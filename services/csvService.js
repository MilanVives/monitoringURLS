const fs = require('fs');
const csv = require('csv-parser');
const { getTimeDifference } = require('../utils/dateUtils');
const { initializeUptimeHistory } = require('./uptimeService');
const CSVMapping = require('../models/CSVMapping');

const CSV_FILE = 'Node.csv';

async function getActiveMapping() {
  let mapping = await CSVMapping.findOne({ isActive: true });
  
  if (!mapping) {
    // Create default mapping if none exists
    mapping = new CSVMapping({
      name: 'Default Mapping',
      description: 'Default column mapping for Node.csv files',
      isActive: true,
      columnMappings: {
        nameColumn: 4,
        urlColumn: 8,
        emailColumn: 3,
        githubColumn: 7,
        documentationColumn: 9,
        submissionTimeColumn: 2,
        commentsColumn: 20
      },
      separator: ';',
      skipLines: 1
    });
    await mapping.save();
  }
  
  return mapping;
}

async function detectCSVHeaders(filePath) {
  return new Promise((resolve, reject) => {
    const headers = [];
    let rowCount = 0;
    
    fs.createReadStream(filePath)
      .on('data', (chunk) => {
        if (rowCount === 0) {
          const line = chunk.toString().split('\n')[0];
          const cols = line.split(';');
          headers.push(...cols);
          rowCount++;
        }
      })
      .on('end', () => resolve(headers))
      .on('error', reject);
  });
}

async function processCSV(customMapping = null) {
  const mapping = customMapping || await getActiveMapping();
  const { columnMappings, separator, skipLines } = mapping;
  
  return new Promise((resolve, reject) => {
    const allRecords = [];
    let rowIndex = 0;
    
    fs.createReadStream(CSV_FILE)
      .pipe(csv({
        separator: separator,
        headers: false,
        skipLines: skipLines
      }))
      .on('data', (row) => {
        const columns = Object.values(row);
        
        const name = columns[columnMappings.nameColumn];
        const url = columns[columnMappings.urlColumn];
        const email = columns[columnMappings.emailColumn];
        const github = columns[columnMappings.githubColumn];
        const documentation = columns[columnMappings.documentationColumn];
        const submissionTime = columns[columnMappings.submissionTimeColumn];
        const comments = columns[columnMappings.commentsColumn];
        
        if (name && url && url.toLowerCase() !== 'ok' && !url.toLowerCase().includes('volledig')) {
          const timeDiff = getTimeDifference(submissionTime);
          initializeUptimeHistory(url);
          allRecords.push({
            name,
            url,
            email,
            status: 'unknown',
            github,
            documentation,
            submissionTime,
            comments,
            timeSinceSubmission: `${timeDiff.days} days and ${timeDiff.hours} hours ago`,
            uptimeStats: 'Collecting data...'
          });
        }
        rowIndex++;
      })
      .on('end', () => {
        // Count submissions per email
        const submissionCounts = {};
        allRecords.forEach(rec => {
          if (rec.email) {
            submissionCounts[rec.email] = (submissionCounts[rec.email] || 0) + 1;
          }
        });
        // Find the most recent record per email
        const latestByEmail = {};
        allRecords.forEach((rec, idx) => {
          if (!rec.email) return;
          const [day, month, yearAndTime] = rec.submissionTime.split('-');
          const [year, time] = yearAndTime.split(' ');
          const isoString = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${time}`;
          const recDate = new Date(isoString);
          if (!latestByEmail[rec.email] || recDate > latestByEmail[rec.email].date) {
            latestByEmail[rec.email] = { date: recDate, _idx: idx };
          }
        });
        // Mark grayedOut for non-latest and add submissionCount
        const result = allRecords.map((rec, idx) => {
          const submissionCount = rec.email ? submissionCounts[rec.email] : 1;
          if (rec.email && latestByEmail[rec.email] && latestByEmail[rec.email]._idx !== idx) {
            return { ...rec, grayedOut: true, submissionCount };
          }
          return { ...rec, grayedOut: false, submissionCount };
        });
        resolve(result);
      })
      .on('error', reject);
  });
}

module.exports = { processCSV, getActiveMapping, detectCSVHeaders }; 