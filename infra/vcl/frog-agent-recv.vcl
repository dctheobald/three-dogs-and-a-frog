# Build 4 -- Agentic Commerce: gate the agent surface (/catalog, /mcp) to the trusted
# lane, and serve the product catalog entirely from the edge (frog_catalog, no origin).
if (req.url.path == "/catalog" || req.url.path ~ "^/mcp") {
  if (req.http.X-Frog-Class != "verified-agent"
      && req.http.X-Frog-Agent-Key != table.lookup(frog_config, "agent_key", "__unset__")) {
    error 403 "agent-forbidden";
  }
  if (req.url.path == "/catalog") {
    error 900 "agent-catalog";
  }
}
