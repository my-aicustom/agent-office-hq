import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import net from 'net';
import { fileURLToPath } from 'url';
import { SEARCH_TERMS_VAULT_DATA, getAuditSummary, getKeywordsData, refreshSerpData, isGscConfigured } from './serp_auditor.mjs';
import { processAgentChat, AGENT_KNOWLEDGE } from './agent_brain.mjs';
import { nadiaAgent } from './agents/nadia/agent.mjs';
import { mayaAgent } from './agents/maya/agent.mjs';
import { budiAgent } from './agents/budi/agent.mjs';
import { rianAgent } from './agents/rian/agent.mjs';
import { gilangAgent } from './agents/gilang/agent.mjs';
import { TARGET_ENVIRONMENTS } from './agents/gilang/constants.mjs';
import { IronDirector } from './director/iron_director.mjs';

export const ironDirector = new IronDirector();
ironDirector.startDaemon();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Native .env file loader
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const val = match[2].trim().replace(/^["']|["']$/g, '');
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

const PORT = process.env.PORT || 3399;
const ROOT = __dirname;
const MASTER_PASSWORD = process.env.HQ_PASSWORD;
const AUTH_SECRET = process.env.HQ_AUTH_SECRET;

if (!MASTER_PASSWORD?.trim() || !AUTH_SECRET?.trim()) {
  console.error('FATAL: HQ_PASSWORD and HQ_AUTH_SECRET must both be set to non-empty values in .env or environment.');
  process.exit(1);
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

const STATIC_FILES = new Map([
  ['/index.html', 'index.html'],
  ['/style.css', 'style.css'],
  ['/app.js', 'app.js'],
  ['/audio.js', 'audio.js'],
  ['/agents.js', 'agents.js'],
  ['/office.js', 'office.js'],
  ['/kpi.js', 'kpi.js']
]);

const LOGIN_WINDOW_MS = 5 * 60 * 1000;
const MAX_LOGIN_FAILURES = 5;
const MAX_TRACKED_LOGIN_IPS = 10000;
const TRUST_PROXY = process.env.TRUST_PROXY === 'true';
const loginFailuresByIp = new Map();

// Token utilities
function generateToken(payload = {}) {
  const data = JSON.stringify({ ...payload, timestamp: Date.now() });
  const dataB64 = Buffer.from(data).toString('base64url');
  const signature = crypto.createHmac('sha256', AUTH_SECRET).update(dataB64).digest('base64url');
  return `${dataB64}.${signature}`;
}

function verifyToken(token) {
  try {
    if (typeof token !== 'string') return false;

    const parts = token.split('.');
    if (parts.length !== 2) return false;

    const [dataB64, signature] = parts;
    if (!dataB64 || !signature) return false;

    const expectedSignature = crypto.createHmac('sha256', AUTH_SECRET).update(dataB64).digest('base64url');
    const signatureBuffer = Buffer.from(signature, 'utf8');
    const expectedSignatureBuffer = Buffer.from(expectedSignature, 'utf8');

    if (signatureBuffer.length !== expectedSignatureBuffer.length) return false;
    if (!crypto.timingSafeEqual(signatureBuffer, expectedSignatureBuffer)) return false;

    const decoded = JSON.parse(Buffer.from(dataB64, 'base64url').toString('utf8'));
    const timestamp = decoded?.timestamp;
    const now = Date.now();
    const maxTokenAgeMs = 30 * 24 * 60 * 60 * 1000;

    if (!Number.isFinite(timestamp)) return false;
    if (timestamp > now) return false;
    if (now - timestamp >= maxTokenAgeMs) return false;

    return decoded;
  } catch {
    return false;
  }
}

function parseIpHeader(value) {
  if (typeof value !== 'string') return null;
  const candidate = value.trim();
  return net.isIP(candidate) ? candidate : null;
}

function getClientIp(req) {
  const socketIp = req.socket.remoteAddress || 'unknown';

  // Forwarded headers are trusted only when an operator explicitly confirms
  // that a reverse proxy sanitizes/overwrites them before requests reach Node.
  if (!TRUST_PROXY) return socketIp;

  const realIp = parseIpHeader(req.headers['x-real-ip']);
  if (realIp) return realIp;

  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string') {
    const firstForwardedIp = parseIpHeader(forwardedFor.split(',')[0]);
    if (firstForwardedIp) return firstForwardedIp;
  }

  return socketIp;
}

function cleanupExpiredLoginFailures(now = Date.now()) {
  for (const [ip, state] of loginFailuresByIp) {
    if (now - state.windowStartedAt >= LOGIN_WINDOW_MS) {
      loginFailuresByIp.delete(ip);
    }
  }
}

function evictOldestLoginFailure() {
  let oldestIp = null;
  let oldestTimestamp = Infinity;

  for (const [ip, state] of loginFailuresByIp) {
    if (state.windowStartedAt < oldestTimestamp) {
      oldestIp = ip;
      oldestTimestamp = state.windowStartedAt;
    }
  }

  if (oldestIp !== null) loginFailuresByIp.delete(oldestIp);
}

function getLoginFailureState(ip, now = Date.now()) {
  const state = loginFailuresByIp.get(ip);
  if (!state || now - state.windowStartedAt >= LOGIN_WINDOW_MS) {
    loginFailuresByIp.delete(ip);
    return null;
  }
  return state;
}

function recordLoginFailure(ip, now = Date.now()) {
  let state = getLoginFailureState(ip, now);

  if (!state) {
    if (loginFailuresByIp.size >= MAX_TRACKED_LOGIN_IPS) {
      cleanupExpiredLoginFailures(now);
      if (loginFailuresByIp.size >= MAX_TRACKED_LOGIN_IPS) {
        evictOldestLoginFailure();
      }
    }
    state = { count: 0, windowStartedAt: now };
  }

  state.count += 1;
  loginFailuresByIp.set(ip, state);
  return state;
}

setInterval(cleanupExpiredLoginFailures, LOGIN_WINDOW_MS).unref();

function getRequestToken(req) {
  // 1. Check Authorization header
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }

  // 2. Check cookie header
  const cookieHeader = req.headers['cookie'];
  if (cookieHeader) {
    const cookies = cookieHeader.split(';').map(c => c.trim());
    const authCookie = cookies.find(c => c.startsWith('hq_session_token='));
    if (authCookie) {
      return authCookie.split('=')[1];
    }
  }

  return null;
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let receivedBytes = 0;
    let settled = false;

    const rejectOnce = error => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    req.on('data', chunk => {
      if (settled) return;

      receivedBytes += chunk.length;
      if (receivedBytes > 1e6) {
        const error = new Error('Payload too large');
        error.code = 'PAYLOAD_TOO_LARGE';
        rejectOnce(error);
        req.resume();
        return;
      }

      chunks.push(chunk);
    });

    req.on('end', () => {
      if (settled) return;
      settled = true;

      try {
        const body = Buffer.concat(chunks).toString('utf8');
        // Preserve existing behavior: empty or malformed JSON becomes {}.
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });

    req.on('error', rejectOnce);
    req.on('aborted', () => {
      const error = new Error('Request aborted');
      error.code = 'REQUEST_ABORTED';
      rejectOnce(error);
    });
  });
}

function sendJsonBodyError(res, error) {
  if (error?.code === 'PAYLOAD_TOO_LARGE') {
    res.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ status: 'error', message: 'PAYLOAD TOO LARGE' }));
    return;
  }

  res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ status: 'error', message: 'INVALID REQUEST BODY' }));
}

function sendNadiaApiError(res, operation, error) {
  console.error(`[NADIA] ${operation} failed: ${error.message}`);
  res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ status: 'error', message: `NADIA ${operation.toUpperCase()} FAILED` }));
}

function sendMayaApiError(res, operation, error) {
  console.error(`[MAYA] ${operation} failed: ${error.message}`);
  res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ status: 'error', message: `MAYA ${operation.toUpperCase()} FAILED` }));
}

function sendBudiApiError(res, operation, error) {
  console.error(`[BUDI] ${operation} failed: ${error.message}`);
  res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ status: 'error', message: `BUDI ${operation.toUpperCase()} FAILED` }));
}

function sendRianApiError(res, operation, error) {
  console.error(`[RIAN] ${operation} failed: ${error.message}`);
  res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ status: 'error', message: `RIAN ${operation.toUpperCase()} FAILED` }));
}

function sendGilangApiError(res, operation, error) {
  console.error(`[GILANG] ${operation} failed: ${error.message}`);
  res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ status: 'error', message: `GILANG ${operation.toUpperCase()} FAILED` }));
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
  let reqPath = parsedUrl.pathname;

  // Global Security & CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // 1. Auth Endpoint: Login
  if (reqPath === '/api/auth/login' && req.method === 'POST') {
    res.setHeader('Cache-Control', 'no-store');
    const clientIp = getClientIp(req);
    const now = Date.now();
    const failureState = getLoginFailureState(clientIp, now);

    if (failureState?.count >= MAX_LOGIN_FAILURES) {
      const retryAfterSeconds = Math.max(1, Math.ceil((LOGIN_WINDOW_MS - (now - failureState.windowStartedAt)) / 1000));
      res.writeHead(429, {
        'Content-Type': 'application/json; charset=utf-8',
        'Retry-After': String(retryAfterSeconds)
      });
      res.end(JSON.stringify({ status: 'error', message: 'TOO MANY LOGIN ATTEMPTS' }));
      return;
    }

    let body;
    try {
      body = await parseJsonBody(req);
    } catch (error) {
      sendJsonBodyError(res, error);
      return;
    }
    const passwordInput = typeof body.password === 'string' ? body.password.trim() : '';

    if (passwordInput === MASTER_PASSWORD) {
      loginFailuresByIp.delete(clientIp);
      const token = generateToken({ role: 'admin', user: 'boss' });
      const secureCookie = process.env.NODE_ENV === 'production' ? '; Secure' : '';
      res.setHeader('Set-Cookie', `hq_session_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secureCookie}`);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        status: 'success',
        token: token,
        message: 'ACCESS GRANTED: WELCOME TO SWARM HQ'
      }));
      return;
    } else {
      recordLoginFailure(clientIp, now);
      res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        status: 'error',
        message: 'ACCESS DENIED: INVALID PASSCODE'
      }));
      return;
    }
  }

  // 2. Auth Endpoint: Verify Token
  if (reqPath === '/api/auth/verify') {
    res.setHeader('Cache-Control', 'no-store');
    const token = getRequestToken(req);
    const session = verifyToken(token);
    if (session) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ status: 'success', authenticated: true, user: session.user }));
    } else {
      res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ status: 'error', authenticated: false, message: 'UNAUTHORIZED' }));
    }
    return;
  }

  // Protected API Endpoints Guard
  if (reqPath.startsWith('/api/')) {
    const token = getRequestToken(req);
    const session = verifyToken(token);
    if (!session) {
      res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        status: 'error',
        message: 'UNAUTHORIZED: SECURITY PASSCODE REQUIRED'
      }));
      return;
    }

    if (reqPath.startsWith('/api/agents/nadia/')) {
      res.setHeader('Cache-Control', 'no-store');
    }

    if (reqPath === '/api/agents/nadia/status' && req.method === 'GET') {
      try {
        const status = await nadiaAgent.getStatus();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ status: 'success', ...status }, null, 2));
      } catch (error) {
        sendNadiaApiError(res, 'status', error);
      }
      return;
    }

    if (reqPath === '/api/agents/maya/status' && req.method === 'GET') {
      try {
        const status = await mayaAgent.getStatus();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ status: 'success', ...status }, null, 2));
      } catch (error) {
        sendMayaApiError(res, 'status', error);
      }
      return;
    }

    if (reqPath === '/api/agents/nadia/google-ads/status' && req.method === 'GET') {
      try {
        const provider = await nadiaAgent.getGoogleAdsStatus();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ status: 'success', provider }, null, 2));
      } catch (error) {
        sendNadiaApiError(res, 'Google Ads provider status', error);
      }
      return;
    }

    if (reqPath === '/api/agents/nadia/opportunities' && req.method === 'GET') {
      try {
        const opportunities = await nadiaAgent.getOpportunities({
          classification: parsedUrl.searchParams.get('classification') || undefined,
          minScore: parsedUrl.searchParams.get('minScore') || 0,
          limit: parsedUrl.searchParams.get('limit') || 100
        });
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ status: 'success', count: opportunities.length, opportunities }, null, 2));
      } catch (error) {
        sendNadiaApiError(res, 'opportunities', error);
      }
      return;
    }

    if (reqPath === '/api/agents/nadia/analyze' && req.method === 'POST') {
      let body;
      try {
        body = await parseJsonBody(req);
      } catch (error) {
        sendJsonBodyError(res, error);
        return;
      }
      if (body.manualSearchTerms != null && !Array.isArray(body.manualSearchTerms)) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ status: 'error', message: 'manualSearchTerms must be an array when supplied.' }));
        return;
      }
      try {
        const result = await nadiaAgent.analyze({ manualSearchTerms: body.manualSearchTerms });
        res.writeHead(result.status === 'success' ? 200 : 500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(result, null, 2));
      } catch (error) {
        sendNadiaApiError(res, 'analysis', error);
      }
      return;
    }

    if (reqPath === '/api/agents/nadia/tasks' && req.method === 'POST') {
      let body;
      try {
        body = await parseJsonBody(req);
      } catch (error) {
        sendJsonBodyError(res, error);
        return;
      }
      if (typeof body.opportunityId !== 'string' || !body.opportunityId.trim()) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ status: 'error', message: 'opportunityId is required.' }));
        return;
      }
      try {
        const task = await nadiaAgent.createTask(body.opportunityId.trim());
        res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ status: 'success', task }, null, 2));
      } catch (error) {
        if (error.code === 'OPPORTUNITY_NOT_FOUND' || error.code === 'OPPORTUNITY_DISCARDED') {
          const responseStatus = error.code === 'OPPORTUNITY_NOT_FOUND' ? 404 : 409;
          res.writeHead(responseStatus, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ status: 'error', message: error.message }));
        } else {
          sendNadiaApiError(res, 'task creation', error);
        }
      }
      return;
    }

    // BUDI — Customer Success & Lead Ops Agent
    if (reqPath === '/api/agents/budi/status' && req.method === 'GET') {
      try {
        const status = await budiAgent.getStatus();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ status: 'success', ...status }, null, 2));
      } catch (error) {
        sendBudiApiError(res, 'status', error);
      }
      return;
    }

    if (reqPath === '/api/agents/budi/leads' && req.method === 'GET') {
      try {
        const leads = await budiAgent.getLeads({
          status: parsedUrl.searchParams.get('status') || undefined,
          source: parsedUrl.searchParams.get('source') || undefined,
          limit: parsedUrl.searchParams.get('limit') || undefined
        });
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ status: 'success', count: leads.length, leads }, null, 2));
      } catch (error) {
        sendBudiApiError(res, 'leads', error);
      }
      return;
    }

    if (reqPath === '/api/agents/budi/webhook' && req.method === 'POST') {
      let body;
      try {
        body = await parseJsonBody(req);
      } catch (error) {
        sendJsonBodyError(res, error);
        return;
      }
      try {
        const result = await budiAgent.syncWhatsAppWebhook(body);
        res.writeHead(result.inserted || result.duplicate ? 200 : 500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ status: 'success', ...result }, null, 2));
      } catch (error) {
        if (error.code === 'VALIDATION_ERROR') {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ status: 'error', message: error.message }));
        } else {
          sendBudiApiError(res, 'webhook', error);
        }
      }
      return;
    }

    // RIAN — Negative Keyword & Search Terms Waste Auditor
    if (reqPath === '/api/agents/rian/status' && req.method === 'GET') {
      try {
        const status = rianAgent.getStatus();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ status: 'success', ...status }, null, 2));
      } catch (error) {
        sendRianApiError(res, 'status', error);
      }
      return;
    }

    if (reqPath === '/api/agents/rian/audit' && req.method === 'POST') {
      let body;
      try {
        body = await parseJsonBody(req);
      } catch (error) {
        sendJsonBodyError(res, error);
        return;
      }
      if (body.searchTerms != null && !Array.isArray(body.searchTerms)) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ status: 'error', message: 'searchTerms must be an array when supplied.' }));
        return;
      }
      try {
        const audit = rianAgent.auditSearchTerms({ searchTerms: body.searchTerms });
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ status: 'success', ...audit }, null, 2));
      } catch (error) {
        sendRianApiError(res, 'audit', error);
      }
      return;
    }

    if (reqPath === '/api/agents/rian/negatives' && req.method === 'GET') {
      try {
        const format = parsedUrl.searchParams.get('format') || 'json';
        const exported = rianAgent.exportNegatives({ format });
        if (format === 'csv') {
          res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8' });
          res.end(exported);
        } else if (format === 'text') {
          res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end(exported);
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(exported);
        }
      } catch (error) {
        sendRianApiError(res, 'negatives', error);
      }
      return;
    }

    // GILANG — DevOps & Server Deployer
    if (reqPath === '/api/agents/gilang/status' && req.method === 'GET') {
      try {
        const status = await gilangAgent.getStatus();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ status: 'success', ...status }, null, 2));
      } catch (error) {
        sendGilangApiError(res, 'status', error);
      }
      return;
    }

    if (reqPath === '/api/agents/gilang/deploy' && req.method === 'POST') {
      let body;
      try {
        body = await parseJsonBody(req);
      } catch (error) {
        sendJsonBodyError(res, error);
        return;
      }
      const environment = typeof body.environment === 'string' ? body.environment.trim().toUpperCase() : '';
      if (!Object.values(TARGET_ENVIRONMENTS).includes(environment)) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ status: 'error', message: `environment must be one of: ${Object.values(TARGET_ENVIRONMENTS).join(', ')}` }));
        return;
      }
      try {
        const deployment = gilangAgent.triggerBuild(environment);
        res.writeHead(deployment.status === 'FAILED' ? 502 : 200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ status: 'success', deployment }, null, 2));
      } catch (error) {
        sendGilangApiError(res, 'deploy', error);
      }
      return;
    }

    if (reqPath === '/api/agents/gilang/purge' && req.method === 'POST') {
      let body;
      try {
        body = await parseJsonBody(req);
      } catch (error) {
        sendJsonBodyError(res, error);
        return;
      }
      if (body.urls != null && !Array.isArray(body.urls)) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ status: 'error', message: 'urls must be an array when supplied.' }));
        return;
      }
      try {
        const result = await gilangAgent.purgeCache(body.urls || []);
        res.writeHead(result.purged ? 200 : 502, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ status: 'success', ...result }, null, 2));
      } catch (error) {
        sendGilangApiError(res, 'purge', error);
      }
      return;
    }

    // Interactive Agent Chat & Interrogation API
    if (reqPath === '/api/agent/chat' && req.method === 'POST') {
      let body;
      try {
        body = await parseJsonBody(req);
      } catch (error) {
        sendJsonBodyError(res, error);
        return;
      }
      const agentId = body.agentId;
      const message = typeof body.message === 'string' ? body.message.trim() : '';
      const history = body.history || [];

      if (!agentId || !message) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ status: 'error', message: 'agentId dan message wajib diisi.' }));
        return;
      }

      const REAL_AGENT_ANSWERERS = {
        'radar-x': () => nadiaAgent.answer(message),
        'aero-writer': () => mayaAgent.answer(message),
        'iron-shield': () => rianAgent.answer(message),
        'hermes-sentry': () => budiAgent.answer(message),
        'cloud-forge': () => gilangAgent.answer(message)
      };
      const chatResult = REAL_AGENT_ANSWERERS[agentId]
        ? await REAL_AGENT_ANSWERERS[agentId]()
        : processAgentChat(agentId, message, history);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(chatResult, null, 2));
      return;
    }

    // SERP Rank Audit API — live data from Google Search Console (see serp_auditor.mjs)
    if (reqPath === '/api/serp-audit') {
      const summary = getAuditSummary();
      const responseData = {
        status: 'success',
        timestamp: summary.lastAuditTimestamp,
        summary: summary,
        keywords: getKeywordsData()
      };
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(responseData, null, 2));
      return;
    }

    // Raw Google Ads Search Terms & Negative Vault API
    if (reqPath === '/api/search-terms') {
      const fetchedAt = new Date().toISOString();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        status: 'success',
        source: 'google_ads_search_terms_manual',
        dataStatus: 'MANUAL',
        fetchedAt,
        totalSearchTerms: SEARCH_TERMS_VAULT_DATA.length,
        buyerCount: SEARCH_TERMS_VAULT_DATA.filter(s => s.category === 'buyer' || s.category === 'location').length,
        blockedNegativeCount: SEARCH_TERMS_VAULT_DATA.filter(s => s.category === 'negative').length,
        terms: SEARCH_TERMS_VAULT_DATA.map(term => ({
          ...term,
          provenance: { source: 'google_ads_search_terms_manual', status: 'MANUAL', fetchedAt }
        }))
      }, null, 2));
      return;
    }

    // Iron Director — Task Ledger & State Machine Telemetry
    if (reqPath === '/api/director/telemetry' && req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store');
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ status: 'success', director: ironDirector.getTelemetry() }, null, 2));
      return;
    }

    if (reqPath === '/api/director/tasks' && req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store');
      const state = parsedUrl.searchParams.get('state') || undefined;
      const role = parsedUrl.searchParams.get('role') || undefined;
      const owner = parsedUrl.searchParams.get('owner') || undefined;
      const limit = Number(parsedUrl.searchParams.get('limit')) || 50;

      const tasks = ironDirector.ledger.listTasks({ state, role, owner, limit });
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ status: 'success', count: tasks.length, tasks }, null, 2));
      return;
    }

    if (reqPath === '/api/director/dispatch' && req.method === 'POST') {
      let body;
      try {
        body = await parseJsonBody(req);
      } catch (error) {
        sendJsonBodyError(res, error);
        return;
      }

      if (!body.title) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ status: 'error', message: 'Field "title" is required to dispatch task.' }));
        return;
      }

      try {
        const result = await ironDirector.dispatch(body);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ status: 'success', task: result }, null, 2));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ status: 'error', message: error.message }, null, 2));
      }
      return;
    }

    if (reqPath === '/api/director/reconcile' && req.method === 'POST') {
      try {
        const result = ironDirector.reconcile();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ status: 'success', ...result }, null, 2));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ status: 'error', message: error.message }, null, 2));
      }
      return;
    }

    if (reqPath === '/api/system-status') {
      const statusData = {
        status: 'ONLINE',
        vps: '163.61.44.41: OK',
        fleet: ['tepatlaser.com', 'rajacuttinglaser.com', 'jasalasercutting.com'],
        uptime: process.uptime()
      };
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(statusData, null, 2));
      return;
    }
  }

  // 3. Static files serving with an explicit browser-facing allowlist
  if (reqPath === '/') reqPath = '/index.html';

  const staticFile = STATIC_FILES.get(reqPath);
  if (!staticFile) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
    return;
  }

  const filePath = path.join(ROOT, staticFile);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'text/plain';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🎮 TepatLaser AI Swarm HQ & Search Terms Vault is live on: http://localhost:${PORT}`);
});

// Live SERP audit scheduler — periodically refreshes keyword rankings from
// Google Search Console (see serp_auditor.mjs). Disabled until
// GSC_SERVICE_ACCOUNT_JSON is set; see README.md "Setup Google Search Console".
const REFRESH_INTERVAL_HOURS = Number(process.env.GSC_REFRESH_INTERVAL_HOURS) || 12;

async function runSerpRefresh() {
  try {
    await refreshSerpData();
    console.log(`✅ [SERP] Search Console refresh done at ${new Date().toISOString()}`);
  } catch (e) {
    console.error(`❌ [SERP] Search Console refresh failed: ${e.message}`);
  }
}

if (isGscConfigured()) {
  runSerpRefresh();
  setInterval(runSerpRefresh, REFRESH_INTERVAL_HOURS * 60 * 60 * 1000);
} else {
  console.warn('⚠️ [SERP] GSC_SERVICE_ACCOUNT_JSON not set — SERP dashboard will show "no data" until configured. See README.md "Setup Google Search Console".');
}

// Maya activity sync — pulls her real publish/rank log from the tepatlaser
// repo (public raw file, no auth needed) so the dashboard reflects real work
// instead of the old hardcoded KPI card. See agents/maya/sync.mjs.
const MAYA_SYNC_INTERVAL_HOURS = Number(process.env.MAYA_SYNC_INTERVAL_HOURS) || 6;

async function runMayaSync() {
  try {
    const { errors } = await mayaAgent.sync();
    if (errors.length) console.warn(`⚠️ [MAYA] sync completed with warnings: ${errors.join('; ')}`);
    else console.log(`✅ [MAYA] activity sync done at ${new Date().toISOString()}`);
  } catch (e) {
    console.error(`❌ [MAYA] activity sync failed: ${e.message}`);
  }
}

runMayaSync();
setInterval(runMayaSync, MAYA_SYNC_INTERVAL_HOURS * 60 * 60 * 1000);
