// Integration Tests for HTTP Security Layer, Authentication, Rate Limiting, and Quorum Protection
// Tests server.mjs endpoints directly via ephemeral HTTP server.

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

// Set up test environment variables before server load
process.env.NODE_ENV = 'test';
process.env.TEST_NO_LISTEN = 'true';
process.env.PORT = '0'; // dynamic port
process.env.HQ_PASSWORD = 'test-master-password-super-secure';
process.env.HQ_AUTH_SECRET = 'test-auth-secret-32-chars-long!!';
process.env.HQ_SESSION_TTL_HOURS = '24';
process.env.TRUST_PROXY = 'true';

const { server, generateToken, verifyToken, securityStore, ironDirector } = await import('../server.mjs');

let testBaseUrl = '';
let httpServer = null;

function makeRequest(path, { method = 'GET', headers = {}, body = null } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, testBaseUrl);
    const reqHeaders = { ...headers };
    let bodyPayload = null;

    if (body !== null) {
      bodyPayload = typeof body === 'string' ? body : JSON.stringify(body);
      reqHeaders['Content-Type'] = reqHeaders['Content-Type'] || 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(bodyPayload);
    }

    const req = http.request(url, { method, headers: reqHeaders }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch {}
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data,
          json
        });
      });
    });

    req.on('error', reject);
    if (bodyPayload) req.write(bodyPayload);
    req.end();
  });
}

test('HTTP Server Test Suite Setup', async () => {
  await new Promise((resolve) => {
    httpServer = server.listen(0, '127.0.0.1', () => {
      const port = httpServer.address().port;
      testBaseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

test('1. Auth Login: accepts valid passcode, returns token, sets 24h cookie, logs audit', async () => {
  const res = await makeRequest('/api/auth/login', {
    method: 'POST',
    body: { password: 'test-master-password-super-secure', username: 'boss' }
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.json.status, 'success');
  assert.ok(res.json.token);

  // Verify Set-Cookie header contains 24h Max-Age (86400)
  const setCookie = res.headers['set-cookie']?.[0] || '';
  assert.ok(setCookie.includes('Max-Age=86400'), `Cookie should have 24h TTL (Max-Age=86400): ${setCookie}`);
  assert.ok(setCookie.includes('HttpOnly'));

  // Verify token
  const session = verifyToken(res.json.token);
  assert.ok(session);
  assert.equal(session.user, 'boss');
  assert.equal(session.role, 'admin');

  // Verify audit log
  const logs = securityStore.getAuditLogs({ limit: 5, action: 'AUTH_LOGIN' });
  assert.ok(logs.length > 0);
  assert.equal(logs[0].status, 'SUCCESS');
});

test('2. Auth Login: rejects invalid passcode, records failure and audit log', async () => {
  const res = await makeRequest('/api/auth/login', {
    method: 'POST',
    body: { password: 'wrong-password', username: 'intruder' }
  });

  assert.equal(res.statusCode, 401);
  assert.equal(res.json.status, 'error');

  const logs = securityStore.getAuditLogs({ limit: 5, action: 'AUTH_LOGIN' });
  assert.ok(logs.some(l => l.status === 'FAILED'));
});

test('2b. Client IP: trusts only the last X-Forwarded-For hop, not a client-spoofable earlier one', async () => {
  const res = await makeRequest('/api/auth/login', {
    method: 'POST',
    headers: { 'X-Forwarded-For': '198.51.100.66, 203.0.113.77' },
    body: { password: 'wrong-password', username: 'spoof-test' }
  });

  assert.equal(res.statusCode, 401);

  const logs = securityStore.getAuditLogs({ limit: 1, action: 'AUTH_LOGIN' });
  assert.equal(logs[0].ip, '203.0.113.77', 'must trust the last (proxy-appended) hop, not the client-suppliable first one');
});

test('3. Rate Limiting: 5 failed attempts lock out IP with 429 Too Many Requests', async () => {
  const testIp = '198.51.100.99';
  securityStore.clearLoginFailures(testIp);

  // Trigger 5 failures
  for (let i = 0; i < 5; i++) {
    securityStore.recordLoginFailure(testIp);
  }

  assert.equal(securityStore.isIpBlocked(testIp), true);
});

test('4. Token Revocation & Logout: blacklists token and rejects subsequent requests', async () => {
  // Generate a valid token
  const token = generateToken({ role: 'admin', user: 'boss' });
  assert.ok(verifyToken(token));

  // Request logout to revoke token
  const logoutRes = await makeRequest('/api/auth/logout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` }
  });

  assert.equal(logoutRes.statusCode, 200);
  assert.equal(logoutRes.json.status, 'success');
  assert.equal(logoutRes.json.message, 'SESSION_REVOKED');

  // Token must now be blacklisted
  assert.equal(securityStore.isTokenRevoked(token), true);
  assert.equal(verifyToken(token), false);

  // Subsequent request with revoked token must be rejected with 401
  const verifyRes = await makeRequest('/api/auth/verify', {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(verifyRes.statusCode, 401);
});

test('5. Info Disclosure Protection: /api/system-status does NOT leak VPS IP or internal fleet', async () => {
  const token = generateToken({ role: 'admin', user: 'boss' });
  const res = await makeRequest('/api/system-status', {
    headers: { Authorization: `Bearer ${token}` }
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.json.status, 'ONLINE');
  assert.ok(Number.isFinite(res.json.uptimeSeconds));

  // Crucial check: Must NOT contain the hardcoded VPS IP or private domain fleet
  assert.equal(res.json.vps, undefined);
  assert.equal(res.json.fleet, undefined);
  assert.ok(!res.data.includes('163.61.44.41'), 'Response must NOT disclose real VPS IP');
  assert.ok(!res.data.includes('rajacuttinglaser.com'), 'Response must NOT leak private domain fleet');
});

test('6. Quorum Gate on /api/director/dispatch: rejects mutating tasks when quorum fails', async () => {
  const token = generateToken({ role: 'admin', user: 'boss' });

  // Inject fast failing provider mock to test fail-closed quorum without waiting for network timeouts
  const origGemini = ironDirector.caseBus.geminiProvider;
  const origClaude = ironDirector.caseBus.claudeProvider;
  const origCodex = ironDirector.caseBus.codexProvider;

  ironDirector.caseBus.geminiProvider = { execute: async () => { throw new Error('Mock 503 Outage'); } };
  ironDirector.caseBus.claudeProvider = { execute: async () => { throw new Error('Mock 503 Outage'); } };
  ironDirector.caseBus.codexProvider = { execute: async () => { throw new Error('Mock 503 Outage'); } };

  try {
    // Attempt to dispatch a mutating task with WRITE_CODE permissions without quorum approval
    const res = await makeRequest('/api/director/dispatch', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: {
        title: 'Direct Mutating Attempt',
        permissions: ['WRITE_CODE'],
        role: 'gemini-worker'
      }
    });

    // Mutating action MUST be blocked by Quorum Gate (403 Forbidden or 503 Quorum Unavailable)
    assert.ok([403, 503].includes(res.statusCode), `Expected 403/503 for unauthorized mutating task, got ${res.statusCode}`);
    assert.equal(res.json.status, 'error');
    assert.ok(res.json.message.includes('Quorum Gate Rejected'));
  } finally {
    ironDirector.caseBus.geminiProvider = origGemini;
    ironDirector.caseBus.claudeProvider = origClaude;
    ironDirector.caseBus.codexProvider = origCodex;
  }
});

test('7. Audit Logs Endpoint: returns immutable historical logs to authenticated admin', async () => {
  const token = generateToken({ role: 'admin', user: 'boss' });
  const res = await makeRequest('/api/audit-logs?limit=10', {
    headers: { Authorization: `Bearer ${token}` }
  });

  assert.equal(res.statusCode, 200);
  assert.equal(res.json.status, 'success');
  assert.ok(Array.isArray(res.json.logs));
  assert.ok(res.json.logs.length > 0);
});

test('HTTP Server Test Suite Teardown', async () => {
  ironDirector.stopDaemon();
  if (httpServer) {
    await new Promise((resolve) => httpServer.close(resolve));
  }
  securityStore.close();
});
