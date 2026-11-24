'use strict';
// 設計部監督總覽｜LINE 收到的文件（報價單／合約／匯款證明）：待辦事項「新文件待歸檔」、整理群組頁「新報價、Ragic 還沒建檔」、案件頁「文件」段落、歸檔面板。
// 只有編輯者看得到：伺服器對檢視者連資料都不給（DATA.docs 是 null），這裡沒資料就什麼都不畫。
// 依賴 oversight.js／oversight-edit.js 的全域：DATA、D、byId、esc、money、md、stampTW、toast、api、go、openSheet、sheetErr、postEdit、reload、pairSheet、notCaseSheet、postPair。

const DOC_ST = { todo: '待歸檔', done: '已上傳 Ragic', skip: '不需要', none: 'Ragic 無此案' };
const docsOn = () => !!(DATA && DATA.docs && CAN_EDIT && !IS_VIEWER);
const docItems = () => (docsOn() ? DATA.docs.items : []);
const docById = (id) => docItems().find((d) => String(d.id) === String(id));
const docsOf = (c) => docItems().filter((d) => d.rid === c.id);
const kindClass = { 合約: 'green', 匯款證明: 'amber', 報價單: 'gray' };

/* 匯款證明對到「已入帳那筆」：同案、金額相同、日期相差 3 天內的已收款（跟登記收款防重複 dupPay 同一條規則；c.ledger 含 Ragic 列與網站待同步登記）。
   對不上（或不是匯款證明、沒金額、沒日期、沒配對案件）回 null，畫面維持原樣。文件日期缺時用 LINE 收到的那天。 */
function docPaidMatch(d) {
  if (!d || d.kind !== '匯款證明' || d.amount == null || !d.rid) return null;
  const c = ALL_CASES.find((x) => x.id === d.rid), day = d.docDate || (d.msgAt ? String(d.msgAt).slice(0, 10) : '');
  if (!c || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  return dupPay(c, Number(d.amount), day);
}
const docPaidText = (m) => `這張是 ${md(m.date)} 已入帳 NT$${money(m.amount)}${m.stage ? `（${esc(m.stage)}）` : ''}的證明，不是新的收款`;

function docMeta(d, withCase) {
  const where = d.caseName ? esc(d.caseName) : `群組「${esc(d.group)}」`;
  return [withCase ? where : '', d.sender ? esc(d.sender) : '', d.msgAt ? esc(stampTW(d.msgAt)) : '', d.docDate && d.kind !== '報價單' ? `文件日期 ${esc(md(d.docDate))}` : d.docDate ? `報價日 ${esc(d.docDate)}` : '',
    d.amount != null ? `NT$${money(d.amount)}` : '', d.period ? esc(d.period) : ''].filter(Boolean).join(' ・ ');
}
function docStatusPill(d) {
  if (d.status === DOC_ST.done) return `<span class="pill green" title="${esc(d.target || '')}">已上傳 Ragic</span>`;
  if (d.status === DOC_ST.skip) return `<span class="pill gray" title="${esc(d.note || '')}">${d.note ? '只存網站' : '不需要'}</span>`;
  if (d.status === DOC_ST.none) return '<span class="pill amber">Ragic 還沒建檔</span>';
  return '<span class="pill amber">待歸檔</span>';
}
function docCard(d, withCase) {
  const pending = d.status === DOC_ST.todo, noCase = d.status === DOC_ST.none;
  const paid = docPaidMatch(d);
  const acts = pending
    ? `<button class="btn primary" type="button" data-docarch="${d.id}">${paid ? '附到 Ragic 那筆' : '上傳到 Ragic'}</button><button class="btn" type="button" data-docskip="${d.id}">不需要</button>`
    : noCase
      ? `<button class="btn primary" type="button" data-docpair="${d.id}">去配對</button><button class="btn" type="button" data-docnotcase="${d.id}">標記不是案子</button><button class="btn quiet" type="button" data-docskip="${d.id}">不需要</button>`
      : d.status === DOC_ST.skip ? `${d.extraRows && d.extraRows.length ? `<button class="btn" type="button" data-docarch="${d.id}">放到追加款的報價單欄位</button>` : ''}${d.auto ? '' : `<button class="btn quiet" type="button" data-docrestore="${d.id}">放回待歸檔</button>`}` : '';
  return `<article class="doc">
    <div class="doc-top"><span class="pill ${kindClass[d.kind] || 'gray'}">${esc(d.kind)}</span><button class="linkish doc-name" type="button" data-docopen="${d.id}" title="打開檔案">${esc(d.fileName)}</button>${docStatusPill(d)}</div>
    <p class="doc-meta">${docMeta(d, withCase)}</p>
    ${paid ? `<p class="doc-sum doc-match">${docPaidText(paid)}</p>` : ''}
    ${d.summary ? `<p class="doc-sum">${esc(d.summary)}</p>` : ''}
    ${d.note && d.status === DOC_ST.skip ? `<p class="doc-sum">${esc(d.note)}${d.extraRows && d.extraRows.length ? '。如果它是某筆追加款的報價單，可以放進該筆追加款的報價單欄位。' : '。'}</p>` : ''}
    ${d.status === DOC_ST.done && d.target ? `<p class="doc-sum">已放到：${esc(d.target)}${d.handledBy ? '（' + esc(d.handledBy) + '）' : ''}</p>` : ''}
    ${acts ? `<div class="task-act">${acts}</div>` : ''}
  </article>`;
}

/* 整理群組頁：新報價、Ragic 還沒建檔（沒配對到案件，不屬於任何一列）＋最近處理過的文件。
   已配對案件的「新文件待歸檔」2026-10-20 起併進「待辦事項」該案那一列（oversight-dash.js），不在這裡重複列。 */
function docsQuotesBlock() {
  if (!DATA || !DATA.docs || !CAN_EDIT || IS_VIEWER) return '';
  if (DATA.docs.error) return '<section class="sec docs-sec" id="docsSec"><h3 class="blk-title">LINE 新收到的文件</h3><p class="empty">文件資料讀取失敗，請按重新整理。</p></section>';
  const quotes = DATA.docs.newQuotes.map(docById).filter(Boolean);
  const recent = docItems().filter((d) => (d.status === DOC_ST.done || d.status === DOC_ST.skip) && !d.auto).slice(0, 6);
  if (!quotes.length && !recent.length) return '';
  return `<section class="sec docs-sec" id="docsSec">
    <h3 class="blk-title">新報價、Ragic 還沒建檔 <span class="count ${quotes.length ? 'warn' : ''} tnum">${quotes.length}</span></h3>
    <p class="blk-sub">群組收到報價單，但還沒配對到 Ragic 案件。可能是漏建案，也可能不是案子。系統不會自動在 Ragic 建案：請「去配對」，或「標記不是案子」。（已配對案件的新文件，在「待辦事項」該案那一列。）</p>
    <div class="doclist">${quotes.map((d) => docCard(d, true)).join('') || '<p class="empty">沒有這種報價單。</p>'}</div>
    ${recent.length ? `<details class="fold" id="docsDoneBox"><summary>最近處理過的 ${recent.length} 份</summary><div class="doclist">${recent.map((d) => docCard(d, true)).join('')}</div></details>` : ''}
  </section>`;
}

/* 案件頁「文件」段落 */
function docsSectionHTML(c) {
  if (!docsOn()) return '';
  const list = docsOf(c);
  return `<section class="csec" id="c-docs">
    ${head('文件', '群組收到的文件', '報價單、合約、匯款截圖。每天晚上 10 點從這案的 LINE 群組收進來，點檔名可以打開。')}
    <div class="doclist">${list.map((d) => docCard(d, false)).join('') || '<p class="empty">這案的群組還沒有收到報價單、合約或匯款截圖。</p>'}</div>
  </section>`;
}
const docPendingN = (c) => docsOf(c).filter((d) => d.status === DOC_ST.todo).length;

/* 打開檔案：用登入憑證換一個 2 分鐘有效的簽名網址再開（檔案本身是私有的） */
async function openDoc(id) {
  const w = window.open('', '_blank');   // 先開空白頁，避免非同步之後被瀏覽器當成彈出視窗擋掉
  try {
    const r = await api('/oversightDoc?id=' + encodeURIComponent(id) + '&mode=url');
    if (w) w.location.href = r.url; else location.href = r.url;
  } catch (e) {
    if (w) w.close();
    if (onAuthError(e)) return;
    toast(e.status === 404 ? '找不到這個檔案（可能已被清除）' : '打不開檔案，請稍後再試');
  }
}

/* 歸檔面板 */
function docArchiveSheet(id) {
  const d = docById(id); if (!d) return;
  const where = d.kind === '合約' ? '這案在 Ragic 的「合約上傳」欄位（追加進去，不會蓋掉原本的檔案）'
    : d.kind === '報價單' ? 'Ragic 追加款某一筆的「報價單(客戶簽名)」欄位（Ragic 沒有原始報價單的欄位，只有追加款有）'
      : '這案 Ragic 款項表某一列的「匯款證明」欄位';
  const rows = d.rows || [];
  const exRows = d.extraRows || [];
  const paid = docPaidMatch(d);
  const guess = paid && paid.rowId && rows.some((r) => r.rowId === paid.rowId) ? paid.rowId : d.guessRowId;   // 已入帳那筆有 Ragic 列就選那一列
  const rowOpt = (r) => `第 ${esc(r.rowId)} 列：${esc(r.stage || '（未選款項）')} ・ ${r.amount != null ? 'NT$' + money(r.amount) : '金額空白'} ・ ${r.paidAt ? esc(md(r.paidAt)) + ' 匯款' : '還沒填匯款日'}${r.proof ? ' ・ 已有證明' : ''}`;
  openSheet({
    kicker: d.caseName || d.group, title: `${paid ? '附上' : '上傳'}「${d.fileName}」`, save: paid ? '附到 Ragic 那筆' : '上傳到 Ragic',
    sync: DATA.ragicWrite ? '會寫進 Ragic，寫完會讀回確認' : 'Ragic 寫入開關關閉中：不會上傳',
    body: `<p class="note">${esc(d.kind)}${d.amount != null ? ' ・ NT$' + money(d.amount) : ''}${d.docDate ? ' ・ ' + esc(d.docDate) : ''}${d.period ? ' ・ ' + esc(d.period) : ''}<br>會放到：${where}。</p>
      ${paid ? `<p class="note">${docPaidText(paid)}，只是把截圖附到那一筆，不會多一筆收款。</p>` : ''}
      ${d.kind === '匯款證明' ? (rows.length
        ? `<div class="field"><label for="docRow">這張匯款證明屬於哪一列？${guess ? ' <span class="pill green">系統先猜了一列</span>' : ' <span class="pill amber">系統猜不出來，請選</span>'}</label>
          <select class="inp" id="docRow"><option value="">請選擇</option>${rows.map((r) => `<option value="${esc(r.rowId)}" ${r.rowId === guess ? 'selected' : ''}>${rowOpt(r)}</option>`).join('')}</select></div>
          <p class="note">依金額、日期猜的，請對照一下再按。</p>`
        : '<p class="note warn">這案 Ragic 款項表還沒有任何一列，匯款證明沒有地方放。請先在 Ragic 建款項列，或按「不需要」。</p>') : ''}
      ${d.kind === '報價單' ? `<div class="field"><label for="docRow">這份報價單是哪一筆追加款的？${d.guessRowId ? ' <span class="pill green">系統依金額先猜了一筆</span>' : ''}</label>
        <select class="inp" id="docRow"><option value="">請選擇</option>${exRows.map((r) => `<option value="${esc(r.rowId)}" ${r.rowId === d.guessRowId ? 'selected' : ''}>第 ${esc(r.rowId)} 列：${esc(r.item || '（沒寫項目）')} ・ ${r.amount != null ? 'NT$' + money(r.amount) : '金額空白'}${r.date ? ' ・ ' + esc(md(r.date)) : ''}${r.quote ? ' ・ 已有報價單' : ''}</option>`).join('')}</select></div>
        <p class="note">不是追加款的報價單（例如簽約前的原始報價）Ragic 沒有地方放，只存在這裡，不用處理。</p>` : ''}`,
    onSave: async () => {
      let row = '';
      if (d.kind === '匯款證明' || d.kind === '報價單') { row = ($('#docRow') || {}).value || ''; if (!row) return sheetErr(d.kind === '報價單' ? '請選哪一筆追加款。' : '請選一列。'); }
      const r = await postEdit({ op: 'doc_archive', doc_id: d.id, ...(row ? { row_id: row } : {}) }, true);
      if (!r) return false;
      if (r.sync === 'pending') return sheetErr(r.message || 'Ragic 同步尚未開啟，沒有上傳。');
      await reload(); toast(r.already ? '這個檔案 Ragic 已經有了，沒有重複上傳' : '已上傳到 Ragic');
    },
  });
}
async function docSimple(op, id, msg) {
  const r = await postEdit({ op, doc_id: id });
  if (!r) return;
  await reload(); toast(msg);
}
function docPair(id) {
  const d = docById(id); if (!d) return;
  const i = (D.orphans || []).findIndex((g) => g.group === d.group);
  if (i >= 0) return pairSheet(i);
  go('gap'); toast('到「整理群組」找這個群組配對');
}
async function docNotCase(id) {
  const d = docById(id); if (!d) return;
  const i = (D.orphans || []).findIndex((g) => g.group === d.group);
  if (i >= 0) return notCaseSheet(i);
  if (!confirm(`把群組「${d.group}」標成不是案子？它的文件會從清單消失。`)) return;
  await postPair({ group_name: d.group, not_a_case: true, reason: '其他', note: 'LINE 收到報價單但不是案子' }, '已標成不是案子');
}

// 文件的點擊（由 oversight.js 的全域 click 轉進來；dataset key 都是 doc 開頭）
function docClick(d) {
  if (d.docopen) { openDoc(d.docopen); return true; }
  if (d.docarch) { docArchiveSheet(d.docarch); return true; }
  if (d.docskip) { docSimple('doc_skip', d.docskip, '已標成不需要'); return true; }
  if (d.docrestore) { docSimple('doc_restore', d.docrestore, '已放回待歸檔'); return true; }
  if (d.docpair) { docPair(d.docpair); return true; }
  if (d.docnotcase) { docNotCase(d.docnotcase); return true; }
  return false;
}
