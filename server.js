const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();

const { processCSV } = require('./services/csvService');
const { updateAllStatuses, checkUrlStatus } = require('./services/uptimeService');
const { setupWebSocketServer, broadcastStatusUpdate } = require('./services/wsService');

const PORT = 3000;
let urlData = [];

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

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

app.post('/api/reload-csv', async (req, res) => {
  try {
    urlData = await processCSV();
    await updateAllStatuses(urlData, (url, status) => broadcastStatusUpdate(wss, url, status));
    res.json({ success: true, message: 'CSV reloaded' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

async function initialize() {
  try {
    urlData = await processCSV();
    await updateAllStatuses(urlData, (url, status) => broadcastStatusUpdate(wss, url, status));
    console.log(`Processed ${urlData.length} URLs`);
    if (urlData.length > 0) {
      console.log('Sample data:', urlData[0]);
    }
    setInterval(() => updateAllStatuses(urlData, (url, status) => broadcastStatusUpdate(wss, url, status)), 5 * 60 * 1000);
  } catch (error) {
    console.error('Initialization failed:', error);
  }
}

const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

const wss = setupWebSocketServer(server);

initialize();