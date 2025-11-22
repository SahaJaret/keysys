// Test script access control
const http = require('http');

function makeRequest(userAgent, name) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/script/simple-test',
      method: 'GET',
      headers: {
        'User-Agent': userAgent
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        resolve({
          name,
          statusCode: res.statusCode,
          isBlocked: res.statusCode === 403,
          contentPreview: data.substring(0, 100)
        });
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function test() {
  console.log('=== Testing Script Access Control ===\n');

  const tests = [
    { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0', name: 'Browser (Chrome)' },
    { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/121.0', name: 'Browser (Firefox)' },
    { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Edge/120.0.0.0', name: 'Browser (Edge)' },
    { userAgent: 'Roblox/WinInet', name: 'Roblox Client' },
    { userAgent: '', name: 'No User-Agent (Executor)' },
  ];

  for (const test of tests) {
    try {
      const result = await makeRequest(test.userAgent, test.name);
      const icon = result.isBlocked ? '🔒' : '✅';
      const status = result.isBlocked ? 'BLOCKED' : 'ALLOWED';
      console.log(`${icon} ${result.name}: ${status} (${result.statusCode})`);
      
      if (result.isBlocked) {
        console.log(`   → Shows: "Access Denied" page`);
      } else {
        console.log(`   → Returns: Obfuscated script`);
        console.log(`   → Content: ${result.contentPreview}...`);
      }
      console.log('');
    } catch (error) {
      console.log(`❌ ${test.name}: ERROR - ${error.message}\n`);
    }
  }

  console.log('=== Summary ===');
  console.log('✅ Browsers should be BLOCKED (403)');
  console.log('✅ Roblox/Executors should be ALLOWED (200)');
  console.log('\n💡 Open in browser: http://localhost:3000/script/simple-test');
}

test();

