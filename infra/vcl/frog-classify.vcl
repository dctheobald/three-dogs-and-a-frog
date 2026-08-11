declare local var.frog_class STRING;
declare local var.trusted_key BOOL;

# Demo trust override: a request presenting the shared demo agent key is a
# trusted agent, regardless of Bot Management's UA-based verdict. This aligns
# the telemetry class with the /catalog + /mcp gate (frog-agent-recv), which
# already admits key-holders -- so a keyed agent lands in "Trusted Agents"
# instead of "Untrusted Bots".
set var.trusted_key = false;
if (req.http.X-Frog-Agent-Key == table.lookup(frog_config, "agent_key", "__unset__")) {
  set var.trusted_key = true;
}

if (var.trusted_key) {
  set var.frog_class = "verified-agent";
} else if (!fastly.bot.analyzed) {
  set var.frog_class = "unknown";
} else if (!fastly.bot.detected) {
  set var.frog_class = "human";
} else if (fastly.bot.category.is_verified) {
  set var.frog_class = "verified-agent";
} else {
  set var.frog_class = "bot";
}

set req.http.X-Frog-Class = var.frog_class;
# Only stamp a bot signal for genuinely untrusted automation -- a keyed trusted
# agent should not carry a "bot management signal" in the telemetry.
if (!var.trusted_key && fastly.bot.detected && fastly.bot.name != "") {
  set req.http.X-Frog-Bot-Name = fastly.bot.name;
}

# Build 2 telemetry: pseudonymous per-client key (hashed IP, not PII) for
# top-throttled-clients analysis on the observability dashboard.
set req.http.X-Frog-Client = substr(digest.hash_sha256(client.ip), 0, 12);
