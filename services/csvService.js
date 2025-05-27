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
    const results = [];
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
          results.push({
            name,
            url,
            status: 'unknown',
            github: data.Github_project_URL,
            documentation: data.Documentation_URL,
            submissionTime,
            timeSinceSubmission: `${timeDiff.days} days and ${timeDiff.hours} hours ago`,
            uptimeStats: 'Collecting data...'
          });
        }
      })
      .on('end', () => resolve(results))
      .on('error', reject);
  });
}

module.exports = { processCSV }; 