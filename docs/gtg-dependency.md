# Google Tag Gateway (GTG) — Operational Note

Google Tag Gateway (Fastly Ad Tag Gateway) is **enabled** on `www.3dogsandafrog.com`.
It serves the Google tag first-party through the Fastly edge, so measurement traffic
runs on our own domain instead of `googletagmanager.com` / `google-analytics.com`.

It was enabled through **Google Tag Manager**, and it is **not** managed by this repo's
Terraform. Read the next section before touching `infra/`.

---

## Current configuration

| Item | Value |
| --- | --- |
| Domain | `www.3dogsandafrog.com` |
| Measurement path | `/3dafmetrics` |
| GTM container | `GTM-MLHMZRHK` |
| Destination (Google Ads) | `AW-18439127160` (umbrella Google tag `GT-MQRZ3G2H`) |
| Managed from | Google Tag Manager → Admin → **Google tag gateway** |

---

## ⚠️ This is NOT in Terraform — and must not be added

The gateway routing (`/3dafmetrics` → Google's endpoint) is provisioned and operated by
**Fastly's platform**, out-of-band from our `fastly_service_vcl`. It lives on a separate,
Fastly-managed service and is attached to the **domain**, not to a version of our service.

Consequences:

- `terraform plan` reports **"No changes."** The gateway is invisible to our IaC **by design**.
  That is **not drift** — do not try to "fix" it.
- **Do NOT add an `fps.goog` backend or a `/3dafmetrics` condition/snippet to `infra/main.tf`.**
  It would create a second, competing route for the same path and conflict with the
  platform-managed routing.
- A `terraform apply` on our service does **not** strip the gateway (different object, keyed to
  the domain). It is safe to run applies as normal.

## Why it doesn't show in the Fastly portal

The current rollout phase is Google-UI-managed; there is intentionally **no Fastly-UI indicator**
that GTG is enabled, and no corresponding VCL on our service. Its absence from the portal and
from `terraform plan` is expected, not a misconfiguration.

---

## Verify it's live

```
curl -sI https://www.3dogsandafrog.com/3dafmetrics/healthy
```

Expect `HTTP/2 200` served through Fastly (`via: 1.1 varnish`). For a fuller check, load the
storefront with DevTools → Network and confirm the Google tag loads from
`www.3dogsandafrog.com/3dafmetrics/…` (first-party) rather than a Google domain.

### After any future `terraform apply`

Re-run the health check above and confirm `200`. It is expected to survive service version
bumps; verify anyway before relying on it for a live demo.

---

## Disable / rollback

- Opt out in **Google Tag Manager → Admin → Google tag gateway → Configure → Delete**.
- Fails safe: if the Fastly↔Google link ever drops, the site keeps serving normally — only
  measurement pauses. The gateway cannot take the storefront down.

---

## Setup gotcha (discovered during rollout)

The automated flow **silently no-ops until a Google tag is firing *and* detected on the site.**
Enabling the gateway against an empty GTM container looks stuck ("Pending / Incomplete") with no
error. Correct sequence:

1. Add and **publish** the Google tag in GTM.
2. Confirm it's firing (Tag Assistant / DevTools).
3. *Then* enable / complete the gateway — the edge provisions within ~2 minutes.

---

## References

- Fastly public docs: *Fastly Ad Tag Gateway* integration guide (fastly.com/documentation).
- Google setup guide: Tag Manager → Google tag gateway (support.google.com).
- Internal Fastly runbook: Confluence — *"Fastly Ad Tag Manager (Google Tag Gateway)"*
  (CustomerEngineering space). Contains the internal API/architecture/escalation details;
  **do not copy those into this repo.**

---

## Customer / webinar note

Keep Fastly-internal architecture out of customer-facing material. The customer story is:
"enable it in Google Tag Manager; Fastly provisions the edge automatically." The Fastly-UI
toggle is a future phase — today's flow is Google-UI-driven end to end.
