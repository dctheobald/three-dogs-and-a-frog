require('dotenv').config();
const express = require('express');
const path = require('path');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();

// --- VIEW ENGINE SETUP ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware to serve static files (CSS, JS, images)
// Removed the { extensions: ['html'] } fallback since we use EJS routing now
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// --- PAGE ROUTERS ---
app.get('/', (req, res) => res.render('index', { title: 'Home | 3 Dogs and a Frog' }));
app.get('/cart', (req, res) => res.render('cart', { title: 'Cart | 3 Dogs and a Frog' }));
app.get('/shop', (req, res) => res.render('shop', { title: 'Shop Gear | 3 Dogs and a Frog' }));
app.get('/success', (req, res) => res.render('success', { title: 'Success | 3 Dogs and a Frog' }));

// --- SCENARIO ROUTERS ---
const scenarioRoutes = require('./routes/scenarios');
app.use('/scenarios', scenarioRoutes);

// --- STRIPE CHECKOUT ROUTE ---
app.post('/create-checkout-session', async (req, res) => {
    try {
        const { cart } = req.body;

        const lineItems = cart.map(item => {
            return {
                price_data: {
                    currency: 'usd',
                    product_data: {
                        name: item.name,
                        images: [`https://www.3dogsandafrog.com${item.image}`], 
                    },
                    unit_amount: Math.round(item.price * 100), 
                },
                quantity: item.quantity,
            };
        });

        const domain = process.env.NODE_ENV !== 'production' 
            ? 'http://localhost:3000' 
            : 'https://www.3dogsandafrog.com';

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            mode: 'payment',
            line_items: lineItems,
            success_url: `${domain}/success`,
            cancel_url: `${domain}/cart`,
        });

        res.json({ url: session.url });
    } catch (error) {
        console.error("Stripe Error:", error);
        res.status(500).json({ error: "Failed to create checkout session" });
    }
});

// --- START SERVER ---
const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🏕️ 3 Dogs and a Frog backend running on port ${PORT}`);
});
