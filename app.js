const ID='1QEgjN6IXs473j1oNuTt-5WM39CcihQNHfUN7Piyp6WI',statuses=['배정','진행','내부검수','검수요청','반영대기','완료','이월','보류'],KEY='cx-workflow-edits-v5';
let workers=[];
let data=[],newRows=new Set(),deleteMode=false,edits=JSON.parse(localStorage.getItem(KEY)||'{}');const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)],esc=v=>String(v??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
const nowText=()=>{let d=new Date(),p=n=>String(n).padStart(2,'0');return `${p(d.getFullYear()%100)}.${p(d.getMonth()+1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`};
function normalize(r){let a=[...r];if(a.length>=13){a.splice(3,1);a.splice(9,1)}a=Array.from({length:11},(_,i)=>a[i]??'');if(a[3]==='진행중')a[3]='진행';return a}
function renderWorkerAdmin(){const box=$('#workerAdminList');if(!box)return;box.innerHTML=workers.map(name=>`<div class="worker-admin-item"><span>${esc(name)}</span></div>`).join('')}
let requestId=0,loading=false;
function loadJSONP(makeURL){
  return new Promise((resolve,reject)=>{
    const callback='__cxResponse_'+Date.now()+'_'+(++requestId),script=document.createElement('script');
    let settled=false;
    const timer=setTimeout(()=>finish(new Error('서버 응답 시간 초과'),undefined,true),10000);
    function finish(error,value,timedOut=false){
      if(settled)return;
      settled=true;
      clearTimeout(timer);
      // Removing a script does not cancel an already downloaded JSONP response.
      if(timedOut)window[callback]=()=>{delete window[callback]};
      else delete window[callback];
      script.remove();
      error?reject(error):resolve(value);
    }
    window[callback]=value=>finish(null,value);
    script.onerror=()=>finish(new Error('서버 연결 실패'));
    try{script.src=makeURL(callback);document.head.appendChild(script)}catch(error){finish(error)}
  });
}
async function loadSheet(sheet){
  const result=await loadJSONP(callback=>{
    const url=new URL('https://docs.google.com/spreadsheets/d/'+ID+'/gviz/tq');
    url.search=new URLSearchParams({sheet,headers:'0',tqx:'out:json;responseHandler:'+callback,cache:String(Date.now())});
    return url.href;
  });
  if(result?.status!=='ok'||!Array.isArray(result.table?.rows))throw new Error('시트 응답을 확인해 주세요.');
  return result.table.rows.map(r=>(r.c||[]).map(c=>c?.f??c?.v??'')).filter(r=>r.some(v=>String(v).trim()));
}
const workerNames=names=>[...new Set(names.map(name=>String(name??'').trim()).filter(Boolean))];
async function loadWorkers(){
  try{
    if(!window.APPS_SCRIPT_URL)throw new Error('작업자 API URL 없음');
    const result=await loadJSONP(callback=>{
      const url=new URL(window.APPS_SCRIPT_URL);
      url.searchParams.set('action','getWorkers');
      url.searchParams.set('callback',callback);
      url.searchParams.set('cache',String(Date.now()));
      return url.href;
    });
    if(!result?.ok||!Array.isArray(result.workers))throw new Error('작업자 API 응답 오류');
    return workerNames(result.workers);
  }catch(error){
    const rows=await loadSheet('작업자');
    return workerNames(rows.map(r=>r[0]).filter((name,i)=>i!==0||String(name).trim()!=='작업자'));
  }
}
async function load(){
  if(loading)return;
  loading=true;
  ['newTask','refresh','resetEdits'].forEach(id=>$('#'+id).disabled=true);
  $('#sync').textContent='시트 연결 중…';
  $('#updated').textContent='서버 데이터를 불러오는 중…';
  try{
    const [sheetResult,workerResult]=await Promise.allSettled([loadSheet('CX'),loadWorkers()]);
    const live=sheetResult.status==='fulfilled';
    if(live){
      data=sheetResult.value.map(normalize).filter(r=>!(r[2]==='작업자'&&['단계','상태'].includes(r[3])));
      data=data.map((r,i)=>Array.from({length:11},(_,c)=>edits[i+':'+c]??r[c]??''));
      newRows.clear();
    }else console.error('sheet load failed',sheetResult.reason);
    if(workerResult.status==='fulfilled')workers=workerResult.value;
    else console.error('worker load failed',workerResult.reason);
    workers=workerNames([...workers,...data.map(r=>r[2])]);
    renderWorkerAdmin();
    $('#sync').textContent=live?(workerResult.status==='fulfilled'?'실시간 연결됨':'시트 연결됨 · 작업자 목록 연결 실패'):'시트 데이터를 불러오지 못함';
    const message=live?(data.length?'Google Sheets':'Google Sheets · 등록된 업무가 없습니다'):'연결 실패 · 시트 공유 설정과 네트워크를 확인한 뒤 새로고침해 주세요';
    $('#updated').textContent=new Intl.DateTimeFormat('ko-KR',{dateStyle:'long',timeStyle:'short'}).format(new Date())+' 기준 · '+message;
    $('#saveStatus').textContent=window.APPS_SCRIPT_URL?'● Apps Script 저장 준비됨':'● Apps Script URL 필요';
    filters();render();
  }finally{
    loading=false;
    ['newTask','refresh','resetEdits'].forEach(id=>$('#'+id).disabled=false);
  }
}
function filters(){$('#worker').innerHTML='<option value="all">전체 작업자</option>'+workers.map(x=>`<option>${esc(x)}</option>`).join('');$('#status').innerHTML='<option value="all">전체 단계</option>'+statuses.map(x=>`<option>${esc(x)}</option>`).join('')}
function selected(){let q=$('#search').value.toLowerCase(),w=$('#worker').value,s=$('#status').value;return data.map((r,i)=>({r,i})).filter(x=>(!q||x.r.join(' ').toLowerCase().includes(q))&&(w==='all'||x.r[2]===w)&&(s==='all'||x.r[3]===s))}
function cell(v,r,c,cl=''){return `<td class="editable ${cl}" contenteditable="true" data-row="${r}" data-col="${c}" spellcheck="false">${esc(v)}</td>`}
function rmsCell(v,r){let num=String(v||'').replace(/\D/g,'');return `<td class="rms-cell"><input class="rms-input" data-row="${r}" value="${esc(v)}" inputmode="numeric">${num?`<a href="http://kms-redmine.medialog.co.kr/redmine/issues/${num}" target="_blank" rel="noopener">↗</a>`:''}</td>`}
function dateValue(v){let m=String(v||'').trim().match(/^(?:(\d{4})[.\/-])?(\d{1,2})[.\/-](\d{1,2})$/);return m?`${m[1]||new Date().getFullYear()}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`:''}
function dateCell(v,r){return `<td class="date-cell"><input type="date" class="date-input" data-row="${r}" value="${dateValue(v)}"></td>`}function selectCell(v,r,c,items,type){return `<td class="select-cell"><select class="cell-select ${type} ${esc(v)}" data-row="${r}" data-col="${c}">${items.map(x=>`<option ${x===v?'selected':''}>${esc(x)}</option>`).join('')}</select></td>`}
function render(){let a=selected();$('#rows').innerHTML=a.map(({r,i})=>`<tr class="${newRows.has(i)?'new-row':''}"><td class="locked">${deleteMode?`<input class="row-check" type="checkbox" data-check="${i}" aria-label="행 선택">`:newRows.has(i)?`<button class="save-row" data-save="${i}">시트에 저장</button>`:esc(r[0])}</td>${rmsCell(r[1],i)}${selectCell(r[2],i,2,['',...workers],'worker-select')}${selectCell(r[3],i,3,statuses,'status-select')}${dateCell(r[4],i)}${cell(r[5],i,5,'task')}${cell(r[6],i,6)}${cell(r[7],i,7)}${cell(r[8],i,8)}${cell(r[9],i,9)}${cell(r[10],i,10)}</tr>`).join('');$('#count').textContent=`총 ${a.length}개의 업무`;people(a.map(x=>x.r));bind();$$('[data-save]').forEach(b=>b.onclick=()=>saveRow(+b.dataset.save,b))}
function remember(r,c,v){data[r][c]=v;if(!newRows.has(r)){edits[`${r}:${c}`]=v;localStorage.setItem(KEY,JSON.stringify(edits))}}
function bind(){$$('.rms-input').forEach(x=>x.onchange=()=>{remember(+x.dataset.row,1,x.value.trim());render()});$$('.date-input').forEach(x=>x.onchange=()=>remember(+x.dataset.row,4,x.value));$$('#rows [contenteditable]').forEach(x=>{x.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();x.blur()}};x.onfocus=()=>x.dataset.old=x.textContent;x.onblur=()=>{let v=x.textContent.trim(),r=+x.dataset.row,c=+x.dataset.col;if(v!==x.dataset.old){remember(r,c,v);x.classList.add('saved');setTimeout(()=>x.classList.remove('saved'),700)}}});$$('.cell-select').forEach(x=>x.onchange=()=>{let r=+x.dataset.row,c=+x.dataset.col,v=x.value;remember(r,c,v);if(c===3&&v==='진행'&&!data[r][7])remember(r,7,nowText());if(c===3&&v==='완료')remember(r,8,nowText());render()})}
function addRow(){let d=new Date();data.unshift([`${d.getMonth()+1}/${d.getDate()}`,'','','배정','','','','','','','','']);newRows=new Set([...newRows].map(i=>i+1));newRows.add(0);$('#search').value='';$('#worker').value='all';$('#status').value='all';render();requestAnimationFrame(()=>$('#rows tr:first-child .worker-select')?.focus())}
async function saveRow(i,b){if(!window.APPS_SCRIPT_URL){alert('Apps Script URL을 확인해 주세요.');return}if(!data[i][2]||!data[i][5]){alert('작업자와 업무제목을 입력해 주세요.');return}b.disabled=true;b.textContent='저장 중…';try{await fetch(window.APPS_SCRIPT_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'appendTask',values:data[i]})});newRows.delete(i);$('#saveStatus').textContent='● Google Sheets 저장 완료';render()}catch(e){b.disabled=false;b.textContent='다시 저장';$('#saveStatus').textContent='● 저장 실패';alert('저장에 실패했습니다.')}}
function monthOf(v){let m=String(v).match(/(?:\d{2,4}[.\/-])?(\d{1,2})[.\/-]\d{1,2}/);return m?`${+m[1]}월`:'기타'}
function people(rows){$('#people').innerHTML=workers.map(n=>{let own=rows.filter(r=>r[2]===n);if(!own.length)return '';let total=own.reduce((s,r)=>s+(+r[9]||0),0),months={};own.forEach(r=>(months[monthOf(r[0])]??=[]).push(r));let groups=Object.entries(months).map(([m,list])=>`<div class="person-month"><div class="month-row">${m}</div>${list.map(r=>`<div class="person-task"><span>${esc(r[0])}</span><span class="rms">${esc(r[1])}</span><span><b class="mini-status ${esc(r[3])}">${esc(r[3])}</b></span><span>${esc(r[4])}</span><strong>${esc(r[5])}</strong><span>${esc(r[9]||'')}</span></div>`).join('')}</div>`).join('');return `<section class="person-section"><div class="person-header"><b>${esc(n)}</b><strong>${total}</strong></div>${groups}</section>`}).join('')}
function deleteSelected(){let ids=$$('.row-check:checked').map(x=>+x.dataset.check);if(!ids.length){alert('삭제할 업무를 선택해 주세요.');return}if(!confirm(`${ids.length}개의 업무를 화면에서 삭제하시겠습니까?`))return;ids.sort((a,b)=>b-a).forEach(i=>data.splice(i,1));newRows.clear();deleteMode=false;$('#deleteSelected').hidden=true;$('#deleteToggle').textContent='선택 삭제';$('#saveStatus').textContent='● 선택 업무를 화면에서 삭제했습니다';render()}
$$('[data-tab],aside [data-view]').forEach(b=>b.onclick=()=>{let v=b.dataset.tab||b.dataset.view;$$('[data-tab]').forEach(x=>x.classList.toggle('active',x.dataset.tab===v));$$('aside [data-view]').forEach(x=>x.classList.toggle('active',x.dataset.view===v));$('#list').hidden=v==='people';$('#people').hidden=v!=='people'});
['search','worker','status'].forEach(x=>$('#'+x).addEventListener(x==='search'?'input':'change',render));
$('#newTask').onclick=addRow;
$('#deleteToggle').onclick=()=>{deleteMode=!deleteMode;$('#deleteSelected').hidden=!deleteMode;$('#deleteToggle').textContent=deleteMode?'삭제 취소':'선택 삭제';render()};
$('#deleteSelected').onclick=deleteSelected;
$('#refresh').onclick=load;
$('#resetEdits').onclick=()=>{localStorage.removeItem(KEY);edits={};load()};
load();
