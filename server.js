const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const multer = require('multer');
const app = express();

const { connectDB } = require('./config/database');
const { processCSV } = require('./services/csvService');
const { updateAllStatuses, checkUrlStatus } = require('./services/uptimeService');
const { setupWebSocketServer, broadcastStatusUpdate } = require('./services/wsService');
const { requireAuth, ADMIN_PASSWORD } = require('./middleware/auth');
const { logAccess } = require('./middleware/accessLogger');
const dbService = require('./services/databaseService');
const adminProgramsRouter = require('./routes/adminPrograms');
const webhookRouter = require('./routes/webhook');

const PORT = process.env.PORT || 3000;
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

app.use('/api/admin/programs', adminProgramsRouter);
app.use('/api/webhook/forms', webhookRouter);

// API endpoint to get all URL data
app.get('/api/urls', async (req, res) => {
  try {
    let servers;
    if (req.query.program) {
      const Program = require('./models/Program');
      const program = await Program.findOne({ slug: req.query.program });
      if (!program) return res.json([]);
      servers = await dbService.getVisibleServersByProgram(program._id);
    } else {
      servers = await dbService.getVisibleServers();
    }
    const urlData = servers.map(server => {
      const timeDiff = server.submissionTime
        ? require('./utils/dateUtils').getTimeDifference(server.submissionTime) : null;
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
        comments: server.comments,
        status: server.currentStatus,
        latency: server.currentLatency,
        submissionTime: server.submissionTime,
        timeSinceSubmission: timeDiff ? `${timeDiff.days} days and ${timeDiff.hours} hours ago` : 'N/A',
        uptimeStats: `${uptimePercent}% uptime (last ${totalChecks} checks)`,
        grayedOut: false,
        submissionCount: server.editCount || 0
      };
    });
    res.json(urlData);
  } catch (error) {
    console.error('Error fetching servers:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/programs', async (req, res) => {
  try {
    const Program = require('./models/Program');
    const Server = require('./models/Server');
    const programs = await Program.find().sort({ order: 1 });
    const counts = await Promise.all(
      programs.map(p => Server.countDocuments({ program: p._id, hidden: false }))
    );
    res.json(programs.map((p, i) => ({
      _id: p._id,
      name: p.name,
      slug: p.slug,
      order: p.order,
      serverCount: counts[i],
      tileFields: p.tileFields
    })));
  } catch (error) {
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
    const { name, url, email, github, documentation, comments, submissionTime, programId } = req.body;

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
      hidden: false,
      manuallyAdded: true,
      program: programId || null
    });
    
    await server.save();
    
    // Initialize monitoring for this server
    const { initializeUptimeHistory } = require('./services/uptimeService');
    initializeUptimeHistory(url);
    
    // Add to urlData array so monitoring picks it up
    urlData.push(server);
    console.log(`[MANUAL ADD] Added server ${name} to monitoring. Total servers: ${urlData.length}`);
    
    // Run immediate status check for new server
    const { online, latency } = await checkUrlStatus(url);
    server.currentStatus = online ? 'online' : 'offline';
    server.currentLatency = latency;
    await dbService.updateServerStatus(server._id.toString(), online ? 'online' : 'offline', latency);
    console.log(`[MANUAL ADD] Initial status check: ${server.currentStatus}`);
    
    // Broadcast to WebSocket clients
    broadcastStatusUpdate(wss, url, { status: server.currentStatus, latency });
    
    res.json({ success: true, server });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/admin/servers/:id', requireAuth, async (req, res) => {
  try {
    const server = await dbService.getServerById(req.params.id);
    await dbService.deleteServer(req.params.id);
    
    // Remove from urlData array
    if (server) {
      urlData = urlData.filter(s => s._id.toString() !== req.params.id);
      console.log(`[DELETE] Removed server ${server.name} from monitoring. Total servers: ${urlData.length}`);
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/admin/servers/:id', requireAuth, async (req, res) => {
  try {
    const { name, url, email, github, documentation, comments } = req.body;
    
    // Update in database
    await dbService.updateServer(req.params.id, {
      name,
      url,
      email,
      github,
      documentation,
      comments
    });
    
    // Update in urlData array
    const index = urlData.findIndex(s => s._id.toString() === req.params.id);
    if (index !== -1) {
      urlData[index] = {
        ...urlData[index],
        name,
        url,
        email,
        github,
        documentation,
        comments
      };
      console.log(`[UPDATE] Updated server ${name}. Total servers: ${urlData.length}`);
    }
    
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
      uniqueUsers,
      topPaths,
      recentLogs
    ] = await Promise.all([
      AccessLog.countDocuments({ timestamp: { $gte: last24h } }),
      AccessLog.distinct('ip', { timestamp: { $gte: last24h } }),
      AccessLog.distinct('cloudflareEmail', { 
        timestamp: { $gte: last24h },
        cloudflareEmail: { $ne: null, $exists: true }
      }),
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
      uniqueUsers: uniqueUsers.length,
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

// Get unique IPs and users with last access timestamp
app.get('/api/admin/access-logs/unique', requireAuth, async (req, res) => {
  try {
    const AccessLog = require('./models/AccessLog');
    
    // Get unique IPs with their last access time
    const uniqueIPs = await AccessLog.aggregate([
      {
        $sort: { timestamp: -1 }
      },
      {
        $group: {
          _id: '$ip',
          lastAccess: { $first: '$timestamp' },
          accessCount: { $sum: 1 }
        }
      },
      {
        $sort: { lastAccess: -1 }
      },
      {
        $limit: 100
      }
    ]);
    
    // Get unique authenticated users with their last access time
    const uniqueUsers = await AccessLog.aggregate([
      {
        $match: {
          cloudflareEmail: { $ne: null, $exists: true }
        }
      },
      {
        $sort: { timestamp: -1 }
      },
      {
        $group: {
          _id: '$cloudflareEmail',
          lastAccess: { $first: '$timestamp' },
          accessCount: { $sum: 1 },
          lastIP: { $first: '$ip' }
        }
      },
      {
        $sort: { lastAccess: -1 }
      },
      {
        $limit: 100
      }
    ]);
    
    res.json({
      ips: uniqueIPs.map(item => ({
        ip: item._id,
        lastAccess: item.lastAccess,
        accessCount: item.accessCount
      })),
      users: uniqueUsers.map(item => ({
        email: item._id,
        lastAccess: item.lastAccess,
        accessCount: item.accessCount,
        lastIP: item.lastIP
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Serve index.html for the root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

async function initialize() {
  try {
    await connectDB();
    
    // Load all servers from database (includes CSV + manually added)
    console.log('[INIT] Loading servers from database...');
    const dbServers = await dbService.getAllServers();
    
    if (dbServers.length > 0) {
      // Database has servers, use those
      urlData = dbServers;
      console.log(`[INIT] Loaded ${urlData.length} servers from database`);
    } else {
      urlData = [];
      console.log('[INIT] Database empty. Create programs and upload CSVs via admin panel.');
    }
    
    if (urlData.length > 0) {
      console.log('[INIT] Running initial status check...');
      await updateAllStatuses(urlData, (url, status) => broadcastStatusUpdate(wss, url, status));
      console.log('[INIT] Initial status check complete');
    } else {
      console.log('[INIT] No servers to monitor yet. Upload CSV or add servers via admin panel.');
    }
    
    // Start monitoring loop
    const checkInterval = parseInt(process.env.CHECK_INTERVAL || '300000', 10);
    console.log(`[INIT] Starting monitoring loop - checking every ${checkInterval / 1000} seconds`);
    
    setInterval(async () => {
      if (urlData.length > 0) {
        console.log(`[MONITOR] Running scheduled check for ${urlData.length} servers...`);
        await updateAllStatuses(urlData, (url, status) => broadcastStatusUpdate(wss, url, status));
        console.log('[MONITOR] Scheduled check complete');
      }
    }, checkInterval);
    
  } catch (error) {
    console.error('[INIT] Initialization failed:', error);
  }
}

const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

const wss = setupWebSocketServer(server);
app.locals.wss = wss;
app.locals.addToMonitoring = (server) => {
  const existingIndex = urlData.findIndex(s => s._id.toString() === server._id.toString());
  if (existingIndex === -1) {
    urlData.push(server);
  } else {
    urlData[existingIndex] = server;
  }
  const { initializeUptimeHistory } = require('./services/uptimeService');
  initializeUptimeHistory(server.url);
};

initialize();