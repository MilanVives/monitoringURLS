const Server = require('../models/Server');
const { getTimeDifference } = require('../utils/dateUtils');

async function syncServersFromCSV(csvData) {
  const syncedServers = [];
  
  for (const data of csvData) {
    const { name, url, email, github, documentation, submissionTime, comments } = data;
    
    let server = await Server.findOne({ url });
    
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
    
    syncedServers.push(server);
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
