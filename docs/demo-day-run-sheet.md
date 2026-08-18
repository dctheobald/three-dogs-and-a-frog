# 3 Dogs & a Frog — Demo-Day Run-Sheet

*Deterministic sequence for the "Performance to Profit" demo. Order matters: the Runtime Governance beat (slide 31) only lands if the Govern lane opens empty. Keep this on a second screen.*

**Refs:** Fastly service `wBCY7mB7jg6n24pJqN5q40` · `frog_config` dict `PNGoE9Xbgz2mEu4SYAv5G4` · Looker "Edge Traffic Classification" (one page-level time control → Last 60 min). Governance commands run from `infra/` (direnv sets `FASTLY_API_TOKEN` + `FASTLY_SERVICE_ID`); warm-up commands run from the repo root.

---

## Phase A — Prep (~T-5, at your keyboard)

**A1 · Open governance in shadow.** From `infra/`:

```
fastly service dictionary-entry update --dictionary-id=PNGoE9Xbgz2mEu4SYAv5G4 --key=enforce --value=false
```

Wait ~1–2 min to propagate, then confirm it reads `false`:

```
fastly service dictionary-entry list --dictionary-id=PNGoE9Xbgz2mEu4SYAv5G4 --service-id=wBCY7mB7jg6n24pJqN5q40
```

**A2 · Warm the lanes with governance POSTs off** (so the Blocked lane stays 0). From the repo root:

```
AGENT_REQUESTS=0 bash .claude/skills/3daf-demo-prep/scripts/preflight.sh full
node tools/shopper-agent.js "Buy a backpack for a weekend hike"
```

Equivalent: `/3daf-demo-prep` → Full prep → choose **shadow** when it asks.

**A3 · Seed the human + agent sales by hand** (real browser, laptop + phone):

1. Click around `/`, `/shop`, `/cart` — seeds the **Humans** lane.
2. **Complete one checkout as a human:** add an item to the cart → Proceed to Checkout → Stripe test card `4242 4242 4242 4242`, any future expiry, any CVC. Seeds **Human Sales**.
3. Chat the **Wise Frog**: "buy the backpack." Seeds an **Agent – Wise Frog** sale and "Allowed: human" in Govern.

**A4 · Verify the open state in Looker** (page time control → Last 60 min → Refresh data):

- **Identify:** Humans > 0 · Untrusted Bots dominant · Trusted Agents > 0 · Edge-Served > 0.
- **Govern:** **Bots Blocked = 0**, only "Allowed: human" showing. ← this is the shadow open.
- **Monetize:** **Human Sales > 0 AND Agent Sales > 0** — both bars present in Value by Channel.

> If Bots Blocked ≠ 0, you either warmed in enforce or the shadow flip hadn't propagated. Reset (Phase C), then redo A1–A2.

---

## Phase B — On stage · slide 31 (Runtime Governance)

**B1 · Open in shadow.** Narrate "identify but allow" — Govern's Blocked lane sits at 0.

**B2 · Flip to enforce, live.** From `infra/`:

```
fastly service dictionary-entry update --dictionary-id=PNGoE9Xbgz2mEu4SYAv5G4 --key=enforce --value=true
```

Talk through the value for ~1–2 min while it propagates — do **not** demo the change in the first few seconds.

**B3 · Make the Blocked lane fill on cue.** From the repo root:

```
FORCE=1 WARMUP_REQUESTS=0 AGENT_REQUESTS=12 bash .claude/skills/3daf-demo-prep/scripts/preflight.sh warm
```

Refresh Looker — **Bots Blocked** jumps from 0. The same untrusted agents waved through in shadow are now 429'd at the edge, before origin. That's the reveal.

---

## Phase C — Reset (after the demo / before the next rehearsal)

Return to shadow so the next run opens clean:

```
fastly service dictionary-entry update --dictionary-id=PNGoE9Xbgz2mEu4SYAv5G4 --key=enforce --value=false
```

---

## Guardrails

- Dictionary flips take ~1–2 min — never test a flip 10 seconds after making it.
- `% Automated` eases down from its warmed peak once you browse and the Humans lane fills — that's the headline reconciling with the donut, not a regression.
- If any readout shows `/catalog key=403`, the demo agent key was rotated (runbook §5.2) — the Trusted-Agents lane won't fill until the scripts' key matches the dictionary.
- The warm-up is on-demand only — never scheduled.
