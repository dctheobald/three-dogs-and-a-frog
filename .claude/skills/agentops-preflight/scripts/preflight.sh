#!/usr/bin/env bash
# AgentOps demo PRE-FLIGHT — verify, warm, confirm, and print a go/no-go.
#
# ON-DEMAND, PRE-DEMO USE ONLY. Every check is read-only or self-limiting: a
# pre-flight tool must be more reliable than the thing it prepares, so it never
# aborts on a soft failure — it reports it in the readout instead.
#
# Usage:
#   bash scripts/preflight.sh          # full: preconditions -> warm -> verify -> readout
#   bash scripts/preflight.sh verify   # re-verify + readout only (after browsing the human lane)
#   bash scripts/preflight.sh warm     # warm + short summary only (skip verification)
#
# Env: DRY_RUN=1 (mock, touch nothing) | FORCE=1 (skip the recent-run guard)
#      WARMUP_REQUESTS / WARMUP_PACE / AI_WEIGHT   (see warmup.sh)
#
# Exit code encodes the verdict:  0 = GO   10 = CHECK   20 = NO-GO
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=warmup.sh
source "${HERE}/warmup.sh"

PROJECT="three-dogs-frog-store"
DATASET_TABLE="agentops.edge_requests"
TABLE_FQN="three-dogs-frog-store.agentops.edge_requests"

CONFIRM_WINDOW_MIN="${CONFIRM_WINDOW_MIN:-10}"   # window used to confirm our warm-up landed
DASH_WINDOW_MIN=60                               # window the dashboard actually shows
CONFIRM_TIMEOUT_S="${CONFIRM_TIMEOUT_S:-120}"
CONFIRM_INTERVAL_S="${CONFIRM_INTERVAL_S:-15}"
SETTLE_S="${SETTLE_S:-20}"                        # initial settle before first poll
GUARD_MINUTES="${GUARD_MINUTES:-10}"
MARKER="/tmp/agentops-preflight.last"

MODE="${1:-full}"

# --- Readout state ----------------------------------------------------------
HEALTH_OK="unknown"; HEALTH_NOTE=""
BQ_OK="unknown"; LANDED="unknown"; CONFIRM_NOTE=""
BOT_N=0; HUMAN_N=0; OTHER_N=0

have() { command -v "$1" >/dev/null 2>&1; }

check_preconditions() {
  if ! have curl; then
    echo "FATAL: curl not found — cannot warm up or health-check." >&2
    exit 2
  fi
  local p code bad=0
  HEALTH_NOTE=""
  for p in "${paths[@]}"; do
    if [[ "$DRY_RUN" == "1" ]]; then
      if [[ "$MOCK_STATE" == "origin-down" ]]; then code=503; else code=200; fi
    else
      code=$(curl -s -o /dev/null -w '%{http_code}' -A "preflight-healthcheck/1.0" "${SITE}${p}" || echo 000)
    fi
    if [[ ! "$code" =~ ^(2|3) ]]; then
      bad=$((bad + 1)); HEALTH_NOTE+="${p}=${code} "
    fi
  done
  HEALTH_NOTE="${HEALTH_NOTE% }"
  if (( bad == 0 )); then HEALTH_OK="yes"; else HEALTH_OK="no"; fi

  if [[ "$DRY_RUN" == "1" ]]; then
    if [[ "$MOCK_STATE" == "bq-down" ]]; then BQ_OK="no"; else BQ_OK="yes"; fi
  elif have bq && bq --project_id="$PROJECT" show "$DATASET_TABLE" >/dev/null 2>&1; then
    BQ_OK="yes"
  else
    BQ_OK="no"
  fi
}

recent_run_guard() {
  if [[ "$DRY_RUN" == "1" || "${FORCE:-0}" == "1" ]]; then return 0; fi
  if [[ ! -f "$MARKER" ]]; then return 0; fi
  local last now age
  last=$(cat "$MARKER" 2>/dev/null || echo 0)
  now=$(date +%s)
  age=$(( (now - last) / 60 ))
  if (( age < GUARD_MINUTES )); then
    echo "GUARD: a warm-up ran ${age} min ago (< ${GUARD_MINUTES}). Synthetic traffic may still be in the window." >&2
    echo "       Re-running stacks more synthetic volume. Set FORCE=1 to proceed anyway." >&2
    exit 3
  fi
}

mark_run() {
  if [[ "$DRY_RUN" == "1" ]]; then return 0; fi
  date +%s > "$MARKER" 2>/dev/null || true
}

confirm_query() {
  local q="SELECT class, COUNT(*) n FROM \`${TABLE_FQN}\` WHERE timestamp > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL ${CONFIRM_WINDOW_MIN} MINUTE) GROUP BY class"
  bq --project_id="$PROJECT" query --quiet --use_legacy_sql=false --format=csv "$q" 2>/dev/null | tail -n +2
}

parse_counts() {
  local csv="$1" cls n
  BOT_N=0; HUMAN_N=0; OTHER_N=0
  while IFS=, read -r cls n; do
    if [[ -z "${cls:-}" ]]; then continue; fi
    n="${n//[^0-9]/}"; if [[ -z "$n" ]]; then n=0; fi
    case "$cls" in
      bot)   BOT_N="$n";;
      human) HUMAN_N="$n";;
      *)     OTHER_N=$((OTHER_N + n));;
    esac
  done <<< "$csv"
}

verify_landing() {
  if [[ "$BQ_OK" != "yes" ]]; then
    LANDED="unverified"; CONFIRM_NOTE="bq unavailable/unauthed — landing not verified"
    return 0
  fi
  local waited=0 csv
  while (( waited <= CONFIRM_TIMEOUT_S )); do
    if [[ "$DRY_RUN" == "1" ]]; then
      case "$MOCK_STATE" in
        human-empty)                      csv=$'bot,152\nother,4';;
        no-land|origin-down|rate-limited) csv='';;
        *)                                csv=$'bot,152\nhuman,6\nother,4';;
      esac
    else
      csv="$(confirm_query || true)"
    fi
    parse_counts "$csv"
    if (( BOT_N > 0 )); then
      LANDED="yes"; CONFIRM_NOTE="confirmed in last ${CONFIRM_WINDOW_MIN} min"
      return 0
    fi
    if [[ "$DRY_RUN" == "1" ]]; then break; fi
    sleep "$CONFIRM_INTERVAL_S"; waited=$((waited + CONFIRM_INTERVAL_S))
  done
  LANDED="timeout"; CONFIRM_NOTE="no bot rows after ${CONFIRM_TIMEOUT_S}s — check Fastly logging + BQ streaming"
}

pct() {
  local a="$1" t="$2"
  if (( t == 0 )); then echo 0; return; fi
  awk -v a="$a" -v t="$t" 'BEGIN{printf "%d",(a*100.0/t)+0.5}'
}

readout() {
  local total=$((BOT_N + HUMAN_N + OTHER_N)) automated verdict="GO" reason="" human_state="PASS"
  automated=$(pct "$BOT_N" "$total")
  if (( HUMAN_N == 0 )); then human_state="WARN"; fi

  # Most fundamental cause wins the headline reason: a dead origin outranks a
  # missed landing, which outranks an aborted warm-up. Applied last => wins.
  # CHECK only applies when the verdict would otherwise be GO.
  if [[ "$LANDED" == "timeout" ]]; then
    verdict="NO-GO"; reason="warm-up did not land in BigQuery in time"
  fi
  if (( WARMUP_ABORTED == 1 )); then
    verdict="NO-GO"; reason="warm-up aborted on edge 429s — wait out the 60s penalty box, then retry"
  fi
  if [[ "$HEALTH_OK" == "no" ]]; then
    verdict="NO-GO"; reason="origin health failing (${HEALTH_NOTE})"
  fi
  if [[ "$LANDED" == "unverified" && "$verdict" == "GO" ]]; then
    verdict="CHECK"; reason="landing not verified (bq unavailable) — refresh Looker and eyeball the panels"
  fi

  local health_str="PASS"; if [[ "$HEALTH_OK" != "yes" ]]; then health_str="FAIL"; fi
  local abort_str="";      if (( WARMUP_ABORTED == 1 )); then abort_str="  [ABORTED]"; fi
  local health_extra="";   if [[ -n "$HEALTH_NOTE" ]]; then health_extra="  (${HEALTH_NOTE})"; fi
  local confirm_extra="";  if [[ -n "$CONFIRM_NOTE" ]]; then confirm_extra="  (${CONFIRM_NOTE})"; fi
  local human_extra="";    if [[ "$human_state" == "WARN" ]]; then human_extra="  <- browse storefront on laptop + phone NOW"; fi

  echo
  echo "==================== AGENTOPS PRE-FLIGHT — GO / NO-GO ===================="
  printf "  Verdict          : [ %s ]\n" "$verdict"
  if [[ -n "$reason" ]]; then printf "  Reason           : %s\n" "$reason"; fi
  echo   "  ----------------------------------------------------------------------"
  printf "  Origin health    : %s%s\n" "$health_str" "$health_extra"
  printf "  Warm-up sent     : %s req  (2xx=%s 4xx=%s 5xx=%s 429=%s)%s\n" \
         "$WARMUP_TOTAL" "$WARMUP_2XX" "$WARMUP_4XX" "$WARMUP_5XX" "$WARMUP_429" "$abort_str"
  printf "  Landing in BQ    : %s%s\n" "$LANDED" "$confirm_extra"
  printf "  Bot lane         : %s rows\n" "$BOT_N"
  printf "  Human lane       : %s rows  [%s]%s\n" "$HUMAN_N" "$human_state" "$human_extra"
  printf "  %% Automated      : %s%%  (bot of %s classified)\n" "$automated" "$total"
  echo   "  ----------------------------------------------------------------------"
  echo   "  Manual at demo time (no API can do these):"
  printf "   - Looker date & time picker -> last %s min; match subtitle 'Last 60 min.'\n" "$DASH_WINDOW_MIN"
  echo   "   - After browsing, wait ~60s (Fastly flush + BQ streaming), hit Refresh data"
  printf "  Snapshot         : %s\n" "$(date '+%Y-%m-%d %H:%M:%S %Z')"
  echo   "========================================================================="
  echo

  case "$verdict" in
    GO)    return 0;;
    CHECK) return 10;;
    *)     return 20;;
  esac
}

main() {
  case "$MODE" in
    warm)
      check_preconditions
      recent_run_guard
      run_warmup
      mark_run
      echo "Warm complete: ${WARMUP_TOTAL} requests. After browsing, run: bash scripts/preflight.sh verify"
      ;;
    verify)
      check_preconditions
      verify_landing
      readout
      ;;
    full)
      check_preconditions
      recent_run_guard
      run_warmup
      mark_run
      if [[ "$DRY_RUN" != "1" ]]; then sleep "$SETTLE_S"; fi
      verify_landing
      readout
      ;;
    *)
      echo "Unknown mode: $MODE (use: full | warm | verify)" >&2
      exit 64
      ;;
  esac
}

main
