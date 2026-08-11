---
name: agentops-preflight
description: >-
  Warm up the "3 Dogs & a Frog" AgentOps demo dashboard right before presenting.
  Runs one self-contained script that drives synthetic bot traffic, exercises the
  /api/agent governance and /catalog agent surfaces, verifies the data landed in
  BigQuery, and prints a GO/NO-GO — then checklists the two steps that need a human.
  Use when the user says they're about to demo or present the AgentOps / edge-traffic
  dashboard, mentions "pre-flight", "warm up the demo", "prep the dashboard", or is
  about to show the storefront traffic dashboard to an audience. Run on demand ~5
  minutes before the demo; do NOT schedule it to run continuously.
---

# AgentOps demo pre-flight

Prepares the **3D&aF: AgentOps — Edge Traffic Classification** Looker Studio dashboard for a live demo. The live view defaults to the last 60 minutes, so it looks empty unless traffic arrived in the last hour. This skill fills the bot lane, exercises the agent-governance and agent-commerce surfaces, verifies the data landed in BigQuery, and reminds you of the two steps that need a human.

## One command does it all

Run the self-contained orchestrator — warm-up + `/api/agent` governance burst + `/catalog` gate check + BigQuery verification + a GO / NO-GO readout:

```bash
bash .claude/skills/agentops-preflight/scripts/preflight.sh
```

Modes: `preflight.sh` (full), `preflight.sh warm` (skip verification), `preflight.sh verify` (re-verify + readout only, after browsing). It reports failures in the readout rather than pretending success — trust the verdict and the exit code (**0 = GO, 10 = CHECK, 20 = NO-GO**). `DRY_RUN=1` runs the whole flow against mocks without touching the site.

## What it automates

- A paced, AI-weighted burst of `bot` requests to `/`, `/shop`, `/cart` — fills the Identify lane, the traffic-mix donut, and the "% Automated" callout.
- A short burst of `POST /api/agent` that the edge blocks under enforce mode (429 at the edge, no origin/AI cost) — gives the Govern lane's "Blocked: untrusted bot" series shape.
- A `/catalog` gate check with and without the demo agent key — confirms the agentic-commerce surface (expect `200` / `403`).
- A BigQuery confirmation that the traffic landed, then the GO / NO-GO readout.

## What it can't automate (do these by hand at demo time)

- **The Looker window.** Set the report's date & time picker to the last 60 minutes so the live view matches the window the warm-up fills.
- **The human lane.** Only a real browser produces `human` classifications — click around the live storefront on a laptop and a phone, and chat with the Wise Frog (including "buy the backpack") to seed the human + agent-sale rows. `curl` cannot fake that.
- **The agent lane.** Run the reference shopping agent once from the repo root — `node tools/shopper-agent.js "buy the backpack"` — to seed the **Trusted Agents** classification lane, an **Agent – MCP client** sale in Monetize, and an `arc-shopper-agent` lane in ARC → Logging. Needs `ARC_SHOPPER_KEY` (in the root `.envrc`). Unlike the human lane this one *can* be scripted, so it's a candidate to fold into `preflight.sh` later.

## Important

Do **not** run this on a persistent or recurring schedule. It injects synthetic traffic; running it always-on would pollute the real classification picture the dashboard is meant to show. On-demand, pre-demo only.

## Target

Site `https://www.3dogsandafrog.com` (paths `/`, `/shop`, `/cart`, `/api/agent`, `/catalog`) → Fastly service `wBCY7mB7jg6n24pJqN5q40` → BigQuery `three-dogs-frog-store.agentops` (`edge_requests` · traffic & governance; `agent_commerce` · checkouts & revenue).
