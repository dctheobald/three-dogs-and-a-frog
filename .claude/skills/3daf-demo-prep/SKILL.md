---
name: 3daf-demo-prep
description: >-
  Prepare the "3 Dogs & a Frog" (3D&aF) AgentOps demo before presenting. Warms the
  live traffic window with synthetic bot traffic, exercises the /api/agent governance
  and /catalog agent surfaces, seeds a verified-agent sale via the reference shopping
  agent, verifies the data landed in BigQuery, and prints a GO/NO-GO — then flags the
  one lane only a human can fill. Use when the user says they're about to demo or
  present the 3 Dogs & a Frog / AgentOps / edge-traffic dashboard, mentions "demo prep",
  "pre-flight", "warm up the demo", "prep the dashboard", or is about to show the
  storefront traffic dashboard to an audience. Run on demand ~5 minutes before the demo;
  do NOT schedule it to run continuously.
---

# 3 Dogs & a Frog — demo prep

Gets the **3D&aF: AgentOps — Edge Traffic Classification** dashboard ready to present. The live view reads the last ~60 minutes, so it looks empty unless traffic arrived in the last hour. This skill fills every lane it can script, verifies landing in BigQuery, and returns a go/no-go — then reminds you of the one lane a script can't fake.

It lines up with the four demo pillars: **Bot Management** (Identify lane), **Runtime Governance** (Blocked lane), **Agentic Commerce** (Trusted Agents + agent sale), **AgentOps Visibility** (the dashboard itself).

## Entry point

Two scripted phases. For a full prep, run both, in order.

**1 — Edge warm-up + verifier** (bot burst + `/api/agent` governance + `/catalog` gate + BigQuery check + GO/NO-GO):

```bash
bash .claude/skills/3daf-demo-prep/scripts/preflight.sh full
```

Modes: `full` (default), `warm` (skip verification), `verify` (re-verify + readout only, after browsing). The exit code is the verdict — trust it, not any "complete" line: **0 = GO, 10 = CHECK, 20 = NO-GO**.

**2 — Agent / commerce lane** (the reference shopping agent — unlike the human lane, this one *can* be scripted, so run it every prep):

```bash
node tools/shopper-agent.js "Buy a backpack for a weekend hike"
```

Run from the repo root (so Node resolves the app's `node_modules`). Needs `ARC_SHOPPER_KEY` in the root `.envrc` and egress to `arc.fastly.app` and `/mcp`. The storefront agent key (`X-Frog-Agent-Key`) defaults to the documented demo value (runbook §5.2), so you only export `FROG_AGENT_KEY` if that key has been rotated. It drives an ARC-governed LLM through the storefront's MCP endpoint as a verified agent, lighting up the **Trusted Agents** classification lane, an **Agent – MCP client** sale in **Monetize** (`txn_initiator = mcp`), and an `arc-shopper-agent` lane in **ARC → Logging** alongside `arc-wisefrog-virtual-key`.

## How to run it

Invoked without specifics, present these as a short numbered menu and let the user pick (default = 1). One pick or "go" is enough — don't interrogate before a demo.

1. **Full prep (recommended)** — `preflight.sh full`, then `shopper-agent.js`. Warms every scriptable lane and returns the verdict.
2. **Re-verify after browsing** — `preflight.sh verify`. Re-checks landing and the human lane after the presenter has clicked around. No new traffic.
3. **Warm only** — `preflight.sh warm` (+ `shopper-agent.js`). Skips verification.
4. **Agent leg only** — just `shopper-agent.js`, to top up the Trusted Agents / Monetize lanes.
5. **Preview a readout (dry run — touches nothing)** — `DRY_RUN=1 MOCK_STATE=<state> preflight.sh full`. States: `go`, `human-empty`, `bq-down`, `no-land`, `origin-down`, `rate-limited`.
6. **Adjust intensity** — apply a Variance override below, then run.

If the user's request already names an intent (e.g. "verify", "agent only", "show me a no-go", "heavier warm-up"), skip the menu and map straight to it.

## Variance (optional overrides)

All optional; defaults are demo-safe. Pass inline before the command.

| Need | Override | Default | Applies to |
|---|---|---|---|
| More / less bot traffic | `WARMUP_REQUESTS` | 180 | preflight |
| Faster / slower pace | `WARMUP_PACE` | 0.15 | preflight (clamped to a 0.05 floor, ~20 rps, 5x under the 100 rps limiter) |
| Lean harder into AI agents | `AI_WEIGHT` | 3 | preflight |
| More / fewer governance POSTs | `AGENT_REQUESTS` | 8 | preflight |
| Re-run within 10 min | `FORCE=1` | — | preflight (overrides the recent-run guard) |
| Agent goal | (CLI arg) | "Buy a backpack…" | shopper-agent |

## What each phase populates

- **Bot burst** (`/`, `/shop`, `/cart`, AI-weighted) → the **Identify** lane, the traffic-mix donut, and the **% Automated** callout. Keeps the live window bot-dominant so the donut doesn't invert.
- **`POST /api/agent`** → under enforce mode the edge 429s before origin (no AI/Vertex cost), giving the **Govern** lane's "Blocked: untrusted bot" series shape.
- **`/catalog` gate** (with and without the agent key) → confirms the agentic-commerce surface (expect `200` / `403`).
- **Shopping agent** → **Trusted Agents** lane + **Monetize** agent sale + `arc-shopper-agent` in **ARC → Logging**.
- **BigQuery check** confirms the bot rows landed. Governance and the agent sale are confirmed at the edge (429 / 403 / checkout) and eyeballed in ARC → Logging and the Monetize row — the readout's BQ verdict gates on bot rows only.

## React to the verdict

- **Recent-run guard (exit 3):** "a warm-up ran N min ago." Ask whether to re-run; if yes, re-invoke with `FORCE=1`.
- **NO-GO (exit 20):** surface the Reason and act — origin health failing (check the VM / Caddy), didn't land (Fastly logging endpoint + BQ streaming), or aborted on 429s (wait out the 60s penalty box, then retry).
- **CHECK (exit 10):** `bq` unavailable/unauthed — landing unverified; refresh Looker and confirm the panels by eye.

## Manual at demo time (no script can do this)

- **The human lane.** Only a real browser produces `human` rows — click around the live storefront on a laptop and a phone, and chat with the Wise Frog. `curl` can't fake it. Expect a **GO with a Humans-lane WARN** on the first pass; browse, then run option 2 (`verify`).
- Set the report's time control to the **last 60 minutes**.
- Wait ~60s (Fastly flush + BigQuery streaming), then hit **Refresh data** in Looker.

## Important

On-demand, pre-demo only. Never run on a persistent or recurring schedule — always-on synthetic traffic pollutes the real classification picture the dashboard exists to show.

## Target

Site `https://www.3dogsandafrog.com` (paths `/`, `/shop`, `/cart`, `/api/agent`, `/catalog`, `/mcp`) → Fastly service `wBCY7mB7jg6n24pJqN5q40` → BigQuery `three-dogs-frog-store.agentops` (`edge_requests` · traffic & governance; `agent_commerce` · checkouts & revenue). LLM traffic is governed through **Fastly ARC** (virtual keys `arc-shopper-agent`, `arc-wisefrog-virtual-key`).
