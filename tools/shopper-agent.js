#!/usr/bin/env node
/**
 * 3 Dogs & a Frog - Reference Shopping Agent  (ARC PM use case #3: the agent tier)
 *
 * An autonomous shopping agent that:
 *   - reasons with an LLM *through Fastly ARC* (governed + attributed to the
 *     `arc-shopper-agent` virtual key), and
 *   - shops via the storefront's real MCP endpoint (/mcp) as a verified agent.
 *
 * ARC governs the LLM leg; MCP is the tool surface the agent drives. Running this
 * lights up a distinct `arc-shopper-agent` lane in the ARC dashboard alongside
 * `arc-wisefrog-virtual-key`, and (on checkout) an agent sale in the edge
 * telemetry (txn_initiator = mcp).
 *
 * Run from the repo root so Node can resolve the app's node_modules:
 *   export ARC_SHOPPER_KEY='<arc-shopper-agent virtual key>'
 *   node tools/shopper-agent.js "Buy a backpack for a weekend hike"
 */

const OpenAI = require('openai');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');

const ARC_BASE_URL    = process.env.ARC_BASE_URL    || 'https://arc.fastly.app/v1';
const ARC_MODEL       = process.env.ARC_MODEL       || 'gemini/gemini-3.5-flash';
const ARC_SHOPPER_KEY = process.env.ARC_SHOPPER_KEY;                 // the arc-shopper-agent virtual key
const MCP_URL         = process.env.MCP_URL         || 'https://www.3dogsandafrog.com/mcp';
const FROG_AGENT_KEY  = process.env.FROG_AGENT_KEY  || 'sk-frog-demo-2026';
const GOAL            = process.argv.slice(2).join(' ') || process.env.GOAL || 'Buy a backpack for a weekend hike.';

if (!ARC_SHOPPER_KEY) {
  console.error('Set ARC_SHOPPER_KEY to the arc-shopper-agent virtual key first.');
  process.exit(1);
}

const ai = new OpenAI({ apiKey: ARC_SHOPPER_KEY, baseURL: ARC_BASE_URL });

// MCP tool (JSON-Schema inputSchema) -> OpenAI tool-calling format.
function toOpenAITool(t) {
  const params = (t.inputSchema && t.inputSchema.type) ? t.inputSchema : { type: 'object', properties: {} };
  return { type: 'function', function: { name: t.name, description: t.description || '', parameters: params } };
}

async function main() {
  console.log('3D&aF reference shopping agent');
  console.log(`  goal : ${GOAL}`);
  console.log(`  LLM  : ${ARC_MODEL} via Fastly ARC (${ARC_BASE_URL}) - key arc-shopper-agent`);
  console.log(`  MCP  : ${MCP_URL} (verified agent)\n`);

  // 1) Connect to the storefront's MCP server as a verified agent.
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
    requestInit: { headers: { 'X-Frog-Agent-Key': FROG_AGENT_KEY } }
  });
  const mcp = new Client({ name: 'frog-shopper-agent', version: '1.0.0' });
  await mcp.connect(transport);
  const { tools } = await mcp.listTools();
  console.log(`MCP tools discovered: ${tools.map(t => t.name).join(', ')}\n`);
  const openaiTools = tools.map(toOpenAITool);

  // 2) Agentic loop: the ARC-governed LLM plans, calls MCP tools, until done.
  const messages = [
    { role: 'system', content:
      'You are an autonomous shopping agent for the "3 Dogs & a Frog" outdoor gear store. ' +
      'Use the MCP tools to accomplish the user goal: inspect the catalog, confirm the item is in stock, ' +
      'then create a checkout. When you have a checkout URL, present it plainly and stop. Keep reasoning brief.' },
    { role: 'user', content: GOAL }
  ];

  let guard = 0;
  while (guard < 8) {
    guard++;
    const res = await ai.chat.completions.create({ model: ARC_MODEL, messages, tools: openaiTools, tool_choice: 'auto' });
    const msg = res.choices[0].message;
    messages.push(msg);   // echo the assistant turn (tool_calls + reasoning_details) back - 3.5-flash is a reasoning model

    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      console.log(`\nAgent: ${msg.content || '(no further action)'}\n`);
      break;
    }

    for (const call of msg.tool_calls) {
      let args = {};
      try { args = JSON.parse(call.function.arguments || '{}'); } catch (_) {}
      console.log(`-> ${call.function.name}(${JSON.stringify(args)})`);
      let text;
      try {
        const out = await mcp.callTool({ name: call.function.name, arguments: args });
        text = (out.content || []).map(c => c.text || '').join('\n') || JSON.stringify(out);
      } catch (e) {
        text = JSON.stringify({ error: String((e && e.message) || e) });
      }
      console.log(`   <- ${text}`);
      messages.push({ role: 'tool', tool_call_id: call.id, content: text });
    }
  }

  await mcp.close();
  console.log('Done - check ARC -> Logging for the arc-shopper-agent lane, and the dashboard Monetize row for the agent sale.');
}

main().catch(e => { console.error('Agent error:', (e && e.stack) || e); process.exit(1); });
