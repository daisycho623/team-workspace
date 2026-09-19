const statusClasses={"배정":"status-assigned","진행":"status-in-progress","진행중":"status-in-progress","내부검수":"status-internal-review","검수요청":"status-review-requested","반영대기":"status-pending-release","완료":"status-completed","이월":"status-carried-over","보류":"status-on-hold"};
const statusClass=value=>Object.hasOwn(statusClasses,value)?statusClasses[value]:'';
const ID='1QEgjN6IXs473j1oNuTt-5WM39CcihQNHfUN7Piyp6WI',statuses=['배정','진행','내부검수','검수요청','반영대기','완료','이월','보류'],KEY='cx-workflow-edits-v5';
let workers=[...(window.WORKERS||[])];
let editPrefix='',serverConnected=false;
let saving=false;
let currentView='list',currentTab='list',reorderMode=false,draggedRow=null;
let data=[],newRows=new Set(),deleteMode=false,edits={};const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)],esc=v=>String(v??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
const nowText=()=>{let d=new Date(),p=n=>String(n).padStart(2,'0');return `${p(d.getFullYear()%100)}.${p(d.getMonth()+1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`};
function normalize(row){
  if(!Array.isArray(row)||![9,11].includes(row.length)||row.some(v=>v!==null&&!['string','number','boolean'].includes(typeof v)))throw new Error('업무 데이터는 9개 열의 배열이어야 합니다.');
  const values=row.map(v=>String(v??''));
  if(values.length===9)values.splice(7,0,'','');
  return values;
}
function renderWorkerAdmin(){const box=$('#workerAdminList');if(box)box.innerHTML=workers.map(name=>`<div class="worker-admin-item"><span>${esc(name)}</span></div>`).join('')}
let loading=false;
async function requestServer(payload){
  if(!window.APPS_SCRIPT_URL)throw new Error('config.js에 Apps Script 웹 앱 URL을 설정해 주세요.');
  const response=await fetch(window.APPS_SCRIPT_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload),signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error('서버 응답 오류 (HTTP '+response.status+')');
  let result;
  try{result=await response.json()}catch{throw new Error('서버가 JSON을 반환하지 않습니다. 웹 앱 배포와 접근 권한을 확인해 주세요.')}
  if(!result?.ok)throw new Error(result?.error||result?.message||'Apps Script 요청에 실패했습니다.');
  return result;
}
function lockControls(busy){['newTask','refresh','resetEdits','saveAll','deleteToggle','reorderToggle'].forEach(id=>{const el=$('#'+id);if(el)el.disabled=busy});$('#rows').inert=busy}
async function load(){
  if(loading||saving)return;
  loading=true;lockControls(true);serverConnected=false;
  $('#sync').textContent='Apps Script 연결 중…';
  try{
    const result=await requestServer({action:'load'});
    if(!Array.isArray(result.tasks))throw new Error('load 응답에 tasks가 없습니다. 제공하신 Apps Script 코드를 새 버전으로 배포해 주세요.');
    const rows=result.tasks.map(normalize);
    data=rows;newRows.clear();edits={};deleteMode=false;
    $('#deleteToggle').textContent='선택 삭제';
    workers=[...new Set([...(window.WORKERS||[]),...(Array.isArray(result.workers)?result.workers:[]),...data.map(r=>r[2])].filter(Boolean))];
    serverConnected=true;renderWorkerAdmin();filters();render();
    $('#sync').textContent='Apps Script 연결됨';
    $('#updated').textContent=result.updatedAt?'서버 최종 저장: '+result.updatedAt:(data.length?'서버 업무를 불러왔습니다.':'등록된 업무가 없습니다.');
    $('#saveStatus').textContent='● 서버 저장 준비됨';

  }catch(error){
    $('#sync').textContent='Apps Script 연결 실패';
    $('#updated').textContent=error.message;
    $('#saveStatus').textContent='● 조회 성공 후 저장할 수 있습니다';
  }finally{loading=false;lockControls(false);$('#saveAll').disabled=!serverConnected}
}
async function saveAll(){
  if(loading||saving)return;
  if(!serverConnected){alert('서버 데이터를 먼저 불러와 주세요.');return}
  document.activeElement?.blur?.();
  if(data.some(r=>!r[2].trim()||!r[5].trim())){alert('모든 업무의 작업자와 업무제목을 입력해 주세요.');return}
  saving=true;lockControls(true);$('#saveStatus').textContent='● 저장 중…';
  const tasks=data.map(row=>[0,1,2,3,4,5,6,9,10].map(c=>row[c]??''));
  try{
    const result=await requestServer({action:'save',tasks});
    newRows.clear();edits={};try{localStorage.removeItem(KEY)}catch{}
    $('#saveStatus').textContent='● Apps Script 저장 완료';
    $('#updated').textContent=result.updatedAt?'서버 최종 저장: '+result.updatedAt:'서버에 저장했습니다.';
    render();
  }catch(error){const reason=error.name==='TimeoutError'?'서버 응답 시간이 초과되었습니다. 불러오기로 저장 여부를 확인해 주세요.':error.message;$('#saveStatus').textContent='● 저장 실패: '+reason}
  finally{saving=false;lockControls(false)}
}
function filters(){$('#worker').innerHTML='<option value="all">전체 작업자</option>'+workers.map(x=>`<option>${esc(x)}</option>`).join('');$('#status').innerHTML='<option value="all">전체 단계</option>'+statuses.map(x=>`<option>${esc(x)}</option>`).join('')}
function selected(){let q=$('#search').value.toLowerCase(),w=$('#worker').value,s=$('#status').value;return data.map((r,i)=>({r,i})).filter(x=>(currentTab!=='active'||!['완료','보류','이월'].includes(x.r[3]))&&(!q||x.r.join(' ').toLowerCase().includes(q))&&(w==='all'||x.r[2]===w)&&(s==='all'||x.r[3]===s))}
function cell(v,r,c,cl=''){return `<td class="editable ${cl}" contenteditable="true" data-row="${r}" data-col="${c}" spellcheck="false">${esc(v)}</td>`}
function rmsCell(v,r){let num=String(v||'').replace(/\D/g,'');return `<td class="rms-cell"><input class="rms-input" data-row="${r}" value="${esc(v)}" inputmode="numeric">${num?`<a href="http://kms-redmine.medialog.co.kr/redmine/issues/${num}" target="_blank" rel="noopener">↗</a>`:''}</td>`}
function dateValue(v){let m=String(v||'').trim().match(/^(?:(\d{4})[.\/-])?(\d{1,2})[.\/-](\d{1,2})$/);return m?`${m[1]||new Date().getFullYear()}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`:''}
function dateCell(v,r){return `<td class="date-cell"><input type="date" class="date-input" aria-label="완료 및 반영일" data-row="${r}" value="${dateValue(v)}"></td>`}function selectCell(v,r,c,items,type){return `<td class="select-cell"><select class="cell-select ${type} ${type==='status-select'?statusClass(v):''}" data-row="${r}" data-col="${c}">${items.map(x=>`<option ${x===v?'selected':''}>${esc(x)}</option>`).join('')}</select></td>`}
function render(){let a=selected();$('#rows').innerHTML=a.map(({r,i})=>`<tr data-index="${i}" class="${newRows.has(i)?'new-row':''}"><td class="locked">${reorderMode?`<button class="drag-handle" draggable="true" data-drag="${i}" aria-label="업무 순서 이동" title="드래그 또는 위·아래 방향키로 이동">⠿</button>`:''}${deleteMode?`<input class="row-check" type="checkbox" data-check="${i}" aria-label="행 선택">`:newRows.has(i)?`<button class="save-row" data-save="${i}">${serverConnected?'서버에 저장':'시트에 저장'}</button>`:esc(r[0])}</td>${rmsCell(r[1],i)}${selectCell(r[2],i,2,['',...workers],'worker-select')}${selectCell(r[3],i,3,statuses,'status-select')}${dateCell(r[4],i)}${cell(r[5],i,5,'task')}${cell(r[6],i,6)}${cell(r[9],i,9)}${cell(r[10],i,10)}</tr>`).join('');$('#count').textContent=`총 ${a.length}개의 업무`;people(a.map(x=>x.r));bind();bindReorder();$$('.row-check').forEach(x=>x.onchange=updateDeleteButton);updateDeleteButton();$$('[data-save]').forEach(b=>b.onclick=()=>saveRow(+b.dataset.save,b))}
function remember(r,c,v){data[r][c]=v;$('#saveStatus').textContent='● 변경사항 저장 필요';if(!newRows.has(r)){edits[`${editPrefix}${r}:${c}`]=v;try{localStorage.setItem(KEY,JSON.stringify(edits))}catch{}}}
function bind(){$$('.rms-input').forEach(x=>x.onchange=()=>{remember(+x.dataset.row,1,x.value.trim());render()});$$('.date-input').forEach(x=>x.onchange=()=>remember(+x.dataset.row,4,x.value));$$('#rows [contenteditable]').forEach(x=>{x.oninput=()=>remember(+x.dataset.row,+x.dataset.col,x.textContent.trim());x.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();x.blur()}};x.onfocus=()=>x.dataset.old=x.textContent;x.onblur=()=>{let v=x.textContent.trim(),r=+x.dataset.row,c=+x.dataset.col;if(v!==x.dataset.old){remember(r,c,v);x.classList.add('saved');setTimeout(()=>x.classList.remove('saved'),700)}}});$$('.cell-select').forEach(x=>x.onchange=()=>{let r=+x.dataset.row,c=+x.dataset.col,v=x.value;remember(r,c,v);if(c===3&&v==='진행'&&!data[r][7])remember(r,7,nowText());if(c===3&&v==='완료')remember(r,8,nowText());render()})}
function addRow(){let d=new Date();data.push([`${d.getMonth()+1}/${d.getDate()}`,'','','배정','','','','','','','']);newRows.add(data.length-1);$('#search').value='';$('#worker').value='all';$('#status').value='all';render();requestAnimationFrame(()=>$('#rows tr:last-child .worker-select')?.focus())}
async function saveRow(){await saveAll()}
function monthOf(v){let m=String(v).match(/(?:\d{2,4}[.\/-])?(\d{1,2})[.\/-]\d{1,2}/);return m?`${+m[1]}월`:'기타'}
function people(rows){$('#people').innerHTML=workers.map(n=>{let own=rows.filter(r=>r[2]===n);if(!own.length)return '';let total=own.reduce((s,r)=>s+(+r[9]||0),0),months={};own.forEach(r=>(months[monthOf(r[0])]??=[]).push(r));let groups=Object.entries(months).map(([m,list])=>`<div class="person-month"><div class="month-row">${m}</div>${list.map(r=>`<div class="person-task"><span>${esc(r[0])}</span><span class="rms">${esc(r[1])}</span><span><b class="mini-status ${statusClass(r[3])}">${esc(r[3])}</b></span><span>${esc(r[4])}</span><strong>${esc(r[5])}</strong><span>${esc(r[9]||'')}</span></div>`).join('')}</div>`).join('');return `<section class="person-section"><div class="person-header"><b>${esc(n)}</b><strong>${total}</strong></div>${groups}</section>`}).join('')}
function deleteSelected(){let ids=$$('.row-check:checked').map(x=>+x.dataset.check);if(!ids.length){alert('삭제할 업무를 선택해 주세요.');return}if(!confirm(`${ids.length}개의 업무를 목록에서 제외하시겠습니까? 변경사항 저장 시 서버에 반영됩니다.`))return;ids.sort((a,b)=>b-a).forEach(i=>data.splice(i,1));newRows.clear();deleteMode=false;$('#deleteToggle').textContent='선택 삭제';$('#saveStatus').textContent='● 삭제를 반영하려면 변경사항 저장을 눌러 주세요';render()}

function showView(view){
 currentView=view;reorderMode=false;
 $$('aside [data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
 $('#list').hidden=view!=='list';$('#people').hidden=view!=='people';$('#workers').hidden=view!=='workers';
 $('.tools').hidden=view==='workers';$('#editHint').hidden=view!=='list';$('#newTask').hidden=view!=='list';
 updateReorder();render();
}
function updateReorder(){
 $('#reorderToggle').hidden=currentView!=='list'||currentTab!=='list';
 $('#reorderToggle').setAttribute('aria-pressed',String(reorderMode));
 $('#reorderToggle').textContent=reorderMode?'✓ 순서 변경 완료':'↕ 순서 변경';
}
function moveRow(from,to){
 if(loading||saving||!reorderMode||from===to||!data[from]||!data[to])return;
 const pending=new Set([...newRows].map(i=>data[i]));
 const [row]=data.splice(from,1);data.splice(to,0,row);
 newRows=new Set(data.flatMap((r,i)=>pending.has(r)?[i]:[]));edits={};
 $('#saveStatus').textContent='● 순서 변경사항 저장 필요';render();
}
function bindReorder(){
 $$('[data-drag]').forEach(b=>{
 b.ondragstart=e=>{draggedRow=+b.dataset.drag;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',String(draggedRow))};
 b.ondragend=()=>{draggedRow=null;$$('.drop-target').forEach(r=>r.classList.remove('drop-target'))};
 b.onkeydown=e=>{if(!['ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const ids=selected().map(x=>x.i),pos=ids.indexOf(+b.dataset.drag),to=ids[pos+(e.key==='ArrowUp'?-1:1)];if(to!==undefined){moveRow(+b.dataset.drag,to);$('[data-drag="'+to+'"]')?.focus()}};
 });
 $$('#rows tr').forEach(row=>{
 row.ondragover=e=>{if(draggedRow===null||!reorderMode)return;e.preventDefault();row.classList.add('drop-target')};
 row.ondragleave=()=>row.classList.remove('drop-target');
 row.ondrop=e=>{e.preventDefault();row.classList.remove('drop-target');if(draggedRow!==null)moveRow(draggedRow,+row.dataset.index);draggedRow=null};
 });
}
$$('aside [data-view]').forEach(b=>b.onclick=()=>showView(b.dataset.view));
$$('[data-tab]').forEach(b=>b.onclick=()=>{currentTab=b.dataset.tab;reorderMode=false;$$('[data-tab]').forEach(x=>x.classList.toggle('active',x===b));updateReorder();render()});
$('#reorderToggle').onclick=()=>{reorderMode=!reorderMode;deleteMode=false;$('#deleteToggle').textContent='선택 삭제';updateReorder();render()};
['search','worker','status'].forEach(x=>$('#'+x).addEventListener(x==='search'?'input':'change',render));
$('#newTask').onclick=addRow;
$('#saveAll').onclick=saveAll;
function updateDeleteButton(){
  const count=$$('.row-check:checked').length;
  $('#deleteToggle').textContent=deleteMode?(count?'선택 항목 삭제 ('+count+')':'삭제 취소'):'선택 삭제';
}
$('#deleteToggle').onclick=()=>{
  if(deleteMode&&$$('.row-check:checked').length){deleteSelected();return}
  deleteMode=!deleteMode;reorderMode=false;updateReorder();render();
};

$('#refresh').onclick=load;
$('#resetEdits').onclick=()=>{try{localStorage.removeItem(KEY)}catch{}edits={};load()};
load();
