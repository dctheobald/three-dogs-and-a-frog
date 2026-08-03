#!/usr/bin/env bash
# AgentOps demo warm-up — drives synthetic bot traffic into the trailing 60-minute window.
# ON-DEMAND, PRE-DEMO USE ONLY. Do not run on a persistent schedule (it pollutes real data).
set -euo pipefail

SITE="https://www.3dogsandafrog.com"

# Bot / automation user-agents. ContentGuard classifies these as `bot` by
# fingerprint and behavior — the browser-looking ones included here still land
# as `bot`, so they add volume to the bot lane, not the human lane.
bots=(
  "GPTBot/1.0 (+https://openai.com/gptbot)"
  "ClaudeBot/1.0"
  "Bytespider"
  "meta-externalagent/1.1"
  "python-requests/2.31.0"
  "curl/8.4.0"
  "Scrapy/2.11"
)
paths=(/ /shop /cart)

echo "Warming up ${SITE} (bot lane) ..."
for r in 1 2 3 4 5; do
  for ua in "${bots[@]}"; do
    for p in "${paths[@]}"; do
      curl -s -o /dev/null -A "$ua" "${SITE}${p}"
      sleep 0.15
    done
  done
  echo "  round ${r}/5 complete"
done

cat <<'DONE'

Bot warm-up complete. Two manual steps a script can't do:
  1. Set the report's date & time picker to the last 60 minutes (and match the
     subtitle if it's still hard-coded).
  2. Browse the live storefront in a REAL browser (laptop + phone) to populate
     the Humans lane — curl cannot fake that.
Then wait ~60s (Fastly flush + BigQuery streaming) and hit Refresh data in Looker.
DONE
