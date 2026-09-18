const DATA_SHEET = '웹앱_업무데이터';

function doGet() {
  try {
    return jsonResponse(loadPayload());
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message });
  }
}

function doPost(e) {
  try {
    const request = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (request.action === 'load') return jsonResponse(loadPayload());
    if (request.action === 'save') return jsonResponse(savePayload(request.tasks));
    return jsonResponse({ ok: false, error: '지원하지 않는 요청입니다.' });
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message });
  }
}

function loadPayload() {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const values = getDataSheet().getRange('A2:B2').getValues()[0];
    const tasks = values[0] ? JSON.parse(values[0]) : [];
    validateTasks(tasks);
    return { ok: true, tasks: tasks, updatedAt: values[1] || '' };
  } finally {
    lock.releaseLock();
  }
}

// 9열: 등록, RMS, 작업자, 단계, 완료 & 반영일, 업무제목, 비고, 실 작업 시간, 조정.
// 기존 프로젝트에서 저장한 11열 데이터도 조회할 수 있습니다.
function validateTasks(tasks) {
  if (!Array.isArray(tasks) || tasks.some(function (row) {
    return !Array.isArray(row) || (row.length !== 9 && row.length !== 11) ||
      row.some(function (value) {
        return value !== null && ['string', 'number', 'boolean'].indexOf(typeof value) === -1;
      });
  })) {
    throw new Error('업무 데이터는 9개 열의 배열이어야 합니다.');
  }
}

function savePayload(tasks) {
  validateTasks(tasks);
  const json = JSON.stringify(tasks);
  if (json.length > 50000) {
    throw new Error('업무 데이터가 한 셀의 저장 한도(50,000자)를 초과했습니다.');
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const updatedAt = new Date().toISOString();
    getDataSheet().getRange('A2:B2').setValues([[json, updatedAt]]);
    SpreadsheetApp.flush();
    return { ok: true, updatedAt: updatedAt };
  } finally {
    lock.releaseLock();
  }
}

function getDataSheet() {
  const book = SpreadsheetApp.getActiveSpreadsheet();
  if (!book) throw new Error('대상 스프레드시트의 확장 프로그램 → Apps Script에서 실행해 주세요.');
  let sheet = book.getSheetByName(DATA_SHEET);
  if (!sheet) {
    sheet = book.insertSheet(DATA_SHEET);
    sheet.getRange('A1:B1').setValues([['업무 데이터(JSON)', '최종 저장 시각']]);
    sheet.hideSheet();
  }
  return sheet;
}

function jsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
