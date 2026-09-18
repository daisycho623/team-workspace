const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { storePath } = require('./cx-store.cjs');

const files = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/config.js': ['config.js', 'text/javascript; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
};
const port = Number(process.env.PORT || 3000);
const server = http.createServer(async (req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/api/tasks') {
    try {
      const snapshot = JSON.parse(await fs.readFile(storePath, 'utf8'));
      const body = JSON.stringify({ ok: true, importedAt: snapshot.importedAt,
        source: snapshot.source, rows: snapshot.tasks.map(task => task.values), workers: snapshot.workers });
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch (error) {
      res.writeHead(error.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: '저장된 CX 데이터를 읽을 수 없습니다.' }));
    }
    return;
  }
  const file = Object.hasOwn(files, pathname) ? files[pathname] : null;
  if (!file) {
    res.writeHead(404).end('Not found');
    return;
  }
  try {
    const body = await fs.readFile(path.join(__dirname, file[0]));
    res.writeHead(200, { 'Content-Type': file[1], 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(500).end('Unable to read file');
  }
});
server.on('error', error => {
  console.error('로컬 서버 시작 실패:', error.message);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => {
  console.log(`CX 업무 관리: http://127.0.0.1:${server.address().port}`);
});
