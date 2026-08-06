require('dotenv').config();
const express = require('express');
const path = require('path');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { GoogleGenAI } = require('@google/genai');
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
function buildMcpServer() {
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
      const problems = [], lineItems = [];
      for (const it of items) {
        const prod = productsById[it.id];
        if (!prod) { problems.push('unknown product: ' + it.id); continue; }
        if (prod.stock_qty <= 0) { problems.push(prod.name + ' is out of stock'); continue; }
        if (it.qty > prod.stock_qty) { problems.push('only ' + prod.stock_qty + ' of ' + prod.name + ' in stock (requested ' + it.qty + ')'); continue; }
        lineItems.push({ price_data: { currency: 'usd', product_data: { name: prod.name }, unit_amount: Math.round(prod.price * 100) }, quantity: it.qty });
      }
      if (problems.length) return { isError: true, content: [{ type: 'text', text: JSON.stringify({ status: 'rejected', problems }) }] };
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'], mode: 'payment', line_items: lineItems,
        success_url: SITE_BASE + '/success?session_id={CHECKOUT_SESSION_ID}', cancel_url: SITE_BASE + '/cart'
      });
      return { content: [{ type: 'text', text: JSON.stringify({ status: 'ok', checkout_url: session.url, session_id: session.id }) }] };
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
// --- GLOBAL AI INITIALIZATION ---
// ==========================================

// 1. PRODUCTION PATH: If we have an API Key (injected), use it.
// 2. CLOUD NATIVE PATH: If no key, we rely on the VM's internal service account (Vertex AI).
//    This requires the GCP_PROJECT_ID we just injected via Terraform.

const geminiApiKey = process.env.GEMINI_API_KEY;
const gcpProjectId = process.env.GCP_PROJECT_ID;

let ai;

if (geminiApiKey) {
    // DEVELOPMENT/MANUAL PATH
    console.log("🚀 Initializing Gemini with API Key");
    ai = new GoogleGenAI({ apiKey: geminiApiKey });
} else if (gcpProjectId) {
    // PRODUCTION PATH (The fix you needed!)
    console.log(`☁️ Initializing Gemini with Vertex AI (Project: ${gcpProjectId})`);
    ai = new GoogleGenAI({
        vertexai: true,
        project: gcpProjectId,
        location: 'us-central1'
    });
} else {
    // FALLBACK
    console.warn("⚠️ Warning: No API Key or Project ID found! AI may fail.");
    ai = new GoogleGenAI({ vertexai: true, location: 'us-central1' });
}

// ==========================================
// --- AI TOOLS & AGENT ENDPOINT ---
// ==========================================

// 1. Fully defined Inventory Tool
const checkInventoryTool = {
    name: 'check_inventory',
    description: 'Check product inventory levels and pricing.',
    parameters: {
        type: 'object',
        properties: { product_name: { type: 'string' } },
        required: ['product_name']
    }
};

// 2. Fully defined Cart Tool
const addToCartTool = {
    name: 'add_to_cart',
    description: 'Add a product to the user\'s shopping cart when they explicitly ask to buy it.',
    parameters: {
        type: 'object',
        properties: {
            product_name: { type: 'string', description: 'The simple name of the product (e.g., backpack, bowl, harness)' }
        },
        required: ['product_name']
    }
};

// 3. Local Mock Database Function
function checkInventoryLocally(productName) {
    console.log(`🧠 [Database] Looking up secure data for: ${productName}`);
    const key = Object.keys(productsById).find(k => productName.toLowerCase().includes(k));
    if (!key) return { status: "Not Found" };
    const prod = productsById[key];
    return { status: statusFor(prod.stock_qty), price: prod.price, name: prod.name, image: prod.image };
}

// 🧠 4. In-memory store to remember conversation history!
const activeChats = new Map();

app.post('/api/agent', async (req, res) => {
    try {
        const userMessage = req.body.message;
        
        // 🧠 5. Grab the unique session ID from the frontend
        const sessionId = req.headers['x-session-id'] || 'default-session';
        let clientAction = null; 

        // 🧠 6. Check if this user already has an active conversation
        let chat = activeChats.get(sessionId);

        if (!chat) {
            console.log(`🆕 Starting new AI memory session: ${sessionId}`);
            // If no history exists, create the chat and store it in the Map
            chat = ai.chats.create({
                model: "gemini-2.5-flash",
                config: {
                    systemInstruction: `You are the 'Wise Frog', the expert trail guide and sales assistant for the '3 Dogs and a Frog' outdoor gear storefront. 
                    Constraint 1: You must keep every response strictly under 3 sentences.
                    Constraint 2: Maintain a helpful, adventurous, and outdoorsy tone.
                    Constraint 3: If a user asks to buy an item or add it to their pack, you MUST use the 'add_to_cart' tool to do it for them.
		            Constraint 4: You are strictly limited to discussing outdoor gear, camping, dogs, and the '3 Dogs and a Frog' store. If a user asks about politics, coding, history, or ANY unrelated topic, you must politely refuse to answer and steer the conversation back to outdoor gear.`,
                    tools: [{ functionDeclarations: [checkInventoryTool, addToCartTool] }] 
                }
            });
            activeChats.set(sessionId, chat);
        }

        // We now use the persistent 'chat' object, so it remembers everything!
        let response = await chat.sendMessage({ message: userMessage });

        if (response.functionCalls && response.functionCalls.length > 0) {
            const call = response.functionCalls[0];
            
            if (call.name === 'check_inventory') {
                const result = checkInventoryLocally(call.args.product_name);
                response = await chat.sendMessage({ message: [{ functionResponse: { name: 'check_inventory', response: result } }] });
            } 
            else if (call.name === 'add_to_cart') {
                const secureProductData = checkInventoryLocally(call.args.product_name);
                
                if (secureProductData.status !== "Not Found") {
                    console.log(`🛒 [Action] Securely routing ${secureProductData.name} to frontend cart.`);
                    
                    clientAction = {
                        type: 'ADD_TO_CART',
                        product: { 
                            id: call.args.product_name.toLowerCase(), 
                            name: secureProductData.name, 
                            price: secureProductData.price, 
                            quantity: 1, 
                            image: secureProductData.image 
                        }
                    };
                    response = await chat.sendMessage({ message: [{ functionResponse: { name: 'add_to_cart', response: { status: "Success" } } }] });
                } else {
                    response = await chat.sendMessage({ message: [{ functionResponse: { name: 'add_to_cart', response: { status: "Failed, item not found" } } }] });
                }
            }
        }

        res.json({ reply: response.text, action: clientAction });

    } catch (error) {
        console.error("Agent Error:", error);
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
        const lineItems = cart.map(item => ({
            price_data: { currency: 'usd', product_data: { name: item.name }, unit_amount: Math.round(item.price * 100) },
            quantity: item.quantity,
        }));
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'], mode: 'payment', line_items: lineItems,
            success_url: `${req.headers.origin}/success?session_id={CHECKOUT_SESSION_ID}`, cancel_url: `${req.headers.origin}/cart`,
        });
        res.json({ url: session.url });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/mcp', async (req, res) => {
  const server = buildMcpServer();
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
