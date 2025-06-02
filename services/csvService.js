const fs = require('fs');
const csv = require('csv-parser');
const { getTimeDifference } = require('../utils/dateUtils');
const { initializeUptimeHistory } = require('./uptimeService');

const CSV_FILE = 'Node.csv';

const CSV_HEADERS = [
  'Id', 'Begintijd', 'Tijd_van_voltooien', 'Email', 'Naam', 
  'Submission_type', 'Your_name', 'Exam_moment', 'Github_User_name', 
  'Github_project_URL', 'Commit_count', 'Live_Deployment_URL', 
  'Documentation_URL', 'External_Documentation_URL', 
  'Deployment_tutorial_URL', 'Comments'
];

async function processCSV() {
  return new Promise((resolve, reject) => {
    const allRecords = [];
    fs.createReadStream(CSV_FILE)
      .pipe(csv({
        separator: ';',
        headers: CSV_HEADERS,
        skipLines: 1
      }))
      .on('data', (data) => {
        const name = data.Naam;
        const url = data.Live_Deployment_URL;
        const submissionTime = data.Tijd_van_voltooien;
        if (name && url && url.toLowerCase() !== 'ok') {
          const timeDiff = getTimeDifference(submissionTime);
          initializeUptimeHistory(url);
          allRecords.push({
            name,
            url,
            email: data.Email,
            status: 'unknown',
            github: data.Github_project_URL,
            documentation: data.Documentation_URL,
            submissionTime,
            timeSinceSubmission: `${timeDiff.days} days and ${timeDiff.hours} hours ago`,
            uptimeStats: 'Collecting data...'
          });
        }
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

module.exports = { processCSV }; 