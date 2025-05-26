const express = require('express');
const fs = require('fs');
const csv = require('csv-parser');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const WebSocket = require('ws');
const app = express();
app.use(cors());
const wss = new WebSocket.Server({ noServer: true });

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));


const PORT = 3000;
const CSV_FILE = 'Node.csv';



// Cache for URL statuses and uptime tracking
let urlData = [];
const uptimeHistory = new Map(); // Using Map instead of object for better performance

// Function to calculate time difference in days and hours// Improved date parsing function
function getTimeDifference(submissionTime) {
  try {
    // Parse European date format "25-5-2025 17:34"
    const [datePart, timePart] = submissionTime.split(' ');
    const [day, month, year] = datePart.split('-');
    const [hours, minutes] = timePart.split(':');
    
    // Create date object (months are 0-indexed in JavaScript)
    const subDate = new Date(year, month-1, day, hours, minutes);
    
    // Validate the date
    if (isNaN(subDate.getTime())) {
      throw new Error('Invalid date');
    }
    
    const now = new Date();
    const diffMs = now - subDate;
    
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    return { days: diffDays, hours: diffHours };
  } catch (error) {
    console.error(`Error parsing submission time "${submissionTime}":`, error);
    return { days: 0, hours: 0 }; // Return default values if parsing fails
  }
}

// Function to initialize uptime tracking for a URL
function initializeUptimeHistory(url) {
  if (!uptimeHistory.has(url)) {
    uptimeHistory.set(url, {
      checks: 0,
      uptime: 0,
      history: Array(10).fill(null) // Last 10 days
    });
  }
  return uptimeHistory.get(url);
}


// Modified processCSV function
function processCSV() {
  return new Promise((resolve, reject) => {
    const results = [];
    
    fs.createReadStream(CSV_FILE)
      .pipe(csv({
        separator: ';',
        headers: [
          'Id', 'Begintijd', 'Tijd_van_voltooien', 'Email', 'Naam', 
          'Submission_type', 'Your_name', 'Exam_moment', 'Github_User_name', 
          'Github_project_URL', 'Commit_count', 'Live_Deployment_URL', 
          'Documentation_URL', 'External_Documentation_URL', 
          'Deployment_tutorial_URL', 'Comments'
        ],
        skipLines: 1
      }))
      .on('data', (data) => {
        const name = data.Naam;
        const url = data.Live_Deployment_URL;
        const submissionTime = data.Tijd_van_voltooien; // Column 3
        
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
            uptimeStats: null // Will be populated later
          });
        }
      })
      .on('end', () => {
        resolve(results);
      })
      .on('error', reject);
  });
}


// Function to check if a URL is online
async function checkUrlStatus(url) {
  try {
    if (!url) return false;
    
    // Ensure URL has protocol
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'http://' + url;
    }
    
    // Validate URL format
    try {
      new URL(url);
    } catch (e) {
      return false;
    }
    
    const response = await axios.head(url, { 
      timeout: 5000,
      validateStatus: () => true // Don't throw on HTTP errors
    });
    return response.status >= 200 && response.status < 400;
  } catch (error) {
    console.error(`Error checking URL ${url}:`, error.message);
    return false;
  }
}
// Read and process the CSV file
// Modified processCSV function
async function processCSV() {
  return new Promise((resolve, reject) => {
    const results = [];
    
    fs.createReadStream(CSV_FILE)
      .pipe(csv({
        separator: ';',
        headers: [
          'Id', 'Begintijd', 'Tijd_van_voltooien', 'Email', 'Naam', 
          'Submission_type', 'Your_name', 'Exam_moment', 'Github_User_name', 
          'Github_project_URL', 'Commit_count', 'Live_Deployment_URL', 
          'Documentation_URL', 'External_Documentation_URL', 
          'Deployment_tutorial_URL', 'Comments'
        ],
        skipLines: 1
      }))
      .on('data', (data) => {
        const name = data.Naam;
        const url = data.Live_Deployment_URL;
        const submissionTime = data.Tijd_van_voltooien;
        
        if (name && url && url.toLowerCase() !== 'ok') {
          const timeDiff = getTimeDifference(submissionTime);
          
          // Initialize uptime history for this URL
          initializeUptimeHistory(url);
          
          results.push({ 
            name, 
            url, 
            status: 'unknown',
            github: data.Github_project_URL,
            documentation: data.Documentation_URL,
            submissionTime,
            timeSinceSubmission: `${timeDiff.days} days and ${timeDiff.hours} hours ago`,
            uptimeStats: 'Collecting data...' // Initial state
          });
        }
      })
      .on('end', () => {
        resolve(results);
      })
      .on('error', reject);
  });
}


// Check all URLs and update their status
// Modified updateAllStatuses function

async function updateAllStatuses() {
  for (const item of urlData) {
    try {
      const wasOnline = item.status === 'online';
      const isNowOnline = await checkUrlStatus(item.url);
      item.status = isNowOnline ? 'online' : 'offline';
      
      // Broadcast if status changed
      if (wasOnline !== isNowOnline) {
        broadcastStatusUpdate(item.url, item.status);
      }
      
      // Initialize or get uptime stats
      const stats = initializeUptimeHistory(item.url);
      
      // Update uptime statistics
      stats.checks++;
      if (isNowOnline) stats.uptime++;
      
      // Calculate uptime percentage (last 10 days)
      const uptimePercent = stats.checks > 0 
        ? Math.round((stats.uptime / stats.checks) * 100)
        : 0;
      
      item.uptimeStats = `${uptimePercent}% uptime (last ${stats.checks} checks)`;
      
      // Update daily history
      stats.history.shift();
      stats.history.push(isNowOnline ? 1 : 0);
    } catch (error) {
      console.error(`Error checking URL ${item.url}:`, error);
      item.status = 'error';
      item.uptimeStats = 'Error checking status';
    }
  }
}
// Broadcast function to notify all clients
function broadcastStatusUpdate(url, status) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ url, status }));
    }
  });
}



// Initialize the server
async function initialize() {
  try {
    urlData = await processCSV();
    await updateAllStatuses();
    
    console.log(`Processed ${urlData.length} URLs`);
    console.log('Sample data:', urlData[0]);
    
    // Update statuses every 5 minutes
    setInterval(updateAllStatuses, 5 * 60 * 1000);
    
   const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});


  } catch (error) {
    console.error('Initialization failed:', error);
  }
}


// API endpoint to get all URL data
app.get('/api/urls', (req, res) => {
  res.json(urlData);
});

// API endpoint to check a single URL (for frontend refresh)
app.get('/api/check-url', async (req, res) => {
  const url = req.query.url;
  if (!url) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }
  
  const isOnline = await checkUrlStatus(url);
  res.json({ url, status: isOnline ? 'online' : 'offline' });
});

// Serve index.html for the root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

initialize();