# 3 Dogs & a Frog — Project Knowledge Base (handoff)

Shared memory across all 3D&aF project chats. Each workstream below is self-contained so a new chat starts current: **read your workstream's section before acting, and update it (and the date below) when you finish work.** Owner: David Theobald, Fastly Field CTO (CDN performance, edge compute, multi-CDN, agentic readiness). Last consolidated: 2026-09-15.

## Working conventions (apply to every chat)
- **C-level tone + Fastly brand** on all customer-facing artifacts. One issue at a time; verify state before acting; test against production (real network / BigQuery / Fastly) before merging.
- **Deploys:** never push to `origin/main` casually — any push not covered by `paths-ignore` triggers a full Terraform + Docker + VM deploy via `deploy.yml`. Doc commits are path-ignored and safe to push directly.
- **Files:** prefer complete drop-in files over diffs/patches; consolidate related content into existing files rather than spawning new ones.
- **Secrets:** all creds live in gitignored `.envrc` via direnv (`FASTLY_API_TOKEN` is the MCP var). Never echo live secret values.
- **Shell:** no `#` comments in pasted multi-line zsh (interactive mode parses `#` as an arg). `preflight.sh` / `warmup.sh` use `set -uo pipefail` (not `-e`) for graceful failure reporting.
- **Execution surface:** the desktop chat sandbox has no outbound network and silently reports success for shell egress — run real network / Fastly / BigQuery work in Claude Code locally.

## Environment & access
- Built with: Claude Code 2.1.220, Fastly CLI 15.4.0, Fastly Agent Toolkit (project-scope, committed `27327ce`, unpushed), Fastly MCP (read-only, `github.com/fastly/mcp`).
- Fastly: CDN service `wBCY7mB7jg6n24pJqN5q40`; MCP registered via `claude mcp add-json` (flag-form `add` fails on this build). API token `global:read`, named `claude-code-mcp-readonly`, restricted to the 3D&aF service, expires **2026-10-25**, lives only in root `.envrc`. At `global:read`, VCL-level API endpoints return 403 — use `terraform plan` to confirm VCL config.
- Live edge: `three-dogs-frog-store-production`, active version 55 (heavy iteration — expect drift vs `main.tf`).
- Terraform: v9.4.0 Fastly provider; state in `infra/`; `infra/main.tf` primary; `infra/agentops-telemetry.tf` for BigQuery. Fully reconciled, zero drift via CI `terraform plan`.
- GCP: Compute Engine origin; BigQuery `three-dogs-frog-store.agentops`; Gemini Developer API (Wise Frog — see Workstream 3). Region `us-central1`.
- CI/CD: GitHub Actions — parallel `terraform plan` + `docker build` on PRs; deploy on push to `main`.
- Other: Looker Studio (AgentOps dashboard); GTM container `GTM-MLHMZRHK`; Atlassian Rovo (keyword search works; page lookups need numeric page ID, not URL slug). Canonical architecture source: `docs/architecture.dot` (`root/architecture.png` is a stale render).
- **Open next step:** read-only recon of live v55 (VCL, backends, rate limiter, dictionaries, TLS) → map against slide 31's four demos.

## Workstream 1 — Demo site & infrastructure
Live customer demo at `www.3dogsandafrog.com`, used in customer presentations to showcase Fastly edge capabilities. Stack: Node.js/Express + EJS on GCP Compute Engine, Docker + Caddy (TLS), Fastly CDN, Terraform + GitHub Actions CI/CD, Stripe test-mode checkout. Single product source: `data/products.json`. Repo: `three-dogs-and-a-frog`. Infra and app code kept strictly decoupled. Provenance: the site was first built in the Google Gemini app, then migrated to Claude / Claude Code for building and operations — a dev-tooling move only; the Wise Frog *runtime* stays on Gemini (see Workstream 3).

## Workstream 2 — The four demo pillars (deck slide 31)
The demo shows edge handling of agentic traffic across four pillars:
- **Bot Management** — uses Bot Management / ContentGuard (NOT NGWAF). Talk-track framing: "UA is one signal checked against TLS fingerprint and behavior" — never say "we ignore the user-agent." Gotcha: ContentGuard resets on `terraform apply` and must be re-enabled via PATCH afterward (predictable, not a bug).
- **Runtime Governance** — opens in shadow/warn mode (`enforce=false` in `frog_config` dictionary `PNGoE9Xbgz2mEu4SYAv5G4`), then flips to enforce/deny live on stage. Warm-up must run *after* setting warn mode to keep the Blocked lane empty. Under enforce, `POST /api/agent` 429s at the edge before origin (no AI cost).
- **Agentic Commerce** — Wise Frog + shopper-agent transact via `/mcp` + Stripe. Prep gotcha: run a human cart checkout (Stripe's standard test card 4242…) to populate Human Sales, else "buy the backpack" via Wise Frog logs as an agent sale.
- **AgentOps Visibility** — BigQuery `agentops` dataset → Looker Studio "Edge Traffic Classification" dashboard. Looker's native date control is day-granular only; sub-hour windows need a parameter-driven time control.

## Workstream 3 — AI runtime: Fastly ARC + Wise Frog
ARC (AI Runtime Control) is the edge AI gateway. Every AI caller authenticates with a per-key **virtual key**, never the raw provider key (the raw Gemini key lives only in ARC's provider config). OpenAI-compatible endpoint: `arc.fastly.app/v1/chat/completions`. Three use-case tiers:
- **App tier** — Wise Frog storefront assistant, virtual key `arc-wisefrog-virtual-key` (`ARC_VIRTUAL_KEY` in GCP Secret Manager). Live.
- **Agent tier** — reference shopping agent `tools/shopper-agent.js`, virtual key `arc-shopper-agent` (`ARC_SHOPPER_KEY` in `.envrc`), transacts via `/mcp`. Live reference client.
- **Builder tier** — dev/coding tools via Passthrough SSO. Planned for ARC GA.

**Wise Frog runtime surface (corrected 2026-09-15):** Gemini **3.5 Flash** via ARC → **Gemini Developer API** (`generativelanguage.googleapis.com`) — **NOT Vertex AI**. The provider key is a service-account-bound key on `three-dogs-frog-store`, restricted to the Generative Language API. `server.js` default is `ARC_MODEL=gemini/gemini-3.5-flash`. (Supersedes the earlier "Wise Frog uses Vertex AI" note that caused a Vertex-console goose chase — there is no Vertex integration.)

**GCP Gemini 2.5-Flash retirement notice — CLOSED, no action needed.** The notice covers the Gemini Enterprise Agent Platform, not the Developer API, and Wise Frog is already on 3.5 Flash. Verified 2026-09-15: 0 endpoints/models/Agent-Engine agents (us-central1), $0 `aiplatform` spend, 0 `gemini-2.5-flash` logs in 90 days. The project's `aiplatform` + `agentregistry` APIs (the source of the notice) were **disabled 2026-09-15** (clean, no dependents) — re-enable via `gcloud services enable` only if the ARC-GA ADC path later needs Vertex.

**ARC GA (2026-09-15):** ARC exited beta. Beta was static-key auth only with no in-ARC budget/rate caps; GA adds Passthrough SSO / Google-identity (ADC) auth intended to retire the static API key, plus budget/rate caps. `X-Frog-Agent-Key` is a documented static demo value, hardcoded by design; only `ARC_VIRTUAL_KEY` / `ARC_SHOPPER_KEY` are real creds.

## Workstream 4 — Google Tag Gateway (Ad Tag Gateway)
Provisioned on the storefront: GTM container `GTM-MLHMZRHK`, Google Ads tag `AW-18439127160`, measurement path `/3dafmetrics`. **#1 gotcha: GTG silently no-ops if the GTM container has no firing, detected Google tag** — the tag must be published and detected before provisioning completes. Phase 3 GTG Terraform files were shelved permanently: the gateway runs in a Fastly-platform-owned proxy service, deliberately absent from VCL, so `terraform plan` returning "No changes" is correct (not drift). Webinar: "Boost your advertising ROI with Fastly Ad Tag Gateway," co-presented with Ben Briskin (Google ad-tag expert), George Mack, and Sarah; ~60/40 business/technical audience; anchored on a 14% conversion-lift claim.

## Workstream 5 — Sales enablement decks
- **Master deck** — "Architecting for What's Next" v4.2 (dark theme). Thesis: **Identify / Govern / Monetize** agentic traffic. First-party network stats: 6.5×, ~50% machine-to-machine, 555%, 6×. Agentic Commerce framed as $1T+ by 2030. Live demo on slide 31; AgentOps on 30–32; Next Steps / gap assessment on slide 33.
- **Costco teaser** — `Architecting for What's Next - Costco Teaser.pptx`, 6 slides (Title → Why now → Identify/Govern/Monetize → Agentic Commerce → Three Questions → Next Steps CTA). Built entirely from vetted v4.2 content; expands slide-for-slide into the master deck for the deep dive.
- **Brand & compliance** — customer-facing outputs carry "AI Assisted" in the filename per Fastly's review rule, EXCEPT when the content is the user's own already-vetted material (as with the Costco teaser, where David is the accountable reviewer and the parent deck carries no label).

_(Note: a "Multi-CDN thought-leadership" deck exists but belongs to a **separate** Claude project, "Multi-CDN Best Practices" — deliberately not consolidated here to keep project memory isolated.)_

## Workstream 6 — Demo-prep tooling
Skill `3daf-demo-prep` (renamed from `agentops-preflight`), at `.claude/skills/3daf-demo-prep/` in the repo; invoke `/agentops-preflight` ~5 min before presenting the AgentOps dashboard. `preflight.sh` orchestrates; `warmup.sh` drives AI-weighted synthetic traffic (105 requests: 7 user-agents × 3 paths × 5 rounds) with verified BigQuery landing. Run warm-up *after* setting Runtime Governance to warn mode. Must run locally in Claude Code (chat sandbox has no egress).

## Workstream 7 — Recurring ops
A weekly-digest scheduled task runs Mondays 7am (calendar + Gmail → meetings, key findings, items needing attention). Personal scheduling, deal, and security-flag content stays in that digest, not in this file.
