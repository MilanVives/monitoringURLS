const Server = require('../models/Server');
const { getTimeDifference } = require('../utils/dateUtils');

async function syncServersFromCSV(csvData) {
  const syncedServers = [];
  
  // Filter out grayed-out entries (only keep latest per email)
  const latestEntries = csvData.filter(data => !data.grayedOut);
  
  // Process each latest entry
  for (const data of latestEntries) {
    const { name, url, email, github, documentation, submissionTime, comments } = data;
    
    let server;
    
    // First, try to find existing server by email
    if (email) {
      server = await Server.findOne({ email });
      
      if (server) {
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
          serverByUrl.name = name;
          serverByUrl.email = email;
          serverByUrl.github = github;
          serverByUrl.documentation = documentation;
          serverByUrl.submissionTime = submissionTime;
          serverByUrl.comments = comments;
          serverByUrl.updatedAt = new Date();
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
            currentStatus: 'unknown'
          });
          await server.save();
        }
      }
    } else {
      // No email provided, just check by URL
      server = await Server.findOne({ url });
      
      if (server) {
        server.name = name;
        server.email = email;
        server.github = github;
        server.documentation = documentation;
        server.submissionTime = submissionTime;
        server.comments = comments;
        server.updatedAt = new Date();
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
          currentStatus: 'unknown'
        });
        await server.save();
      }
    }
    
    syncedServers.push(server);
  }
  
  // Clean up: Remove any servers with emails that are no longer in the latest CSV data
  const latestEmails = latestEntries.filter(e => e.email).map(e => e.email);
  if (latestEmails.length > 0) {
    const serversToRemove = await Server.find({
      email: { $exists: true, $ne: null, $nin: latestEmails }
    });
    
    for (const oldServer of serversToRemove) {
      console.log(`Removing old server for ${oldServer.email}: ${oldServer.url}`);
      await Server.deleteOne({ _id: oldServer._id });
    }
  }
  
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

async function getAllServers() {
  return await Server.find().sort({ createdAt: -1 });
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
      } : null
    }
  };
}

module.exports = {
  syncServersFromCSV,
  updateServerStatus,
  getVisibleServers,
  getAllServers,
  getServerWithHistory,
  hideServer,
  unhideServer,
  deleteServer,
  clearAllServers,
  getServerStatistics
};
