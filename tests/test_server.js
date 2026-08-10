/**
 * Automated Test Suite for Discord Data Export Explorer Backend (server.js)
 */
const assert = require('assert');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const TEST_PORT = 3123;
const FIXTURE_DIR = path.resolve(__dirname, 'fixtures', 'mock_package');

let serverProcess = null;

function request(urlPath, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: urlPath,
      method: method,
      headers: {}
    };

    if (body) {
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(body));
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, headers: res.headers, body: json, raw: data });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, raw: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runTests() {
  console.log('====================================================');
  console.log('🧪 Running Node.js Server & Parser Test Suite...');
  console.log('====================================================\n');

  // 1. Launch server on TEST_PORT with mock package
  serverProcess = spawn(process.execPath, [
    path.join(__dirname, '..', 'server.js'),
    '--package', FIXTURE_DIR,
    '--port', String(TEST_PORT)
  ], {
    env: { ...process.env, PORT: String(TEST_PORT) },
    stdio: 'pipe'
  });

  serverProcess.stdout.on('data', d => {
    // console.log(`[Server]:`, d.toString().trim());
  });

  serverProcess.stderr.on('data', d => {
    console.error(`[Server Err]:`, d.toString().trim());
  });

  // Wait for server to bind
  await new Promise(resolve => setTimeout(resolve, 1500));

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAIL: ${name}`);
      console.error(`     Error: ${err.message}`);
      failed++;
    }
  }

  try {
    // Test 1: Status Endpoint
    await test('GET /api/status returns indexed state & totals', async () => {
      const res = await request('/api/status');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.isIndexed, true);
      assert.strictEqual(res.body.totalChannels, 4);
      assert.strictEqual(res.body.totalMessages, 17);
    });

    // Test 2: Account Endpoint & Connected Accounts
    await test('GET /api/account returns profile & connected accounts', async () => {
      const res = await request('/api/account');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.id, '112233445566778899');
      assert.strictEqual(res.body.username, 'TestExplorerUser');
      assert.strictEqual(res.body.connected_accounts.length, 5);
      assert.strictEqual(res.body.relationships.length, 2);
    });

    // Test 3: Servers Directory Endpoint
    await test('GET /api/servers aggregates channels & total messages', async () => {
      const res = await request('/api/servers');
      assert.strictEqual(res.status, 200);
      assert(Array.isArray(res.body.servers));
      assert(res.body.servers.length >= 2);
      const s1 = res.body.servers.find(s => s.id === '900000000000000001');
      assert(s1);
      assert.strictEqual(s1.name, 'Community Hangout');
    });

    // Test 4: Channel List Endpoint
    await test('GET /api/channels lists all 4 channels with metadata', async () => {
      const res = await request('/api/channels');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.total, 4);
      const ch1 = res.body.channels.find(c => c.id === '100000000000000001');
      assert.strictEqual(ch1.messageCount, 8);
    });

    // Test 5: CSV Channel Parsing (messages.csv)
    await test('CSV channel c100000000000000002 parses quotes, commas, multiline', async () => {
      const res = await request('/api/channel/100000000000000002/messages');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.totalMessages, 4);
      assert.strictEqual(res.body.messages.length, 4);
      const msgComma = res.body.messages.find(m => m.ID === '800000000000000021');
      assert(msgComma);
      assert.strictEqual(msgComma.Contents, 'Message with, commas, and "quotes"');
      const msgMulti = res.body.messages.find(m => m.ID === '800000000000000022');
      assert(msgMulti);
      assert(msgMulti.Contents.includes('line 2 of multiline message'));
    });

    // Test 6: Multi-Source Deleted User ID Recovery Engine
    await test('Deleted User DM c100000000000000003 recovers recipient ID 778899001122334455', async () => {
      const res = await request('/api/channels');
      const deletedDm = res.body.channels.find(c => c.id === '100000000000000003');
      assert(deletedDm);
      assert.strictEqual(deletedDm.recipientId, '778899001122334455');
      assert.strictEqual(deletedDm.isRecovered, true);
    });

    // Test 7: Global Cross-Chat Search & Filtering
    await test('GET /api/search finds term across channels', async () => {
      const res = await request('/api/search?q=gaming');
      assert.strictEqual(res.status, 200);
      assert(res.body.total >= 1);
    });

    // Test 8: Filter Search (has:image)
    await test('GET /api/search?q=has:image returns messages with image attachments', async () => {
      const res = await request('/api/search?q=has:image');
      assert.strictEqual(res.status, 200);
      assert(res.body.total >= 1);
      assert(res.body.results.some(r => r.message.Attachments.includes('.png')));
    });

    // Test 9: Deep Advanced Analytics API
    await test('GET /api/stats/advanced returns heatmaps, timelines, emojis & words', async () => {
      const res = await request('/api/stats/advanced');
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.body.totalMessages, 17);
      assert.strictEqual(res.body.heatmap.length, 7);
      assert.strictEqual(res.body.heatmap[0].length, 24);
      assert(res.body.monthlyTimeline.length > 0);
      assert(res.body.topEmojis.some(e => e.emoji === ':pepedance:'));
      assert(res.body.attachmentStats.total >= 4);
    });

    // Test 10: Activity Telemetry Endpoint
    await test('GET /api/activity returns gaming hours & voice logs', async () => {
      const res = await request('/api/activity');
      assert.strictEqual(res.status, 200);
      assert(res.body.totalEvents >= 3);
      assert(res.body.topGames.some(g => g.name === 'Counter-Strike 2'));
    });

    // Test 11: Channel Export Generator (CSV, JSON, TXT, HTML)
    await test('GET /api/channel/100000000000000001/export?format=json returns valid JSON dump', async () => {
      const res = await request('/api/channel/100000000000000001/export?format=json');
      assert.strictEqual(res.status, 200);
      assert(Array.isArray(res.body));
      assert.strictEqual(res.body.length, 8);
    });

    await test('GET /api/channel/100000000000000001/export?format=csv returns CSV string with headers', async () => {
      const res = await request('/api/channel/100000000000000001/export?format=csv');
      assert.strictEqual(res.status, 200);
      assert(res.raw.startsWith('ID,') || res.raw.startsWith('"ID"'));
    });

    await test('GET /api/channel/100000000000000001/export?format=html returns styled HTML document', async () => {
      const res = await request('/api/channel/100000000000000001/export?format=html');
      assert.strictEqual(res.status, 200);
      assert(res.raw.includes('<!DOCTYPE html>'));
      assert(res.raw.includes('Discord Chat Export'));
    });

  } finally {
    if (serverProcess) {
      serverProcess.kill();
    }
  }

  console.log('\n====================================================');
  console.log(`📊 Test Results: ${passed} Passed, ${failed} Failed`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  if (serverProcess) serverProcess.kill();
  process.exit(1);
});
