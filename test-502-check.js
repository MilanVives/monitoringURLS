const axios = require('axios');

async function test502() {
  const url = 'https://app.bookswap-app.be';
  console.log(`Testing ${url}...`);
  
  try {
    const start = Date.now();
    const response = await axios.head(url, {
      timeout: 5000,
      validateStatus: () => true
    });
    const latency = Date.now() - start;
    
    console.log(`Status Code: ${response.status}`);
    console.log(`Latency: ${latency}ms`);
    console.log(`Status >= 500? ${response.status >= 500}`);
    
    if (response.status >= 500) {
      console.log('Should be DEGRADED');
    } else if (response.status >= 200 && response.status < 400) {
      console.log('Should be ONLINE');
    } else {
      console.log('Should be OFFLINE');
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

test502();
