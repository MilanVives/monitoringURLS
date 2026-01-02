const mongoose = require('mongoose');

const statusCheckSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  status: { type: String, enum: ['online', 'offline', 'error'], required: true },
  latency: { type: Number, default: null }
});

const serverSchema = new mongoose.Schema({
  name: { type: String, required: true },
  url: { type: String, required: true },
  email: String,
  github: String,
  documentation: String,
  submissionTime: String,
  comments: String,
  currentStatus: { type: String, enum: ['online', 'offline', 'error', 'unknown'], default: 'unknown' },
  currentLatency: Number,
  statusHistory: [statusCheckSchema],
  hidden: { type: Boolean, default: false },
  manuallyAdded: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

serverSchema.index({ url: 1 });
serverSchema.index({ email: 1 });
serverSchema.index({ hidden: 1 });

module.exports = mongoose.model('Server', serverSchema);
