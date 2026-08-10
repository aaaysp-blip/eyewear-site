// dev-server.mjs
// เซิร์ฟเวอร์สำหรับรันในเครื่องระหว่างพัฒนา — เสิร์ฟไฟล์ static เหมือน serve.ps1
// บวกกับรัน /api/*.js (Vercel serverless functions) จริงๆ โดยไม่ต้องพึ่ง Vercel CLI/account
//
// รัน: npm run dev   แล้วเปิด http://localhost:8080

import http from 'node:http';
import { readFile, readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8080;

// ---------- โหลด .env เอง (ไม่พึ่ง dotenv) ----------
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!existsSync(envPath)) return;
  const text = readFileSync(envPath, 'utf8');
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}
loadEnv();

const MIME = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css', '.js': 'application/javascript', '.mjs': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.gif': 'image/gif', '.ico': 'image/x-icon', '.webp': 'image/webp',
};

function serveStatic(req, res, urlPath) {
  let p = decodeURIComponent(urlPath);
  if (p === '/') p = '/index.html';
  const filePath = path.join(__dirname, p);
  const resolved = path.normalize(filePath);
  if (!resolved.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('403 Forbidden');
    return;
  }
  readFile(resolved, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found: ' + p);
      return;
    }
    const ext = path.extname(resolved).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

// ---------- shim ให้ req/res เข้ากันได้กับ signature ของ Vercel serverless function ----------
async function handleApi(req, res, apiPath, search) {
  const fileName = apiPath.replace(/^\/api\//, '').replace(/\.js$/, '');
  const modPath = path.join(__dirname, 'api', fileName + '.js');
  if (!existsSync(modPath)) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'API route not found: ' + apiPath }));
    return;
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const rawBody = Buffer.concat(chunks).toString('utf8');
  let body = null;
  if (rawBody) {
    try { body = JSON.parse(rawBody); } catch { body = rawBody; }
  }

  const query = Object.fromEntries(search.entries());

  let statusCode = 200;
  const shimRes = {
    status(code) { statusCode = code; return this; },
    json(obj) {
      res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(obj));
    },
    // ใช้ header ที่ setHeader() ตั้งไว้ก่อนหน้า (เช่น promptpay-qr.js ตั้ง Content-Type: image/png เอง)
    send(data) {
      res.statusCode = statusCode;
      res.end(data);
    },
    setHeader(name, value) { res.setHeader(name, value); },
  };

  const shimReq = { method: req.method, query, body, headers: req.headers };

  try {
    const mod = await import(pathToFileURL(modPath).href + '?t=' + Date.now());
    await mod.default(shimReq, shimRes);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: String(err.message || err) }));
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname.startsWith('/api/')) {
    await handleApi(req, res, url.pathname, url.searchParams);
    return;
  }
  serveStatic(req, res, url.pathname);
});

server.listen(PORT, () => {
  console.log(`Dev server (static + /api/*) running at http://localhost:${PORT}`);
});
