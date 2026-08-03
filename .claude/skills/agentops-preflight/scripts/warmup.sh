#!/usr/bin/env bash
# AgentOps demo warm-up — drives synthetic, AI-weighted bot traffic into the
# trailing window the dashboard reads.
#
# ON-DEMAND, PRE-DEMO USE ONLY. Do not run on a persistent schedule; it injects
# synthetic traffic and would pollute the real classification picture.
#
# Runnable directly (bash scripts/warmup.sh) or sourced by preflight.sh, which
# reuses run_warmup() and the counters it sets. preflight.sh is preferred: it
# verifies the traffic landed instead of assuming it did.
#
# No `set -e`: this script (and the orchestrator that sources it) deliberately
# continues past a failed request so it can REPORT the failure rather than die.
set -uo pipefail

SITE="${SITE:-https://www.3dogsandafrog.com}"

# --- Intensity controls -----------------------------------------------------
# Defaults stay far under the site's 100 rps edge rate limiter. That limiter's
# penalty box is 60s, and tripping it right before a demo is the exact failure
# this tool exists to prevent — so pace is clamped to a hard floor below.
WARMUP_REQUESTS="${WARMUP_REQUESTS:-180}"        # exact, configurable total
WARMUP_PACE="${WARMUP_PACE:-0.15}"               # seconds between requests
PACE_FLOOR="0.05"                                # ~20 rps worst case, 5x under limit
AI_WEIGHT="${AI_WEIGHT:-3}"                       # how hard the mix leans to AI agents
RL_ABORT_THRESHOLD="${RL_ABORT_THRESHOLD:-3}"    # back off after this many 429s
WARMUP_PATHS="${WARMUP_PATHS:-/,/shop,/cart}"
DRY_RUN="${DRY_RUN:-0}"

# Scenario preview (DRY_RUN only): render a specific readout without any live
# call, so the team can see what a WARN / CHECK / NO-GO looks like before it
# happens on stage. Valid states are validated here so a typo doesn't silently
# fall through to a misleading "healthy" preview.
MOCK_STATE="${MOCK_STATE:-go}"
if [[ "$DRY_RUN" == "1" ]]; then
  case "$MOCK_STATE" in
    go|human-empty|bq-down|no-land|origin-down|rate-limited) : ;;
    *) echo "note: unknown MOCK_STATE='$MOCK_STATE' — using 'go'. Valid: go, human-empty, bq-down, no-land, origin-down, rate-limited" >&2
       MOCK_STATE="go" ;;
  esac
fi

float_lt() { awk -v a="$1" -v b="$2" 'BEGIN{exit (a<b)?0:1}'; }
# Clamp pace up to the floor if an override is too aggressive.
if float_lt "$WARMUP_PACE" "$PACE_FLOOR"; then WARMUP_PACE="$PACE_FLOOR"; fi

# --- Weighted user-agent pool ----------------------------------------------
# All land in the `bot` lane under Fastly ContentGuard. AI/agent crawlers are
# over-represented (x AI_WEIGHT) so "% Automated" and the donut lean toward the
# agentic-traffic narrative the demo is meant to show.
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
pool=()
w=0
while (( w < AI_WEIGHT )); do pool+=("${ai_agents[@]}"); w=$((w + 1)); done
pool+=("${generic_bots[@]}")

IFS=',' read -r -a paths <<< "$WARMUP_PATHS"

# Counters (globals so a sourcing orchestrator can read them for the readout).
WARMUP_TOTAL=0; WARMUP_2XX=0; WARMUP_4XX=0; WARMUP_5XX=0; WARMUP_429=0
WARMUP_OTHER=0; WARMUP_ABORTED=0

run_warmup() {
  WARMUP_TOTAL=0; WARMUP_2XX=0; WARMUP_4XX=0; WARMUP_5XX=0; WARMUP_429=0
  WARMUP_OTHER=0; WARMUP_ABORTED=0
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
    # Back off the instant the edge starts rate-limiting us. A partial fill we
    # can report beats tripping the 60s penalty box seconds before going live.
    if (( WARMUP_429 >= RL_ABORT_THRESHOLD )); then
      WARMUP_ABORTED=1
      echo "  ABORT: edge returned ${WARMUP_429}x 429 — backing off to spare the 60s penalty box." >&2
      break
    fi
    if [[ "$DRY_RUN" != "1" ]]; then sleep "$WARMUP_PACE"; fi
    if (( WARMUP_TOTAL % 30 == 0 )); then
      fails=$((WARMUP_4XX + WARMUP_5XX + WARMUP_429 + WARMUP_OTHER))
      if (( fails > 0 )); then
        echo "  ${WARMUP_TOTAL}/${WARMUP_REQUESTS} sent (${fails} failing)"
      else
        echo "  ${WARMUP_TOTAL}/${WARMUP_REQUESTS} sent"
      fi
    fi
  done
  echo "  sent ${WARMUP_TOTAL} (2xx=${WARMUP_2XX} 4xx=${WARMUP_4XX} 5xx=${WARMUP_5XX} 429=${WARMUP_429})"
}

# Run when executed directly; stay quiet (just define functions) when sourced.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  run_warmup
  cat <<'DONE'

Bot warm-up complete. Two manual steps a script can't do:
  1. Set the report's date & time picker to the last 60 minutes (and match the
     subtitle if it's still hard-coded).
  2. Browse the live storefront in a REAL browser (laptop + phone) to populate
     the Humans lane — curl cannot fake that.
Then wait ~60s (Fastly flush + BigQuery streaming) and hit Refresh data in Looker.
For a verified go/no-go instead of this reminder, run: bash scripts/preflight.sh
DONE
fi
