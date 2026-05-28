const mongoose = require('mongoose');

const csvMappingSchema = new mongoose.Schema({
  nameColumn:           { type: Number, default: 4 },
  urlColumn:            { type: Number, default: 8 },
  emailColumn:          { type: Number, default: 3 },
  githubColumn:         { type: Number, default: 7 },
  documentationColumn:  { type: Number, default: 9 },
  submissionTimeColumn: { type: Number, default: 2 },
  commentsColumn:       { type: Number, default: 20 },
  separator:            { type: String, default: ';' },
  skipLines:            { type: Number, default: 1 }
}, { _id: false });

const tileFieldsSchema = new mongoose.Schema({
  latency:             { type: Boolean, default: true },
  uptime:              { type: Boolean, default: true },
  submissionCount:     { type: Boolean, default: true },
  github:              { type: Boolean, default: true },
  documentation:       { type: Boolean, default: false },
  timeSinceSubmission: { type: Boolean, default: false },
  comments:            { type: Boolean, default: false }
}, { _id: false });

const programSchema = new mongoose.Schema({
  name:           { type: String, required: true },
  slug:           { type: String, required: true, unique: true },
  order:          { type: Number, default: 0 },
  csvMapping:     { type: csvMappingSchema, default: {} },
  tileFields:     { type: tileFieldsSchema, default: {} },
  webhookToken:   { type: String, default: null },
  webhookEnabled: { type: Boolean, default: false },
  createdAt:      { type: Date, default: Date.now }
});

module.exports = mongoose.model('Program', programSchema);
