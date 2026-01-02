const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const multer = require('multer');
const app = express();

const { connectDB } = require('./config/database');
const { processCSV, getActiveMapping, detectCSVHeaders } = require('./services/csvService');
const { updateAllStatuses, checkUrlStatus } = require('./services/uptimeService');
const { setupWebSocketServer, broadcastStatusUpdate } = require('./services/wsService');
const { requireAuth, ADMIN_PASSWORD } = require('./middleware/auth');
const { logAccess } = require('./middleware/accessLogger');
const dbService = require('./services/databaseService');
const CSVMapping = require('./models/CSVMapping');

const PORT = 3000;
let urlData = [];

const upload = multer({ dest: 'uploads/' });

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'monitoring-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// Apply IP logging to specific routes
app.use('/', (req, res, next) => {
  // Only log specific pages/endpoints
  const pathsToLog = ['/', '/admin.html', '/server.html', '/api/admin'];
  
  if (pathsToLog.some(p => req.path === p || req.path.startsWith(p))) {
    return logAccess(req, res, next);
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// API endpoint to get all URL data
app.get('/api/urls', async (req, res) => {
  try {
    const servers = await dbService.getVisibleServers();
    const urlData = servers.map(server => {
      const timeDiff = server.submissionTime ? require('./utils/dateUtils').getTimeDifference(server.submissionTime) : null;
      const history = server.statusHistory.slice(-10);
      const totalChecks = server.statusHistory.length;
      const onlineCount = server.statusHistory.filter(h => h.status === 'online').length;
      const uptimePercent = totalChecks > 0 ? Math.round((onlineCount / totalChecks) * 100) : 0;
      
      return {
        _id: server._id.toString(),
        name: server.name,
        url: server.url,
        email: server.email,
        github: server.github,
        documentation: server.documentation,
        status: server.currentStatus,
        latency: server.currentLatency,
        submissionTime: server.submissionTime,
        timeSinceSubmission: timeDiff ? `${timeDiff.days} days and ${timeDiff.hours} hours ago` : 'N/A',
        uptimeStats: `${uptimePercent}% uptime (last ${totalChecks} checks)`,
        grayedOut: false,
        submissionCount: 1
      };
    });
    res.json(urlData);
  } catch (error) {
    console.error('Error fetching servers:', error);
    res.status(500).json({ error: error.message });
  }
});

// API endpoint to check a single URL (for frontend refresh)
app.get('/api/check-url', async (req, res) => {
  const url = req.query.url;
  if (!url) {
    return res.status(400).json({ error: 'URL parameter is required' });
  }
  const { online: isOnline, latency } = await checkUrlStatus(url);
  res.json({ url, status: isOnline ? 'online' : 'offline', latency });
});

// API endpoint to get server details with history
app.get('/api/server/:id', async (req, res) => {
  try {
    const result = await dbService.getServerStatistics(req.params.id);
    if (!result) {
      return res.status(404).json({ error: 'Server not found' });
    }
    res.json(result);
  } catch (error) {
    console.error('Error fetching server details:', error);
    res.status(500).json({ error: error.message });
  }
});

// Admin authentication endpoints
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    req.session.isAuthenticated = true;
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/admin/check-auth', (req, res) => {
  res.json({ authenticated: !!req.session.isAuthenticated });
});

// Admin endpoints
app.get('/api/admin/servers', requireAuth, async (req, res) => {
  try {
    const servers = await dbService.getAllServers();
    res.json(servers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/servers/:id/hide', requireAuth, async (req, res) => {
  try {
    const server = await dbService.hideServer(req.params.id);
    res.json(server);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/servers/:id/unhide', requireAuth, async (req, res) => {
  try {
    const server = await dbService.unhideServer(req.params.id);
    res.json(server);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/servers/manual', requireAuth, async (req, res) => {
  try {
    const { name, url, email, github, documentation, comments, submissionTime } = req.body;
    
    if (!name || !url) {
      return res.status(400).json({ error: 'Name and URL are required' });
    }
    
    const Server = require('./models/Server');
    const server = new Server({
      name,
      url,
      email,
      github,
      documentation,
      comments,
      submissionTime: submissionTime || new Date().toISOString(),
      currentStatus: 'unknown',
      hidden: false
    });
    
    await server.save();
    
    // Initialize monitoring for this server
    const { initializeUptimeHistory } = require('./services/uptimeService');
    initializeUptimeHistory(url);
    
    res.json({ success: true, server });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/admin/servers/:id', requireAuth, async (req, res) => {
  try {
    await dbService.deleteServer(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/clear-database', requireAuth, async (req, res) => {
  try {
    await dbService.clearAllServers();
    urlData = [];
    res.json({ success: true, message: 'Database cleared' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/upload-csv', requireAuth, upload.single('csvFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const fs = require('fs');
    const uploadedPath = req.file.path;
    const targetPath = path.join(__dirname, 'Node.csv');
    
    fs.copyFileSync(uploadedPath, targetPath);
    fs.unlinkSync(uploadedPath);
    
    // Detect headers from the CSV
    const headers = await detectCSVHeaders(targetPath);
    
    const csvData = await processCSV();
    const servers = await dbService.syncServersFromCSV(csvData);
    
    res.json({ 
      success: true, 
      message: `Imported ${servers.length} servers`,
      headers: headers,
      detectedColumns: headers.length
    });
  } catch (error) {
    console.error('Error uploading CSV:', error);
    res.status(500).json({ error: error.message });
  }
});

// CSV Mapping endpoints
app.get('/api/admin/csv-mapping', requireAuth, async (req, res) => {
  try {
    const mapping = await getActiveMapping();
    res.json(mapping);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/csv-mappings', requireAuth, async (req, res) => {
  try {
    const mappings = await CSVMapping.find().sort({ createdAt: -1 });
    res.json(mappings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/csv-mapping', requireAuth, async (req, res) => {
  try {
    const { name, description, columnMappings, separator, skipLines } = req.body;
    
    // Deactivate all other mappings
    await CSVMapping.updateMany({}, { isActive: false });
    
    const mapping = new CSVMapping({
      name,
      description,
      columnMappings,
      separator: separator || ';',
      skipLines: skipLines || 1,
      isActive: true
    });
    
    await mapping.save();
    res.json({ success: true, mapping });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/admin/csv-mapping/:id', requireAuth, async (req, res) => {
  try {
    const { name, description, columnMappings, separator, skipLines, isActive } = req.body;
    
    if (isActive) {
      // Deactivate all other mappings
      await CSVMapping.updateMany({}, { isActive: false });
    }
    
    const mapping = await CSVMapping.findByIdAndUpdate(
      req.params.id,
      {
        name,
        description,
        columnMappings,
        separator,
        skipLines,
        isActive,
        updatedAt: new Date()
      },
      { new: true }
    );
    
    res.json({ success: true, mapping });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/admin/csv-mapping/:id', requireAuth, async (req, res) => {
  try {
    await CSVMapping.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/csv-preview', requireAuth, async (req, res) => {
  try {
    const targetPath = path.join(__dirname, 'Node.csv');
    const headers = await detectCSVHeaders(targetPath);
    
    // Read first 5 rows for preview
    const fs = require('fs');
    const readline = require('readline');
    const fileStream = fs.createReadStream(targetPath);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
    
    const rows = [];
    let lineCount = 0;
    
    for await (const line of rl) {
      if (lineCount < 6) {
        rows.push(line.split(';'));
        lineCount++;
      } else {
        break;
      }
    }
    
    res.json({ headers: rows[0], preview: rows.slice(1, 6) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Access Logs endpoints
app.get('/api/admin/access-logs', requireAuth, async (req, res) => {
  try {
    const AccessLog = require('./models/AccessLog');
    const limit = parseInt(req.query.limit) || 100;
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * limit;
    
    const logs = await AccessLog.find()
      .sort({ timestamp: -1 })
      .limit(limit)
      .skip(skip);
    
    const total = await AccessLog.countDocuments();
    
    res.json({ 
      logs, 
      total,
      page,
      pages: Math.ceil(total / limit)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/access-logs/stats', requireAuth, async (req, res) => {
  try {
    const AccessLog = require('./models/AccessLog');
    
    // Get stats for last 24 hours
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const [
      totalToday,
      uniqueIPs,
      topPaths,
      recentLogs
    ] = await Promise.all([
      AccessLog.countDocuments({ timestamp: { $gte: last24h } }),
      AccessLog.distinct('ip', { timestamp: { $gte: last24h } }),
      AccessLog.aggregate([
        { $match: { timestamp: { $gte: last24h } } },
        { $group: { _id: '$path', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]),
      AccessLog.find({ timestamp: { $gte: last24h } })
        .sort({ timestamp: -1 })
        .limit(10)
    ]);
    
    res.json({
      totalToday,
      uniqueIPsToday: uniqueIPs.length,
      topPaths,
      recentLogs
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/admin/access-logs/clear', requireAuth, async (req, res) => {
  try {
    const AccessLog = require('./models/AccessLog');
    const result = await AccessLog.deleteMany({});
    res.json({ success: true, deletedCount: result.deletedCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Serve index.html for the root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/reload-csv', async (req, res) => {
  try {
    const csvData = await processCSV();
    const servers = await dbService.syncServersFromCSV(csvData);
    urlData = servers;
    await updateAllStatuses(urlData, (url, status) => broadcastStatusUpdate(wss, url, status));
    res.json({ success: true, message: 'CSV reloaded' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

async function initialize() {
  try {
    await connectDB();
    
    const csvData = await processCSV();
    const servers = await dbService.syncServersFromCSV(csvData);
    urlData = servers;
    
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