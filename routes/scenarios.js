const express = require('express');
const router = express.Router();

// ==========================================
// SCENARIO UI ROUTES (Updated to use EJS)
// ==========================================

router.get('/chaos', (req, res) => {
  // We use res.render() now, which automatically looks in the views/ directory
  // and knows to append the .ejs extension!
  res.render('scenarios/chaos'); 
});

router.get('/observability', (req, res) => {
  res.render('scenarios/observability');
});

router.get('/security', (req, res) => {
  res.render('scenarios/security');
});

router.get('/deployment', (req, res) => {
  res.render('scenarios/deployment');
});


// ==========================================
// SCENARIO API ENDPOINTS (Do not change)
// ==========================================

router.post('/api/trigger-crash', (req, res) => {
  console.log("CRITICAL: Intentional crash triggered via Demo UI.");
  
  // Send response before crashing so the UI doesn't hang
  res.status(200).send({ message: "Crashing server..." }); 
  
  // Kill the process. Docker/Caddy will auto-recover this in production.
  setTimeout(() => process.exit(1), 100); 
});

module.exports = router;
