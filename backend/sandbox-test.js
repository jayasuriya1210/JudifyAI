const http = require('http');

const BASE_URL = 'http://localhost:5000';
function makeRequest(path, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method: method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = http.request(url, options, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => { responseBody += chunk; });
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: responseBody ? JSON.parse(responseBody) : null
          });
        } catch (e) {
          resolve({ status: res.statusCode, data: responseBody });
        }
      });
    });

    req.on('error', (err) => reject(err));

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

// Sandbox Test Flow
async function runSandboxTest() {
  console.log("🚀 Starting Sandbox API Test Flow...\n");

  try {
    // 1. Test Base Server Health
    console.log("1. Pinging Base API (GET /)...");
    const health = await makeRequest('/');
    console.log(`   Status: ${health.status}`);
    console.log(`   Response:`, health.data);
    console.log("   ✅ Base Server is accessible.\n");

    // 2. Test specific routes based on your server.js
    // Note: If you have required auth headers, you would add them to the helper function.

    // Example: Check TTS health endpoint (if you have one)
    console.log("2. Checking TTS API (GET /api/tts/health)...");
    const ttsResponse = await makeRequest('/api/tts/health');
    console.log(`   Status: ${ttsResponse.status}`);
    console.log("   ✅ TTS Route pinged.\n");

    // Example: Attempt to list cases (might fail if auth is required)
    console.log("3. Fetching Cases (GET /api/cases)...");
    const casesResponse = await makeRequest('/api/cases');
    console.log(`   Status: ${casesResponse.status}`);
    if (casesResponse.status === 401 || casesResponse.status === 403) {
      console.log("   ⚠️ Auth required (Expected behavior for protected routes).");
    }
    console.log("\n✅ Sandbox test completed.");

  } catch (error) {
    console.error("❌ Sandbox test failed. Is the backend server running on port 5000?");
    console.error("   Error details:", error.message);
  }
}

runSandboxTest();
