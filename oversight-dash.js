'use strict';
// 設計部監督總覽｜總覽（首頁）、待辦事項、最近修改（2026-11-05 介面改版，照 Joan 點頭的示範頁，仿物業管理系統的簡單模式）
// 總覽只留：4 張數字卡＋「我的待辦」（一列一件）＋「其他要整理的」；完整待辦（含先拿掉、這週先不管、備註）在「待辦事項」頁。
// 原本首頁的款項總覽、收了沒、全案進度、新報價清單、最近修改分別搬到款項、全案時程、整理群組、最近修改頁。
// 檢視者（租賃部同仁）看另一個首頁：只有「你的案子」與搜尋。
// 依賴 oversight.js／oversight-views.js／oversight-docs.js／oversight-perf.js 的全域：D、DATA、S、CASES、CLOSED、byId、esc、money、md、whoLine、yearFigures…

/* ---------- 待辦分類（待辦事項頁的快篩） ---------- */
const CAT_OF = {
  pay: '款項', closedbal: '款項', unsigned: '款項',
  stall: '進度', quiet: '進度', miss: '進度', wkstale: '進度', nowk: '進度', nosched: '進度',
  overdue: '該結案了', finished: '該結案了',
  nocontract: '資料不全', nointro: '資料不全', noarch: '資料不全', doc: '資料不全',
  chat: '群組對話',   // 對話待辦：LINE 群組裡交代的事（lib/oversight-chat.js）
};
const CAT_LIST = ['全部', '群組對話', '款項', '該結案了', '進度', '資料不全'];
const TAG_OF = { 群組對話: '對話', 款項: '款項', 該結案了: '結案', 進度: '進度', 資料不全: '資料' };   // 一列一件裡的類別小標籤

/* 把待辦（伺服器算好的 D.tasks）加上「新文件待歸檔」依案件分組：一案一組 */
function dashQueue() {
  const ok = (id) => { const c = byId(id); return !!c && (!S.mineOnly || c.mine); };
  const map = new Map();
  const put = (cid, it) => { if (!map.has(cid)) map.set(cid, { c: byId(cid), items: [] }); map.get(cid).items.push(it); };
  for (const t of D.tasks) if (t.state === 'active' && ok(t.caseId)) put(t.caseId, { ...t, cat: CAT_OF[t.kind] || '進度' });
  // LINE 收到、還沒歸檔的文件（lib/oversight-docs.js）併進該案那一組；沒配對到案件的新報價不是某一案的事，放在「整理群組」頁的「新報價、Ragic 還沒建檔」
  if (typeof docsOn === 'function' && docsOn() && !DATA.docs.error) {
    const byCase = {};
    for (const id of DATA.docs.todo) { const d = docById(id); if (d && d.rid && ok(d.rid)) (byCase[d.rid] ||= []).push(d); }
    for (const [cid, docs] of Object.entries(byCase)) put(cid, { key: 'doc:' + cid, kind: 'doc', sev: 1, color: 'amber', tag: `${docs.length} 份新文件待歸檔`, cat: '資料不全', docs });
  }
  return [...map.values()].map((q) => {
    q.items.sort((a, b) => (b.sev || 0) - (a.sev || 0) || (b.amt || 0) - (a.amt || 0));
    return { ...q, cats: [...new Set(q.items.map((t) => t.cat))], sev: Math.max(...q.items.map((t) => t.sev || 0)), red: q.items.some((t) => t.color === 'red') };
  }).sort((a, b) => (b.red - a.red) || b.sev - a.sev || b.items.length - a.items.length || a.c.name.localeCompare(b.c.name, 'zh-Hant'));
}

/* 一件一列（案件順序同 dashQueue：紅的在前）；first＝這案的第一件（案件層級的備註、這週先不管只掛在第一列） */
function todoItems() {
  return dashQueue().flatMap((q) => q.items.map((t, i) => ({ c: q.c, t, first: i === 0 })));
}
/* 一句話：案名（粗體）後面接的字 */
function todoText(c, t) {
  if (t.kind === 'doc') {
    const m = t.docs.filter((d) => docPaidMatch(d)).length;   // 其中已經入帳的匯款證明：不是新的錢
    return `${t.docs.length} 份新文件待歸檔${m ? `（其中 ${m} 份是已入帳那筆的匯款證明，不是新的收款）` : ''}`;
  }
  const pre = c.name + '：';
  return t.title.startsWith(pre) ? t.title.slice(pre.length) : t.title;
}
/* 「處理」連結要做的事：能直接處理的打開既有的處理面板（標記結案、登記收款），其餘進該案對應的段落 */
function todoAttrs(c, t) {
  const id = esc(c.id), at = (sec) => `data-case="${id}"${sec ? ` data-csec="${sec}"` : ''}`;
  if (!CAN_EDIT) return at('');
  switch (t.kind) {
    case 'finished': case 'overdue': return c.closed ? at('') : `data-close="${id}"`;
    case 'pay': case 'closedbal': return `data-payadd="${id}"`;
    case 'unsigned': case 'nocontract': return at('pay');
    case 'doc': return at('docs');
    case 'nointro': case 'noarch': return at('info');
    case 'wkstale': case 'nosched': case 'nowk': return at('timeline');
    case 'chat': return at('chat');
    default: return at('progress');
  }
}
/* 「處理」按鈕的字：對話待辦是去案件頁看群組原話 */
const actLabel = (t) => (t.kind === 'chat' ? '看原話' : '處理');
const noteLine = (c) => { const n = c.notes[0]; return n ? `${md(String(n.at).slice(0, 10))}${n.by ? ' ' + esc(n.by) : ''}：${esc(n.text)}` : ''; };

/* ---------- 備註：待辦事項頁、案件頁頂端共用同一份（c.notes，新的在前） ---------- */
const noteMeta = (n) => `${esc(stampTW(n.at))}・${esc(n.by || '')}`;
function noteList(c) {
  return `<div class="nt-list">${c.notes.map((n) => `<div class="nt-item"><span class="nt-meta">${noteMeta(n)}</span><p>${esc(n.text)}</p></div>`).join('')}</div>`;
}
/* ctx：'row'＝待辦事項頁一列（編輯中顯示輸入框）；'case'＝案件頁頂端（入口在常用動作那排） */
function noteBlock(c, ctx) {
  const N = c.notes.length, n = c.notes[0];
  if (S.noteEdit === c.id) {
    return `<div class="nt nt-edit"><label for="noteDraft">${N ? '再加一則備註' : '加備註'}</label>
      <textarea class="inp" id="noteDraft" rows="3" maxlength="500" placeholder="例如：設計師說木地板 10/22 進場">${esc(S.noteDraft)}</textarea>
      <p class="err" id="noteErr" role="alert"></p>
      <div class="nt-btns"><button class="btn sm" type="button" data-notecancel="${esc(c.id)}">取消</button><button class="btn primary sm" type="button" id="noteSave" data-notesave="${esc(c.id)}">儲存</button></div></div>`;
  }
  if (!N) return ctx === 'row' && CAN_EDIT ? `<div class="nt"><button class="nt-add" type="button" data-noteopen="${esc(c.id)}"><i aria-hidden="true">＋</i>加備註</button></div>` : '';
  const all = ctx === 'row' && S.noteAll[c.id] && N > 1;
  // 案件頁下方「資料與備註」已列全部，頂端的「共 N 則」直接跳過去
  const more = ctx === 'case' ? `<button class="linkish" type="button" data-jumpsec="info">共 ${N} 則</button>` : `<button class="linkish" type="button" data-noteall="${esc(c.id)}" aria-expanded="${!!all}">${all ? '收起' : `共 ${N} 則`}</button>`;
  const tools = `<div class="nt-tools">${N > 1 ? more : ''}${ctx === 'row' && CAN_EDIT ? `<button class="linkish" type="button" data-noteopen="${esc(c.id)}">加一則</button>` : ''}</div>`;
  if (all) return `<div class="nt"><div class="nt-latest"><span class="nt-meta">全部備註，新的在上面</span>${tools}</div>${noteList(c)}</div>`;
  return `<div class="nt"><div class="nt-latest"><div class="nt-body" title="${esc(n.text)}"><span class="nt-meta">${noteMeta(n)}</span><span class="nt-text">${esc(n.text)}</span></div>${tools}</div></div>`;
}
/* 案件列表、待辦事項：案名下面一行最新備註 */
function noteOne(c) {
  const n = c.notes[0]; if (!n) return '';
  return `<p class="nt-one"><span class="nt-meta">${noteMeta(n)}${c.notes.length > 1 ? `（共 ${c.notes.length} 則）` : ''}</span><span class="nt-text">${esc(n.text)}</span></p>`;
}

/* ---------- 總覽「要注意的案子」：直接列案名（2026-11-11 體檢：小吳哥打開只看到案數、看不到是哪幾案） ----------
   左邊到期未收（跟款項頁、業績頁同一個數：進行中已到期＋已結案尾款），右邊進度有狀況（停更、漏工項、過完工日、疑似做完）。
   行政類的待辦（週報、行程、資料夾、文件）不放這裡，留在下面「我的待辦」。 */
const ATTN_KINDS = new Set(['stall', 'quiet', 'miss', 'overdue', 'finished']);
function attnBlock(SC, closedSC) {
  const ok = (id) => SC.some((c) => c.id === id);
  const dueList = [...SC, ...closedSC].filter((c) => c.dueAmt > 0).sort((a, b) => b.dueAmt - a.dueAmt);
  const dueSum = dueList.reduce((s, c) => s + c.dueAmt, 0);
  const prog = new Map();
  for (const t of D.tasks) {
    if (t.state !== 'active' || !ATTN_KINDS.has(t.kind) || !ok(t.caseId)) continue;
    const cur = prog.get(t.caseId);
    if (!cur) prog.set(t.caseId, { c: byId(t.caseId), t, n: 1 });
    else { cur.n++; if ((t.sev || 0) > (cur.t.sev || 0)) cur.t = t; }
  }
  const progList = [...prog.values()].sort((a, b) => (b.t.sev || 0) - (a.t.sev || 0) || a.c.name.localeCompare(b.c.name, 'zh-Hant'));
  const CAP = 6;
  const tagOf = (c) => (c.closed ? '<span class="pill gray">已結案</span>' : c.status === '暫停' ? '<span class="pill amber">暫停</span>' : '');
  const dueRow = (c) => `<button class="attn-row" type="button" data-case="${esc(c.id)}" data-csec="pay"><span class="an"><b>${esc(c.name)}</b>${tagOf(c)}<small>${esc(c.designer || '未指派')}・${c.closed ? '尾款' : '已到期的款'}</small></span><span class="aa tnum">NT$${money(c.dueAmt)}</span></button>`;
  const progRow = ({ c, t, n }) => `<button class="attn-row" type="button" data-case="${esc(c.id)}" data-csec="${taskSection(t)}"><span class="an"><b>${esc(c.name)}</b>${tagOf(c)}<small>${esc(c.designer || '未指派')}・${esc(todoText(c, t))}${n > 1 ? `（另 ${n - 1} 件）` : ''}</small></span></button>`;
  const more = (n, go) => (n > CAP ? `<div class="card-foot"><button class="linkish" type="button" ${go}>還有 ${n - CAP} 案 →</button></div>` : '');
  return `<section class="card attn" id="attnSec">
    <h2>要注意的案子 <small>點案名直接看那一案</small></h2>
    <div class="attn-grid">
      <div class="attn-col"><h3>到期未收 <b class="tnum ${dueSum ? 'red' : ''}">NT$${money(dueSum)}</b><small>${dueList.length} 案</small></h3>
        ${dueList.slice(0, CAP).map(dueRow).join('') || '<p class="empty-row">沒有到期未收的錢。</p>'}${more(dueList.length, 'data-go="money"')}</div>
      <div class="attn-col"><h3>進度有狀況 <b class="tnum">${progList.length} 案</b><small>停更、漏工項、過完工日、疑似做完</small></h3>
        ${progList.slice(0, CAP).map(progRow).join('') || '<p class="empty-row">每案進度都正常。</p>'}${more(progList.length, 'data-qf="進度"')}</div>
    </div>
  </section>`;
}

/* ===================== 總覽（編輯者） ===================== */
function viewDash() {
  if (IS_VIEWER) return viewViewerHome();
  const SC = scopeCases();
  const closedSC = S.mineOnly ? CLOSED.filter((c) => c.mine) : CLOSED;
  const Q = dashQueue();
  const items = todoItems();
  const closeN = Q.filter((q) => q.cats.includes('該結案了')).length;
  const mc = moneyCalc([...SC, ...closedSC]);   // 到期未收：跟款項頁、業績頁同一個算法
  const due = mc.dueAll;
  const gapLeft = D.orphans.length;
  const run = DATA.run;
  let alert = '';
  if (run.stale) alert = run.hoursSinceOk == null ? '<div class="alert">手機收集還沒有成功跑過，照片與群組資料是空的。</div>' : `<div class="alert">手機收集已 ${run.hoursSinceOk} 小時沒更新，照片與群組資料可能不是最新的。</div>`;
  else if (run.lastRunOk === false) alert = `<div class="alert soft">最近一次手機收集失敗${run.lastRunNote ? '：' + esc(run.lastRunNote) : ''}（上一次成功是 ${run.lastOkAt ? stampTW(run.lastOkAt) : '—'}）。</div>`;
  if (S.mineOnly && !SC.length && !closedSC.length) return alert + mineBar() + mineEmpty();
  if (whoEmpty()) return alert + mineBar() + whoEmptyView();

  const yf = yearFigures();
  const yearCards = yf.state === 'ok'
    ? `<button class="kpi" type="button" data-go="perf"><span class="lab">${yf.y} 年簽的合約</span><span class="num tnum">${money(yf.s.signed)}</span>${yf.split('signed')}<span class="sub">今年簽約 ${yf.s.signedN} 案・含已簽追加</span></button>
    <button class="kpi" type="button" data-go="perf"><span class="lab">${yf.y} 年收進來的錢</span><span class="num tnum">${money(yf.s.received)}</span>${yf.split('received')}<span class="sub">今年真的收到的錢${yf.oldRecv ? `・含往年簽約的 ${wan(yf.oldRecv)}` : ''}</span></button>`
    : ['簽的合約', '收進來的錢'].map((l) => `<button class="kpi" type="button" data-go="perf"><span class="lab">${yf.y} 年${l}</span><span class="num dim-num">—</span><span class="sub">${yf.state === 'err' ? esc(yf.msg) : '計算中…'}</span></button>`).join('');
  const wk = weeklyOf().thisWeek;
  const quotes = docsOn() && !DATA.docs.error ? DATA.docs.newQuotes.map(docById).filter(Boolean) : [];
  const other = [];
  if (gapLeft) other.push(['群組', `${gapLeft} 個 LINE 群組還沒歸類`, 'data-go="gap"', '開始整理']);
  if (quotes.length) other.push(['報價', `${quotes.length} 份新報價單還沒對到 Ragic 案件`, 'data-goto="gap|docsSec"', '去配對']);
  if (wk.total) other.push(['行程', `${wk.label}行程：${wk.scheduled} 案已排、${wk.missing.length} 案沒排`, 'data-go="weekly"', '看每週行程']);
  const pr = typeof prospectHomeRow === 'function' ? prospectHomeRow() : null;   // 還沒簽約的客戶（oversight-prospects.js）
  if (pr) other.push(pr);
  const TOP = 8;
  const row = ({ c, t, first }) => `<div class="todo"><span class="tag">${esc(TAG_OF[t.cat] || t.cat)}</span><div class="txt"><b>${esc(c.name)}</b> ${esc(todoText(c, t))}${t.note ? `<small>待辦備註：${esc(t.note)}</small>` : first && c.notes[0] ? `<small>${noteLine(c)}</small>` : ''}</div><button class="linkish" type="button" ${todoAttrs(c, t)}>${actLabel(t)}</button></div>`;
  return `
  ${alert}
  ${S.mineOnly ? mineBar() : ''}
  <div class="kpis kpis4">
    ${yearCards}
    <button class="kpi" type="button" data-goto="dash|attnSec"><span class="lab">到期未收</span><span class="num tnum ${due ? 'red' : ''}">${money(due)}</span><span class="sub">${dueSub(mc.dueN + mc.closedN, mc.closedN)}</span></button>
    <button class="kpi" type="button" data-qf="該結案了"><span class="lab">該結案了</span><span class="num tnum">${closeN} 案</span><span class="sub">看起來做完、還沒標結案</span></button>
  </div>

  ${attnBlock(SC, closedSC.filter((c) => c.closedBalance > 0))}

  <section class="card" id="tasksSec">
    <h2>我的待辦 <small>${items.length ? `${items.length} 件・` : ''}處理完會自動消失；情況有變會自己回來</small></h2>
    ${items.slice(0, TOP).map(row).join('') || '<p class="empty-row">今天要追的事都處理完了。</p>'}
    ${items.length > TOP ? `<div class="card-foot"><button class="linkish" type="button" data-go="todo">還有 ${items.length - TOP} 件，全部看待辦事項 →</button></div>` : ''}
  </section>

  <section class="card" id="otherSec">
    <h2>其他要整理的 <small>不急，有空再處理</small></h2>
    ${other.map(([tag, text, attr, act]) => `<div class="todo"><span class="tag">${tag}</span><div class="txt">${esc(text)}</div><button class="linkish" type="button" ${attr}>${act}</button></div>`).join('') || '<p class="empty-row">沒有要整理的事。</p>'}
  </section>`;
}

/* ===================== 待辦事項（編輯者）：總覽「我的待辦」的完整版 ===================== */
// 手機寬度（≤640px，跟 CSS 斷點同一個數）：待辦事項改畫成一案一張卡，不用左右滑
const NARROW_Q = '(max-width:640px)';
const narrowScreen = () => !!(window.matchMedia && window.matchMedia(NARROW_Q).matches);
if (window.matchMedia) {   // 轉直橫、拉視窗跨過斷點時，待辦事項換另一種畫法
  const mq = window.matchMedia(NARROW_Q);
  if (mq.addEventListener) mq.addEventListener('change', () => { if (D && S.view === 'todo') render(false); });
}
function viewTodo() {
  const all = todoItems();
  const cnt = (k) => all.filter((x) => x.t.cat === k).length;
  const list = S.qFilter === 'all' ? all : all.filter((x) => x.t.cat === S.qFilter);
  const chatDoneT = D.tasks.filter((t) => t.kind === 'chat' && t.state === 'done' && byId(t.caseId));
  const doneT = D.tasks.filter((t) => t.kind !== 'chat' && t.state === 'done' && byId(t.caseId)), snoozeT = D.tasks.filter((t) => t.state === 'snooze' && byId(t.caseId));
  const gapLeft = D.orphans.length;
  const foldRow = (t, kind) => `<div class="fold-row"><div><b>${esc(t.title)}</b><span>${t.kind === 'chat' && kind === 'done' ? esc(chatDoneText(t)) : `${esc(t.doneBy || '')} ${kind === 'done' ? '先拿掉了' : `這週先不管，${md(t.until)} 再出現`}`}${t.note ? `・備註：${esc(t.note)}` : ''}</span></div>${CAN_EDIT ? chatUndoBtn(t) : ''}</div>`;
  const quick = [['all', '全部', all.length], ...CAT_LIST.slice(1).map((k) => [k, k, cnt(k)])]
    .map(([k, label, n]) => (S.qFilter === k ? `<b>${esc(label)} ${n}</b>` : `<button class="linkish" type="button" data-qf="${esc(k)}">${esc(label)} ${n}</button>`)).join('｜');
  const detail = (c, t) => {
    if (t.kind === 'doc') {
      return `<b>${t.docs.length} 份新文件待歸檔</b>${t.docs.map((d) => `<div class="doc-line"><span>${esc(d.kind)}・<button class="linkish" type="button" data-docopen="${d.id}">${esc(d.fileName)}</button>${d.amount != null ? `・NT$${money(d.amount)}` : ''}${docPaidMatch(d) ? `<small class="doc-match">${docPaidText(docPaidMatch(d))}</small>` : ''}</span>${CAN_EDIT ? `<span class="inl"><button class="btn sm" type="button" data-docarch="${d.id}">${docPaidMatch(d) ? '附到 Ragic 那筆' : '上傳到 Ragic'}</button><button class="btn sm quiet" type="button" data-docskip="${d.id}">不需要</button></span>` : ''}</div>`).join('')}`;
    }
    // 對話待辦：過約定日、快到期、拖太久的標出來（系統待辦的急迫度已寫在標題裡）
    const urg = t.kind === 'chat' && t.sev >= 2 ? ` <span class="pill ${t.color === 'red' ? 'red' : 'amber'}">${esc(t.tag)}</span>` : '';
    return `<b>${esc(todoText(c, t))}</b>${urg}<small class="why" title="${esc(t.why || '')}">${esc(t.why || '')}</small>${t.note ? `<small class="hint">待辦備註：${esc(t.note)}</small>` : ''}`;
  };
  // 這一件事自己的動作（尾款已收清、待辦備註）；這一案的動作（加備註、這週先不管）掛在案件上
  const itemBits = (c, t) => {
    const bits = [];
    if (t.kind === 'closedbal') bits.push(`<button class="btn sm" type="button" data-psettle="${esc(c.id)}" data-pname="${esc(c.name)}" data-pbal="${c.closedBalance}">尾款已收清（未入 Ragic）</button>`);
    if (t.kind === 'chat') bits.push(`<button class="linkish" type="button" data-tskip="${esc(t.key)}" title="AI 抓錯了，或這件事取消了">不用做</button>`);
    if (t.kind !== 'doc') bits.push(`<button class="linkish" type="button" data-tnote="${esc(t.key)}">${t.note ? '改備註' : '備註'}</button>`);
    return bits;
  };
  const caseBits = (c) => {
    const bits = [`<button class="linkish" type="button" data-noteopen="${esc(c.id)}">加備註</button>`];
    if (all.some((x) => x.c.id === c.id && x.t.key && x.t.kind !== 'doc')) bits.push(`<button class="linkish" type="button" data-qsnooze="${esc(c.id)}" title="這案這週的待辦先收起來，到期自己回來">這週先不管</button>`);
    return bits;
  };
  const moreBox = (bits) => (bits.length ? `<details class="more-acts"><summary>更多</summary><div class="more-body">${bits.join('')}</div></details>` : '');
  const doneBtn = (t) => (!CAN_EDIT || t.kind === 'doc' ? '' : t.kind === 'chat' ? `<button class="linkish" type="button" data-tdone="${esc(t.key)}" title="這件事做好了，從清單收起來">做完了</button>` : `<button class="linkish" type="button" data-tdone="${esc(t.key)}" title="這件事不用再追了（已經處理，或不需要處理），先從清單拿掉；情況變了會自己回來">先拿掉</button>`);
  const caseHead = (c) => `<button class="qname-btn" type="button" data-case="${esc(c.id)}"><b>${esc(c.name)}</b></button> ${typeBadge(c)}${whoLine(c, 'who', false)}${S.noteEdit === c.id ? noteBlock(c, 'row') : noteOne(c)}`;
  const whoCell = (c) => (c.closed ? '<span class="pill gray">已結案</span>' : esc(c.designer || '未指派'));
  // 同一案的多件事併成一組（案名、屋主地址、備註、負責人只在該案出現一次）；篩選之後只留符合的那幾件
  const groups = [];
  for (const x of list) { const g = groups[groups.length - 1]; if (g && g.c.id === x.c.id) g.items.push(x.t); else groups.push({ c: x.c, items: [x.t] }); }
  // 電腦：表格，案件與負責人兩格跨該案所有列
  const tableRows = (g) => g.items.map((t, i) => `<tr class="${i === 0 ? 'grp-first' : ''} ${i === g.items.length - 1 ? 'grp-last' : ''}">
    <td><span class="tag">${esc(TAG_OF[t.cat] || t.cat)}</span></td>
    ${i === 0 ? `<td class="case-cell" rowspan="${g.items.length}">${caseHead(g.c)}${CAN_EDIT ? `<div class="case-acts">${moreBox(caseBits(g.c))}</div>` : ''}</td>` : ''}
    <td class="what">${detail(g.c, t)}</td>
    ${i === 0 ? `<td rowspan="${g.items.length}">${whoCell(g.c)}</td>` : ''}
    <td class="acts"><button class="linkish main-act" type="button" ${todoAttrs(g.c, t)}>${actLabel(t)}</button>${doneBtn(t)}${CAN_EDIT ? moreBox(itemBits(g.c, t)) : ''}</td>
  </tr>`).join('');
  // 手機（≤640px）：一案一張卡。卡頭＝案名（點進案件）＋負責設計師＋最新備註；卡內一件一條：類別小標籤＋一句話＋原因小字，右邊「處理」，先拿掉、更多收小
  const cardOf = (g) => `<article class="todo-card">
    <header class="tc-head"><div class="tc-name">${caseHead(g.c)}</div><div class="tc-who">${whoCell(g.c)}${CAN_EDIT ? moreBox(caseBits(g.c)) : ''}</div></header>
    <ul class="tc-items">${g.items.map((t) => `<li class="tc-item">
      <div class="tc-main"><span class="tag">${esc(TAG_OF[t.cat] || t.cat)}</span><div class="tc-what what">${detail(g.c, t)}</div></div>
      <div class="tc-acts"><button class="btn sm main-act" type="button" ${todoAttrs(g.c, t)}>${actLabel(t)}</button><div class="tc-sub">${doneBtn(t)}${CAN_EDIT ? moreBox(itemBits(g.c, t)) : ''}</div></div>
    </li>`).join('')}</ul>
  </article>`;
  const emptyMsg = all.length ? '這一類都處理完了。' : '今天要追的事都處理完了。';
  if (whoEmpty()) return mineBar() + whoEmptyView();
  const body = narrowScreen()
    ? `<div class="todo-cards">${groups.map(cardOf).join('') || `<p class="empty-row">${emptyMsg}</p>`}</div>`
    : `<div class="card tablecard"><div class="tablewrap scroll"><table class="clean todo-tbl">
    <thead><tr><th>類別</th><th>案件</th><th>要做什麼</th><th>負責人</th><th></th></tr></thead>
    <tbody>${groups.map(tableRows).join('') || `<tr><td colspan="5" class="empty-row">${emptyMsg}</td></tr>`}</tbody>
  </table></div></div>`;
  return `
  ${mineBar()}
  <p class="finding">${all.length ? `今天要追 <b class="tnum">${dashQueue().length}</b> 案、共 <b class="tnum">${all.length}</b> 件。同一案的事排在一起，處理完會自動消失；情況有變（例如又停更了）會自己回來。` : '今天要追的事都處理完了。'}</p>
  <div class="quick" role="group" aria-label="篩選">${quick}</div>
  ${body}
  ${gapLeft ? `<p class="note-line">另有 ${gapLeft} 個 LINE 群組還沒歸類，到<button class="linkish" type="button" data-go="gap">整理群組</button>處理。</p>` : ''}
  ${chatDoneT.length ? `<details class="fold" id="chatDoneBox" ${S.openChatDone ? 'open' : ''}><summary>群組交代的事已做完 ${chatDoneT.length} 件</summary><div class="fold-list">${chatDoneT.map((t) => foldRow(t, 'done')).join('')}</div></details>` : ''}
  ${doneT.length ? `<details class="fold" id="doneBox" ${S.openDone ? 'open' : ''}><summary>先拿掉 ${doneT.length} 件</summary><div class="fold-list">${doneT.map((t) => foldRow(t, 'done')).join('')}</div></details>` : ''}
  ${snoozeT.length ? `<details class="fold" id="snoozeBox" ${S.openSnooze ? 'open' : ''}><summary>這週先不管 ${snoozeT.length} 件</summary><div class="fold-list">${snoozeT.map((t) => foldRow(t, 'snooze')).join('')}</div></details>` : ''}`;
}

/* ---------- 對話待辦做完的說明與復原按鈕（待辦事項頁摺疊區、案件頁「群組裡交代的事」共用） ---------- */
function chatDoneText(t) {
  if (t.aiClosed) return `${t.doneBy}${t.chat.doneAt ? `（${md(t.chat.doneAt)}）` : ''}${t.chat.doneQuote ? `：「${t.chat.doneQuote}」` : ''}`;
  return `${t.doneBy || ''} 標了${t.skip ? '不用做' : '做完了'}`;
}
// 群組裡說做好了的，復原＝「還沒做完」（寫標記 open）；設計師自己按的，復原＝清掉標記
const chatUndoBtn = (t) => (t.kind === 'chat' && t.aiClosed
  ? `<button class="btn" type="button" data-treopen="${esc(t.key)}" title="AI 判斷錯了，這件事其實還沒做完">還沒做完</button>`
  : `<button class="btn" type="button" data-tundo="${esc(t.key)}">復原</button>`);

/* ===================== 最近修改 ===================== */
function viewLog() {
  const logs = D.log;
  return `<section class="card"><h2>最近修改 <small>誰改了什麼都在這裡（最近 ${logs.length} 筆）</small></h2>
    <div class="logbox">
      ${logs.map((l) => `<div class="logrow"><span class="tnum">${esc(stampTW(l.at))}</span><p><b>${esc(l.who)}</b>　${esc(l.what)}${l.sync === 'pending' ? ' ' + syncTag(true) : ''}</p></div>`).join('') || '<p class="log-empty">還沒有人改過。標記結案、登記收款、加備註，都會出現在這裡。</p>'}
    </div></section>`;
}

/* ===================== 檢視者首頁（租賃部同仁） =====================
   只看得到進度與照片：沒有款項金額、沒有待辦、不能修改。首頁是「你的案子」與「找你介紹的案子」。 */
function viewerRel(c) {
  const me = D.me || (DATA.viewer && DATA.viewer.name) || '';
  if (c.homeStaff && c.homeStaff === me) return '<span class="pill accent">你的家</span>';
  if (c.intro && c.intro.names.includes(me)) return '<span class="pill accent">你介紹的</span>';
  if ([c.designer, c.take].includes(me)) return '<span class="pill accent">你負責的</span>';
  return '<span class="pill accent">你的案子</span>';
}
function viewViewerHome() {
  const all = [...CASES, ...CLOSED];
  const mine = all.filter((c) => c.mine);
  const me = (DATA.viewer && DATA.viewer.name) || '';
  const q = S.viewerQ.trim().toLowerCase();
  const hits = q ? all.filter((c) => [c.name, c.owner, c.address, '#' + c.rid].some((v) => String(v || '').toLowerCase().includes(q))) : [];
  const dept = '';
  return `
  <p class="eyebrow">${esc(me)}${dept}</p>
  <h2 class="page-title">你的案子 <span class="hl tnum">${mine.length}</span> 案</h2>
  <p class="finding">你介紹的案子、你自己的房子、你負責的案子，都會出現在這裡。找不到的話，用下面的搜尋找到它，按「這是我介紹的」。</p>
  <section class="sec">
    ${mine.map((c) => `<div class="vcase" role="button" tabindex="0" data-case="${esc(c.id)}">
      <div class="qname"><b>${esc(c.name)}</b>${typeBadge(c)}${viewerRel(c)}${c.closed ? '<span class="pill gray">已結案</span>' : c.status === '暫停' ? '<span class="pill amber">暫停</span>' : ''}</div>${whoLine(c)}
      <div style="margin-top:10px">${miniTrack(c)}</div>
      <p class="hint" style="margin-top:6px">${c.cur ? `做到 ${esc(c.cur)} ・ ` : ''}完成 ${pctText(c)} ・ ${c.last ? `最後照片 ${md(c.last)}（${c.days} 天前）` : c.weekly.last ? `依 Ragic 週報（${md(c.weekly.last)}）` : '還沒有進度資料'}</p>
    </div>`).join('') || '<p class="empty">還沒有掛在你名下的案子。用下面的搜尋找到你介紹的案子，按「這是我介紹的」。</p>'}
  </section>
  <section class="sec">
    <h3 class="blk-title">找你介紹的案子</h3>
    <div class="field" style="margin-top:10px"><label for="vSearch">輸入案名、屋主或地址</label><input class="inp" id="vSearch" type="search" value="${esc(S.viewerQ)}" placeholder="例如：正義北路、謝先生" autocomplete="off"></div>
    ${q ? `<div class="sres">${hits.slice(0, 20).map((c) => `<div class="r"><div><b>${esc(c.name)}</b>${whoLine(c)}</div>${c.mine ? '<span class="pill accent">已是你的</span>' : `<button class="btn sm" type="button" data-claim="${esc(c.id)}">這是我介紹的</button>`}</div>`).join('') || '<p class="hint" style="padding:10px 0">找不到。可能還沒在 Ragic 建檔，請跟芳芳說。</p>'}${hits.length > 20 ? `<p class="hint" style="padding:8px 0">還有 ${hits.length - 20} 筆，請輸入更完整的關鍵字。</p>` : ''}</div>` : ''}
  </section>`;
}
