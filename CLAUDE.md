3 Dogs & a Frog — AgentOps state (handoff)

Environment built: Claude Code 2.1.220, Fastly CLI 15.4.0, Fastly Agent Toolkit (project-scope, committed as 27327ce, unpushed), Fastly MCP connected read-only
Token: global:read, scoped to service wBCY7mB7jg6n24pJqN5q40, expires 2026-10-25, lives only in root .envrc
Quirk: claude mcp add flag forms fail on this build — use add-json
Live edge: three-dogs-frog-store-production, active version 55 (heavy iteration — expect drift vs. main.tf)
Next step: read-only recon of live v55 (VCL, backends, rate limiter, dictionaries, TLS) → map against slide 31's four demos: Bot Management, Runtime Governance, Agentic Commerce, AgentOps Visibility
Constraints: Gemini stays as Wise Frog runtime (product); Claude owns AgentOps + code; one issue at a time; C-level tone, Fastly brand on artifacts
Tooling: - Demo pre-flight: `.claude/skills/agentops-preflight/` — run `/agentops-preflight` ~5 min before presenting the AgentOps Edge Traffic Classification dashboard.
