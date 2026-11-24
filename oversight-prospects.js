'use strict';
// 設計部案件看板｜還沒簽約：報價中、還沒簽約的客戶（Ragic 客戶表狀態＝潛在客戶）。只有編輯者看得到（後端對檢視者根本不回資料）。
// 資料在 DATA.prospects（伺服器 lib/oversight-prospects.js 算好）；報價金額／報價日／備註只存網站，走 POST /oversightEdit op=prospect_quote。
// 這些客戶不在 Ragic 案件表，所以不算進合約金額、到期未收與待辦。
// 依賴 oversight.js／oversight-edit.js 的全域：DATA、S、TODAY、esc、money、md、openSheet、sheetErr、postEdit、reload、toast、CAN_EDIT、IS_VIEWER。

const PROSPECT_INTRO = '報價中、還沒簽約的客戶（Ragic 客戶表狀態是「潛在客戶」）。這些金額不算進合約金額與到期未收。簽約後在 Ragic 把客戶改成「簽約客戶」並建案件，就會移到案件清單。';
const PQUICK = [['', '全部'], ['stale', '超過 14 天沒聯繫'], ['quoted', '有報價'], ['invalid', '案名寫「無效」的']];

const prospectsOn = () => !IS_VIEWER && CAN_EDIT && !!DATA && !!DATA.prospects;
const prospectsOk = () => prospectsOn() && !DATA.prospects.error;
const prospectItems = () => (prospectsOk() ? DATA.prospects.items : []);
const prospectStaleDays = () => (prospectsOk() && DATA.prospects.staleDays) || 14;
// 沒有任何聯繫紀錄（days 是 null）也當成要追：最久沒聯繫的就是它
const prospectStale = (p) => p.days == null || p.days > prospectStaleDays();

// 要追的客戶：不含案名寫「無效」的（那些是整理剩下的垃圾名單，不算進報價中）
function prospectStats() {
  const live = prospectItems().filter((p) => !p.invalid);
  const quoted = live.filter((p) => p.quote && p.quote.amount);
  return { n: live.length, quotedN: quoted.length, sum: quoted.reduce((s, p) => s + p.quote.amount, 0), staleN: live.filter(prospectStale).length, invalidN: prospectItems().length - live.length };
}
// 首頁「其他要整理的」的一行；沒有報價中的客戶就不出現
function prospectHomeRow() {
  if (!prospectsOk()) return null;
  const s = prospectStats();
  if (!s.n) return null;
  return ['還沒簽約', `報價中 ${s.n} 位客戶（已登記報價 ${s.quotedN} 位、合計 NT$${money(s.sum)}）；${s.staleN} 位超過 ${prospectStaleDays()} 天沒聯繫`, 'data-go="prospects"', '看還沒簽約'];
}

function prospectFilter(items, quick) {
  if (quick === 'invalid') return items.filter((p) => p.invalid);
  const live = items.filter((p) => !p.invalid);   // 預設（全部、超過天數、有報價）都不含「無效」
  if (quick === 'stale') return live.filter(prospectStale);
  if (quick === 'quoted') return live.filter((p) => p.quote && p.quote.amount);
  return live;
}
const prospectCount = (k) => prospectFilter(prospectItems(), k).length;

function prospectLastCell(p) {
  if (!p.lastContactAt) return '<span class="bad">沒有聯繫紀錄</span>';
  const d = Math.max(0, p.days ?? 0);
  return `<span class="tnum">${md(p.lastContactAt)}</span> <span class="dim${prospectStale(p) ? ' bad' : ''}">（${d ? d + ' 天前' : '今天'}）</span>`;
}
function prospectQuoteCell(p) {
  const q = p.quote;
  if (!q || !q.amount) return `<button class="btn sm" type="button" data-pquote="${esc(p.id)}">登記報價</button>${q && (q.date || q.note) ? `<small class="dim p-sub" title="${esc(q.note || '')}">${q.date ? '報價日 ' + md(q.date) : ''}${q.note ? (q.date ? '・' : '') + esc(q.note) : ''}</small>` : ''}`;
  return `<b class="tnum">NT$${money(q.amount)}</b>${q.date ? `<small class="dim p-sub">報價日 ${md(q.date)}</small>` : ''}${q.note ? `<small class="dim p-sub p-clip" title="${esc(q.note)}">${esc(q.note)}</small>` : ''}<button class="linkish" type="button" data-pquote="${esc(p.id)}">修改</button>`;
}
function prospectRow(p) {
  const place = [p.customer, p.area].filter(Boolean).join('・');
  const status = p.lastStatus || (p.lastLog && p.lastLog.text) || '';
  const full = [p.lastStatus, p.lastLog && p.lastLog.text && p.lastLog.text !== p.lastStatus ? `最新聯絡紀錄：${p.lastLog.text}` : ''].filter(Boolean).join('\n');
  return `<tr>
    <td class="name"><b class="p-name">${esc(p.name)}</b>${p.invalid ? ' <span class="pill gray">無效</span>' : ''}${place ? `<small class="dim p-sub">${esc(place)}${p.budget ? `・預算 ${esc(p.budget)} 萬` : ''}</small>` : (p.budget ? `<small class="dim p-sub">預算 ${esc(p.budget)} 萬</small>` : '')}${p.inCases ? `<small class="p-sub"><span class="pill amber">案件清單已有同名案件</span> <button class="linkish" type="button" data-case="${esc(p.inCases)}">看那個案件</button></small>` : ''}</td>
    <td class="c-dsg" data-l="設計師">${p.designer ? esc(p.designer) : '<span class="dim">未指派</span>'}</td>
    <td class="c-quote" data-l="報價金額">${prospectQuoteCell(p)}</td>
    <td class="c-last" data-l="最後聯繫">${prospectLastCell(p)}${p.lastContactBy ? `<small class="dim p-sub">${esc(p.lastContactBy)}</small>` : ''}</td>
    <td class="c-stat" data-l="最後狀態">${status ? `<span class="p-clip" title="${esc(full || status)}">${esc(status)}</span>` : '<span class="dash">—</span>'}</td>
    <td class="c-src" data-l="來源">${p.source ? esc(p.source) : '<span class="dash">—</span>'}</td>
  </tr>`;
}

function viewProspects() {
  if (!prospectsOn()) return '<p class="empty-row">只有編輯者看得到這一頁。</p>';
  if (DATA.prospects.error) return `<p class="finding">${esc(PROSPECT_INTRO)}</p><div class="alert">客戶表（Ragic）暫時讀不到，請按右上角「重新整理」再試一次。</div>`;
  const quick = S.pQuick || '';
  const rows = prospectFilter(prospectItems(), quick);   // 伺服器已依最後聯繫舊的在前排好
  const s = prospectStats();
  const bits = PQUICK.map(([k, label]) => { const t = `${label} ${prospectCount(k)}`; return quick === k ? `<b>${esc(t)}</b>` : `<button class="linkish" type="button" data-pq="${esc(k)}">${esc(t)}</button>`; }).join('｜');
  const empty = quick === 'invalid' ? '沒有案名寫「無效」的客戶。' : quick ? '沒有符合的客戶，按「全部」看全部。' : '目前沒有報價中的客戶。';
  return `<p class="finding">${esc(PROSPECT_INTRO)}</p>
  <p class="note-line">${s.n ? `報價中 <b class="tnum">${s.n}</b> 位；已登記報價 <b class="tnum">${s.quotedN}</b> 位、合計 <b class="tnum">NT$${money(s.sum)}</b>；<b class="tnum">${s.staleN}</b> 位超過 ${prospectStaleDays()} 天沒聯繫。` : '目前沒有報價中的客戶。'}</p>
  <div class="quick" role="group" aria-label="快速篩選">${bits}</div>
  <div class="card tablecard"><div class="tablewrap scroll"><table class="clean prospect-tbl">
    <thead><tr><th>案名 / 客戶</th><th>設計師</th><th>報價金額</th><th>最後聯繫</th><th>最後狀態</th><th>來源</th></tr></thead>
    <tbody>${rows.map(prospectRow).join('') || `<tr><td colspan="6" class="empty-row">${empty}</td></tr>`}</tbody>
  </table></div></div>
  <p class="note-line">報價金額、報價日、備註只存在這個網站，不寫回 Ragic。最後聯繫與最後狀態取自 Ragic 客戶表，要更新請到 Ragic 的聯絡紀錄。</p>`;
}

/* ---------- 登記報價（側邊面板） ---------- */
function prospectQuoteSheet(id) {
  const p = prospectItems().find((x) => x.id === id);
  if (!p || !CAN_EDIT) return;
  const q = p.quote || {};
  openSheet({
    kicker: p.name, title: q.amount ? '修改報價' : '登記報價', sync: '只存在網站，不寫回 Ragic', save: '儲存',
    body: `<div class="field"><label for="pqAmount">報價金額（元）</label><input class="inp tnum" id="pqAmount" type="text" inputmode="numeric" value="${q.amount ? esc(money(q.amount)) : ''}" autocomplete="off" placeholder="例如：1,200,000"></div>
      <div class="field"><label for="pqDate">報價日</label><input class="inp" id="pqDate" type="date" value="${esc(q.date || '')}" max="${esc(addDays(localISO(), 1))}"></div>
      <div class="field"><label for="pqNote">備註（選填）</label><input class="inp" id="pqNote" type="text" maxlength="200" value="${esc(q.note || '')}" placeholder="例如：報價含系統櫃，客戶說下週回覆" autocomplete="off"></div>
      ${p.quote ? '<p class="hint">三格都清空再儲存，就是清除這筆登記。</p>' : ''}`,
    onSave: async () => {
      const amount = String($('#pqAmount').value || '').replace(/[^\d]/g, '');
      const date = $('#pqDate').value, note = $('#pqNote').value.trim();
      if (amount && !Number(amount)) return sheetErr('金額要是大於 0 的數字。');
      const r = await postEdit({ op: 'prospect_quote', prospect_id: p.id, amount, date, note }, true);
      if (!r) return false;
      await reload(); toast(amount || date || note ? `已登記「${p.name}」的報價` : `已清除「${p.name}」的報價登記`);
    },
  });
}

// 點擊分流（由 oversight.js 的全域 click 呼叫；處理了回傳 true）
function prospectClick(d) {
  if (d.pq !== undefined) { S.pQuick = d.pq; render(false); return true; }
  if (d.pquote) { prospectQuoteSheet(d.pquote); return true; }
  return false;
}
