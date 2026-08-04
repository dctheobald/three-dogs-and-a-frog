# Build 2 -- Runtime Governance: differential enforcement on X-Frog-Class for the
# Wise Frog endpoint (/api/agent). Bots/unknown are gated; human/verified agents get
# graduated RPS ceilings. Shadow-safe: enforces only when frog_config[enforce]="true".
if (req.url.path == "/api/agent") {
  declare local var.frog_over BOOL;
  declare local var.frog_reason STRING;
  set var.frog_over = false;
  set var.frog_reason = "allow";

  if (fastly.ff.visits_this_service == 0) {
    if (req.http.X-Frog-Class == "verified-agent") {
      if (ratelimit.check_rate(client.ip, frog_rc, 1, 60, 20, frog_pb, 10m)) {
        set var.frog_over = true;
        set var.frog_reason = "verified-ceiling";
      }
    } else if (req.http.X-Frog-Class == "human") {
      if (ratelimit.check_rate(client.ip, frog_rc, 1, 60, 10, frog_pb, 10m)) {
        set var.frog_over = true;
        set var.frog_reason = "human-ceiling";
      }
    } else {
      set var.frog_over = true;
      set var.frog_reason = "bot-gate";
    }
  }

  set req.http.X-Frog-Govern = var.frog_reason;

  if (var.frog_over && table.lookup(frog_config, "enforce", "false") == "true") {
    error 429 "frog-governed";
  }
}
