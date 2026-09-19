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
