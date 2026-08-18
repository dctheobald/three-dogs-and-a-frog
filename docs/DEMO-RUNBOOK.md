# 3 Dogs & a Frog — AgentOps Demo Runbook

*Operational runbook for the "Performance to Profit" edge + agentic-commerce demo.*
*Site: https://www.3dogsandafrog.com · Last updated: 2026-08-17*

---

## 1. The story

A luxury pet-gear storefront that demonstrates the edge doing three jobs, end to end, with no second stack:

- **Identify** — Fastly Bot Management (ContentGuard) classifies every request as human, verified agent, or untrusted bot.
- **Govern** — Edge Rate Limiting protects the whole site; agent-surface enforcement allows humans/trusted agents and blocks untrusted bots on the sensitive `/api/agent` endpoint. And the storefront's own AI assistant, the Wise Frog, has every model call routed through **Fastly AI Runtime Control (ARC)** — governing the AI *runtime*, not just the traffic to it.
- **Monetize** — an agent-ready commerce surface: a product catalog served entirely from the edge, a real MCP endpoint, and Stripe checkout — with human-vs-agent revenue attributed in telemetry.

The dashboard at `/observability` (Looker Studio) tells the same three-act story from live edge logs.

## 2. Architecture

```
Browser / AI agent
   |  https://www.3dogsandafrog.com
   v
Fastly VCL service  (id wBCY7mB7jg6n24pJqN5q40)
   - redirect apex->www, http->https
   - Bot Management classification            -> X-Frog-Class
   - Edge Rate Limiting (100 rps, 60s penalty box)
   - agent gate + edge-served catalog (/catalog, /mcp)
   - governance on /api/agent (shadow/enforce)
   - real-time logs  --->  BigQuery agentops.edge_requests  --->  Looker Studio
   |  (cache miss / dynamic)
   v
GCP VM origin  (three-dog-one-frog-prod, us-central1-c, project three-dogs-frog-store)
   - Docker: node:20-alpine, Express (server.js)
   - Wise Frog assistant  --->  Fastly ARC (arc.fastly.app)  --->  Gemini 3.5 Flash (Developer API)
        (OpenAI SDK + virtual key; ARC governs, attributes & logs every LLM call)
   - /mcp  MCP server  (@modelcontextprotocol/sdk, JSON response mode)
   - Stripe checkout (test mode)
```

**Single source of truth:** `data/products.json` drives all four consumers — the storefront views, the Wise Frog inventory, the MCP tools, and (projected at deploy) the edge `frog_catalog` dictionary. Edit the file, everything moves.

**Wise Frog → ARC path:** the app calls `arc.fastly.app/v1/chat/completions` (OpenAI-compatible) with the `ARC_VIRTUAL_KEY` and model `gemini/gemini-3.5-flash`. ARC forwards to the Gemini Developer API using the provider key stored in its own config — the app never holds the raw Gemini key.

**Agent tier (`tools/shopper-agent.js`):** a runnable client (run locally from the repo root) that connects to `/mcp` as a verified agent and reasons via ARC on the `arc-shopper-agent` key — same OpenAI-compatible ARC path, a separate virtual key. ARC governs the LLM leg; the MCP calls are the tools it drives. One run seeds three surfaces: the ARC dashboard's `arc-shopper-agent` lane, the storefront's Trusted-Agents classification, and an Agent–MCP sale in Monetize.

## 3. Edge request flow (VCL, recv order)

| pri | snippet | does |
|----:|---------|------|
| 5  | `frog-classify`   | stamps `X-Frog-Class` (human/verified-agent/bot) + hashed `X-Frog-Client`; a valid `X-Frog-Agent-Key` is upgraded to **verified-agent** (keyed agents = Trusted Agents) |
| 10 | `force-https-and-www` | canonical redirects |
| 15 | `frog-agent-recv` | gates `/catalog` + `/mcp` to verified agents; edge-serves `/catalog` from `frog_catalog` |
| 30 | `frog-govern`     | governs `/api/agent` — allow human/verified-agent, gate bots (enforce) |
| 50 | Threat Detection  | SQLi block |

Error/fetch/deliver snippets render the synthetic catalog (900), agent-gate 403, governance 429, and stamp response headers. Full definitions live in `infra/main.tf` + `infra/vcl/`.

## 4. Demo sections -> Fastly products used

| Section | Fastly product | In this demo |
|---------|----------------|--------------|
| Identify | Bot Management (ContentGuard) | `frog-classify` -> `X-Frog-Class`, dashboard Identify row |
| Govern | Edge Rate Limiting + agent-surface enforcement | site rate limiter + `/api/agent` allow/block |
| Govern | **ARC (AI Runtime Control)** | Wise Frog LLM calls routed through ARC (`arc.fastly.app`); per-virtual-key model/token/session attribution in the ARC dashboard (Tools → AI Runtime Control) |
| Monetize | Edge dictionary (catalog) served at the edge | `/catalog` served with no origin |
| Monetize | (3rd-party) MCP + Stripe | `/mcp` tools, Stripe test checkout |
| Monetize | **ARC agent tier** (reference) | `tools/shopper-agent.js` reasons via ARC (`arc-shopper-agent`) and buys through `/mcp` — a second live ARC lane, plus a Trusted-Agents classification and an Agent–MCP sale |

> Note: on a VCL/Deliver service the VCL-native edge data store is an **Edge Dictionary** (`frog_catalog`); Config Store is its Compute-platform sibling. Same concept — edge-cached key/value served with no origin.

> ARC status (as of this build): **beta**, so static-key auth only and no in-ARC budget/rate caps yet — both land at GA (Sept 15, 2026), along with Passthrough SSO / Google-identity auth that will let ARC reach Gemini/Vertex via ADC and retire the API key entirely.

## 5. Live knobs you'll touch

Run edge CLI commands from `infra/` (direnv sets `FASTLY_API_TOKEN` + `FASTLY_SERVICE_ID`). The two dictionaries are **versionless** — entry changes take effect in ~1–2 minutes without a deploy.

### 5.1 Governance mode — shadow <-> enforce
`frog_config` key `enforce` (`frog_config` dictionary id `PNGoE9Xbgz2mEu4SYAv5G4`):

```bash
# enforce = block untrusted bots on /api/agent
fastly service dictionary-entry update --dictionary-id=PNGoE9Xbgz2mEu4SYAv5G4 --key=enforce --value=true
# shadow  = identify only, nothing blocked
fastly service dictionary-entry update --dictionary-id=PNGoE9Xbgz2mEu4SYAv5G4 --key=enforce --value=false
```

Open your talk in **shadow** if you want to flip to **enforce** live on stage. Allow ~1–2 min for propagation before demonstrating the change.

### 5.2 Demo agent key
`frog_config` key `agent_key` (currently `sk-frog-demo-2026`). A request presenting `X-Frog-Agent-Key: <that value>` is treated as a verified agent for `/catalog` and `/mcp`. Rotate anytime via the same `dictionary-entry update`.

### 5.3 Product catalog
Edit `data/products.json` and deploy. `stock_qty` drives everything: `0` -> Out of Stock (checkout refused), `1–5` -> Low Stock, `>5` -> In Stock. Every purchase path (human cart, Wise Frog, MCP) validates stock, so out-of-stock/over-quantity orders are refused (409) and the storefront shows a disabled "Sold Out" button.

### 5.4 ARC — the Wise Frog's LLM control plane
Configured in the **Fastly control panel → Tools → AI Runtime Control** (superuser-only), not Terraform:
- **Provider:** Gemini, base URL `https://generativelanguage.googleapis.com`, holding the Gemini Developer API key (a service-account-bound key on `three-dogs-frog-store`, restricted to the Generative Language API).
- **Virtual keys:** `arc-wisefrog-virtual-key` (the app's key, mapped to `gemini-3.5-flash`) is stored in Secret Manager and injected into the container as `ARC_VIRTUAL_KEY`. A second key, `arc-shopper-agent` (also `gemini-3.5-flash`), powers the reference shopping agent (`tools/shopper-agent.js`); it lives locally as `ARC_SHOPPER_KEY` in the root `.envrc` (the agent is a client tool, not deployed, so it needs no Secret Manager entry). The app/agent present these — never the raw Gemini key.
- **Watch usage live:** the **Logging** tab is per-request and near-real-time (filter by `arc-wisefrog-virtual-key`); the **Summary** tab is an hourly rollup, so it lags — trust Logging during a demo.
- **Change model / rotate:** edit the provider or refresh the virtual key in the control panel. A new virtual-key value means updating the `arc-wisefrog-virtual-key` Secret Manager secret and rolling the VM.

## 6. Demo-day pre-flight (~5 min before)

> For the full slide-keyed sequence (prep → on-stage governance flip → reset), see the **demo-day run-sheet** (`docs/demo-day-run-sheet.md`). The steps below are the reference; the run-sheet is what you drive from.

### 6.1 Warm-up (fills the dashboard's live 60-min window)
Run the pre-flight skill's warm-up. It fills the Identify bot lane, exercises `/api/agent` governance, checks the `/catalog` agent surface, seeds the agent-commerce lane via the shopper agent, verifies BigQuery landing, and prints a GO/NO-GO — all under the 100 rps limiter.

**Set governance mode first.** If the talk opens in shadow (slide 31), flip `enforce=false` (§5.1) and warm with `AGENT_REQUESTS=0` so the Blocked lane opens at 0 — otherwise you pre-spend the reveal.

```bash
bash .claude/skills/3daf-demo-prep/scripts/preflight.sh full
node tools/shopper-agent.js "buy the backpack"
```

In Cowork / Claude Code you can also just invoke the **`3daf-demo-prep`** skill — it prompts for shadow vs enforce and walks the manual steps in order. Do **not** run it on a schedule — it injects synthetic traffic that would pollute the real classification picture.

### 6.2 Manual steps a script can't do (in order)
- **Humans lane:** only a real browser produces `human` classifications — click around the storefront on a laptop/phone.
- **Human sale:** complete **one checkout through the browser cart** (Stripe test card `4242 4242 4242 4242`, any future expiry/CVC). This seeds **Human Sales** — without it, "buy the backpack" via the Wise Frog logs as an *agent* sale and Human Sales stays $0.
- **Agent sale (Wise Frog):** chat with the Wise Frog ("buy the backpack") to seed an **Agent – Wise Frog** sale and "Allowed: human" in Govern. This also populates the ARC dashboard — check **Tools → AI Runtime Control → Logging** on `arc-wisefrog-virtual-key`.
- **Looker window:** set the page time control to **Last 60 minutes**, wait ~60s for the log flush + BigQuery streaming, then hit **Refresh data**.

> The **Trusted Agents + Agent–MCP sale** lane is seeded by the shopper agent in §6.1 (which the `3daf-demo-prep` skill runs as part of full prep), so it's already covered — not a manual step. Needs `ARC_SHOPPER_KEY` in the root `.envrc`.

## 7. Deploy & rollback

Push to `main` -> GitHub Actions `deploy.yml`: `terraform apply` -> Docker build/push -> VM metadata update + reset -> Fastly purge. Expect a brief VM cold-start (503) right after. `.md`, `docs/**`, `.claude/**`, and `.github/**` changes are path-ignored (no deploy). A manual `workflow_dispatch` trigger is available (`gh workflow run "Deploy to Google Cloud" --ref main`).

```bash
gh run watch "$(gh run list --workflow=deploy.yml --branch=main --limit=1 --json databaseId --jq '.[0].databaseId')" --exit-status
```

**Rollback**
- Edge (VCL / dictionaries / gate): `fastly service version activate --version=<previous>` — instant. Find prior with `fastly service version list`.
- App (server.js / views / Dockerfile): `git revert -m 1 <merge-sha> && git push origin main` — redeploys the prior image.

## 8. Telemetry pipeline

Fastly `logging_bigquery` (format `infra/logging/bq-logformat.json`) -> `three-dogs-frog-store.agentops.edge_requests`. Columns: `timestamp, class, bot_name, method, path, status, latency_ms, cache_state, client_region, client_country, govern, client_key, txn_amount, txn_initiator`. Looker custom SQL derives the display labels (`class_label`, `governance_outcome`, `channel`, `buyer_type`).

**Schema changes must precede the log-format deploy** — add BQ columns first (via `bq query 'ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...'`), then ship the format, or Fastly's inserts drop on the unknown field.

**ARC keeps its own accounting** (virtual key, provider, model, input/output tokens, session, timestamp) in the Fastly control panel — separate from this BigQuery pipeline. That's the surface for the Wise Frog's model/token/spend attribution; BigQuery remains the edge-traffic + commerce telemetry.

## 9. Verify current live config

```bash
cd "$HOME/Documents/three-dogs-and-a-frog/infra"; direnv allow . 2>/dev/null; eval "$(direnv export zsh)"
fastly service version list | tail -5
fastly service dictionary-entry list --dictionary-id=PNGoE9Xbgz2mEu4SYAv5G4 --service-id=wBCY7mB7jg6n24pJqN5q40
grep -nE 'ARC_BASE_URL|ARC_MODEL|arc.fastly' ../server.js
bq show --schema three-dogs-frog-store:agentops.edge_requests
```

Confirm the container is on the ARC path: `gcloud compute ssh three-dog-one-frog-prod --zone=us-central1-c --command="docker logs --tail 5 retail-app"` should show `Wise Frog routed through Fastly ARC`.

## 10. Gotchas & lessons (things that bit us)

- **Fastly logs unset headers as the literal string `(null)`** — Looker SQL must `NULLIF(x,'(null)')`, not just `IS NULL`.
- **zsh:** never paste `#`-comment lines (no `interactive_comments`) and always brace variables in table refs (`${PROJ}:agentops` — bare `$PROJ:a` triggers the `:a` path modifier). Also avoid `!` in pasted commands (zsh history expansion — `event not found`); single-quote grep patterns. Prefer writing scripts to a file and running with `bash`.
- **Node 20+** required — the MCP SDK needs `globalThis.crypto`, absent in Node 18 (and 18 is EOL).
- **MCP behind a CDN:** construct the transport with `enableJsonResponse: true` — the default SSE stream holds the connection open and trips Fastly's backend timeout (503).
- **Wise Frog runs through Fastly ARC**, not the model provider directly — OpenAI SDK pointed at `arc.fastly.app/v1`, model `gemini/gemini-3.5-flash`, authed with the ARC **virtual key** (the raw Gemini key lives only in ARC's provider config). ARC beta is **static-key only** (ADC / Passthrough SSO is a GA feature), and per-key **budget/rate limits are GA too** — so today the cost ceiling is the Gemini Developer API **prepay** balance plus the edge blocking bots before they reach the model. `gemini-3.5-flash` is a **reasoning model** and chains tool calls, so the `/api/agent` loop must echo each assistant turn (including `reasoning_details` and `tool_calls`) back into the message history before answering the tool call, or the chain breaks.
- **Boot disk fills from per-commit image tags.** Each deploy pulls a new `retail-app-image:<sha>` and old ones aren't pruned; after ~20 deploys the disk fills and the next `docker run` dies with `no space left on device` — the container never starts and Caddy 502s. Fixed: the startup-script now runs `docker image prune -a -f` before pulling, so every deploy reclaims space.
- **Keyed agents must be classified `verified-agent`, not just admitted.** The demo agent key gates `/catalog` + `/mcp` in `frog-agent-recv`, but the *class* is set earlier in `frog-classify`. Originally the key granted access without upgrading the class, so a keyed agent (short/automated UA) logged as an **untrusted bot in warn mode** and "Trusted Agents" stayed 0. Fix: `frog-classify.vcl` sets `X-Frog-Class = "verified-agent"` (and suppresses the bot signal) when the key matches `frog_config.agent_key`.
- **Looker time filtering (single control).** Both sources — `edge_requests` and `agent_commerce` — are driven by **one page-level date/time control**, unified by matching the control's field name and type across the two data sources. (Earlier builds gave `agent_commerce` its own `Select Time` parameter because a page filter couldn't cross sources; that's no longer needed — the shared control reaches Monetize.) `% Automated` = (bots + verified-agents) / all traffic, so the headline reconciles with the donut's two non-human slices.
- **Dockerfile** must `COPY data/ ./data/` or the app crash-loops on the missing `products.json` (502).
- **Stripe** checkout builds its success/cancel URLs from `SITE_BASE`, so it works for the browser, curl, and agents alike (no `Origin`-header dependency).
- **Dictionary flips** (enforce) take ~1–2 min to propagate — don't test the toggle 10 seconds after flipping.
- **`/api/agent` for a bot** is blocked at the edge (429) before it reaches origin — so bot governance costs nothing at the AI tier.

## 11. Troubleshooting

| Symptom | Likely cause | Check / fix |
|---------|--------------|-------------|
| Home 502 (sustained) | app crash-loop **or** full boot disk (image pull failed) | serial console: `gcloud compute instances get-serial-port-output three-dog-one-frog-prod --zone=us-central1-c`; look for `Cannot find module` (crash) or `no space left on device` (disk). Disk recovery: `docker image prune -a -f` then reset the VM — the startup-script prune prevents recurrence |
| Home 503 (brief) | VM cold-start after deploy | wait 60–90s, re-poll |
| Wise Frog "trail radio static" (500) | ARC key missing/invalid or provider misconfig | confirm `ARC_VIRTUAL_KEY` is injected (`docker logs retail-app` shows the ARC line); check ARC → Providers (Gemini key valid) and ARC → Logging for the request |
| Wise Frog blank reply | model chained tools, loop didn't echo the assistant turn | confirm the `/api/agent` tool-call loop pushes the assistant message (with `tool_calls` + `reasoning_details`) back before the tool result |
| `/catalog` 403 with key | `agent_key` mismatch | confirm dict entry vs the header value |
| Dashboard empty | quiet 60-min window | run 6.1 warm-up, set Looker window, Refresh |
| Govern shows only "Blocked" | no human `/api/agent` traffic | browse the Wise Frog to add "Allowed: human" |
