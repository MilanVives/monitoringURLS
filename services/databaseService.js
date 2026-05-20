const Server = require('../models/Server');
const { getTimeDifference } = require('../utils/dateUtils');

async function syncServersFromCSV(csvData, programId) {
  const syncedServers = [];
  
  // Filter out grayed-out entries (only keep latest per email)
  const latestEntries = csvData.filter(data => !data.grayedOut);
  
  // Process each latest entry
  for (const data of latestEntries) {
    const { name, url, email, github, documentation, submissionTime, comments } = data;
    
    // Create a hash of the data to detect changes
    const csvDataHash = JSON.stringify({
      name,
      url,
      email,
      github,
      documentation,
      submissionTime,
      comments
    });
    
    let server;
    
    // First, try to find existing server by email
    if (email) {
      server = await Server.findOne({ email });
      
      if (server) {
        // Check if data has changed
        const dataChanged = server.lastCsvData !== csvDataHash;
        
        // Update existing server for this email
        // If URL changed, update it
        const urlChanged = server.url !== url;
        
        server.name = name;
        server.url = url;
        server.github = github;
        server.documentation = documentation;
        server.submissionTime = submissionTime;
        server.comments = comments;
        server.updatedAt = new Date();
        if (programId) server.program = programId;
        
        // Increment edit count only if data actually changed
        if (dataChanged) {
          server.editCount = (server.editCount || 0) + 1;
          server.lastCsvData = csvDataHash;
          console.log(`Data changed for ${email}: Edit count now ${server.editCount}`);
        }
        
        if (urlChanged) {
          // Reset status history if URL changed
          console.log(`URL changed for ${email}: ${server.url} -> ${url}`);
          server.statusHistory = [];
          server.currentStatus = 'unknown';
          server.currentLatency = null;
        }
        
        await server.save();
      } else {
        // No server exists for this email, check if URL exists without email
        const serverByUrl = await Server.findOne({ url });
        
        if (serverByUrl) {
          // Update existing server found by URL
          const dataChanged = serverByUrl.lastCsvData !== csvDataHash;
          
          serverByUrl.name = name;
          serverByUrl.email = email;
          serverByUrl.github = github;
          serverByUrl.documentation = documentation;
          serverByUrl.submissionTime = submissionTime;
          serverByUrl.comments = comments;
          serverByUrl.updatedAt = new Date();
          if (programId) serverByUrl.program = programId;
          
          if (dataChanged) {
            serverByUrl.editCount = (serverByUrl.editCount || 0) + 1;
            serverByUrl.lastCsvData = csvDataHash;
          }
          
          await serverByUrl.save();
          server = serverByUrl;
        } else {
          // Create new server
          server = new Server({
            name,
            url,
            email,
            github,
            documentation,
            submissionTime,
            comments,
            currentStatus: 'unknown',
            editCount: 0,
            lastCsvData: csvDataHash,
            program: programId || null
          });
          await server.save();
        }
      }
    } else {
      // No email provided, just check by URL
      server = await Server.findOne({ url });
      
      if (server) {
        const dataChanged = server.lastCsvData !== csvDataHash;
        
        server.name = name;
        server.email = email;
        server.github = github;
        server.documentation = documentation;
        server.submissionTime = submissionTime;
        server.comments = comments;
        server.updatedAt = new Date();
        if (programId) server.program = programId;
        
        if (dataChanged) {
          server.editCount = (server.editCount || 0) + 1;
          server.lastCsvData = csvDataHash;
        }
        
        await server.save();
      } else {
        server = new Server({
          name,
          url,
          email,
          github,
          documentation,
          submissionTime,
          comments,
          currentStatus: 'unknown',
          editCount: 0,
          lastCsvData: csvDataHash,
          program: programId || null
        });
        await server.save();
      }
    }
    
    syncedServers.push(server);
  }
  
  // Clean up: Only remove duplicate servers with same email
  // Do NOT delete servers that aren't in current CSV - allow accumulation from multiple CSVs
  console.log(`CSV sync complete. Total servers synced: ${syncedServers.length}`);
  
  return syncedServers;
}

async function updateServerStatus(serverId, status, latency) {
  const server = await Server.findById(serverId);
  if (!server) return null;
  
  server.currentStatus = status;
  server.currentLatency = latency;
  server.statusHistory.push({
    status,
    latency,
    timestamp: new Date()
  });
  
  // Keep only last 1000 status checks to prevent excessive growth
  if (server.statusHistory.length > 1000) {
    server.statusHistory = server.statusHistory.slice(-1000);
  }
  
  server.updatedAt = new Date();
  await server.save();
  
  return server;
}

async function getVisibleServers() {
  return await Server.find({ hidden: false }).sort({ createdAt: -1 });
}

async function getVisibleServersByProgram(programId) {
  return await Server.find({ hidden: false, program: programId }).sort({ createdAt: -1 });
}

async function getAllServers() {
  return await Server.find().sort({ createdAt: -1 });
}

async function getServerById(serverId) {
  return await Server.findById(serverId);
}

async function getServerWithHistory(serverId) {
  return await Server.findById(serverId);
}

async function hideServer(serverId) {
  return await Server.findByIdAndUpdate(serverId, { hidden: true, updatedAt: new Date() }, { new: true });
}

async function unhideServer(serverId) {
  return await Server.findByIdAndUpdate(serverId, { hidden: false, updatedAt: new Date() }, { new: true });
}

async function deleteServer(serverId) {
  return await Server.findByIdAndDelete(serverId);
}

async function updateServer(serverId, updates) {
  return await Server.findByIdAndUpdate(
    serverId,
    { $set: updates },
    { new: true }
  );
}

async function clearAllServers() {
  return await Server.deleteMany({});
}

async function getServerStatistics(serverId) {
  const server = await Server.findById(serverId);
  if (!server) return null;
  
  const history = server.statusHistory;
  const totalChecks = history.length;
  
  if (totalChecks === 0) {
    return {
      server,
      stats: {
        totalChecks: 0,
        uptimePercentage: 0,
        onlineCount: 0,
        offlineCount: 0,
        averageLatency: null,
        lastCheck: null
      }
    };
  }
  
  const onlineCount = history.filter(h => h.status === 'online').length;
  const offlineCount = history.filter(h => h.status === 'offline').length;
  const uptimePercentage = Math.round((onlineCount / totalChecks) * 100);

  const latencies = history.filter(h => h.latency !== null && h.latency !== undefined).map(h => h.latency);
  const averageLatency = latencies.length > 0
    ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
    : null;

  const lastCheck = history[history.length - 1];

  // Downtime incident analysis — single pass through chronological history
  const downStatuses = new Set(['offline', 'degraded', 'error']);
  let incidentCount = 0;
  let inDowntime = false;
  let lastDowntimeStart = null;
  let lastDowntimeEnd = null;
  let currentIncidentStart = null;

  for (const h of history) {
    const isDown = downStatuses.has(h.status);
    if (isDown && !inDowntime) {
      inDowntime = true;
      incidentCount++;
      currentIncidentStart = h.timestamp;
    } else if (!isDown && inDowntime) {
      inDowntime = false;
      lastDowntimeStart = currentIncidentStart;
      lastDowntimeEnd = h.timestamp;
    }
  }
  if (inDowntime) {
    lastDowntimeStart = currentIncidentStart;
    // lastDowntimeEnd stays null — server is currently down
  }

  return {
    server,
    stats: {
      totalChecks,
      uptimePercentage,
      onlineCount,
      offlineCount,
      averageLatency,
      lastCheck: lastCheck ? {
        timestamp: lastCheck.timestamp,
        status: lastCheck.status,
        latency: lastCheck.latency
      } : null,
      incidentCount,
      lastDowntimeStart,
      lastDowntimeEnd
    }
  };
}

module.exports = {
  syncServersFromCSV,
  updateServerStatus,
  getVisibleServers,
  getVisibleServersByProgram,
  getAllServers,
  getServerById,
  getServerWithHistory,
  hideServer,
  unhideServer,
  deleteServer,
  updateServer,
  clearAllServers,
  getServerStatistics
};
