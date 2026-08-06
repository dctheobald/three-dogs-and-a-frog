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

1. Run the one-command orchestrator (warm-up + `/api/agent` governance + `/catalog` gate check + BigQuery verification + a GO / NO-GO readout):
```bash
   bash .claude/skills/agentops-preflight/scripts/preflight.sh
```
   Trust the verdict and exit code (0 = GO, 10 = CHECK, 20 = NO-GO) — it reports failures in the readout instead of pretending success. `preflight.sh warm` skips verification; `preflight.sh verify` re-checks after browsing; `DRY_RUN=1` runs against mocks.

2. Then tell the user, plainly:
   - "Set the report's date & time picker to the last 60 minutes."
   - "Browse the live storefront on your laptop and phone, and chat with the Wise Frog (try 'buy the backpack') — the only way to move the Humans and agent-sale lanes."
   - "Wait ~60 seconds for the Fastly log flush plus BigQuery streaming, then hit **Refresh data** in Looker Studio."

## Important

Do **not** run this on a persistent or recurring schedule. It injects synthetic traffic; running it always-on would pollute the real classification picture that the dashboard is meant to show. It is an on-demand, pre-demo action only.

## Target
Site `https://www.3dogsandafrog.com` (paths `/`, `/shop`, `/cart`, `/api/agent`, `/catalog`) → Fastly service `wBCY7mB7jg6n24pJqN5q40` → BigQuery `three-dogs-frog-store.agentops` (`edge_requests`, `agent_commerce`).
