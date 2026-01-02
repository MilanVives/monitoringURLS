const mongoose = require('mongoose');

const csvMappingSchema = new mongoose.Schema({
  name: { type: String, required: true, default: 'Default Mapping' },
  description: String,
  isActive: { type: Boolean, default: true },
  columnMappings: {
    nameColumn: { type: Number, required: true, default: 4 },      // Column index for student name
    urlColumn: { type: Number, required: true, default: 8 },       // Column index for URL
    emailColumn: { type: Number, required: true, default: 3 },     // Column index for email
    githubColumn: { type: Number, required: true, default: 7 },    // Column index for GitHub URL
    documentationColumn: { type: Number, required: true, default: 9 }, // Column index for documentation
    submissionTimeColumn: { type: Number, required: true, default: 2 },  // Column index for submission time
    commentsColumn: { type: Number, required: true, default: 20 }  // Column index for comments
  },
  separator: { type: String, default: ';' },
  skipLines: { type: Number, default: 1 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('CSVMapping', csvMappingSchema);
