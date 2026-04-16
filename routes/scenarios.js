const express = require('express');
const path = require('path');
const router = express.Router();

// Helper function to serve the correct HTML file
const servePage = (res, filename) => {
    res.sendFile(path.join(__dirname, '../public/scenarios', filename));
};

// --- ENTERPRISE DEMO ROUTES ---

// 1. The Chaos Engine Demo (Resilience)
router.get('/chaos', (req, res) => {
    servePage(res, 'chaos.html');
});

// An API endpoint we'll use later to actually crash the server for the demo
router.post('/api/trigger-crash', (req, res) => {
    console.error("🔥 CHAOS DEMO: Intentional fatal error triggered by presenter!");
    process.exit(1); // This will kill the container, allowing Docker to auto-restart it
});

// 2. The Observability Demo
router.get('/observability', (req, res) => {
    servePage(res, 'observability.html');
});

// 3. The Edge Security / WAF Demo
router.get('/security', (req, res) => {
    servePage(res, 'security.html');
});

// A simple heartbeat endpoint for the UI to poll
router.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'healthy', uptime: process.uptime() });
});

module.exports = router;
