const express = require('express');
const app = express();

// Cloud Engine typically defaults to port 8080 for Node apps
const PORT = process.env.PORT || 8080; 

// Mock product database
const products = [
    { id: 1, name: 'Sheepadoodle Reflective Harness', price: 45.99, category: 'Apparel' },
    { id: 2, name: 'Bulldog Heavy-Duty Travel Bowl', price: 24.50, category: 'Gear' },
    { id: 3, name: 'Bernedoodle Trail Backpack', price: 65.00, category: 'Packs' }
];

// Serve the main retail storefront
app.get('/', (req, res) => {
    const productList = products.map(p => 
        `<li><strong>${p.name}</strong> - $${p.price.toFixed(2)}</li>`
    ).join('');

    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <title>3 Dogs and a Frog | Outdoor Gear for Your Pack</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
                h1 { color: #2E7D32; }
                .product-list { line-height: 1.8; }
            </style>
        </head>
        <body>
            <h1>Welcome to 3 Dogs and a Frog</h1>
            <h2>Outdoor Gear for Your Pack</h2>
            <p>Check out our latest arrivals below:</p>
            <ul class="product-list">
                ${productList}
            </ul>
        </body>
        </html>
    `);
});

// API endpoint to fetch products (useful later for frontend frameworks)
app.get('/api/products', (req, res) => {
    res.json(products);
});

// Start the server
app.listen(PORT, () => {
    console.log(\`Retail storefront is running on port \${PORT}\`);
});
