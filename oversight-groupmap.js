'use strict';
// 設計部監督總覽｜群組對照表＋案件類型標籤（2026-10-21）
// 對照表資料來自 /oversightGroupMap（lib/oversight-groupmap.js 算好；編輯者與檢視者都能看，沒有金額），這裡只負責畫、搜尋、篩選、匯出 CSV。
// 網站絕不改 LINE 群組名稱（Joan：群組名一律不改），這頁只讀。
// 案件類型（設計／合資／獨資／小吳哥自購）：存網站，編輯者在案件頁改；非「設計」才顯示徽章。
// 依賴 oversight.js／oversight-views.js／oversight-edit.js 的全域：D、S、$、esc、api、head、byId、go、onAuthError、postEdit、reload、toast、csvCell（oversight-perf.js）。

const CASE_TYPES_UI = ['設計', '合資', '獨資', '小吳哥自購'];
const JOINT_SOURCES_UI = ['瘋理財', '如果人生', '同事合資', '其他'];
const typeText = (t, src) => (t === '合資' && src ? `合資・${src}` : t);
let GM = null;          // /oversightGroupMap 的 map
let GM_ERR = '';
let GM_LOADING = false;
const GMS = { q: '', status: '全部' };
function gmReset() { GM = null; GM_ERR = ''; }

/* 非「設計」才顯示徽章，避免畫面雜 */
function typeBadge(c) {
  const t = c && c.caseType;
  return t && t !== '設計' ? `<span class="pill ctype" title="案件類型：${esc(typeText(t, c.jointSource))}">${esc(typeText(t, c.jointSource))}</span>` : '';
}

async function loadGroupMap() {
  if (GM_LOADING || GM || GM_ERR) return;
  GM_LOADING = true;
  try { GM = (await api('/oversightGroupMap')).map; } catch (e) {
    if (onAuthError(e)) { GM_LOADING = false; return; }
    GM_ERR = `群組對照表載入失敗（${e.status || '網路'}）。`;
  }
  GM_LOADING = false;
  if (S.view === 'groupmap') render(false);
}

function gmRows() {
  if (!GM) return [];
  const q = GMS.q.trim().toLowerCase();
  return GM.rows.filter((r) => (GMS.status === '全部' || r.status === GMS.status)
    && (!q || [r.folder, r.name, r.address, r.type, r.take, r.watch, r.status, '#' + r.id, ...r.groups].join('\n').toLowerCase().includes(q)));
}
function gmNotCases() {
  if (!GM) return [];
  const q = GMS.q.trim().toLowerCase();
  return GM.notCases.filter((n) => !q || [n.group, n.reason, n.note].join('\n').toLowerCase().includes(q));
}

function viewGroupMap() {
  const hd = (right = '') => head('群組對照', '案子 ↔ LINE 群組 對照表', '一列一案：標準名稱就是 Drive 存檔資料夾的名字。打群組名、地址、社區名、案名的任何一段都找得到。', right);
  if (!GM) {
    if (!GM_ERR) loadGroupMap();
    return `<section class="sec">${hd()}${GM_ERR ? `<p class="empty">${esc(GM_ERR)}</p><button class="btn" type="button" id="gmRetry">再試一次</button>` : '<div class="loading">對照表整理中…</div>'}</section>`;
  }
  const rows = gmRows(), nots = gmNotCases();
  const cnt = (s) => GM.rows.filter((r) => s === '全部' || r.status === s).length;
  const chips = `<div class="toolbar" role="group" aria-label="案件狀態">${['全部', '工程中', '暫停', '已結案'].map((s) => `<button class="chip" type="button" data-gmst="${s}" aria-pressed="${GMS.status === s}">${s} ${cnt(s)}</button>`).join('')}</div>`;
  const tools = `<div class="gm-tools"><input class="inp" id="gmSearch" type="search" placeholder="搜尋：群組名、地址、社區名、案名、人名" value="${esc(GMS.q)}" autocomplete="off">${chips}<button class="btn" type="button" id="gmCsv">下載 CSV</button></div>`;
  const warnCnt = GM.rows.filter((r) => r.pending).length;
  const body = rows.map((r) => {
    const open = ALL_CASES.some((x) => x.id === r.id);
    const drive = r.driveUrl ? `<a href="${esc(r.driveUrl)}" target="_blank" rel="noopener noreferrer">開資料夾</a>` : (r.archived ? `<span class="dim">${GM.driveChecked ? '資料夾還沒建（夜間存檔後出現）' : '讀不到 Drive'}</span>` : '<span class="dim">—</span>');
    const flags = [...(r.pending ? [`<span class="pill amber" title="資料夾名稱還不確定">待確認：${esc(r.pendingWhy === 'district' ? '地址沒寫區' : '透天或缺樓層')}</span>`] : []),
      ...(!r.groups.length ? ['<span class="pill gray">沒有 LINE 群組</span>'] : []), ...(r.noContractAlbum ? ['<span class="pill gray" title="配對的 LINE 群組裡沒有名稱含「合約」的相簿">LINE 沒有合約相簿</span>'] : []), ...(r.noPayAlbum ? ['<span class="pill gray" title="配對的 LINE 群組裡沒有名稱含「匯款」「工程款」「收款」「付款」等的相簿">LINE 沒有匯款相簿</span>'] : []), ...(r.why.includes('存檔暫停中') ? ['<span class="pill gray">存檔暫停中</span>'] : [])].join('');
    return `<tr>
      <td><span class="gm-folder">${esc(r.folder)}</span></td>
      <td>${open ? `<button class="linkish" type="button" data-case="${esc(r.id)}">${esc(r.name)}</button>` : esc(r.name)}<span class="gm-sub">Ragic #${esc(r.id)}${r.address ? ' ・ ' + esc(r.address) : ''}</span></td>
      <td>${esc(typeText(r.type, r.jointSource))}</td>
      <td>${r.groups.map((g) => `<span class="gm-grp">${esc(g)}</span>`).join('') || '<span class="dim">—</span>'}</td>
      <td>${esc(r.take) || '<span class="dim">—</span>'}<span class="gm-sub">監工 ${esc(r.watch) || '—'}</span></td>
      <td>${esc(r.status)}</td>
      <td>${drive}</td>
      <td>${flags || '<span class="dim">—</span>'}</td></tr>`;
  }).join('') || '<tr><td colspan="8" class="empty">沒有符合的案子。</td></tr>';
  const notRows = nots.map((n) => `<tr><td><span class="gm-grp">${esc(n.group)}</span></td><td>${n.kind === 'nodeal' ? '沒拿到案子（未成交）' : '不是案子'}${n.reason && n.kind !== 'nodeal' ? `<span class="gm-sub">${esc(n.reason)}</span>` : ''}</td><td>${esc(n.note) || '<span class="dim">—</span>'}</td></tr>`).join('') || '<tr><td colspan="3" class="empty">沒有符合的群組。</td></tr>';
  return `<section class="sec">
    ${hd()}
    ${tools}
    <p class="gm-note">${rows.length} 案${warnCnt ? `（全部有 ${warnCnt} 案資料夾名稱待確認，到案件頁補樓層、勾透天或請設計師補 Ragic 地址）` : ''}。群組名稱是 LINE 上的實際名稱，系統不會改它。Drive 資料夾沒有公開分享，只有有公司雲端權限的 Google 帳號打得開。${GM.driveChecked ? '' : '（這次讀不到 Drive，所以沒有資料夾連結。）'}</p>
    <div class="tablewrap scroll"><table class="gm-tbl" aria-label="案子與 LINE 群組對照表">
      <thead><tr><th>標準名稱（Drive 資料夾）</th><th>Ragic 案名</th><th>案件類型</th><th>LINE 群組</th><th>接案人／監工</th><th>狀態</th><th>Drive</th><th>待確認</th></tr></thead>
      <tbody>${body}</tbody></table></div>
    <div class="gm-sec">
      <h3 class="blk-title">沒拿到案子／不是案子的群組（${GM.notCases.length}）</h3>
      <p class="gm-note">這些 LINE 群組不是現役案件，不用幫它們找案子。</p>
      <div class="tablewrap scroll"><table class="gm-tbl" style="min-width:560px" aria-label="不是現役案件的群組">
        <thead><tr><th>LINE 群組</th><th>分類</th><th>說明</th></tr></thead><tbody>${notRows}</tbody></table></div>
      ${GM.lostPairs.length ? `<p class="gm-note">配對的案號在 Ragic 找不到（要重新配對）：${GM.lostPairs.map((p) => esc(p.group) + '（#' + esc(p.ragic_id) + '）').join('、')}</p>` : ''}
    </div>
  </section>`;
}

/* CSV：跟著目前的搜尋／狀態篩選；多個群組用「；」隔開；後面接「不是現役案件的群組」一段 */
function downloadGroupMapCsv() {
  if (!GM) return;
  const rows = gmRows(), nots = gmNotCases();
  const lines = [['標準名稱（Drive資料夾）', 'Ragic案名', 'Ragic編號', '案件類型', '合資來源', 'LINE群組', '接案人', '監工', '狀態', 'Drive資料夾連結', '待確認'],
    ...rows.map((r) => [r.folder, r.name, r.id, r.type, r.jointSource || '', r.groups.join('；'), r.take, r.watch, r.status, r.driveUrl || '', r.why.join('；')]),
    [], ['不是現役案件的群組', '分類', '說明'],
    ...nots.map((n) => [n.group, n.kind === 'nodeal' ? '沒拿到案子（未成交）' : '不是案子' + (n.reason ? '：' + n.reason : ''), n.note])];
  const blob = new Blob(['﻿' + lines.map((l) => l.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `群組對照表_${TODAY}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* 案件頁「案件資料」裡的類型欄：編輯者下拉、檢視者唯讀 */
function caseTypeField(c) {
  const t = c.caseType || '設計';
  if (!CAN_EDIT) return `<div class="field"><span class="flabel">案件類型</span><p class="ro">${esc(typeText(t, c.jointSource))}</p></div>`;
  return `<div class="field"><label for="caseType">案件類型 <span class="sync-tag local">網站</span></label>
    <select class="inp" id="caseType">${CASE_TYPES_UI.map((x) => `<option ${x === t ? 'selected' : ''}>${x}</option>`).join('')}</select>
    ${t === '合資' ? `<label for="caseJoint" style="margin-top:8px">合資來源</label><select class="inp" id="caseJoint"><option value="">（未設定）</option>${JOINT_SOURCES_UI.map((x) => `<option ${x === c.jointSource ? 'selected' : ''}>${x}</option>`).join('')}</select>` : ''}
    <span class="hint">設計＝一般客戶設計案。合資、獨資、小吳哥自購投資的案子，業績會分欄列，不混進設計案。只存網站。</span></div>`;
}
async function saveCaseType(el) {
  const c = byId(S.caseId); if (!c || !CAN_EDIT) return;
  const r = await postEdit({ op: 'case_type', ragic_id: c.id, value: el.value });
  if (!r) { render(false); return; }
  gmReset();
  await reload(); toast(r.unchanged ? '類型沒有變動' : `已改成「${el.value}」`);
}

document.addEventListener('click', (e) => {
  const t = e.target.closest('button'); if (!t) return;
  if (t.dataset.gmst) { GMS.status = t.dataset.gmst; render(false); }
  else if (t.id === 'gmCsv') downloadGroupMapCsv();
  else if (t.id === 'gmRetry') { gmReset(); render(false); }
});
document.addEventListener('input', (e) => {
  if (e.target.id !== 'gmSearch') return;
  GMS.q = e.target.value; const pos = e.target.selectionStart; render(false);
  const n = $('#gmSearch'); if (n) { n.focus(); n.setSelectionRange(pos, pos); }
});
async function saveJointSource(el) {
  const c = byId(S.caseId); if (!c || !CAN_EDIT) return;
  const r = await postEdit({ op: 'joint_source', ragic_id: c.id, value: el.value });
  if (!r) { render(false); return; }
  gmReset();
  await reload(); toast(el.value ? `合資來源：${el.value}` : '已清除合資來源');
}
document.addEventListener('change', (e) => { if (e.target.id === 'caseType') saveCaseType(e.target); if (e.target.id === 'caseJoint') saveJointSource(e.target); });
