# Build 4 -- render the edge-served catalog (900) and the agent-gate rejection (403).
if (obj.status == 900 && obj.response == "agent-catalog") {
  set obj.status = 200;
  set obj.http.Content-Type = "application/json";
  set obj.http.X-Frog-Served-By = "edge-dictionary";
  synthetic table.lookup(frog_catalog, "catalog", "[]");
  return(deliver);
}
if (obj.status == 403 && obj.response == "agent-forbidden") {
  set obj.status = 403;
  set obj.http.Content-Type = "application/json";
  synthetic {"{"error": "verified agent required for the agentic-commerce catalog" }"};
  return(deliver);
}
