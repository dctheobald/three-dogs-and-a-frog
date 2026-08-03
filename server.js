require('dotenv').config();
const express = require('express');
const path = require('path');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { GoogleGenAI } = require('@google/genai');

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
    const mockDb = {
        "backpack": { status: "In Stock", price: 65.00, name: "High-Capacity Trail Backpack", image: "/images/backpack.jpg" },
        "bowl": { status: "Low Stock", price: 24.50, name: "Basecamp Bowl", image: "/images/bowl.jpg" },
        "harness": { status: "Out of Stock", price: 45.99, name: "Night Harness", image: "/images/harness.jpg" }
    };
    const key = Object.keys(mockDb).find(k => productName.toLowerCase().includes(k));
    return key ? mockDb[key] : { status: "Not Found" };
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
app.get('/', (req, res) => res.render('index', { title: 'Home' }));
app.get('/shop', (req, res) => res.render('shop', { title: 'Shop' }));
app.get('/cart', (req, res) => res.render('cart', { title: 'Cart' }));
app.get('/success', (req, res) => res.render('success', { title: 'Success' }));

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🏕️ 3 Dogs and a Frog backend running on port ${PORT}`);
});
