require('dotenv').config();
const express = require('express');
const path = require('path');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();

// Middleware to serve static files and parse JSON data from the cart
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
app.use(express.json());

// --- ROUTERS ---
const scenarioRoutes = require('./routes/scenarios');
app.use('/', scenarioRoutes);

// --- STRIPE CHECKOUT ROUTE ---
app.post('/create-checkout-session', async (req, res) => {
    try {
        const { cart } = req.body;

        // Convert your cart items into the exact format Stripe requires
        const lineItems = cart.map(item => {
            return {
                price_data: {
                    currency: 'usd',
                    product_data: {
                        name: item.name,
                        images: [`https://www.3dogsandafrog.com${item.image}`], // Stripe needs absolute URLs for images
                    },
                    unit_amount: Math.round(item.price * 100), // Stripe expects amounts in cents!
                },
                quantity: item.quantity,
            };
        });

        // Determine the domain for the return URLs
        const domain = process.env.NODE_ENV !== 'production' 
            ? 'http://localhost:3000' 
            : 'https://www.3dogsandafrog.com';

        // Create the secure Stripe session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            mode: 'payment',
            line_items: lineItems,
            success_url: `${domain}/success`,
            cancel_url: `${domain}/cart`,
        });

        // Send the Stripe URL back to the frontend
        res.json({ url: session.url });
    } catch (error) {
        console.error("Stripe Error:", error);
        res.status(500).json({ error: "Failed to create checkout session" });
    }
});

// 2. --- START SERVER ---
// Always listen on the port provided by Docker (defaults to 3000)
// Binding to '0.0.0.0' is required inside Docker to accept outside connections from Caddy
const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🏕️ 3 Dogs and a Frog backend running on port ${PORT}`);
});
