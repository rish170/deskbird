import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const PORT = 4040;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json'
};

const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];

  // Redirect root to /art/preview.html so relative module imports work
  if (reqPath === '/' || reqPath === '/preview') {
    res.writeHead(302, { Location: '/art/preview.html' });
    res.end();
    return;
  }

  // Check direct path from ROOT_DIR
  let filePath = path.join(ROOT_DIR, reqPath);

  // If not found, check if it's inside art/
  if (!fs.existsSync(filePath)) {
    const artPath = path.join(ROOT_DIR, 'art', reqPath);
    if (fs.existsSync(artPath)) {
      filePath = artPath;
    }
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found: ' + reqPath);
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  res.writeHead(200, {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*'
  });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, () => {
  console.log('\n' + '='.repeat(70));
  console.log('       DESKBIRD SPRITE & ART PREVIEW VIEWER');
  console.log(`  👉 Open http://localhost:${PORT}/art/preview.html to inspect sprites!`);
  console.log('  Press Ctrl+C to stop the viewer.');
  console.log('='.repeat(70) + '\n');
});
