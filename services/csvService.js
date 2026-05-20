const fs = require('fs');
const csv = require('csv-parser');
const { getTimeDifference } = require('../utils/dateUtils');
const { initializeUptimeHistory } = require('./uptimeService');

async function detectCSVHeaders(filePath, separator = ';') {
  return new Promise((resolve, reject) => {
    const readline = require('readline');
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
    let firstLine = null;
    rl.on('line', (line) => {
      if (!firstLine) { firstLine = line; rl.close(); fileStream.destroy(); }
    });
    rl.on('close', () => resolve(firstLine ? firstLine.split(separator) : []));
    rl.on('error', reject);
  });
}

async function processCSV(csvMapping, filePath = 'Node.csv') {
  const {
    nameColumn, urlColumn, emailColumn, githubColumn,
    documentationColumn, submissionTimeColumn, commentsColumn,
    separator = ';', skipLines = 1
  } = csvMapping;

  return new Promise((resolve, reject) => {
    const allRecords = [];

    fs.createReadStream(filePath)
      .pipe(csv({ separator, headers: false, skipLines }))
      .on('data', (row) => {
        const columns = Object.values(row);
        const name = columns[nameColumn];
        const url = columns[urlColumn];
        const email = columns[emailColumn];
        const github = columns[githubColumn];
        const documentation = columns[documentationColumn];
        const submissionTime = columns[submissionTimeColumn];
        const comments = columns[commentsColumn];

        if (name && url && url.toLowerCase() !== 'ok' && !url.toLowerCase().includes('volledig')) {
          const timeDiff = getTimeDifference(submissionTime);
          initializeUptimeHistory(url);
          allRecords.push({
            name, url, email, status: 'unknown', github, documentation,
            submissionTime, comments,
            timeSinceSubmission: `${timeDiff.days} days and ${timeDiff.hours} hours ago`,
            uptimeStats: 'Collecting data...'
          });
        }
      })
      .on('end', () => {
        const submissionCounts = {};
        allRecords.forEach(rec => {
          if (rec.email) submissionCounts[rec.email] = (submissionCounts[rec.email] || 0) + 1;
        });

        const latestByEmail = {};
        allRecords.forEach((rec, idx) => {
          if (!rec.email) return;
          let recDate = new Date(0);
          try {
            const [day, month, yearAndTime] = rec.submissionTime.split('-');
            const [year, time] = yearAndTime.split(' ');
            const isoString = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${time}`;
            const parsed = new Date(isoString);
            if (!isNaN(parsed.getTime())) recDate = parsed;
          } catch (_) {}
          if (!latestByEmail[rec.email] || recDate > latestByEmail[rec.email].date) {
            latestByEmail[rec.email] = { date: recDate, _idx: idx };
          }
        });

        resolve(allRecords.map((rec, idx) => {
          const submissionCount = rec.email ? submissionCounts[rec.email] : 1;
          const grayedOut = !!(rec.email && latestByEmail[rec.email] && latestByEmail[rec.email]._idx !== idx);
          return { ...rec, grayedOut, submissionCount };
        }));
      })
      .on('error', reject);
  });
}

module.exports = { processCSV, detectCSVHeaders };
