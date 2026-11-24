'use strict';
// 設計部監督總覽｜畫面（照 2026-10-19 Joan 點頭的第四版示範頁，資料換成伺服器算好的 dash）
// 依賴 oversight.js 的全域：D、CASES、S、DATA、$、esc、money、md、whoLine、memberTags、ring…

/* ---------- 照片 ---------- */
function photoList(c, item) {
  const x = c.items.find((i) => i.name === item);
  const ph = (x && x.photos) || [];
  return ph.map((p, i) => ({ pid: p.id, item, date: p.date || x.last, i, n: ph.length, caseName: c.name, caseId: c.id, orig: !!p.d }));
}
function photoHTML(p, big) {
  if (p && p.pid) return `<img data-pid="${esc(p.pid)}" data-alt="${esc(p.caseName + ' ' + p.item)}" alt="" decoding="async">`;
  return `<div class="ph"><span class="frame"></span>${esc(p ? p.item : '照片')}${big && p ? '<small>照片位</small>' : ''}</div>`;
}
function coverPhoto(c) {
  if (!c.cover) return null;
  return { pid: c.cover.id, item: c.cover.item, date: c.cover.date, i: 0, n: 1, caseName: c.name, caseId: c.id, orig: !!c.cover.d };
}
const photoTotal = (c) => c.items.reduce((s, x) => s + (x.count || 0), 0);

/* ---------- 共用小零件 ---------- */
function head(k, t, d, right = '') {
  return `<div class="head"><div><p class="kicker">${k}</p><h2>${t}</h2>${d ? `<p class="desc">${d}</p>` : ''}</div>${right}</div>`;
}
function miniTrack(c) {
  const k = curIndex(c);
  return `<ol class="mini" aria-label="工項進度">${c.items.map((x, i) => `<li><span class="md ${x.state} ${i === k ? 'cur' : ''}" title="${esc(x.name + '：' + STATE_LABEL[x.state])}"></span></li>`).join('')}</ol>`;
}
function agePill(c) {
  if (!c.active) return `<span class="pill amber">${esc(c.status)}</span>`;
  if (c.noGroup) return `<span class="pill gray">${c.weekly.last ? '週報 ' + dayDiff(c.weekly.last, TODAY) + ' 天前' : '沒有群組'}</span>`;
  if (c.days == null) return '<span class="pill gray">沒有照片</span>';
  if (c.days > D.staleDays) return `<span class="pill red">${c.days} 天沒新照片</span>`;
  if (c.days >= 7) return `<span class="pill amber">${c.days} 天前</span>`;
  return `<span class="pill gray">${c.days === 0 ? '今天' : c.days + ' 天前'}</span>`;
}
function statusPill(c) {
  if (c.kind === '停更') return '<span class="pill amber">停更</span>';
  if (c.kind === '暫停') return '<span class="pill amber">暫停</span>';
  if (c.kind === '已結案') return '<span class="pill gray">已結案</span>';
  if (c.kind === '沒有群組') return '<span class="pill gray">沒有群組</span>';
  return '<span class="pill green">工程中</span>';
}
const statusSync = (c) => (c.statusPending ? ` ${syncTag(true)}` : '');
const lastText = (c) => (c.last ? (c.days === 0 ? '今天' : c.days + ' 天前') : c.weekly.last ? '週報 ' + dayDiff(c.weekly.last, TODAY) + ' 天前' : '沒有照片');
const taskSection = (t) => (t.kind === 'pay' || t.kind === 'closedbal' || t.kind === 'nocontract' || t.kind === 'unsigned' ? 'pay' : t.kind === 'chat' ? 'chat' : 'progress');
const sevOf = (c) => D.tasks.filter((t) => t.caseId === c.id && t.state === 'active').reduce((s, t) => s + t.sev, 0);
function orderedCases() {
  return [...CASES].sort((a, b) => (b.active - a.active) || sevOf(b) - sevOf(a) || b.dueAmt - a.dueAmt || a.name.localeCompare(b.name, 'zh-Hant'));
}
function track(c) {
  return c.source === 'none' && !c.items.some((x) => x.manual)
    ? '<p class="prow-none">沒有 LINE 相簿也沒有 Ragic 週報，系統沒有依據判斷進度（可以到案件頁手動標）</p>'
    : `<div class="rt-full">${rowTrack(c)}</div><div class="rt-mini">${c.cur ? `<p class="rt-now">做到 <b>${esc(c.cur)}</b></p>` : ''}${miniTrack(c)}</div>`;
}

/* 儀表板的進度列：左邊案名＋屋主地址，右邊完整軌道，列尾完成％與天數 */
function rowTrack(c) {
  const k = curIndex(c), n = c.items.length;
  return `<ol class="rtrack" aria-label="${esc(c.name)} 工項進度">${c.items.map((x, i) => {
    const keep = i === k || i === 0 || i === n - 1;
    return `<li class="${keep ? 'keep' : ''} ${i === 0 ? 'first' : ''} ${i === n - 1 ? 'last' : ''}">
      <button type="button" class="rstop ${x.state}" data-citem="${esc(c.id)}|${esc(x.name)}" title="${esc(x.name + '：' + STATE_LABEL[x.state] + (x.last && !x.inferred ? '，最後照片 ' + md(x.last) : ''))}">
        <span class="rdw"><span class="rdot ${x.state} ${i === k ? 'cur' : ''}">${x.state === 'miss' ? '!' : ''}</span></span>
        <span class="rlab ${x.state === 'skip' ? 'strike' : ''} ${i === k ? 'is-cur' : ''}">${esc(x.name)}</span>
      </button></li>`;
  }).join('')}</ol>`;
}
function progressRow(c) {
  const issue = c.kind === '停更' ? `<span class="pill red">停 ${c.days} 天</span>` : c.dueAmt ? `<span class="pill red">該收 NT$${money(c.dueAmt)}</span>`
    : c.miss.length ? `<span class="pill amber">疑似漏 ${esc(c.miss.join('、'))}</span>` : '';
  return `<div class="prow" data-case="${esc(c.id)}" role="button" tabindex="0" aria-label="打開 ${esc(c.name)}">
    <div class="prow-pic">${c.cover ? photoHTML(coverPhoto(c)) : `<div class="ph"><small>${c.noGroup ? '沒有群組' : '沒有縮圖'}</small></div>`}</div>
    <div class="prow-name"><b>${esc(c.name)}</b> ${typeBadge(c)}${whoLine(c)}<p class="dsg">${esc(c.designer || '未指派')}${issue ? ' ' + issue : ''}${!c.active ? ` <span class="pill amber">${esc(c.status)}</span>` : ''}${c.source === 'ragic_weekly' ? ' <span class="pill gray">依週報推估</span>' : ''}</p>${memberTags(c)}</div>
    <div class="prow-track">${track(c)}</div>
    <div class="prow-end"><b class="tnum">${pctText(c)}</b><span class="tnum ${c.kind === '停更' ? 'bad' : ''}">${lastText(c)}</span></div>
  </div>`;
}
function caseCard(c) {
  const note = c.notes[0];
  return `<button class="ccard" type="button" data-case="${esc(c.id)}">
    <div class="cphoto">${c.cover ? photoHTML(coverPhoto(c)) : `<div class="ph"><span class="frame"></span>${c.noGroup ? '沒有 LINE 群組' : '還沒有縮圖'}<small>${esc(c.noGroupReason || '')}</small></div>`}
      <span class="age">${agePill(c)}</span></div>
    <div class="cbody">
      <div class="crow">
        <div class="cname"><h3>${esc(c.name)} ${typeBadge(c)}</h3>${whoLine(c)}<p class="dsg">${esc(c.designer || '未指派')}${c.dueAmt ? ` ・ <span style="color:var(--red-ink);font-weight:800">該收未收 NT$${money(c.dueAmt)}</span>` : ''}</p>${memberTags(c)}</div>
        ${ring(c.progress)}
      </div>
      ${c.source === 'none' ? '<p class="cnow">沒有照片也沒有週報，無法判斷工項</p>' : `
      <p class="cnow">做到 <b>${esc(c.cur || '—')}</b>${c.source === 'ragic_weekly' ? ' <span class="pill gray">依週報推估</span>' : ''}${c.miss.length ? ` ・ <span style="color:var(--amber);font-weight:800">疑似漏 ${esc(c.miss.join('、'))}</span>` : ''}${c.missc.length ? ` ・ <span style="color:var(--red-ink);font-weight:800">確認漏 ${esc(c.missc.join('、'))}</span>` : ''}</p>
      ${miniTrack(c)}`}
      ${note ? `<p class="cnote" title="${esc(note.text)}"><span class="nicon" aria-hidden="true"></span><span><b>備註</b> ${esc(trunc(note.text, 18))}</span></p>` : ''}
    </div>
  </button>`;
}

/* ===================== 案件清單 ===================== */
// 上方篩選下拉（設計師、狀態、類型、關鍵字）＋快篩連結列＋一張表。設計師下拉就是全站的設計師切換（右上角那個），兩處同步。
const isOverdue = (c) => !!c.end && c.active && dayDiff(c.end, TODAY) > 0;
const noContract = (c) => c.active && !!c.recon && c.recon.hasContract === false;
const CQUICK = {   // 快篩：key → [標籤, 條件, 檢視者看不到（金額相關）]
  stale: ['停更', (c) => c.kind === '停更', false],
  due: ['該收未收', (c) => c.dueAmt > 0, true],
  overdue: ['超過完工日', isOverdue, false],
  nocontract: ['沒有合約', noContract, true],
};
function setCasesQuick(k) {
  if (k === 'active' || k === 'closed') { S.casesTab = k; S.cQuick = ''; } else { S.casesTab = 'active'; S.cQuick = S.cQuick === k ? '' : k; }
  render(false);
}
const introCell = (c) => {
  const l = introLabel(c);
  if (l) return `${esc(l)}${c.intro.via === 'group' ? '<small class="dim">推測</small>' : ''}`;
  return c.homeStaff ? '<span class="dash">—</span>' : '<span class="dim">未填</span>';
};
function viewCases() {
  const tab = S.casesTab;
  const q = (S.cq || '').trim().toLowerCase();
  const hit = (c) => (S.cType === '全部' || (c.caseType || '設計') === S.cType)
    && (!q || [c.name, c.owner, c.address, '#' + c.rid, introLabel(c), c.designer].some((v) => String(v || '').toLowerCase().includes(q)));
  const act = scopeCases().filter(hit), clo = CLOSED.filter(hit);   // 設計師切換、我的案子、類型、關鍵字之後的兩池
  let rows = tab === 'closed' ? clo : tab === 'all' ? [...act, ...clo] : act;
  if (S.cQuick && CQUICK[S.cQuick] && tab === 'active') rows = rows.filter(CQUICK[S.cQuick][1]);
  const key = S.sortKey, dir = S.sortDir;
  const val = (c) => ({ name: c.name, type: c.caseType || '設計', intro: introLabel(c) || '~', status: c.kind, progress: c.progress ?? -1, cur: c.cur || '', days: c.days == null ? -1 : c.days, due: c.dueAmt, total: c.total ?? 0 })[key];
  rows = [...rows].sort((a, b) => { const x = val(a), y = val(b); return (typeof x === 'string' ? x.localeCompare(y, 'zh-Hant') : x - y) * dir; });
  S.navOrder = rows.map((c) => c.id);
  if (S.mineOnly && tab !== 'closed' && !scopeCases().length) return mineBar() + mineEmpty();
  const th = (k, label, cls = '') => `<th class="${cls}" aria-sort="${S.sortKey === k ? (S.sortDir > 0 ? 'ascending' : 'descending') : 'none'}"><button type="button" data-sort="${k}">${label}${S.sortKey === k ? (S.sortDir > 0 ? ' ↑' : ' ↓') : ''}</button></th>`;
  const closedCell = (c) => (c.settled ? '<span class="pill green" title="尾款已收清（未入 Ragic）：確定已收到、只是沒登進 Ragic">尾款已收清</span>' : c.closedBalance > 0 ? `<b class="bad">尾款未收 NT$${money(c.closedBalance)}</b>` : '<span class="dash">收齊</span>');
  const pill = (c) => (c.kind === '停更' ? `<span class="pill amber">停更 ${c.days} 天</span>` : statusPill(c));
  const closedView = tab === 'closed';
  const sel = (id, label, opts, cur) => `<label>${label}<select id="${id}">${opts.map(([v, t]) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
  const filters = `<div class="filters" role="search">
    ${sel('cfDsg', '設計師', [[WHO_ALL, '全部'], ...D.dsgList.map((w) => [w, w])], S.who)}
    ${sel('cfStatus', '狀態', [['active', '進行中'], ['closed', '已結案'], ['all', '全部']], tab)}
    ${sel('cfType', '類型', [['全部', '全部'], ...(typeof CASE_TYPES_UI !== 'undefined' ? CASE_TYPES_UI : ['設計', '合資', '獨資', '小吳哥自購']).map((t) => [t, t])], S.cType)}
    <label class="grow">關鍵字<input class="inp" id="cfQ" type="search" value="${esc(S.cqDraft ?? S.cq)}" placeholder="案名、地址、屋主、介紹人" autocomplete="off"></label>
    <button class="btn" type="button" data-csearch>搜尋</button><button class="btn" type="button" data-cclear>清除</button>
    ${closedView ? '' : mineBar()}
  </div>`;
  const quickBits = [
    S.casesTab === 'active' && !S.cQuick ? `<b>進行中 ${act.length}</b>` : `<button class="linkish" type="button" data-cq="active">進行中 ${act.length}</button>`,
    closedView ? `<b>已結案 ${clo.length}</b>` : `<button class="linkish" type="button" data-cq="closed">已結案 ${clo.length}</button>`,
    ...Object.entries(CQUICK).filter(([, v]) => !(v[2] && IS_VIEWER)).map(([k, [label, fn]]) => {
      const n = act.filter(fn).length;
      return S.cQuick === k && tab === 'active' ? `<b>${label} ${n}</b>` : `<button class="linkish" type="button" data-cq="${k}">${label} ${n}</button>`;
    }),
  ];
  const cols = IS_VIEWER ? 7 : 8;
  return `<section class="sec">
    ${filters}
    <div class="quick" role="group" aria-label="快速篩選">${quickBits.join('｜')}</div>
    <div class="card tablecard"><div class="tablewrap scroll"><table class="clean cases-tbl">
      <thead><tr>${th('name', '案名 / 地址')}${th('type', '類型')}${th('intro', '介紹人')}${closedView ? '<th>結案日</th>' : th('status', '狀態')}${th('progress', '進度')}${closedView ? '' : th('cur', '目前工項')}${IS_VIEWER ? '' : closedView ? '<th class="r">尾款</th>' : th('total', '原合約', 'r')}${closedView ? '' : th('days', '最後更新')}</tr></thead>
      <tbody>${rows.map((c) => `<tr data-case="${esc(c.id)}" tabindex="0">
        <td class="name"><b>${esc(c.name)}</b>${whoLine(c, 'who', false)}${S.who === WHO_ALL && c.designer ? `<small class="dim">負責 ${esc(c.designer)}</small>` : ''}${noteOne(c)}</td>
        <td class="c-type" data-l="類型">${esc(c.caseType ? typeText(c.caseType, c.jointSource) : '設計')}</td>
        <td class="c-intro" data-l="介紹人">${introCell(c)}</td>
        <td class="c-status" data-l="${closedView ? '結案日' : '狀態'}">${closedView ? (c.closedAt ? md(c.closedAt) : '<span class="dash">—</span>') : (tab === 'all' && c.closed ? '<span class="pill gray">已結案</span>' : pill(c))}</td>
        <td class="c-prog" data-l="進度"><span class="mini-bar tnum"><i><b style="width:${c.progress || 0}%"></b></i>${pctText(c)}</span></td>
        ${closedView ? '' : `<td class="c-cur" data-l="目前工項">${c.cur ? esc(c.cur) : '<span class="dash">—</span>'}${c.miss.length ? ` <span class="pill amber">漏 ${esc(c.miss.join('、'))}</span>` : ''}</td>`}
        ${IS_VIEWER ? '' : closedView ? `<td class="r tnum c-amt" data-l="尾款">${closedCell(c)}</td>` : `<td class="r tnum c-amt" data-l="原合約">${c.total != null ? money(c.total) : '<span class="dash">—</span>'}</td>`}
        ${closedView ? '' : `<td class="tnum c-last" data-l="最後更新">${c.last ? `${md(c.last)} <span class="dim${c.days > D.staleDays ? ' bad' : ''}">（${c.days} 天前）</span>` : (c.weekly.last ? `${md(c.weekly.last)} <span class="dim">（週報）</span>` : '<span class="dash">—</span>')}</td>`}
      </tr>`).join('') || `<tr><td colspan="${cols}" class="empty-row">${closedView ? '這裡還沒有案子。到某一案按「標記結案」，就會出現在這裡。' : (q || S.cType !== '全部' || S.cQuick) ? '沒有符合的案子，按「清除」看全部。' : '沒有案子。'}</td></tr>`}</tbody></table></div></div>
    <p class="note-line">點案名進該案頁面（款項、照片、時程都在那裡）。點欄位名稱可以排序。</p>
  </section>`;
}

/* ===================== 案件頁 ===================== */
function trackHTML(c) {
  const k = curIndex(c);
  return `<div class="trackwrap"><ol class="track" aria-label="工項進度">${c.items.map((x, i) => {
    const date = x.last ? (x.start && x.start !== x.last ? `${md(x.start)}–${md(x.last)}` : md(x.last)) : (x.state === 'skip' ? '不做' : '—');
    return `<li class="${i === k ? 'is-cur' : ''}">
      <button type="button" class="stop ${x.state}" data-item="${esc(x.name)}" aria-label="${esc(x.name + '：' + STATE_LABEL[x.state] + '，點開可以改狀態')}">
        ${i === k ? '<span class="flag">做到這裡</span>' : ''}
        <span class="dw"><span class="dot ${x.state} ${i === k ? 'cur' : ''}">${x.state === 'miss' ? '!' : ''}</span></span>
        <span class="st-txt"><b class="${x.state === 'skip' ? 'strike' : ''}">${esc(x.name)}${x.manual ? '<i class="mk" title="人工改過"></i>' : ''}</b>
        <small class="tnum">${date}${x.count ? ` ・ ${x.count} 張` : ''}</small>
        <small class="st-lab">${STATE_LABEL[x.state]}${x.manual ? '（人工改過）' : ''}${x.inferred && !x.manual ? '（週報推估）' : ''}</small></span>
      </button></li>`;
  }).join('')}</ol></div>`;
}

function caseBar(c) {
  const list = navList(), i = list.indexOf(c.id);
  return `<div class="casebar">
    <button class="btn" type="button" data-back="cases">回案件列表</button>
    <button class="btn" type="button" data-prev ${list.length < 2 ? 'disabled' : ''} aria-label="上一案">← 上一案</button>
    <button class="btn" type="button" data-next ${list.length < 2 ? 'disabled' : ''} aria-label="下一案">下一案 →</button>
    <span class="grow"></span>
    <span class="kicker tnum">${i >= 0 ? `${i + 1} / ${list.length}` : ''}</span>
    <div class="jump"><input class="inp" id="jumpIn" type="search" placeholder="跳到其他案件：案名、屋主、地址" autocomplete="off" aria-label="搜尋案件"><div class="jump-list" id="jumpList" hidden></div></div>
  </div>`;
}
function navList() {
  const ids = S.navOrder.filter((id) => byId(id));
  if (ids.length && ids.includes(S.caseId)) return ids;
  const cur = byId(S.caseId);
  return (cur && cur.closed ? CLOSED : orderedCases()).map((c) => c.id);
}
function stepCase(dir) {
  const list = navList(), i = list.indexOf(S.caseId);
  if (i < 0 || list.length < 2) return;
  go('case', { caseId: list[(i + dir + list.length) % list.length] });
}
function drawJump(q) {
  const el = $('#jumpList'); if (!el) return;
  const s = String(q || '').trim().toLowerCase();
  const hit = CASES.filter((c) => !s || [c.name, c.owner, c.address, '#' + c.rid, c.designer].some((v) => String(v || '').toLowerCase().includes(s)));
  const order = navList();
  hit.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  el.innerHTML = hit.length ? hit.slice(0, 12).map((c) => `<button type="button" data-jump-to="${esc(c.id)}"><b>${esc(c.name)}</b><span>#${c.rid} ・ ${c.owner ? '屋主 ' + esc(c.owner) : '屋主未填'} ・ ${esc(shortAddr(c.address) || '地址未填')}</span></button>`).join('') : '<p>找不到符合的案件</p>';
  el.hidden = false;
}
function closeJump() { const el = $('#jumpList'); if (el) el.hidden = true; }
document.addEventListener('keydown', (e) => {
  if (e.target.id === 'jumpIn' && e.key === 'Enter') { const b = $('#jumpList [data-jump-to]'); if (b) { e.preventDefault(); b.click(); } }
});

function subnavHTML(c) {
  const total = photoTotal(c);
  const paidN = c.pays.filter((p) => p.status === 'paid').length;
  const progTasks = c.dueTasks.filter((t) => taskSection(t) === 'progress');
  const prog = progTasks.some((t) => t.color === 'red') ? '<i class="sdot red"></i>' : progTasks.length ? '<i class="sdot"></i>' : '';
  const badge = {
    progress: prog + `<span class="bdg">${pctText(c)}</span>`,
    pay: c.dueAmt ? '<i class="sdot red" title="有該收未收"></i>' : (c.pays.length ? `<span class="bdg">${paidN}/${c.pays.length}</span>` : ''),
    docs: docPendingN(c) ? `<span class="bdg">${docPendingN(c)} 待歸檔</span>` : (docsOf(c).length ? `<span class="bdg">${docsOf(c).length} 份</span>` : ''),
    photos: `<span class="bdg">${total ? total + ' 張' : '0'}</span>`,
    timeline: '',
    chat: chatBadge(c),
    info: c.notes.length ? `<span class="bdg">${c.notes.length} 則</span>` : '',
  };
  return `<nav class="subnav" aria-label="案件段落">${secList().map(([k, name]) => `<button type="button" data-sec="${k}" aria-current="${k === 'progress'}">${name}${badge[k]}</button>`).join('')}</nav>`;
}

/* ---------- 案件頁「群組裡交代的事」：AI 從這案 LINE 群組對話抓出來的待辦，含做完的（lib/oversight-chat.js） ---------- */
const chatTaskOf = (c, x) => D.tasks.find((t) => t.key === `chat:${c.id}:${x.id}`);
function chatBadge(c) {
  const open = (c.chat || []).map((x) => chatTaskOf(c, x)).filter((t) => t && t.state === 'active');
  if (!open.length) return (c.chat || []).length ? `<span class="bdg">${c.chat.length} 件</span>` : '';
  return `${open.some((t) => t.color === 'red') ? '<i class="sdot red"></i>' : ''}<span class="bdg">${open.length} 件沒做完</span>`;
}
function chatSectionHTML(c) {
  const list = c.chat || [];
  const row = (x) => {
    const t = chatTaskOf(c, x); if (!t) return '';
    const live = t.state === 'active';
    const status = live ? `<span class="pill ${t.color === 'red' ? 'red' : t.sev >= 2 ? 'amber' : 'gray'}">${esc(t.tag)}</span>` : t.state === 'snooze' ? `<span class="pill gray">這週先不管，${md(t.until)} 再出現</span>` : `<span class="pill green">${t.skip ? '不用做' : '做完了'}</span>`;
    const acts = !CAN_EDIT ? '' : live
      ? `<button class="btn sm" type="button" data-tdone="${esc(t.key)}">做完了</button><button class="linkish" type="button" data-tskip="${esc(t.key)}" title="AI 抓錯了，或這件事取消了">不用做</button>`
      : chatUndoBtn(t);
    return `<li class="chat-item${live ? '' : ' is-done'}">
      <div class="ci-main"><p class="ci-what"><b>${esc(x.what)}</b>${status}</p>
        <p class="ci-quote"><span class="ci-who">${esc(x.who)}・${md(x.said)}</span>「${esc(x.quote)}」</p>
        ${live ? '' : `<p class="ci-done">${esc(chatDoneText(t))}</p>`}${t.note ? `<p class="ci-done">待辦備註：${esc(t.note)}</p>` : ''}</div>
      <div class="ci-acts">${acts}</div></li>`;
  };
  const openN = list.filter((x) => { const t = chatTaskOf(c, x); return t && t.state === 'active'; }).length;
  return `<section class="csec" id="c-chat">
    ${head('群組對話', '群組裡交代的事', `AI 每 5 分鐘讀一次這案的 LINE 群組，把客戶、師傅、設計師交代要做的事抓出來${list.length ? `；目前 ${openN} 件還沒做完` : ''}。群組裡有人說做好了會自己收起來，抓錯了按「不用做」。`)}
    ${list.length ? `<ul class="chat-list">${list.map(row).join('')}</ul>` : '<p class="empty">群組裡還沒有交代要做的事。</p>'}
  </section>`;
}

function viewCase() {
  const c = byId(S.caseId) || CASES[0];
  const k = curIndex(c);
  const groups = c.items.filter((x) => x.count || (x.photos && x.photos.length));
  const quoteNote = c.quote ? '完成度依估價單各工項金額加權；估價單沒列的工項自動標「本案不做」（有照片就不算）。' : '沒有讀到估價單，11 個工項等權重計算完成度。';
  const hasDated = c.items.some((x) => x.last);
  return `
  ${caseBar(c)}
  <section class="case-hero">
    <div class="hero-pic">${c.cover ? photoHTML(coverPhoto(c), true) : `<div class="ph"><span class="frame"></span>${c.noGroup ? '沒有 LINE 群組' : '還沒有縮圖'}</div>`}${c.cover ? `<span class="hero-cap">${esc(c.cover.item)} ・ ${c.cover.date ? md(c.cover.date) : '—'}</span>` : ''}</div>
    <div class="hero-body">
    <div class="hero-ring">${ring(c.progress, 88, 8, 20)}</div>
    <div>
      <h2>${esc(c.name)} ${typeBadge(c)}</h2>
      ${whoLine(c, 'who big')}
      <p class="grp">${c.noGroup ? `沒有 LINE 群組${c.noGroupReason ? '：' + esc(c.noGroupReason) : ''}` : `LINE 群組：${esc(c.group)}`} ・ Ragic #${c.rid}</p>
      ${memberTags(c)}
      <dl class="facts">
        <div><dt>目前工項</dt><dd>${esc(c.cur || '—')}</dd></div>
        <div><dt>${c.last ? '最後照片' : '週報更新'}</dt><dd>${c.last ? `${md(c.last)}（${c.days} 天前）` : c.weekly.last ? `${md(c.weekly.last)}（${dayDiff(c.weekly.last, TODAY)} 天前）` : '—'}</dd></div>
        <div><dt>狀態</dt><dd>${statusPill(c)}${c.closed && c.closedAt ? ` <small class="hint">${md(c.closedAt)}</small>` : ''}${statusSync(c)}</dd></div>
      </dl>
    </div>
    </div>
  </section>
  ${heroActions(c)}
  ${subnavHTML(c)}

  <div class="case-blocks">
  <section class="csec" id="c-progress">
    ${head('工項', '做到哪', c.source === 'none' ? '這案沒有 LINE 相簿也沒有 Ragic 週報，系統判斷不出進度，但還是可以手動標。' : c.source === 'ragic_weekly' ? '這案沒有可用的 LINE 相簿，依 Ragic 每週五排下週行程的週報推估：過去週出現過的工項算已執行，最新一週的算進行中。點任一個點可以改狀態。' : '點任一個點，會捲到那個工項的照片，也可以改狀態。',
      `<span class="pct-tag">完成 <b class="tnum">${pctText(c)}</b>${k >= 0 ? ` ・ 做到 ${esc(c.items[k].name)}` : ''}</span>`)}
    <div class="panel trackpanel">${trackHTML(c)}
      <div class="legend"><span><i class="lg done"></i>完成</span><span><i class="lg doing cur"></i>做到這裡（照片最新）</span><span><i class="lg doing"></i>同時在做</span><span><i class="lg todo"></i>還沒開始</span><span><i class="lg skip"></i>本案不做</span><span><i class="lg miss"></i>疑似漏</span><span><i class="lg missc"></i>確認有漏</span><span><i class="lg mk"></i>人工改過</span></div>
    </div>
    <p class="no-quote" style="margin-top:8px">${quoteNote}</p>
    ${c.source === 'ragic_weekly' && c.weekly.latestText ? `<p class="note" style="margin-top:12px">最新一週週報：${esc(c.weekly.latestText)}</p>` : ''}
  </section>

  ${IS_VIEWER ? '' : chatSectionHTML(c)}

  ${IS_VIEWER ? '' : paySectionHTML(c)}

  ${docsSectionHTML(c)}

  <section class="csec" id="c-photos">
    ${head('照片', '施工照片', `依工項分組，共 ${groups.reduce((s, x) => s + (x.photos || []).length, 0)} 張縮圖（LINE 相簿共 ${photoTotal(c)} 張）。點縮圖放大。原圖在 LINE 相簿。`)}
    ${albumGapPills(c)}
    ${CAN_EDIT && c.archive && c.archive.driveUrl ? `<p class="drive-link"><a class="btn" href="${esc(c.archive.driveUrl)}" target="_blank" rel="noopener noreferrer">看這案全部原圖（公司雲端硬碟）</a><small>要用你登入看板的同一個 Google 帳號開</small></p>` : ''}
    <div class="pgroups">
      ${groups.map((x) => { const list = photoList(c, x.name); return `<div class="pgroup" id="pg-${esc(x.name)}">
        <div class="pg-head"><h3>${esc(x.name)}</h3><span>${x.count} 張 ・ 最後 ${x.last ? md(x.last) : '—'}</span></div>
        ${list.length ? `<div class="thumbs">${list.map((p, i) => `<button class="thumb" type="button" data-lb="${esc(c.id)}|${esc(x.name)}|${i}" aria-label="${esc(x.name + ' 第 ' + (i + 1) + ' 張')}">${photoHTML(p)}</button>`).join('')}</div>` : '<p class="pg-empty">縮圖還沒收進來。</p>'}
        <p class="pg-foot">原圖存在 LINE 相簿，這裡只放縮圖${list.length < x.count ? `（已收 ${list.length} 張，其餘還沒收）` : ''}</p>
      </div>`; }).join('') || '<p class="empty">這案沒有 LINE 工項相簿，沒有照片可以放。</p>'}
    </div>
  </section>

  <section class="csec" id="c-timeline">
    ${head('時程', '每個工項什麼時候進場', '條的起點是進場日、終點是最後一張照片（沒群組的案子是週報日期）。只有一個日期的工項畫成短條。紅線是今天。')}
    <div class="gantt scroll">${hasDated ? caseGantt(c) : '<p class="g-empty" style="padding:16px">還沒有日期可以畫。</p>'}</div>
    ${weeksTrack(c)}
  </section>

  <section class="csec" id="c-info">
    ${groupStaffBlock(c)}
    <div class="two">
    <div>
      ${head('基本資料', '案件資料', '改了會記在「最近修改」。')}
      <div class="panel basic">
        <div class="field">
          <label for="caseOwner">屋主${c.owner ? '' : ' <span class="pill amber">待補</span>'} ${c.ownerLocal ? '<span class="sync-tag local">網站修正</span>' : ''}</label>
          ${CAN_EDIT ? `<div class="inline"><input class="inp" id="caseOwner" type="text" value="${esc(c.owner || '')}" placeholder="例如：王小姐" autocomplete="off" maxlength="60"><button class="btn" type="button" id="caseOwnerSave">儲存</button></div>` : `<p class="ro">${esc(c.owner || '未填')}</p>`}
        </div>
        <div class="field"><span class="flabel">地址（Ragic）</span><p class="ro">${esc(c.address || '未填')}</p></div>
        ${CAN_EDIT ? `<div class="field">
          <label for="caseDesigner">負責人（Ragic 監工）${c.designerPending ? syncTag(true) : ''}</label>
          <select class="inp" id="caseDesigner">${[...new Set([c.designer, ...D.designers].filter(Boolean))].map((d) => `<option ${d === c.designer ? 'selected' : ''}>${esc(d)}</option>`).join('')}${c.designer ? '' : '<option selected value="">未指派</option>'}</select>
        </div>
        <div class="field">
          <label for="caseStatus">案件狀態 ${c.statusPending ? syncTag(true) : ''}</label>
          <select class="inp" id="caseStatus">${['工程中', '暫停', '已結案'].map((s) => `<option ${s === c.status ? 'selected' : ''}>${s}</option>`).join('')}</select>
          <span class="hint">結案請用頁面上方的「標記結案」，會先幫你核對款項與驗收。</span>
        </div>` : `<div class="field"><span class="flabel">負責人</span><p class="ro">${esc(c.designer || '未指派')}</p></div>
        <div class="field"><span class="flabel">案件狀態</span><p class="ro">${esc(c.status)}</p></div>`}
        <div class="field"><span class="flabel">介紹夥伴</span><p class="ro">${esc(introLabel(c) || '沒有紀錄')}${c.intro && c.intro.via === 'local' ? ' <span class="sync-tag local">網站設定</span>' : c.intro && c.intro.via === 'group' ? ' <span class="sync-tag">依群組成員推測</span>' : c.intro && c.intro.via === 'ragic' ? ` <span class="sync-tag local">Ragic 客戶來源「${esc(c.intro.text)}」</span>` : c.intro && c.intro.via === 'text' ? ' <span class="sync-tag local">Ragic 客戶來源</span>' : ''}</p>
          <div class="inline">${!CAN_EDIT && DATA.viewer.name && !(c.intro && c.intro.names.includes(DATA.viewer.name)) ? '<button class="btn primary" type="button" data-claim>這是我介紹的</button>' : ''}${CAN_EDIT ? `<button class="btn" type="button" data-intro>設定介紹夥伴</button>${c.intro && c.intro.via === 'group' ? '<button class="btn" type="button" data-introok>確認這個推測</button>' : ''}` : ''}</div></div>
        ${caseTypeField(c)}
        ${signField(c)}
        ${archiveField(c)}
        ${CAN_EDIT ? `<p class="sync">負責人與狀態${DATA.ragicWrite ? '會同步寫回 Ragic' : '：Ragic 同步尚未開啟，先存在網站'}。屋主不寫回 Ragic（那個欄位從別張表同步，寫回會被蓋掉），只存在網站。</p>` : ''}
        <p class="sync mem-help"><b>瓊安在群組</b>：系統每天讀得到相簿照片和進度。<b>小助手在群組</b>：收得到群組裡的聊天訊息與照片，目前總覽還沒用到這份資料，只是先顯示成員狀態。小助手加入群組後如果一直沒人講話，系統就看不到它，所以「沒收到過訊息」不代表它一定不在群組。</p>
      </div>
    </div>
    <div>
      ${head('備註', '這案的筆記', '可以記下問到的進度、要留意的事。新的在最上面。會同時附加到 Ragic 的備註欄（原本的字不會被蓋掉）。')}
      <div class="panel">
        ${CAN_EDIT ? `<label class="flabel" for="caseNoteInput">新增一筆</label>
        <textarea class="inp" id="caseNoteInput" rows="2" placeholder="例如：木地板 10/22 進場" maxlength="500"></textarea>
        <div class="row-end"><button class="btn primary" type="button" id="caseNoteAdd">新增備註</button></div>` : ''}
        <div class="notes">${c.notes.map((n) => `<div class="noterow"><span class="tnum">${esc(stampTW(n.at))}</span><p><b>${esc(n.by)}</b>　${esc(n.text)}</p></div>`).join('') || '<p class="log-empty">還沒有備註。</p>'}</div>
      </div>
    </div>
  </div></section>
  </div>`;
}

/* 這案配對的 LINE 群組相簿清單裡沒有合約／匯款類相簿：小標示（檢視者也看得到，不含金額）。判斷看相簿名稱，不是有沒有照片 */
function albumGapPills(c) {
  const g = c.albumGaps;
  if (!g || (!g.noContract && !g.noPay)) return '';
  return `<p class="album-gaps">${g.noContract ? '<span class="pill gray" title="這案配對的 LINE 群組裡，沒有任何名稱含「合約」的相簿">LINE 沒有合約相簿</span>' : ''}${g.noPay ? '<span class="pill gray" title="這案配對的 LINE 群組裡，沒有名稱含「匯款」「工程款」「收款」「付款」等的相簿">LINE 沒有匯款相簿</span>' : ''}</p>`;
}

/* 存檔資料夾（公司 Google Drive「03_設計裝修部/案件存檔（設計部監督）」）：顯示資料夾名稱；編輯者可補填社區名，補上後 Drive 資料夾自動改名 */
function archiveField(c) {
  const a = c.archive;
  if (!a) return '';
  const srcTag = a.src === 'manual' ? '網站補填' : a.src === 'address' ? 'Ragic 地址欄' : a.src === 'name' ? '依案名' : '';
  const tag = a.tian ? `<span class="sync-tag ${a.manualTian ? '' : 'local'}" title="整棟透天，資料夾不寫樓層">透天${a.manualTian ? '（網站勾選）' : '（案名或地址明寫）'}</span>` : srcTag ? `<span class="sync-tag ${a.src === 'manual' ? '' : 'local'}" title="括號裡社區名的來源">社區名：${esc(srcTag)}</span>` : '';
  return `<div class="field"><span class="flabel">存檔資料夾（公司 Google Drive）</span>
    <p class="ro">${esc(a.folder)} ${tag}</p>
    ${a.hold ? '<p class="ro"><span class="pill amber">暫停存檔</span> 這案配對的 LINE 群組還在確認中，確認後才開始存。</p>' : ''}
    ${a.pending ? (a.pendingWhy === 'district' ? '<p class="ro"><span class="pill amber">待確認：Ragic 地址沒寫區</span> 資料夾照實用 Ragic 地址、沒有補區。請設計師把完整地址（含區）補進 Ragic，補了資料夾會自動改名。</p>' : '<p class="ro"><span class="pill amber">待確認：是透天還是缺樓層</span> Ragic 地址沒有樓層，案名、地址、群組名也沒寫「透天」，資料夾先只用門牌。整棟透天請勾下面的「透天」；不是的話請設計師把樓層補進 Ragic 地址。</p>') : ''}
    ${CAN_EDIT ? `<div class="inline"><input class="inp" id="caseCommunity" type="text" value="${esc(a.manual || '')}" placeholder="補填社區名，例如：IS台北概念館社區" autocomplete="off" maxlength="40"><button class="btn" type="button" id="caseCommunitySave">儲存</button></div>
    <label class="check"><input type="checkbox" id="caseTian"${a.manualTian || a.tian ? ' checked' : ''}${a.tian && !a.manualTian ? ' disabled' : ''}> 這是整棟透天</label>
    <span class="hint">這案的照片、文件、聊天紀錄存在這個資料夾。命名：區名（去「區」字）＋地址＋樓層（社區名）；整棟透天寫（透天）、不寫樓層。「透天」不能猜，只有案名或地址明寫、或在這裡勾選才算。補填後資料夾會在下一次存檔時自動改名（檔案不動）；社區名留空＝清除補填。</span>` : ''}</div>`;
}

/* gantt for one case */
function caseGantt(c) {
  const dated = c.items.filter((x) => x.last);
  const start = addDays(c.signed || dated.map((x) => x.start || x.last).sort()[0], -4);
  const end = addDays(TODAY, 24);
  const span = Math.max(1, dayDiff(start, end));
  const X = (d) => (dayDiff(start, d) / span * 100);
  const ticks = monthTicks(start, end).map((d) => `<span class="g-tick" style="left:${X(d)}%">${Number(d.slice(5, 7))} 月</span>`).join('');
  const rows = c.items.map((x) => {
    let inner = '';
    if (x.state === 'skip') inner = '<span class="g-note" style="left:0">本案不做</span>';
    else if (x.state === 'missc') inner = '<span class="g-note" style="left:0;color:var(--red-ink)">確認有漏</span>';
    else if (!x.last && x.state !== 'miss') inner = '<span class="g-note" style="left:0">還沒進場</span>';
    else if (x.state === 'miss') inner = '<span class="bar miss" style="left:0;width:auto">疑似漏：沒有照片</span>';
    else {
      const s = x.start || x.last, e = x.last;
      const w = Math.max(X(addDays(e, 1)) - X(s), 0);
      inner = `<span class="bar ${x.state === 'doing' ? 'doing' : ''}" style="left:${X(s)}%;width:${w}%" title="${esc(x.name)} ${md(s)}–${md(e)}"></span>`;
      if (x.state === 'doing' && ts(e) < ts(TODAY)) inner += `<span class="bar tail" style="left:${X(addDays(e, 1))}%;width:${X(TODAY) - X(addDays(e, 1))}%"></span>`;
      inner += `<span class="g-note tnum" style="left:calc(${X(addDays(e, 1))}% + 8px)">${x.start && x.start !== x.last ? md(x.start) + '–' + md(e) : md(e)}${x.start ? '' : '（無進場日）'}</span>`;
    }
    return `<div class="g-row"><div class="g-label">${esc(x.name)}</div><div class="g-track">${inner}</div></div>`;
  }).join('');
  return `<div class="g-inner" style="--gl:92px">
    <div class="g-axis"><div></div><div class="g-track">${ticks}</div></div>
    <div style="position:relative">${rows}
      <div style="position:absolute;inset:0 0 0 92px;pointer-events:none"><div class="g-today" style="left:${X(TODAY)}%;bottom:0"><span>今天 ${md(TODAY)}</span></div></div>
    </div></div>`;
}
function monthTicks(start, end) {
  const out = []; let [y, m] = start.split('-').map(Number); m++; if (m > 12) { m = 1; y++; }
  for (;;) { const d = `${y}-${pad(m)}-01`; if (ts(d) > ts(end)) break; out.push(d); m++; if (m > 12) { m = 1; y++; } }
  return out;
}

/* ===================== 全案時程 ===================== */
// 全案進度軌道（原本在首頁）＋甘特圖
function progressSection() {
  const SC = scopeCases();
  const working = SC.filter((c) => c.active), paused = SC.filter((c) => !c.active);
  const ordered = orderedCases().filter((c) => SC.includes(c));
  S.navOrder = ordered.map((c) => c.id);
  return `<section class="sec lead" id="progSec">
    <div class="lead-head">
      <div><h3 class="blk-title">全案進度</h3><p class="blk-sub">${working.length} 案工程中${paused.length ? `，另有${[...new Set(paused.map((c) => c.status))].join('、')} ${paused.length} 案` : ''}${CLOSED.length ? `，${CLOSED.length} 案已結案（在「案件清單」狀態選「已結案」）` : ''}。有問題的排前面。大橘點是做到這裡（照片最新的那項），小橘點是同一週也在做的工項，點某個點直接看那個工項。沒有群組的案子依 Ragic 週報推估。</p></div>
      <div class="seg-toggle" role="group" aria-label="檢視方式"><button class="chip" type="button" data-dview="rows" aria-pressed="${S.dashView === 'rows'}">進度列</button><button class="chip" type="button" data-dview="cards" aria-pressed="${S.dashView === 'cards'}">照片卡</button></div>
    </div>
    ${S.dashView === 'rows' ? `<div class="prows">${ordered.map(progressRow).join('')}</div>
    <div class="legend dash-legend"><span><i class="lg done"></i>完成</span><span><i class="lg doing cur"></i>做到這裡（照片最新）</span><span><i class="lg doing"></i>同時在做</span><span><i class="lg todo"></i>還沒開始</span><span><i class="lg skip"></i>本案不做</span><span><i class="lg miss"></i>疑似漏</span><span><i class="lg missc"></i>確認有漏</span></div>` : `<div class="grid">${ordered.map(caseCard).join('')}</div>`}
  </section>`;
}
function viewTimeline() { return progressSection() + ganttSection(); }
function ganttSection() {
  const rows = CASES.map((c) => {
    const firsts = [...c.items.filter((x) => x.start || x.last).map((x) => x.start || x.last), ...c.weeks.filter((w) => w.filled).map((w) => w.mon)];
    return { c, first: firsts.sort()[0] };
  }).filter((r) => r.first).sort((a, b) => ts(a.first) - ts(b.first));
  if (!rows.length) return `<section class="sec">${head('全案時程', '每案做到哪、卡在哪', '')}<p class="empty">還沒有任何案子有日期可以畫。</p></section>`;
  const start = addDays(rows[0].first, -10), end = addDays(TODAY, 24);
  const span = Math.max(1, dayDiff(start, end));
  const X = (d) => dayDiff(start, d) / span * 100;
  const ticks = monthTicks(start, end).map((d) => `<span class="g-tick" style="left:${X(d)}%">${Number(d.slice(5, 7))} 月</span>`).join('');
  const body = rows.map(({ c }) => {
    const segs = c.items.filter((x) => (x.state === 'done' || x.state === 'doing') && (x.start || x.last)).map((x) => ({ ...x, s: x.start || x.last })).sort((a, b) => ts(a.s) - ts(b.s));
    let html = '';
    segs.forEach((x, i) => {
      const next = segs[i + 1];
      const e = x.state === 'doing' ? x.last : (next ? addDays(next.s, -1) : x.last);
      const realEnd = ts(e) < ts(x.s) ? x.s : e;
      const w = Math.max(X(addDays(realEnd, 1)) - X(x.s), 0.5);
      html += `<span class="bar seg ${x.state} ${i % 2 ? 'alt' : ''} ${i === 0 ? 'first' : ''} ${i === segs.length - 1 ? 'last' : ''}" style="left:${X(x.s)}%;width:${w}%" title="${esc(c.name + '・' + x.name + ' ' + md(x.s) + '–' + md(realEnd))}">${esc(x.name)}</span>`;
    });
    const lastDate = c.last || c.weekly.last;
    if (segs.length && lastDate && ts(lastDate) < ts(TODAY)) html += `<span class="bar tail" style="left:${X(addDays(lastDate, 1))}%;width:${X(TODAY) - X(addDays(lastDate, 1))}%;${c.days > D.staleDays ? 'border-top-color:var(--red)' : ''}"></span>`;
    // 每週行程小點：實心＝設計師有填 Ragic 週報，空心＝沒填（與案件頁「每週行程」同一套樣式）
    c.weeks.forEach((w) => { const x = X(addDays(w.mon, 2)); if (x >= 0 && x <= 100) html += `<span class="wkdot ${w.filled ? 'on' : ''}" style="left:${x}%" title="${esc(weekTitle(w))}"></span>`; });
    html += `<span class="g-note tnum" style="left:calc(${X(TODAY)}% + 10px)">${c.kind === '停更' ? `<b style="color:var(--red-ink)">停 ${c.days} 天</b>` : esc(c.cur || '')}</span>`;
    return `<div class="g-row tall"><div class="g-label"><button type="button" data-case="${esc(c.id)}">${esc(c.name)}</button>${whoLine(c, 'who tl')}<small>${esc(c.designer || '未指派')} ・ ${pctText(c)}${c.source === 'ragic_weekly' ? ' ・ 週報推估' : ''}</small></div><div class="g-track">${html}</div></div>`;
  }).join('');
  const none = CASES.filter((c) => !rows.some((r) => r.c.id === c.id)).map((c) => c.name).join('、');
  return `<section class="sec">
    ${head('全案時程', '每案做到哪、卡在哪', '每列一案，條上依序是各工項（綠＝完成、橘＝進行中）。點線是最後一張照片到今天的空白，紅點線代表停更。每列下緣的小點是每週行程：實心＝設計師有填 Ragic 週報，空心＝沒填。手機可以左右滑。')}
    <div class="gantt scroll"><div class="g-inner" style="--gl:250px;min-width:1100px">
      <div class="g-axis"><div></div><div class="g-track">${ticks}</div></div>
      <div style="position:relative">${body}<div style="position:absolute;inset:0 0 0 250px;pointer-events:none"><div class="g-today" style="left:${X(TODAY)}%;bottom:0"><span>今天 ${md(TODAY)}</span></div></div></div>
    </div></div>
    ${none ? `<p class="note" style="margin-top:12px">${esc(none)} 沒有任何日期可以畫（沒有照片、週報也沒提到工項）。</p>` : ''}
  </section>`;
}

/* ===================== 照片 ===================== */
function allPhotos() {
  const out = [];
  CASES.forEach((c) => c.items.filter((x) => x.photos && x.photos.length).forEach((x) => photoList(c, x.name).slice(-4).reverse().forEach((p) => out.push(p))));
  return out.sort((a, b) => (b.date || '').localeCompare(a.date || '') || a.caseName.localeCompare(b.caseName, 'zh-Hant') || b.i - a.i);
}
function viewPhotos() {
  let list = allPhotos();
  const names = ['全部', ...new Set(list.map((p) => p.caseName))];
  if (S.photoCase !== '全部') list = list.filter((p) => p.caseName === S.photoCase);
  window.__wall = list;
  let lastDay = null, html = '';
  list.forEach((p, i) => {
    if (p.date !== lastDay) { lastDay = p.date; const n = list.filter((x) => x.date === p.date).length; html += `<div class="daylabel">${p.date ? md(p.date) : '日期不明'}<span>${p.date ? (dayDiff(p.date, TODAY) === 0 ? '今天' : dayDiff(p.date, TODAY) + ' 天前') : ''} ・ ${n} 張</span></div>`; }
    html += `<button class="ptile" type="button" data-wall="${i}"><span class="thumb">${photoHTML(p)}</span><b>${esc(p.caseName)}</b>${whoLine(byId(p.caseId))}<span>${esc(p.item)} ・ ${p.date ? md(p.date) : ''}</span></button>`;
  });
  return `<section class="sec">
    ${head('照片', '各案最新照片', '從新到舊。每個工項最多放 4 張，要看全部請點進案件。只放縮圖，原圖在 LINE 相簿。', `<label><span class="kicker" style="margin-right:6px">只看</span><select class="sel" id="photoSel">${names.map((n) => `<option ${n === S.photoCase ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></label>`)}
    <div class="pwall">${html || '<p class="empty">還沒有縮圖。收集端每天會把新照片的縮圖送上來。</p>'}</div>
  </section>`;
}

function jumpPhotos(name) {
  const el = document.getElementById('pg-' + name);
  if (el) { el.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1400); }
}

/* 案件頁「群組裡的同仁」：收集端讀到的案件 LINE 群組成員裡，對得上公司在職同仁的那幾位（客戶名字不會傳到網站） */
function groupStaffBlock(c) {
  const g = c.groupStaff;
  const head2 = '<h3 class="wk-h">群組裡的同仁</h3>';
  if (!g || !g.hasData) return `<div class="gs-sec">${head2}<p class="note">${c.noGroup ? '這案沒有配對到 LINE 群組。' : '收集端還沒讀到這個群組的成員，等下一輪收集。'}</p></div>`;
  const chip = (n) => `<span class="pill ${g.guess.includes(n) ? 'green' : 'gray'}" title="${g.guess.includes(n) ? '排除固定班底、接案人、監工後，剩下的同仁＝推測的介紹夥伴' : '固定班底、接案人或監工'}">${esc(n)}${g.guess.includes(n) ? '・介紹夥伴候選' : ''}</span>`;
  return `<div class="gs-sec">${head2}
    <p class="blk-sub">群組共 ${g.count} 人，其中公司同仁 ${g.all.length} 位${g.readAt ? `（${esc(stampTW(g.readAt))} 讀）` : ''}。固定班底（設計師沈郁雯、呂鴻墀、瓊安、小吳哥、芳芳）、接案人、監工不算介紹夥伴，剩下的同仁就是推測的介紹夥伴。</p>
    <div class="members gs-chips">${g.all.map(chip).join('') || '<span class="pill gray">群組裡沒有對上在職同仁的成員</span>'}</div>
  </div>`;
}
