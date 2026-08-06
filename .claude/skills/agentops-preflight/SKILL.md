---
name: agentops-preflight
description: Warm up the "3 Dogs & a Frog" AgentOps demo dashboard right before presenting. Drives synthetic bot traffic to fill the live 60-minute BigQuery window so the Looker Studio panels have shape, then checklists the two steps no script can do. Use this whenever the user says they're about to demo or present the AgentOps / edge-traffic-classification dashboard, mentions "pre-flight", "warm up the demo", "prep the dashboard", "getting ready to present Fastly", or is about to show the storefront traffic dashboard to an audience — even if they don't say the word "warm-up". Run on demand ~5 minutes before the demo; do NOT schedule it to run continuously.
---

# AgentOps demo pre-flight

Prepares the **3D&aF: AgentOps — Edge Traffic Classification** Looker Studio dashboard for a live demo. That dashboard's live view defaults to the last 60 minutes via the report's date & time picker, so it looks empty unless traffic has arrived in the last hour. This skill fills the bot lane and reminds the presenter of the two steps that require a human.

## What this automates vs. what it can't

**Automates** — the tedious part: a paced burst of requests with automation/bot user-agents that Fastly ContentGuard classifies as `bot`, populating the last hour so the time-series, donut, and "% Automated" callout have shape. It also fires a short paced burst of `POST /api/agent` calls that the edge blocks under enforce mode, giving the Govern lane's "Blocked: untrusted bot" series shape.

**Cannot automate (remind the user, don't pretend otherwise):**
- **The Looker window.** Set the report's date & time picker to the last 60 minutes so the live view matches the window the warm-up fills. The picker is a report control, set by hand at demo time.
- **The human lane.** Only a real browser produces `human` classifications — curl with a browser user-agent still classifies as `bot` (that's the whole point of the demo). The presenter must click around the live storefront on a laptop and a phone.

## Steps

1. Run the warm-up. From the repo root (Claude Code's default working directory), invoke it by its full path so the reference resolves regardless of cwd; from inside the skill's own directory it is simply `scripts/warmup.sh`:
   ```bash
   bash .claude/skills/agentops-preflight/scripts/warmup.sh
   ```
   ~105 requests (7 user-agents × 3 paths × 5 rounds) paced over ~1 minute, well under the site's 100 rps edge rate limiter. The script preflights the edge and aborts loudly if requests are not actually reaching Fastly — trust its exit status, not a "complete" line.

2. Then tell the user, plainly:
   - "Set the report's date & time picker to the last 60 minutes"
   - "Browse the live storefront on your laptop and phone for a minute — that's the only way to move the Humans lane."
   - "Wait ~60 seconds for the Fastly log flush plus BigQuery streaming lag, then hit **Refresh data** in Looker Studio."

3. Optional sanity check (if the user has `bq` and wants to confirm data landed):
   ```bash
   bq query --use_legacy_sql=false \
   'SELECT class, COUNT(*) n FROM `three-dogs-frog-store.agentops.edge_requests`
    WHERE timestamp > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 15 MINUTE)
    GROUP BY class ORDER BY n DESC'
   ```

## Important

Do **not** run this on a persistent or recurring schedule. It injects synthetic traffic; running it always-on would pollute the real classification picture that the dashboard is meant to show. It is an on-demand, pre-demo action only.

## Target
Site `https://www.3dogsandafrog.com` (paths `/`, `/shop`, `/cart`) → Fastly service `wBCY7mB7jg6n24pJqN5q40` → BigQuery `three-dogs-frog-store.agentops.edge_requests`.
