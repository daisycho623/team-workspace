const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../app.js'), 'utf8');
const sheet = rows => ({ status: 'ok', table: { rows: rows.map(row => ({ c: row.map(v => ({ v })) })) } });

function app(respond, serverResponse) {
  const elements = new Map(), requests = [], scripts = new Set(), timers = new Set();
  const element = selector => {
    // The removed stats container must never be accessed during rendering.
    if (selector === '#stats') return null;
    if (!elements.has(selector)) elements.set(selector, {
      value: ['#worker', '#status'].includes(selector) ? 'all' : '',
      innerHTML: '', textContent: '', disabled: false,
      addEventListener() {}, focus() {},
    });
    return elements.get(selector);
  };
  const window = { APPS_SCRIPT_URL: 'https://example.test/exec' };
  if (serverResponse) window.SERVER_DATA_URL = '/api/tasks';
  const context = vm.createContext({
    window, URL, URLSearchParams, AbortSignal, fetch: async () => serverResponse, console: { error() {} },
    setTimeout(fn) { const timer = { fn }; timers.add(timer); return timer; },
    clearTimeout(timer) { timers.delete(timer); },
    localStorage: { getItem: () => null, removeItem() {}, setItem() {} },
    requestAnimationFrame: fn => fn(),
    document: {
      querySelector: element, querySelectorAll: () => [],
      createElement: () => { const script = { remove() { scripts.delete(script); } }; return script; },
      head: { appendChild(script) {
        scripts.add(script);
        const url = new URL(script.src);
        const target = url.searchParams.get('sheet') || url.searchParams.get('action');
        requests.push(target);
        queueMicrotask(() => {
          const result = respond(target);
          if (result === 'timeout') return;
          if (result instanceof Error) return script.onerror();
          const callback = url.searchParams.get('callback') || url.searchParams.get('tqx').split('responseHandler:')[1];
          window[callback](result);
        });
      } },
    },
  });
  const ready = vm.runInContext(source, context);
  return { ready, element, requests, scripts, timers, context, window,
    run: code => vm.runInContext(code, context) };
}

test('server rows and worker options render without stats; refresh reloads both sources', async () => {
  let title = '서버 업무';
  const page = app(target => target === 'CX'
    ? sheet([['등록', 'RMS', '작업자', '단계', '', '업무제목'], ['9/18', '123', '작업자 A', '진행중', '', title]])
    : { ok: true, workers: [' 작업자 A ', '작업자 A', '작업자 B'] });
  await page.ready;
  assert.match(page.element('#rows').innerHTML, /서버 업무/);
  assert.equal(page.run('data.length'), 1);
  assert.equal(page.run('data[0][3]'), '진행');
  page.run('addRow()');
  assert.match(page.element('#rows').innerHTML, /작업자 B/);
  title = '새 서버 내용';
  await page.element('#refresh').onclick();
  assert.match(page.element('#rows').innerHTML, /새 서버 내용/);
  assert.equal(page.requests.filter(x => x === 'getWorkers').length, 2);
  assert.equal(page.scripts.size, 0);
  assert.equal(page.timers.size, 0);
});

test('empty CX is a successful connection and failed API falls back to worker sheet', async () => {
  const page = app(target => target === 'CX' ? sheet([]) : target === 'getWorkers'
    ? new Error('offline') : sheet([['작업자'], ['작업자 A'], ['작업자 A'], [''], ['작업자 B']]));
  await page.ready;
  assert.equal(page.element('#sync').textContent, '실시간 연결됨');
  assert.match(page.element('#updated').textContent, /등록된 업무가 없습니다/);
  assert.equal(page.run('workers.length'), 2);
  page.run('addRow()');
  assert.match(page.element('#rows').innerHTML, /작업자 B/);
});

test('sheet errors preserve loaded rows and report failure', async () => {
  let failed = false;
  const page = app(target => target !== 'CX' ? { ok: true, workers: [] }
    : failed ? { status: 'error', errors: [{ reason: 'access_denied' }] }
    : sheet([['9/18', '', '기존 작업자', '배정', '', '유지할 업무']]));
  await page.ready;
  failed = true;
  await page.run('load()');
  assert.match(page.element('#rows').innerHTML, /유지할 업무/);
  assert.match(page.element('#updated').textContent, /연결 실패/);
  assert.equal(page.element('#newTask').disabled, false);
});

test('worker timeout falls back and cleans up JSONP requests', async () => {
  const page = app(target => target === 'CX' ? sheet([]) : target === 'getWorkers'
    ? 'timeout' : sheet([['작업자'], ['작업자 A']]));
  await new Promise(resolve => setImmediate(resolve));
  for (const timer of [...page.timers]) timer.fn();
  await page.ready;
  assert.equal(page.run('workers[0]'), '작업자 A');
  assert.equal(page.timers.size, 0);
  assert.equal(page.scripts.size, 0);
  const lateCallback = Object.keys(page.window).find(key => key.startsWith('__cxResponse_'));
  assert.ok(lateCallback);
  page.window[lateCallback]({ ok: true, workers: ['늦은 응답'] });
  assert.equal(page.run('workers[0]'), '작업자 A');
  assert.equal(Object.keys(page.window).length, 1);
});

test('worker names containing HTML characters remain text in options', async () => {
  const page = app(target => target === 'CX' ? sheet([]) : { ok: true, workers: ['A <B> & C'] });
  await page.ready;
  page.run('addRow()');
  assert.match(page.element('#rows').innerHTML, /A &lt;B&gt; &amp; C/);
  assert.doesNotMatch(page.element('#rows').innerHTML, /A <B>/);
});

test('stored server data loads without contacting Google and always uses date inputs', async () => {
  const page = app(() => { throw new Error('Unexpected Google request'); }, {
    ok: true, status: 200, json: async () => ({ ok: true, source: { sha256: 'test' }, importedAt: '2026-09-18T00:00:00Z',
      rows: [['1/21', '', '작업자 A', '진행', '매주', '서버 업무', '', '', '', '14.125', '']], workers: ['작업자 A'] }),
  });
  await page.ready;
  assert.equal(page.requests.length, 0);
  assert.equal(page.element('#sync').textContent, '서버 저장 데이터 연결됨');
  assert.match(page.element('#rows').innerHTML, /서버 업무/);
  assert.match(page.element('#rows').innerHTML, /type="date" class="date-input"/);
  assert.equal(page.run('data[0][4]'), '매주');
  assert.doesNotMatch(page.element('#rows').innerHTML, /data-col="[78]"/);
  page.run("remember(0,5,'로컬 수정')");
  assert.equal(page.run("edits['server:test:0:5']"), '로컬 수정');
});

test('missing storage API falls back to Sheets; server failures are reported', async () => {
  const page = app(target => target === 'CX' ? sheet([]) : { ok: true, workers: [] }, { status: 404 });
  await page.ready;
  assert.equal(page.element('#sync').textContent, '실시간 연결됨');
  const failed = app(() => { throw new Error('Unexpected fallback'); }, { ok: false, status: 500 });
  await failed.ready;
  assert.equal(failed.element('#sync').textContent, '서버 데이터 연결 실패');
  assert.equal(failed.element('#newTask').disabled, false);
});
