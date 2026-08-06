require('dotenv').config();
const express = require('express');
const path = require('path');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const OpenAI = require('openai');
const products = require('./data/products.json');
const productsById = Object.fromEntries(products.map(p => [p.id, p]));
const STATUS_THRESHOLD = 5;
function statusFor(qty) {
  if (qty <= 0) return 'Out of Stock';
  if (qty <= STATUS_THRESHOLD) return 'Low Stock';
  return 'In Stock';
}

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { z } = require('zod');
const SITE_BASE = 'https://www.3dogsandafrog.com';
function toAgentView(p) {
  return { id: p.id, name: p.name, price: p.price, currency: p.currency, in_stock: p.stock_qty > 0, stock_qty: p.stock_qty, image: SITE_BASE + p.image };
}
async function createCheckout(items) {
  const problems = [], lineItems = []; let amount = 0;
  for (const it of items) {
    const prod = productsById[it.id];
    if (!prod) { problems.push('unknown product: ' + it.id); continue; }
    if (prod.stock_qty <= 0) { problems.push(prod.name + ' is out of stock'); continue; }
    if (it.qty > prod.stock_qty) { problems.push('only ' + prod.stock_qty + ' of ' + prod.name + ' in stock (requested ' + it.qty + ')'); continue; }
    lineItems.push({ price_data: { currency: 'usd', product_data: { name: prod.name }, unit_amount: Math.round(prod.price * 100) }, quantity: it.qty });
    amount += prod.price * it.qty;
  }
  if (problems.length) return { ok: false, problems };
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'], mode: 'payment', line_items: lineItems,
    success_url: SITE_BASE + '/success?session_id={CHECKOUT_SESSION_ID}', cancel_url: SITE_BASE + '/cart'
  });
  return { ok: true, url: session.url, session_id: session.id, amount };
}
function buildMcpServer(res) {
  const server = new McpServer({ name: 'three-dogs-frog-agentic-commerce', version: '1.0.0' });
  server.registerTool('list_products',
    { description: 'List every product in the 3 Dogs & a Frog catalog with price and live availability.' },
    async () => ({ content: [{ type: 'text', text: JSON.stringify(products.map(toAgentView)) }] })
  );
  server.registerTool('get_product',
    { description: 'Get full detail for one product by id (harness, bowl, backpack).', inputSchema: { id: z.string().describe('Product id, e.g. "backpack"') } },
    async ({ id }) => {
      const prod = productsById[id];
      if (!prod) return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: 'product not found', id }) }] };
      return { content: [{ type: 'text', text: JSON.stringify({ ...toAgentView(prod), description: prod.description, category: prod.categoryLabel }) }] };
    }
  );
  server.registerTool('checkout',
    { description: 'Create a checkout session for one or more items. Validates stock and returns a Stripe checkout URL (test mode).', inputSchema: { items: z.array(z.object({ id: z.string(), qty: z.number().int().positive() })).describe('Line items to purchase') } },
    async ({ items }) => {
      const result = await createCheckout(items);
      if (!result.ok) return { isError: true, content: [{ type: 'text', text: JSON.stringify({ status: 'rejected', problems: result.problems }) }] };
      if (res) { res.setHeader('X-Frog-Txn-Amount', result.amount.toFixed(2)); res.setHeader('X-Frog-Txn-Initiator', 'mcp'); }
      return { content: [{ type: 'text', text: JSON.stringify({ status: 'ok', checkout_url: result.url, session_id: result.session_id }) }] };
    }
  );
  return server;
}

const app = express();

// --- VIEW ENGINE & MIDDLEWARE ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ==========================================
// --- GLOBAL AI INITIALIZATION (via Fastly ARC) ---
// ==========================================

// The Wise Frog no longer calls Google directly. Every model call is routed
// through Fastly AI Runtime Control (ARC), which governs, attributes, and logs
// the traffic and forwards it to the Gemini Developer API.
//
// ARC is OpenAI-compatible, so we use the `openai` SDK pointed at ARC's endpoint
// and authenticate with an ARC virtual key (NOT a raw Gemini key). The raw
// provider key lives only in ARC's provider config.
//   ARC_VIRTUAL_KEY : the ARC virtual key issued for the Wise Frog (arc-wisefrog-virtual-key)
//   ARC_BASE_URL    : https://arc.fastly.app/v1  (default)
//   ARC_MODEL       : gemini/gemini-3.5-flash    (default)

const ARC_BASE_URL = process.env.ARC_BASE_URL || 'https://arc.fastly.app/v1';
const ARC_MODEL = process.env.ARC_MODEL || 'gemini/gemini-3.5-flash';
const ARC_VIRTUAL_KEY = process.env.ARC_VIRTUAL_KEY;

if (ARC_VIRTUAL_KEY) {
    console.log(`🛡️  Wise Frog routed through Fastly ARC (${ARC_BASE_URL}, model ${ARC_MODEL})`);
} else {
    console.warn('⚠️  Warning: ARC_VIRTUAL_KEY not set — Wise Frog model calls will 401 until it is provided.');
}

const ai = new OpenAI({
    apiKey: ARC_VIRTUAL_KEY || 'missing-arc-virtual-key',
    baseURL: ARC_BASE_URL
});

// ==========================================
// --- AI TOOLS & AGENT ENDPOINT ---
// ==========================================

// Tools are declared in OpenAI tool-calling format ({ type:'function', function:{...} }).
const tools = [
    {
        type: 'function',
        function: {
            name: 'check_inventory',
            description: 'Check product inventory levels and pricing.',
            parameters: {
                type: 'object',
                properties: { product_name: { type: 'string' } },
                required: ['product_name']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'add_to_cart',
            description: "Add a product to the user's shopping cart when they explicitly ask to buy it.",
            parameters: {
                type: 'object',
                properties: {
                    product_name: { type: 'string', description: 'The simple name of the product (e.g., backpack, bowl, harness)' }
                },
                required: ['product_name']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'create_checkout',
            description: 'Create a secure Stripe checkout link when the customer clearly wants to BUY or purchase a specific product now.',
            parameters: {
                type: 'object',
                properties: { product_name: { type: 'string', description: 'The product to buy (e.g., backpack, bowl, harness)' } },
                required: ['product_name']
            }
        }
    }
];

const SYSTEM_PROMPT = `You are the 'Wise Frog', the expert trail guide and sales assistant for the '3 Dogs and a Frog' outdoor gear storefront.
Constraint 1: You must keep every response strictly under 3 sentences.
Constraint 2: Maintain a helpful, adventurous, and outdoorsy tone.
Constraint 3: If a user asks to add an item to their pack or cart, use the 'add_to_cart' tool. If a user clearly wants to buy, purchase, or check out an item now, you MUST call the 'create_checkout' tool in that same turn to generate the secure checkout link -- never claim you created a link without actually calling the tool.
Constraint 4: You are strictly limited to discussing outdoor gear, camping, dogs, and the '3 Dogs and a Frog' store. If a user asks about politics, coding, history, or ANY unrelated topic, you must politely refuse to answer and steer the conversation back to outdoor gear.`;

// Local Mock Database Function
function checkInventoryLocally(productName) {
    console.log(`🧠 [Database] Looking up secure data for: ${productName}`);
    const key = Object.keys(productsById).find(k => productName.toLowerCase().includes(k));
    if (!key) return { status: "Not Found" };
    const prod = productsById[key];
    return { status: statusFor(prod.stock_qty), price: prod.price, name: prod.name, image: prod.image };
}

// In-memory store to remember conversation history (per session, as an OpenAI messages array).
const activeChats = new Map();

app.post('/api/agent', async (req, res) => {
    const sessionId = req.headers['x-session-id'] || 'default-session';
    try {
        const userMessage = req.body.message;
        let clientAction = null;

        // Grab (or start) this session's message history.
        let messages = activeChats.get(sessionId);
        if (!messages) {
            console.log(`🆕 Starting new AI memory session: ${sessionId}`);
            messages = [{ role: 'system', content: SYSTEM_PROMPT }];
            activeChats.set(sessionId, messages);
        }
        messages.push({ role: 'user', content: userMessage });

        let completion = await ai.chat.completions.create({
            model: ARC_MODEL, messages, tools, tool_choice: 'auto'
        });
        let msg = completion.choices[0].message;

        // Tool-call loop. gemini-3.5-flash is a reasoning model and chains tool calls,
        // so we echo each assistant turn (tool_calls + any reasoning_details ride along
        // on the message object) back into the history, answer every tool_call_id, and
        // re-ask until the model returns plain text. Guard caps the round-trips.
        let fcGuard = 0;
        while (msg.tool_calls && msg.tool_calls.length > 0 && fcGuard < 5) {
            fcGuard++;
            messages.push(msg);

            for (const call of msg.tool_calls) {
                let args = {};
                try { args = JSON.parse(call.function.arguments || '{}'); } catch (_) { args = {}; }
                const productName = args.product_name || '';
                let toolResult;

                if (call.function.name === 'check_inventory') {
                    toolResult = checkInventoryLocally(productName);
                }
                else if (call.function.name === 'add_to_cart') {
                    const secureProductData = checkInventoryLocally(productName);
                    if (secureProductData.status === "Out of Stock") {
                        toolResult = { status: "Out of stock; do not add. Tell the customer this item is currently unavailable." };
                    } else if (secureProductData.status !== "Not Found") {
                        console.log(`🛒 [Action] Securely routing ${secureProductData.name} to frontend cart.`);
                        clientAction = {
                            type: 'ADD_TO_CART',
                            product: {
                                id: productName.toLowerCase(),
                                name: secureProductData.name,
                                price: secureProductData.price,
                                quantity: 1,
                                image: secureProductData.image
                            }
                        };
                        toolResult = { status: "Success" };
                    } else {
                        toolResult = { status: "Failed, item not found" };
                    }
                }
                else if (call.function.name === 'create_checkout') {
                    const ckey = Object.keys(productsById).find(k => productName.toLowerCase().includes(k));
                    const prod = ckey ? productsById[ckey] : null;
                    if (!prod) {
                        toolResult = { status: "item not found" };
                    } else {
                        const result = await createCheckout([{ id: prod.id, qty: 1 }]);
                        if (result.ok) {
                            clientAction = { type: 'CHECKOUT', url: result.url, product: prod.name };
                            res.setHeader('X-Frog-Txn-Amount', result.amount.toFixed(2));
                            res.setHeader('X-Frog-Txn-Initiator', 'frog');
                            toolResult = { status: "checkout ready; tell the customer to tap the secure checkout button below" };
                        } else {
                            toolResult = { status: "rejected", problems: result.problems };
                        }
                    }
                }
                else {
                    toolResult = { status: "unknown tool" };
                }

                messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(toolResult) });
            }

            completion = await ai.chat.completions.create({
                model: ARC_MODEL, messages, tools, tool_choice: 'auto'
            });
            msg = completion.choices[0].message;
        }

        // Persist the final assistant turn into session memory.
        messages.push(msg);

        // Demo safety net: if the shopper clearly wants to buy a specific product but the
        // model did not emit a create_checkout call, create the checkout deterministically.
        if (/\b(buy|purchase|checkout|check ?out|i'?ll take|order|get me)\b/i.test(userMessage) && (!clientAction || clientAction.type !== 'CHECKOUT')) {
            const bkey = Object.keys(productsById).find(k => userMessage.toLowerCase().includes(k));
            if (bkey) {
                const netResult = await createCheckout([{ id: bkey, qty: 1 }]);
                if (netResult.ok) {
                    clientAction = { type: 'CHECKOUT', url: netResult.url, product: productsById[bkey].name };
                    res.setHeader('X-Frog-Txn-Amount', netResult.amount.toFixed(2));
                    res.setHeader('X-Frog-Txn-Initiator', 'frog');
                }
            }
        }

        const replyText = (msg && msg.content) ? msg.content : "Ribbit! Let me know how I can help with your gear.";
        res.json({ reply: replyText, action: clientAction });

    } catch (error) {
        // Beta ARC error visibility is still maturing, so log enough to trace whether a
        // failure was ARC-side or upstream at the provider (client/provider/model/session/time).
        console.error(`Agent Error [session=${sessionId} model=${ARC_MODEL} at=${new Date().toISOString()}]:`, error && error.message ? error.message : error);
        res.status(500).json({ reply: "Ribbit... my trail radio is getting static." });
    }
});

// ==========================================
// --- PAGE & STRIPE ROUTERS ---
// ==========================================
app.get('/', (req, res) => res.render('index', { title: 'Home', products }));
app.get('/shop', (req, res) => res.render('shop', { title: 'Shop', products }));
app.get('/cart', (req, res) => res.render('cart', { title: 'Cart' }));
app.get('/success', (req, res) => res.render('success', { title: 'Success' }));
app.get('/observability', (req, res) => res.render('observability', { title: 'Edge Observability' }));

app.post('/create-checkout-session', async (req, res) => {
    try {
        const { cart } = req.body;
        const byName = Object.fromEntries(products.map(p => [p.name.toLowerCase(), p]));
        const problems = [], lineItems = []; let txnAmount = 0;
        for (const item of (cart || [])) {
            const prod = byName[(item.name || '').toLowerCase()] || productsById[item.id];
            const qty = item.quantity || 1;
            if (!prod) { problems.push('Unknown item: ' + (item.name || item.id)); continue; }
            if (prod.stock_qty <= 0) { problems.push(prod.name + ' is out of stock'); continue; }
            if (qty > prod.stock_qty) { problems.push('Only ' + prod.stock_qty + ' of ' + prod.name + ' available'); continue; }
            lineItems.push({ price_data: { currency: 'usd', product_data: { name: prod.name }, unit_amount: Math.round(prod.price * 100) }, quantity: qty });
            txnAmount += prod.price * qty;
        }
        if (problems.length) return res.status(409).json({ error: problems.join('; ') });
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'], mode: 'payment', line_items: lineItems,
            success_url: SITE_BASE + '/success?session_id={CHECKOUT_SESSION_ID}', cancel_url: SITE_BASE + '/cart',
        });
        res.setHeader('X-Frog-Txn-Amount', txnAmount.toFixed(2));
        res.setHeader('X-Frog-Txn-Initiator', 'human');
        res.json({ url: session.url });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/mcp', async (req, res) => {
  const server = buildMcpServer(res);
  try {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { transport.close(); server.close(); });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (e) {
    console.error('MCP error:', e);
    if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null });
  }
});
app.get('/mcp', (req, res) => res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null }));
app.delete('/mcp', (req, res) => res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed.' }, id: null }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🏕️ 3 Dogs and a Frog backend running on port ${PORT}`);
});
