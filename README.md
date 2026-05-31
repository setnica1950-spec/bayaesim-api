const http = require('http');
const https = require('https');
const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }
  if (req.url === '/health') { res.writeHead(200); res.end('{"status":"ok"}'); return; }
  res.writeHead(404);
  res.end('{"error":"not found"}');
}).listen(PORT, () => console.log('ok ' + PORT));
