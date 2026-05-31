const http = require('http');
const https = require('https');
const PORT = process.env.PORT || 3000;

function call(o, d) {
  return new Promise((res, rej) => {
    const r = https.request(o, s => {
      let b = '';
      s.on('data', c => b += c);
      s.on('end', () => {
        try { res({ status: s.statusCode, body: JSON.parse(b) }); }
        catch (e) { res({ status: s.statusCode, body: b }); }
      });
    });
    r.on('error', rej);
    if (d) r.write(d);
    r.end();
  });
}

http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
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
    const id = process.env.OMAX_CLIENT_ID;
    const secret = process.env.OMAX_CLIENT_SECRET;
    if (!id || !secret) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Missing env vars' }));
      return;
    }
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: id,
      client_secret: secret,
    }).toString();
    try {
      const r = await call({
        hostname: 'id.omaxtelecom.com',
        path: '/realms/platform/protocol/openid-connect/token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
        },
      }, body);
      res.writeHead(200);
      res.end(JSON.stringify({ status: r.status, body: r.body }, null, 2));
    } catch (e) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));

}).listen(PORT, () => console.log('running on ' + PORT));
