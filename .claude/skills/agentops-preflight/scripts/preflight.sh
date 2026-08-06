#!/usr/bin/env bash
# AgentOps demo PRE-FLIGHT — the one-command demo warm-up + verifier.
#
# Self-contained: drives synthetic AI/bot traffic, exercises the /api/agent
# governance lane and the /catalog agent surface, confirms it landed in
# BigQuery, and prints a GO / NO-GO. (warmup.sh was folded in here so the skill
# is a single script.)
#
# ON-DEMAND, PRE-DEMO USE ONLY. Every check is read-only or self-limiting, and
# it never aborts on a soft failure — it reports it in the readout instead. Do
# NOT run on a schedule; it injects synthetic traffic that pollutes the real
# classification picture.
#
# Usage:
#   bash scripts/preflight.sh          # full: preconditions -> warm+govern+surface -> verify -> readout
#   bash scripts/preflight.sh verify   # re-verify + readout only (after browsing the human lane)
#   bash scripts/preflight.sh warm     # warm+govern+surface only (skip verification)
#
# Env: DRY_RUN=1 (mock, touch nothing) | FORCE=1 (skip the recent-run guard)
#      WARMUP_REQUESTS / WARMUP_PACE / AI_WEIGHT / AGENT_REQUESTS
#
# Exit code encodes the verdict:  0 = GO   10 = CHECK   20 = NO-GO
set -uo pipefail

SITE="${SITE:-https://www.3dogsandafrog.com}"
AGENT_KEY="${AGENT_KEY:-sk-frog-demo-2026}"

# --- Intensity controls (defaults stay far under the 100 rps edge limiter) ---
WARMUP_REQUESTS="${WARMUP_REQUESTS:-180}"
WARMUP_PACE="${WARMUP_PACE:-0.15}"
PACE_FLOOR="0.05"
AI_WEIGHT="${AI_WEIGHT:-3}"
RL_ABORT_THRESHOLD="${RL_ABORT_THRESHOLD:-3}"
WARMUP_PATHS="${WARMUP_PATHS:-/,/shop,/cart}"
AGENT_REQUESTS="${AGENT_REQUESTS:-8}"
DRY_RUN="${DRY_RUN:-0}"
MOCK_STATE="${MOCK_STATE:-go}"

# --- BigQuery confirmation config ---
PROJECT="three-dogs-frog-store"
DATASET_TABLE="agentops.edge_requests"
TABLE_FQN="three-dogs-frog-store.agentops.edge_requests"
CONFIRM_WINDOW_MIN="${CONFIRM_WINDOW_MIN:-10}"
DASH_WINDOW_MIN=60
CONFIRM_TIMEOUT_S="${CONFIRM_TIMEOUT_S:-120}"
CONFIRM_INTERVAL_S="${CONFIRM_INTERVAL_S:-15}"
SETTLE_S="${SETTLE_S:-20}"
GUARD_MINUTES="${GUARD_MINUTES:-10}"
MARKER="/tmp/agentops-preflight.last"
MODE="${1:-full}"

if [[ "$DRY_RUN" == "1" ]]; then
  case "$MOCK_STATE" in
    go|human-empty|bq-down|no-land|origin-down|rate-limited) : ;;
    *) echo "note: unknown MOCK_STATE='$MOCK_STATE' — using 'go'." >&2; MOCK_STATE="go" ;;
  esac
fi

float_lt() { awk -v a="$1" -v b="$2" 'BEGIN{exit (a<b)?0:1}'; }
if float_lt "$WARMUP_PACE" "$PACE_FLOOR"; then WARMUP_PACE="$PACE_FLOOR"; fi

# --- Weighted user-agent pool (all land in the `bot` lane; AI over-represented) ---
ai_agents=(
  "GPTBot/1.0 (+https://openai.com/gptbot)"
  "ClaudeBot/1.0"
  "Bytespider"
  "meta-externalagent/1.1"
  "PerplexityBot/1.0"
)
generic_bots=(
  "python-requests/2.31.0"
  "curl/8.4.0"
  "Scrapy/2.11"
)
pool=(); w=0
while (( w < AI_WEIGHT )); do pool+=("${ai_agents[@]}"); w=$((w + 1)); done
pool+=("${generic_bots[@]}")
IFS=',' read -r -a paths <<< "$WARMUP_PATHS"

# --- Counters / readout state ---
WARMUP_TOTAL=0; WARMUP_2XX=0; WARMUP_4XX=0; WARMUP_5XX=0; WARMUP_429=0; WARMUP_OTHER=0; WARMUP_ABORTED=0
AGENT_SENT=0; AGENT_BLOCKED=0
CAT_KEY="-"; CAT_NOKEY="-"
HEALTH_OK="unknown"; HEALTH_NOTE=""
BQ_OK="unknown"; LANDED="unknown"; CONFIRM_NOTE=""
BOT_N=0; HUMAN_N=0; OTHER_N=0

have() { command -v "$1" >/dev/null 2>&1; }

# --- Phase 1: general bot warm-up (Identify lane + warn-mode governance) ---
run_warmup() {
  WARMUP_TOTAL=0; WARMUP_2XX=0; WARMUP_4XX=0; WARMUP_5XX=0; WARMUP_429=0; WARMUP_OTHER=0; WARMUP_ABORTED=0
  local npaths=${#paths[@]} i code ua p fails
  echo "Warming up ${SITE} — ${WARMUP_REQUESTS} requests, AI-weighted, paced ${WARMUP_PACE}s/req."
  for (( i = 0; i < WARMUP_REQUESTS; i++ )); do
    ua="${pool[RANDOM % ${#pool[@]}]}"
    p="${paths[i % npaths]}"
    if [[ "$DRY_RUN" == "1" ]]; then
      case "$MOCK_STATE" in
        rate-limited) code=429;;
        origin-down)  code=503;;
        *)            code=200;;
      esac
    else
      code=$(curl -s -o /dev/null -w '%{http_code}' -A "$ua" "${SITE}${p}" || echo 000)
    fi
    WARMUP_TOTAL=$((WARMUP_TOTAL + 1))
    case "$code" in
      2*)  WARMUP_2XX=$((WARMUP_2XX + 1));;
      429) WARMUP_429=$((WARMUP_429 + 1));;
      4*)  WARMUP_4XX=$((WARMUP_4XX + 1));;
      5*)  WARMUP_5XX=$((WARMUP_5XX + 1));;
      *)   WARMUP_OTHER=$((WARMUP_OTHER + 1));;
    esac
    if (( WARMUP_429 >= RL_ABORT_THRESHOLD )); then
      WARMUP_ABORTED=1
      echo "  ABORT: edge returned ${WARMUP_429}x 429 — backing off to spare the 60s penalty box." >&2
      break
    fi
    if [[ "$DRY_RUN" != "1" ]]; then sleep "$WARMUP_PACE"; fi
    if (( WARMUP_TOTAL % 30 == 0 )); then
      fails=$((WARMUP_4XX + WARMUP_5XX + WARMUP_429 + WARMUP_OTHER))
      if (( fails > 0 )); then echo "  ${WARMUP_TOTAL}/${WARMUP_REQUESTS} sent (${fails} failing)"; else echo "  ${WARMUP_TOTAL}/${WARMUP_REQUESTS} sent"; fi
    fi
  done
  echo "  sent ${WARMUP_TOTAL} (2xx=${WARMUP_2XX} 4xx=${WARMUP_4XX} 5xx=${WARMUP_5XX} 429=${WARMUP_429})"
}

# --- Phase 2: agent-surface governance (Govern "Blocked" lane) ---
# POST /api/agent with AI-agent UAs. Under ENFORCE the edge 429s before origin
# (no AI/Vertex cost), populating "Blocked: untrusted bot".
run_agent_governance() {
  local i ua code
  AGENT_SENT=0; AGENT_BLOCKED=0
  echo "Exercising /api/agent governance — ${AGENT_REQUESTS} POSTs (AI-agent UAs)."
  for (( i = 0; i < AGENT_REQUESTS; i++ )); do
    ua="${ai_agents[RANDOM % ${#ai_agents[@]}]}"
    if [[ "$DRY_RUN" == "1" ]]; then code=429; else
      code=$(curl -s -o /dev/null -w '%{http_code}' -A "$ua" -X POST "${SITE}/api/agent" -H 'Content-Type: application/json' -d '{"message":"hi"}' || echo 000)
    fi
    AGENT_SENT=$((AGENT_SENT + 1))
    [[ "$code" == "429" ]] && AGENT_BLOCKED=$((AGENT_BLOCKED + 1))
    if [[ "$DRY_RUN" != "1" ]]; then sleep "$WARMUP_PACE"; fi
  done
  echo "  /api/agent: ${AGENT_SENT} sent, ${AGENT_BLOCKED} blocked (429 => enforce on; 200 => shadow/warn)."
}

# --- Phase 3: agent surface / edge catalog gate ---
run_agent_surface() {
  echo "Checking agent surface — /catalog gate."
  if [[ "$DRY_RUN" == "1" ]]; then CAT_KEY=200; CAT_NOKEY=403; return 0; fi
  CAT_KEY=$(curl -s -o /dev/null -w '%{http_code}' -H "X-Frog-Agent-Key: ${AGENT_KEY}" "${SITE}/catalog" || echo 000)
  CAT_NOKEY=$(curl -s -o /dev/null -w '%{http_code}' "${SITE}/catalog" || echo 000)
  echo "  /catalog: key=${CAT_KEY} no-key=${CAT_NOKEY} (expect 200 / 403)"
}

check_preconditions() {
  if ! have curl; then echo "FATAL: curl not found." >&2; exit 2; fi
  local p code bad=0
  HEALTH_NOTE=""
  for p in "${paths[@]}"; do
    if [[ "$DRY_RUN" == "1" ]]; then
      if [[ "$MOCK_STATE" == "origin-down" ]]; then code=503; else code=200; fi
    else
      code=$(curl -s -o /dev/null -w '%{http_code}' -A "preflight-healthcheck/1.0" "${SITE}${p}" || echo 000)
    fi
    if [[ ! "$code" =~ ^(2|3) ]]; then bad=$((bad + 1)); HEALTH_NOTE+="${p}=${code} "; fi
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
  now=$(date +%s); age=$(( (now - last) / 60 ))
  if (( age < GUARD_MINUTES )); then
    echo "GUARD: a warm-up ran ${age} min ago (< ${GUARD_MINUTES}). Set FORCE=1 to proceed anyway." >&2
    exit 3
  fi
}

mark_run() { if [[ "$DRY_RUN" == "1" ]]; then return 0; fi; date +%s > "$MARKER" 2>/dev/null || true; }

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
    LANDED="unverified"; CONFIRM_NOTE="bq unavailable/unauthed — landing not verified"; return 0
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
    if (( BOT_N > 0 )); then LANDED="yes"; CONFIRM_NOTE="confirmed in last ${CONFIRM_WINDOW_MIN} min"; return 0; fi
    if [[ "$DRY_RUN" == "1" ]]; then break; fi
    sleep "$CONFIRM_INTERVAL_S"; waited=$((waited + CONFIRM_INTERVAL_S))
  done
  LANDED="timeout"; CONFIRM_NOTE="no bot rows after ${CONFIRM_TIMEOUT_S}s — check Fastly logging + BQ streaming"
}

pct() { local a="$1" t="$2"; if (( t == 0 )); then echo 0; return; fi; awk -v a="$a" -v t="$t" 'BEGIN{printf "%d",(a*100.0/t)+0.5}'; }

readout() {
  local total=$((BOT_N + HUMAN_N + OTHER_N)) automated verdict="GO" reason="" human_state="PASS"
  automated=$(pct "$BOT_N" "$total")
  if (( HUMAN_N == 0 )); then human_state="WARN"; fi

  if [[ "$LANDED" == "timeout" ]]; then verdict="NO-GO"; reason="warm-up did not land in BigQuery in time"; fi
  if (( WARMUP_ABORTED == 1 )); then verdict="NO-GO"; reason="warm-up aborted on edge 429s — wait out the 60s penalty box, then retry"; fi
  if [[ "$HEALTH_OK" == "no" ]]; then verdict="NO-GO"; reason="origin health failing (${HEALTH_NOTE})"; fi
  if [[ "$LANDED" == "unverified" && "$verdict" == "GO" ]]; then verdict="CHECK"; reason="landing not verified (bq unavailable) — refresh Looker and eyeball the panels"; fi

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
  printf "  Warm-up sent     : %s req  (2xx=%s 4xx=%s 5xx=%s 429=%s)%s\n" "$WARMUP_TOTAL" "$WARMUP_2XX" "$WARMUP_4XX" "$WARMUP_5XX" "$WARMUP_429" "$abort_str"
  printf "  Agent governance : %s POST /api/agent, %s blocked (429)\n" "$AGENT_SENT" "$AGENT_BLOCKED"
  printf "  Agent surface    : /catalog key=%s no-key=%s  (expect 200 / 403)\n" "$CAT_KEY" "$CAT_NOKEY"
  printf "  Landing in BQ    : %s%s\n" "$LANDED" "$confirm_extra"
  printf "  Bot lane         : %s rows\n" "$BOT_N"
  printf "  Human lane       : %s rows  [%s]%s\n" "$HUMAN_N" "$human_state" "$human_extra"
  printf "  %% Automated      : %s%%  (bot of %s classified)\n" "$automated" "$total"
  echo   "  ----------------------------------------------------------------------"
  echo   "  Manual at demo time (no API can do these):"
  printf "   - Looker date & time picker -> last %s min; match subtitle 'Last 60 min.'\n" "$DASH_WINDOW_MIN"
  echo   "   - Browse the storefront in a REAL browser (laptop + phone) to move the Humans lane"
  echo   "   - Then wait ~60s (Fastly flush + BQ streaming) and hit Refresh data in Looker"
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
      check_preconditions; recent_run_guard
      run_warmup; run_agent_governance; run_agent_surface; mark_run
      echo "Warm complete. After browsing the storefront, run: bash scripts/preflight.sh verify"
      ;;
    verify)
      check_preconditions; verify_landing; readout
      ;;
    full)
      check_preconditions; recent_run_guard
      run_warmup; run_agent_governance; run_agent_surface; mark_run
      if [[ "$DRY_RUN" != "1" ]]; then sleep "$SETTLE_S"; fi
      verify_landing; readout
      ;;
    *)
      echo "Unknown mode: $MODE (use: full | warm | verify)" >&2; exit 64
      ;;
  esac
}

main
