require('dotenv').config();
const express = require('express');
const path = require('path');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();

// Middleware to serve static files and parse JSON data from the cart
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
app.use(express.json());

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

// 2. CHECK ENVIRONMENT: Local vs Production
const isLocal = process.env.NODE_ENV !== 'production';

if (isLocal) {
    // If running locally on your Mac, use standard Express on port 3000
    const PORT = 3000;
    app.listen(PORT, () => {
        console.log(`🏕️ 3 Dogs and a Frog local server running at http://localhost:${PORT}`);
    });
} else {
    // If running on Google Cloud, wrap Express in Greenlock for SSL
    require('greenlock-express')
        .init({
            packageRoot: __dirname,
            configDir: './greenlock.d',
            maintainerEmail: 'dctheobald@gmail.com', // Your Let's Encrypt recovery email
            cluster: false
        })
        .serve(app);
}
