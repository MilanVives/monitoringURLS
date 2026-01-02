const axios = require('axios');
const dbService = require('./databaseService');

const uptimeHistory = new Map();

function initializeUptimeHistory(url) {
  if (!uptimeHistory.has(url)) {
    uptimeHistory.set(url, {
      checks: 0,
      uptime: 0,
      history: Array(10).fill(null)
    });
  }
  return uptimeHistory.get(url);
}

async function checkUrlStatus(url) {
  try {
    if (!url) return { online: false, latency: null };
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'http://' + url;
    }
    try {
      new URL(url);
    } catch (e) {
      return { online: false, latency: null };
    }
    const start = Date.now();
    const response = await axios.head(url, {
      timeout: 5000,
      validateStatus: () => true
    });
    const latency = Date.now() - start;
    const online = response.status >= 200 && response.status < 400;
    return { online, latency: online ? latency : null };
  } catch (error) {
    console.error(`Error checking URL ${url}:`, error.message);
    return { online: false, latency: null };
  }
}

async function updateAllStatuses(urlData, broadcastStatusUpdate) {
  for (const item of urlData) {
    try {
      const wasOnline = item.currentStatus === 'online';
      const { online: isNowOnline, latency } = await checkUrlStatus(item.url);
      const newStatus = isNowOnline ? 'online' : 'offline';
      
      item.currentStatus = newStatus;
      item.currentLatency = latency;
      
      if (item._id) {
        await dbService.updateServerStatus(item._id.toString(), newStatus, latency);
      }
      
      if (wasOnline !== isNowOnline && broadcastStatusUpdate) {
        broadcastStatusUpdate(item.url, newStatus);
      }
      
      const stats = initializeUptimeHistory(item.url);
      stats.checks++;
      if (isNowOnline) stats.uptime++;
      const uptimePercent = stats.checks > 0
        ? Math.round((stats.uptime / stats.checks) * 100)
        : 0;
      item.uptimeStats = `${uptimePercent}% uptime (last ${stats.checks} checks)`;
      stats.history.shift();
      stats.history.push(isNowOnline ? 1 : 0);
    } catch (error) {
      console.error(`Error checking URL ${item.url}:`, error.message);
      item.currentStatus = 'error';
      item.uptimeStats = 'Error checking status';
      item.currentLatency = null;
      
      // Try to update database even on error
      if (item._id) {
        try {
          await dbService.updateServerStatus(item._id.toString(), 'error', null);
        } catch (dbError) {
          console.error(`Failed to update error status in DB:`, dbError.message);
        }
      }
    }
  }
}

module.exports = {
  initializeUptimeHistory,
  checkUrlStatus,
  updateAllStatuses,
  uptimeHistory
}; 