const http = require('http');
const https = require('https');

const DEFAULT_PORT = 3000;
const DEFAULT_TIMEOUT_MS = 10000;
const MAX_UPSTREAM_BODY_BYTES = 1024 * 1024;
const REDACTED = '[REDACTED]';
const SENSITIVE_KEYS = new Set([
  'access_token',
  'client_secret',
  'id_token',
  'refresh_token',
  'secret',
  'token',
]);

function parseInteger(value, fallback) {
  if (value === undefined || value === '') {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getPort(env = process.env) {
  const port = parseInteger(env.PORT, DEFAULT_PORT);
  if (port > 65535) {
    throw new Error('PORT must be between 1 and 65535');
  }

  return port;
}

function parseBody(body) {
  if (!body) {
    return null;
  }

  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

function call(options, data, requestOptions = {}) {
  const timeoutMs = parseInteger(requestOptions.timeoutMs, DEFAULT_TIMEOUT_MS);
  const maxBytes = parseInteger(requestOptions.maxBytes, MAX_UPSTREAM_BODY_BYTES);

  return new Promise((resolve, reject) => {
    const request = https.request(options, response => {
      let body = '';
      let bytes = 0;

      response.setEncoding('utf8');
      response.on('data', chunk => {
        bytes += Buffer.byteLength(chunk);
        if (bytes > maxBytes) {
          request.destroy(new Error('Upstream response body too large'));
          return;
        }

        body += chunk;
      });
      response.on('error', reject);
      response.on('end', () => {
        resolve({
          status: response.statusCode || 502,
          body: parseBody(body),
        });
      });
    });

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error('Upstream request timed out'));
    });
    request.on('error', reject);

    if (data) {
      request.write(data);
    }

    request.end();
  });
}

function isDebugEnabled(env) {
  return env.NODE_ENV === 'development' && env.OMAX_DEBUG_ENABLED === 'true';
}

function normalizeStatus(status, fallback = 502) {
  return Number.isInteger(status) && status >= 100 && status <= 599 ? status : fallback;
}

function redactSensitiveValues(value) {
  if (Array.isArray(value)) {
    return value.map(redactSensitiveValues);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        SENSITIVE_KEYS.has(key.toLowerCase()) ? REDACTED : redactSensitiveValues(entry),
      ]),
    );
  }

  return value;
}

function safeDebugBody(body) {
  if (body && typeof body === 'object') {
    return redactSensitiveValues(body);
  }

  return '[non-json body omitted]';
}

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function sendJson(req, res, status, payload, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    ...headers,
  });

  if (req.method === 'HEAD') {
    res.end();
    return;
  }

  res.end(JSON.stringify(payload));
}

function methodNotAllowed(req, res, allowedMethods) {
  sendJson(req, res, 405, { error: 'Method not allowed' }, {
    Allow: allowedMethods.join(', '),
  });
}

async function handleDebugOmax(req, res, env, request) {
  if (!isDebugEnabled(env)) {
    sendJson(req, res, 404, { error: 'Not found' });
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    methodNotAllowed(req, res, ['GET', 'HEAD', 'OPTIONS']);
    return;
  }

  const id = env.OMAX_CLIENT_ID;
  const secret = env.OMAX_CLIENT_SECRET;
  if (!id || !secret) {
    sendJson(req, res, 400, { error: 'Missing OMAX credentials' });
    return;
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: id,
    client_secret: secret,
  }).toString();

  try {
    const upstream = await request({
      hostname: 'id.omaxtelecom.com',
      path: '/realms/platform/protocol/openid-connect/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    }, body);

    const status = normalizeStatus(upstream.status);
    sendJson(req, res, status, {
      status,
      body: safeDebugBody(upstream.body),
    });
  } catch (error) {
    console.error('OMAX debug request failed', error);
    sendJson(req, res, 502, { error: 'Upstream service unavailable' });
  }
}

async function handleRequest(req, res, options = {}) {
  const env = options.env || process.env;
  const request = options.request || call;

  try {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || '/', 'http://localhost');

    if (url.pathname === '/health') {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        methodNotAllowed(req, res, ['GET', 'HEAD', 'OPTIONS']);
        return;
      }

      sendJson(req, res, 200, { status: 'ok' });
      return;
    }

    if (url.pathname === '/api/debug-omax') {
      await handleDebugOmax(req, res, env, request);
      return;
    }

    sendJson(req, res, 404, { error: 'Not found' });
  } catch (error) {
    console.error('Unhandled request error', error);

    if (res.headersSent) {
      res.destroy();
      return;
    }

    sendJson(req, res, 500, { error: 'Internal server error' });
  }
}

function createServer(options) {
  return http.createServer((req, res) => {
    handleRequest(req, res, options);
  });
}

if (require.main === module) {
  const port = getPort();
  createServer().listen(port, () => {
    console.log('running on ' + port);
  });
}

module.exports = {
  call,
  createServer,
  getPort,
  handleRequest,
  redactSensitiveValues,
};
