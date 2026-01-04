const axios = require('axios');

async function checkUrlStatus(url) {
  try {
    const start = Date.now();
    
    let response = await axios.head(url, {
      timeout: 5000,
      validateStatus: () => true
    });
    
    if (response.status === 403 || response.status === 405 || response.status === 401) {
      const getStart = Date.now();
      response = await axios.get(url, {
        timeout: 5000,
        validateStatus: () => true,
        maxRedirects: 5
      });
      const latency = Date.now() - getStart;
      
      if (response.status >= 200 && response.status < 400) {
        return { online: true, latency, status: 'online' };
      } else if (response.status >= 500) {
        console.log(`Server error for ${url}: ${response.status}`);
        return { online: false, latency, status: 'degraded', statusCode: response.status };
      } else {
        return { online: false, latency: null, status: 'offline' };
      }
    }
    
    const latency = Date.now() - start;
    
    if (response.status >= 200 && response.status < 400) {
      return { online: true, latency, status: 'online' };
    } else if (response.status >= 500) {
      console.log(`Server error for ${url}: ${response.status}`);
      return { online: false, latency, status: 'degraded', statusCode: response.status };
    } else {
      return { online: false, latency: null, status: 'offline' };
    }
  } catch (error) {
    console.error(`Error checking URL ${url}:`, error.message);
    return { online: false, latency: null, status: 'offline' };
  }
}

checkUrlStatus('https://app.bookswap-app.be').then(result => {
  console.log('Final result:', JSON.stringify(result, null, 2));
});
