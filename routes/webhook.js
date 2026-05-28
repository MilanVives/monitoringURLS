const express = require('express');
const router = express.Router();
const Program = require('../models/Program');
const { syncSingleServer } = require('../services/databaseService');

router.post('/:slug', async (req, res) => {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  let program = null;
  try {
    program = await Program.findOne({ slug: req.params.slug });
  } catch (_) {}

  if (
    !program ||
    !program.webhookEnabled ||
    !program.webhookToken ||
    program.webhookToken !== token
  ) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { name, email, url, github, documentation, submissionTime, comments } = req.body;

  if (!email || !url) {
    return res.status(400).json({ error: 'email and url are required' });
  }

  try {
    await syncSingleServer(
      { name, email, url, github, documentation, submissionTime, comments },
      program._id
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('Webhook error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
