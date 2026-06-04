const http = require('http');
const assert = require('node:assert/strict');
const test = require('node:test');

const { createServer, redactSensitiveValues } = require('./index');

function listen(server) {
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      resolve(server.address());
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close(error => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function withServer(options, callback) {
  const server = createServer(options);
  const address = await listen(server);
  const baseUrl = `http://${address.address}:${address.port}`;

  try {
    return await callback(baseUrl);
  } finally {
    await close(server);
  }
}

function request(baseUrl, path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const req = http.request(url, {
      method: options.method || 'GET',
      headers: options.headers,
    }, res => {
      let body = '';

      res.setEncoding('utf8');
      res.on('data', chunk => {
        body += chunk;
      });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: body ? JSON.parse(body) : null,
        });
      });
    });

    req.on('error', reject);
    req.end();
  });
}

test('GET /health returns ok even with a query string', async () => {
  await withServer({}, async baseUrl => {
    const response = await request(baseUrl, '/health?check=1');

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { status: 'ok' });
  });
});

test('unknown routes return 404 JSON', async () => {
  await withServer({}, async baseUrl => {
    const response = await request(baseUrl, '/missing');

    assert.equal(response.status, 404);
    assert.deepEqual(response.body, { error: 'Not found' });
  });
});

test('unsupported route methods return 405', async () => {
  await withServer({}, async baseUrl => {
    const response = await request(baseUrl, '/health', { method: 'POST' });

    assert.equal(response.status, 405);
    assert.equal(response.headers.allow, 'GET, HEAD, OPTIONS');
    assert.deepEqual(response.body, { error: 'Method not allowed' });
  });
});

test('OPTIONS requests include CORS preflight headers', async () => {
  await withServer({}, async baseUrl => {
    const response = await request(baseUrl, '/health', { method: 'OPTIONS' });

    assert.equal(response.status, 204);
    assert.equal(response.headers['access-control-allow-origin'], '*');
    assert.match(response.headers['access-control-allow-methods'], /GET/);
    assert.match(response.headers['access-control-allow-headers'], /Content-Type/);
    assert.equal(response.body, null);
  });
});

test('debug OMAX route is hidden by default', async () => {
  let called = false;

  await withServer({
    request: async () => {
      called = true;
      return { status: 200, body: {} };
    },
  }, async baseUrl => {
    const response = await request(baseUrl, '/api/debug-omax');

    assert.equal(response.status, 404);
    assert.deepEqual(response.body, { error: 'Not found' });
    assert.equal(called, false);
  });
});

test('debug OMAX route redacts token response fields when explicitly enabled', async () => {
  const env = {
    NODE_ENV: 'development',
    OMAX_DEBUG_ENABLED: 'true',
    OMAX_CLIENT_ID: 'client-id',
    OMAX_CLIENT_SECRET: 'client-secret',
  };

  await withServer({
    env,
    request: async (options, body) => {
      assert.equal(options.hostname, 'id.omaxtelecom.com');
      assert.match(body, /client_id=client-id/);
      assert.match(body, /client_secret=client-secret/);

      return {
        status: 201,
        body: {
          access_token: 'access-token',
          refresh_token: 'refresh-token',
          token_type: 'Bearer',
          nested: {
            client_secret: 'nested-secret',
          },
          values: [
            { id_token: 'id-token' },
          ],
        },
      };
    },
  }, async baseUrl => {
    const response = await request(baseUrl, '/api/debug-omax?verbose=1');

    assert.equal(response.status, 201);
    assert.deepEqual(response.body, {
      status: 201,
      body: {
        access_token: '[REDACTED]',
        refresh_token: '[REDACTED]',
        token_type: 'Bearer',
        nested: {
          client_secret: '[REDACTED]',
        },
        values: [
          { id_token: '[REDACTED]' },
        ],
      },
    });
  });
});

test('debug OMAX route hides upstream error details', async () => {
  const env = {
    NODE_ENV: 'development',
    OMAX_DEBUG_ENABLED: 'true',
    OMAX_CLIENT_ID: 'client-id',
    OMAX_CLIENT_SECRET: 'client-secret',
  };

  await withServer({
    env,
    request: async () => {
      throw new Error('secret network detail');
    },
  }, async baseUrl => {
    const response = await request(baseUrl, '/api/debug-omax');

    assert.equal(response.status, 502);
    assert.deepEqual(response.body, { error: 'Upstream service unavailable' });
  });
});

test('redactSensitiveValues recursively redacts sensitive keys', () => {
  assert.deepEqual(redactSensitiveValues({
    token: 'token',
    nested: {
      secret: 'secret',
      safe: 'value',
    },
  }), {
    token: '[REDACTED]',
    nested: {
      secret: '[REDACTED]',
      safe: 'value',
    },
  });
});
