const https = require('https');
const http = require('http');

function httpRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch(e) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

const PORT = process.env.PORT || 3000;

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.url === '/health') {
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  if (req.url === '/api/debug-omax') {
    const clientId = process.env.OMAX_CLIENT_ID;
    const clientSecret = process.env.OMAX_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Missing env vars' }));
      return;
    }

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }).toString();

    const endpoints = [
      { hostname: 'id.omaxtelecom.com', path: '/realms/platform/protocol/openid-connect/token' },
    ];

    const results = [];
    for (const ep of endpoints) {
      try {
        const r = await httpRequest({
          hostname: ep.hostname, path: ep.path, method: 'POST',
          headers: { 'Conten
