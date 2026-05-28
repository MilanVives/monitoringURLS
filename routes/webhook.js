const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Program = require('../models/Program');
const { syncSingleServer } = require('../services/databaseService');

router.post('/:slug', async (req, res) => {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  let program = null;
  try {
    program = await Program.findOne({ slug: req.params.slug });
  } catch (err) {
    console.error('Webhook DB error:', err.message);
    return res.status(503).json({ error: 'Service unavailable' });
  }

  const tokenValid = program &&
    program.webhookEnabled &&
    program.webhookToken &&
    token &&
    crypto.timingSafeEqual(Buffer.from(program.webhookToken), Buffer.from(token));

  if (!tokenValid) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { name, email, url, github, documentation, submissionTime, comments } = req.body;

  if (!email || !url) {
    return res.status(400).json({ error: 'email and url are required' });
  }

  try {
    const server = await syncSingleServer(
      { name, email, url, github, documentation, submissionTime, comments },
      program._id
    );
    if (req.app.locals.addToMonitoring) {
      req.app.locals.addToMonitoring(server);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('Webhook error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
