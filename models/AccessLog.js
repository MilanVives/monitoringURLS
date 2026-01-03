const mongoose = require('mongoose');

const accessLogSchema = new mongoose.Schema({
  ip: { type: String, required: true, index: true },
  path: { type: String, required: true, index: true },
  method: { type: String, required: true },
  userAgent: String,
  cloudflareEmail: { type: String, index: true }, // Email from Cloudflare Access
  timestamp: { type: Date, default: Date.now, index: true }
});

// Create compound index for efficient queries
accessLogSchema.index({ timestamp: -1, ip: 1 });
accessLogSchema.index({ path: 1, timestamp: -1 });
accessLogSchema.index({ cloudflareEmail: 1, timestamp: -1 });

// Auto-delete logs older than 90 days (optional)
accessLogSchema.index({ timestamp: 1 }, { expireAfterSeconds: 7776000 }); // 90 days

module.exports = mongoose.model('AccessLog', accessLogSchema);
