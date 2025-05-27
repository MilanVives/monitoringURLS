const axios = require('axios');

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
    if (!url) return false;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'http://' + url;
    }
    try {
      new URL(url);
    } catch (e) {
      return false;
    }
    const response = await axios.head(url, {
      timeout: 5000,
      validateStatus: () => true
    });
    return response.status >= 200 && response.status < 400;
  } catch (error) {
    console.error(`Error checking URL ${url}:`, error.message);
    return false;
  }
}

async function updateAllStatuses(urlData, broadcastStatusUpdate) {
  for (const item of urlData) {
    try {
      const wasOnline = item.status === 'online';
      const isNowOnline = await checkUrlStatus(item.url);
      item.status = isNowOnline ? 'online' : 'offline';
      if (wasOnline !== isNowOnline && broadcastStatusUpdate) {
        broadcastStatusUpdate(item.url, item.status);
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
      console.error(`Error checking URL ${item.url}:`, error);
      item.status = 'error';
      item.uptimeStats = 'Error checking status';
    }
  }
}

module.exports = {
  initializeUptimeHistory,
  checkUrlStatus,
  updateAllStatuses,
  uptimeHistory
}; 