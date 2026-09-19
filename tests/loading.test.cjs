const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
function app(handler){
  const elements=new Map(),requests=[];
  const element=id=>{if(!elements.has(id))elements.set(id,{value:['#worker','#status'].includes(id)?'all':'',innerHTML:'',textContent:'',addEventListener(){},setAttribute(){},focus(){}});return elements.get(id)};
  const context=vm.createContext({window:{APPS_SCRIPT_URL:'https://example.test/exec',WORKERS:['작업자 A']},AbortSignal,console,
    fetch:async(url,options)=>{const payload=JSON.parse(options.body);requests.push({url,payload,headers:options.headers});return {ok:true,json:async()=>handler(payload)}},
    localStorage:{getItem:()=>null,setItem(){},removeItem(){}},alert(){},confirm:()=>true,requestAnimationFrame:fn=>fn(),setTimeout,
    document:{querySelector:element,querySelectorAll:()=>[]}});
  const ready=vm.runInContext(source,context);
  return {ready,requests,element,run:code=>vm.runInContext(code,context)};
}
const task=['9/19','123','작업자 A','배정','2026-09-20','업무 제목','메모','1.5','0'];
test('new tasks stay below existing tasks after consecutive saves and reload',async()=>{
  let tasks=[task];
  const page=app(p=>{if(p.action==='save'){tasks=p.tasks;return {ok:true}}return {ok:true,tasks}});
  await page.ready;
  for(const title of ['새 업무 1','새 업무 2']){
    page.run('addRow()');
    assert.equal(page.run('selected()[0].i'),page.run('data.length-1'));
    page.run("remember(data.length-1,2,'작업자 A')");
    page.run('remember(data.length-1,5,'+JSON.stringify(title)+')');
    await page.run('saveAll()');
  }
  assert.deepEqual(tasks.map(row=>row[5]),['업무 제목','새 업무 1','새 업무 2']);
  await page.run('load()');
  assert.equal(page.run('data[2][5]'),'새 업무 2');
});
test('load uses Apps Script tasks and maps nine columns without losing work hours',async()=>{
  const page=app(()=>({ok:true,tasks:[task],updatedAt:'2026-09-19T00:00:00Z',holidayError:'key missing'}));await page.ready;
  assert.equal(page.requests[0].payload.action,'load');assert.equal(page.run('data[0][9]'),'1.5');
  assert.match(page.element('#rows').innerHTML,/업무 제목/);assert.equal(page.run('serverConnected'),true);
});
test('save sends the full nine-column task list and reload retrieves it',async()=>{
  let tasks=[task];const page=app(p=>{if(p.action==='save'){tasks=p.tasks;return {ok:true,updatedAt:'saved'}}return {ok:true,tasks}});await page.ready;
  page.run("remember(0,5,'수정 업무')");await page.run('saveAll()');
  assert.equal(tasks[0][5],'수정 업무');assert.equal(tasks[0].length,9);
  assert.equal(page.requests[1].headers['Content-Type'],'text/plain;charset=utf-8');
  await page.run('load()');assert.equal(page.run('data[0][5]'),'수정 업무');
});
test('failed or incompatible load cannot overwrite remote data',async()=>{
  for(const result of [{ok:false,error:'권한 없음'},{ok:true,service:'old API'},{ok:true,tasks:[{title:'unknown format'}]}]){
    const page=app(()=>result);await page.ready;await page.run('saveAll()');
    assert.equal(page.run('serverConnected'),false);assert.equal(page.requests.length,1);assert.equal(page.element('#saveAll').disabled,true);
  }
});
test('empty server keeps worker choices and supports explicit save of an empty list',async()=>{
  const page=app(p=>p.action==='load'?{ok:true,tasks:[]}:{ok:true});await page.ready;
  assert.match(page.element('#worker').innerHTML,/작업자 A/);await page.run('saveAll()');assert.deepEqual(page.requests[1].payload.tasks,[]);
});
test('save failure retains unsaved rows and reports the server error',async()=>{
  const page=app(p=>p.action==='load'?{ok:true,tasks:[task]}:{ok:false,error:'셀 저장 한도 초과'});await page.ready;
  page.run('newRows.add(0)');await page.run('saveAll()');assert.equal(page.run('newRows.size'),1);assert.match(page.element('#saveStatus').textContent,/셀 저장 한도 초과/);
});

test('active tab excludes completed, held and carried-over tasks',async()=>{
 const tasks=['배정','진행','내부검수','검수요청','반영대기','완료','보류','이월'].map(stage=>{const row=[...task];row[3]=stage;return row});
 const page=app(()=>({ok:true,tasks}));await page.ready;
 page.run("currentTab='active'");assert.equal(page.run('selected().length'),5);
 page.element('#worker').value='다른 작업자';assert.equal(page.run('selected().length'),0);
 page.element('#worker').value='all';page.run("currentTab='list'");assert.equal(page.run('selected().length'),8);
});
test('reordering preserves unsaved row identity and persisted order',async()=>{
 let tasks=[task,[...task.slice(0,5),'두번째',...task.slice(6)]];
 const page=app(p=>{if(p.action==='save'){tasks=p.tasks;return {ok:true}}return {ok:true,tasks}});await page.ready;
 page.run('newRows.add(0);reorderMode=true;moveRow(0,1)');
 assert.equal(page.run('newRows.has(1)'),true);
 await page.run('saveAll()');await page.run('load()');
 assert.equal(page.run('data[0][5]'),'두번째');assert.equal(page.run('data[1][5]'),'업무 제목');
});
test('worker directory opens separately from table and people views',async()=>{
 const page=app(()=>({ok:true,tasks:[task]}));await page.ready;
 page.run("showView('workers')");assert.equal(page.element('#workers').hidden,false);assert.equal(page.element('#list').hidden,true);
 page.run("showView('list')");assert.equal(page.element('#workers').hidden,true);assert.equal(page.element('#list').hidden,false);
});
test('save commits focused edit and storage cleanup failure does not report remote save failure',async()=>{
 let saved;const page=app(p=>{if(p.action==='save'){saved=p.tasks;return {ok:true}}return {ok:true,tasks:[task]}});await page.ready;
 page.run("document.activeElement={blur(){remember(0,5,'입력 중인 제목')}};localStorage.removeItem=()=>{throw new Error('storage blocked')}");
 await page.run('saveAll()');assert.equal(saved[0][5],'입력 중인 제목');assert.match(page.element('#saveStatus').textContent,/저장 완료/);
});

test('month navigation crosses years and save retains tasks from other months',async()=>{
 let saved;const rows=['2026-12-15','2027-01-03'].map(date=>[date,...task.slice(1)]);
 const page=app(p=>{if(p.action==='save'){saved=p.tasks;return {ok:true}}return {ok:true,tasks:rows}});await page.ready;
 page.run('selectedMonth=new Date(2026,11,1);updateMonth()');
 assert.equal(page.run('selected().length'),1);
 page.run('changeMonth(1)');assert.equal(page.element('#monthLabel').textContent,'2027년 01월');
 assert.equal(page.run('selected()[0].r[0]'),'2027-01-03');
 page.run("remember(1,5,'1월 수정')");await page.run('saveAll()');
 assert.equal(saved.length,2);assert.equal(saved[0][0],'2026-12-15');assert.equal(saved[1][5],'1월 수정');
 page.run('changeMonth(-1)');assert.equal(page.element('#monthLabel').textContent,'2026년 12월');
});
test('new tasks belong to selected month with explicit year',async()=>{
 const page=app(()=>({ok:true,tasks:[]}));await page.ready;
 page.run('selectedMonth=new Date(2027,1,1);addRow()');
 assert.equal(page.run('data[0][0]'),'2027-02-01');assert.equal(page.run('selected().length'),1);
});

test('multiple drafts display first but are appended on save, with failures retaining drafts',async()=>{
 let fail=true,saved;const page=app(p=>{if(p.action==='save'){if(fail)return {ok:false,error:'실패'};saved=p.tasks;return {ok:true}}return {ok:true,tasks:[task]}});await page.ready;
 for(const title of ['초안 A','초안 B']){page.run('addRow()');page.run("remember(data.length-1,2,'작업자 A')");page.run('remember(data.length-1,5,'+JSON.stringify(title)+')')}
 assert.equal(page.run('selected()[0].r[5]'),'초안 B');
 await page.run('saveAll()');assert.equal(page.run('newRows.size'),2);assert.equal(page.run('selected()[0].r[5]'),'초안 B');
 fail=false;await page.run('saveAll()');assert.deepEqual(saved.map(r=>r[5]),['업무 제목','초안 A','초안 B']);assert.equal(page.run('selected()[0].r[5]'),'업무 제목');
});

test('new registration dates save as M/D and remain so on later saves',async()=>{
 let saved;const page=app(p=>{if(p.action==='save'){saved=p.tasks;return {ok:true}}return {ok:true,tasks:[]}});await page.ready;
 page.run("addRow();remember(0,0,'2026-09-19');remember(0,2,'작업자 A');remember(0,5,'새 업무')");
 assert.doesNotMatch(page.element('#rows').innerHTML,/data-save|서버에 저장/);
 await page.run('saveAll()');assert.equal(saved[0][0],'9/19');await page.run('saveAll()');assert.equal(saved[0][0],'9/19');
});
test('personal task shows all eight fields except worker',async()=>{
 const row=['9/19','123','작업자 A','배정','2026-09-20','제목','비고 내용','1.5','조정 내용'];
 const page=app(()=>({ok:true,tasks:[row]}));await page.ready;
 const html=page.element('#people').innerHTML.match(/<div class="person-task">(.*?)<\/div>/)[1];
 for(const value of row.filter((_,i)=>i!==2))assert.ok(html.includes(value));
 assert.ok(!html.includes('작업자 A'));
});

test('refresh button fetches changed server rows and clears stale search',async()=>{
 let tasks=[task];const page=app(()=>({ok:true,tasks}));await page.ready;
 tasks=[[...task.slice(0,5),'서버에서 바뀐 제목',...task.slice(6)]];
 page.element('#search').value='이전 검색어';await page.element('#refresh').onclick();
 assert.equal(page.requests.length,2);assert.equal(page.run('data[0][5]'),'서버에서 바뀐 제목');
 assert.equal(page.element('#search').value,'');assert.match(page.element('#saveStatus').textContent,/새로고침 완료/);
 assert.equal(page.element('#refresh').disabled,false);
});


test('workers can be added, hidden and restored without changing existing assignments',async()=>{
 const page=app(()=>({ok:true,tasks:[task]}));await page.ready;
 page.element('#workerName').value='추가 작업자';page.run('addWorker()');assert.equal(page.run("visibleWorkers().includes('추가 작업자')"),true);
 page.run("hideWorkers(['작업자 A'])");assert.equal(page.run("visibleWorkers().includes('작업자 A')"),false);assert.equal(page.run('data[0][2]'),'작업자 A');
 page.element('#workerName').value='작업자 A';page.run('addWorker()');assert.equal(page.run("visibleWorkers().includes('작업자 A')"),true);
});
