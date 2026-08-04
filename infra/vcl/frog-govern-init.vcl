# Build 2 -- Runtime Governance: rate-limiting primitives for /api/agent.
# Declared at init (top level) per Fastly's edge rate limiting pattern.
penaltybox frog_pb {}
ratecounter frog_rc {}
