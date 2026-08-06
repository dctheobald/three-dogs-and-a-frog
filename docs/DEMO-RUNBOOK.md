# 3 Dogs & a Frog — AgentOps Demo Runbook

*Operational runbook for the "Performance to Profit" edge + agentic-commerce demo.*
*Site: https://www.3dogsandafrog.com · Last updated: 2026-08-06*

---

## 1. The story

A luxury pet-gear storefront that demonstrates the edge doing three jobs, end to end, with no second stack:

- **Identify** — Fastly Bot Management (ContentGuard) classifies every request as human, verified agent, or untrusted bot.
- **Govern** — Edge Rate Limiting protects the whole site; agent-surface enforcement allows humans/trusted agents and blocks untrusted bots on the sensitive `/api/agent` endpoint.
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
   - Wise Frog assistant  (Gemini 3.6 Flash via Vertex, global endpoint)
   - /mcp  MCP server  (@modelcontextprotocol/sdk, JSON response mode)
   - Stripe checkout (test mode)
```

**Single source of truth:** `data/products.json` drives all four consumers — the storefront views, the Wise Frog inventory, the MCP tools, and (projected at deploy) the edge `frog_catalog` dictionary. Edit the file, everything moves.

## 3. Edge request flow (VCL, recv order)

| pri | snippet | does |
|----:|---------|------|
| 5  | `frog-classify`   | stamps `X-Frog-Class` (human/verified-agent/bot) + hashed `X-Frog-Client` |
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
| Govern | **ARC (AI Runtime Control)** | *TBD — integration pending internal docs* |
| Monetize | Edge dictionary (catalog) served at the edge | `/catalog` served with no origin |
| Monetize | (3rd-party) MCP + Stripe | `/mcp` tools, Stripe test checkout |

> Note: on a VCL/Deliver service the VCL-native edge data store is an **Edge Dictionary** (`frog_catalog`); Config Store is its Compute-platform sibling. Same concept — edge-cached key/value served with no origin.

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
Edit `data/products.json` and deploy. `stock_qty` drives everything: `0` -> Out of Stock (checkout refused), `1–5` -> Low Stock, `>5` -> In Stock.

## 6. Demo-day pre-flight (~5 min before)

### 6.1 Warm-up (fills the dashboard's live 60-min window)
Run the pre-flight skill's warm-up. It fills the Identify bot lane, exercises `/api/agent` governance (the "Blocked" line), spot-checks the agent surface, and stays under the 100 rps limiter:

```bash
bash .claude/skills/agentops-preflight/scripts/preflight.sh
```

In Cowork / Claude Code you can also just invoke the **`agentops-preflight`** skill. Do **not** run it on a schedule — it injects synthetic traffic that would pollute the real classification picture.

### 6.2 Manual steps a script can't do
- **Humans lane:** only a real browser produces `human` classifications — click around the storefront on a laptop/phone, and chat with the Wise Frog (including "buy the backpack") to seed human + agent-sale rows.
- **Looker window:** set the report's date & time picker to **Last 60 minutes**, wait ~60s for the log flush + BigQuery streaming, then hit **Refresh data**.

## 7. Deploy & rollback

Push to `main` -> GitHub Actions `deploy.yml`: `terraform apply` -> Docker build/push -> VM metadata update + reset -> Fastly purge. Expect a brief VM cold-start (503) right after. `.md` and `.github/**` changes are path-ignored (no deploy).

```bash
gh run watch "$(gh run list --workflow=deploy.yml --branch=main --limit=1 --json databaseId --jq '.[0].databaseId')" --exit-status
```

**Rollback**
- Edge (VCL / dictionaries / gate): `fastly service version activate --version=<previous>` — instant. Find prior with `fastly service version list`.
- App (server.js / views / Dockerfile): `git revert -m 1 <merge-sha> && git push origin main` — redeploys the prior image.

## 8. Telemetry pipeline

Fastly `logging_bigquery` (format `infra/logging/bq-logformat.json`) -> `three-dogs-frog-store.agentops.edge_requests`. Columns: `timestamp, class, bot_name, method, path, status, latency_ms, cache_state, client_region, client_country, govern, client_key, txn_amount, txn_initiator`. Looker custom SQL derives the display labels (`class_label`, `governance_outcome`, `channel`, `buyer_type`).

**Schema changes must precede the log-format deploy** — add BQ columns first (via `bq query 'ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...'`), then ship the format, or Fastly's inserts drop on the unknown field.

## 9. Verify current live config

```bash
cd "$HOME/Documents/three-dogs-and-a-frog/infra"; direnv allow . 2>/dev/null; eval "$(direnv export zsh)"
fastly service version list | tail -5
fastly service dictionary-entry list --dictionary-id=PNGoE9Xbgz2mEu4SYAv5G4 --service-id=wBCY7mB7jg6n24pJqN5q40
grep -n 'model:' ../server.js
bq show --schema three-dogs-frog-store:agentops.edge_requests
```

## 10. Gotchas & lessons (things that bit us)

- **Fastly logs unset headers as the literal string `(null)`** — Looker SQL must `NULLIF(x,'(null)')`, not just `IS NULL`.
- **zsh:** never paste `#`-comment lines (no `interactive_comments`) and always brace variables in table refs (`${PROJ}:agentops` — bare `$PROJ:a` triggers the `:a` path modifier). Prefer writing scripts to a file and running with `bash`.
- **Node 20+** required — the MCP SDK needs `globalThis.crypto`, absent in Node 18 (and 18 is EOL).
- **MCP behind a CDN:** construct the transport with `enableJsonResponse: true` — the default SSE stream holds the connection open and trips Fastly's backend timeout (503).
- **Gemini 3.6 Flash** lives on the Vertex **global** endpoint (regional = 404); needs `@google/genai` >= 2.15; and it chains tool calls, so the `/api/agent` handler must **loop** over function calls until the model returns text (a single round returns empty replies).
- **Dockerfile** must `COPY data/ ./data/` or the app crash-loops on the missing `products.json` (502).
- **Stripe** `/create-checkout-session` builds its success/cancel URLs from the `Origin` header — fine from the browser; a raw curl without `Origin` 500s.
- **Dictionary flips** (enforce) take ~1–2 min to propagate — don't test the toggle 10 seconds after flipping.
- **`/api/agent` for a bot** is blocked at the edge (429) before it reaches origin — so bot governance costs nothing at the AI tier.

## 11. Troubleshooting

| Symptom | Likely cause | Check / fix |
|---------|--------------|-------------|
| Home 502 (sustained) | app crash-loop | serial console: `gcloud compute instances get-serial-port-output three-dog-one-frog-prod --zone=us-central1-c`; look for `Cannot find module` / stack trace |
| Home 503 (brief) | VM cold-start after deploy | wait 60–90s, re-poll |
| `/catalog` 403 with key | `agent_key` mismatch | confirm dict entry vs the header value |
| Wise Frog blank reply | model chained tools, handler didn't loop | confirm the `while` function-call loop in `server.js` |
| Dashboard empty | quiet 60-min window | run 6.1 warm-up, set Looker window, Refresh |
| Govern shows only "Blocked" | no human `/api/agent` traffic | browse the Wise Frog to add "Allowed: human" |
