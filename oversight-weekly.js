'use strict';
// 設計部監督總覽｜每週行程畫面（模組：週報填寫狀況表、案件頁每週軌道、頁首一行摘要）
// 依賴 oversight.js、oversight-views.js 的全域。資料來自伺服器 dash.weekly 與每案 weeks（lib/oversight-weekly.js 算好）。

/* ===================== 每週行程（設計師有沒有填 Ragic 週報） ===================== */
const WD = '日一二三四五六';
const wdOf = (d) => '週' + WD[new Date(ts(d)).getUTCDay()];
const weekHead = (mon) => `${md(mon)} 週`;
const fillText = (d) => (d ? `${md(d)} ${wdOf(d)}` : '填寫日不明');
const abbr = (names) => (names && names.length ? names.map((n) => n.slice(0, 1)).join('') : '?');
const FIRST_FRIDAY_UI = '2026-10-23';   // 與 lib/oversight-model.js 的 FIRST_FRIDAY 同步
function weekTitle(w) {
  return w.filled ? `${weekHead(w.mon)}｜${w.by.join('、') || '記錄人空白'}｜${fillText(w.upd)} 填｜${w.text || '（沒寫內容）'}` : `${weekHead(w.mon)}｜這週沒有人填`;
}

/* 依目前的設計師切換篩過的每週行程：只留他負責的案子，記錄人列、格子數字、沒人填、本週摘要都重算（全設計部＝伺服器原樣） */
function weeklyOf() {
  const W = D.weekly;
  if (S.who === WHO_ALL) return W;
  const keep = (e) => !!byId(e.caseId);
  const rows = W.rows.map((r) => {
    const cells = {}; let total = 0;
    for (const [mon, c] of Object.entries(r.cells)) {
      const entries = c.entries.filter(keep);
      if (!entries.length) continue;
      const fills = [...new Set(entries.map((e) => e.upd).filter(Boolean))].sort();
      cells[mon] = { ...c, n: entries.length, entries, fills, fill: fills.at(-1) || null };
      total += entries.length;
    }
    return { ...r, cells, total, targetN: cells[W.target] ? cells[W.target].n : 0 };
  }).filter((r) => r.total > 0);
  const noOne = {};
  for (const [mon, c] of Object.entries(W.noOne)) { const entries = c.entries.filter(keep); if (entries.length) noOne[mon] = { ...c, n: entries.length, entries }; }
  const T = W.thisWeek, tEntries = rows.flatMap((r) => (r.cells[W.target] ? r.cells[W.target].entries : []));
  const byWho = rows.filter((r) => r.targetN).map((r) => ({ who: r.who, n: r.targetN })).sort((a, b) => b.n - a.n);
  const fills = tEntries.map((e) => e.upd).filter(Boolean).sort();
  const thisWeek = {
    ...T, scheduled: new Set(tEntries.map((e) => e.caseId)).size, total: CASES.filter((c) => c.status === '工程中' || c.status === '暫停').length,
    byWho, fill: fills.at(-1) || null, missing: T.missing.filter(keep),
  };
  return { ...W, rows, noOne, thisWeek };
}

/* 每週行程頁最上面一行：本週行程已排幾案、誰填的、幾案沒排；後面接「本週進場」（過去 7 天有工項進場的案子，原本在首頁，2026-11-05 搬來） */
function weekLine() {
  const t = weeklyOf().thisWeek;
  if (!t.total) return '';
  const who = t.byWho.map((x) => `${esc(x.who)} ${x.n}`).join('、');
  const weekStart = addDays(TODAY, -6);
  const entered = scopeCases().filter((c) => c.items.some((x) => x.start && !x.inferred && ts(x.start) >= ts(weekStart) && ts(x.start) <= ts(TODAY)));
  return `<div class="wkline">
    <span><b>${t.label}行程</b>（${weekHead(t.mon)}）：${t.scheduled} 案已排${t.scheduled ? `（${who}${t.fill ? '，' + md(t.fill) + ' 填' : ''}）` : ''}</span>
    <span class="${t.missing.length ? 'bad' : ''}">${t.missing.length ? `${t.missing.length} 案沒排` : '全部都排了'}</span>
    <span>本週進場 ${entered.length} 案${entered.length ? '：' + esc(trunc(entered.map((c) => c.name).join('、'), 24)) : ''}</span></div>`;
}

function viewWeekly() {
  const W = weeklyOf(), t = W.thisWeek;
  const open = S.wkOpen ? S.wkOpen.split('|') : null;
  const cell = (key, c, kind) => {
    if (!c) return '<td class="wkc none">—</td>';
    const on = S.wkOpen === key;
    return `<td class="wkc"><button type="button" class="wkcell ${kind} ${on ? 'on' : ''}" data-wkcell="${esc(key)}" aria-expanded="${on}"><b class="tnum">${c.n} 案</b>${kind === 'noone' ? '<span>沒人填</span>' : `<span class="tnum">${esc(fillText(c.fill))}</span>`}</button></td>`;
  };
  const thead = `<tr><th>記錄人</th>${W.weeks.map((m) => `<th class="${m === W.target ? 'cur' : ''}">${weekHead(m)}${m === W.target ? `<small>${t.label}</small>` : ''}</th>`).join('')}</tr>`;
  const body = W.rows.map((r) => `<tr><th scope="row">${esc(r.who)}<small>最近 8 週共 ${r.total} 案次</small></th>${W.weeks.map((m) => cell(`${r.who}|${m}`, r.cells[m], 'who')).join('')}</tr>`).join('')
    + `<tr class="noone"><th scope="row">沒有人填<small>該週案件已存在、Ragic 沒有行程列</small></th>${W.weeks.map((m) => cell(`@noone|${m}`, W.noOne[m], 'noone')).join('')}</tr>`;
  let panel = '';
  if (open) {
    const [who, mon] = open;
    const c = who === '@noone' ? W.noOne[mon] : (W.rows.find((r) => r.who === who) || { cells: {} }).cells[mon];
    if (c) {
      panel = `<div class="wkpanel" id="wkPanel"><h3>${who === '@noone' ? '沒有人填' : esc(who)}・${weekHead(mon)}・${c.n} 案</h3>
        ${c.entries.map((e) => {
          const cs = byId(e.caseId);
          return `<div class="wkentry"><div><b>${esc(e.name)}</b>${e.status === '暫停' ? ' <span class="pill amber">暫停</span>' : ''}${cs ? whoLine(cs) : ''}</div>
            <p>${who === '@noone'
              ? (e.last ? `最後一筆：${md(e.last.start)} ${wdOf(e.last.start)}（${esc(e.last.by || '記錄人空白')}）${esc(e.last.text || '')}` : 'Ragic 從來沒有週報')
              : `${e.upd ? esc(fillText(e.upd)) + ' 填' : '填寫日不明'}　${esc(e.text || '（沒寫內容）')}`}</p>
            <button class="btn" type="button" data-case="${esc(e.caseId)}" data-csec="timeline">看這案</button></div>`;
        }).join('')}</div>`;
    }
  }
  const miss = t.missing.map((m) => {
    const cs = byId(m.caseId);
    return `<div class="gapitem"><div><h3>${esc(m.name)}${m.status === '暫停' ? ' <span class="pill amber">暫停</span>' : ''}</h3>${cs ? whoLine(cs) : ''}
      <p>${m.last ? `最後一筆：${md(m.last.start)} ${wdOf(m.last.start)}${m.last.upd ? `（${md(m.last.upd)} 填）` : ''}・${esc(m.last.by || '記錄人空白')}　${esc(m.last.text || '（沒寫內容）')}` : 'Ragic 從來沒有任何週報'}</p></div>
      <div class="acts"><button class="btn" type="button" data-case="${esc(m.caseId)}" data-csec="timeline">看這案</button></div></div>`;
  }).join('');
  return `${weekLine()}<section class="sec">
    ${head('每週行程', '設計師有沒有填 Ragic 每週工程進度', '設計部每週五開會後，在 Ragic 工程進度的週報填下週一到五的行程。這張表看每位記錄人、每一週填了幾案、哪天填的。點格子看是哪幾案、當週寫了什麼。')}
    <div class="tablewrap scroll"><table class="wktbl"><thead>${thead}</thead><tbody>${body}</tbody></table></div>
    ${panel}
    <p class="note" style="margin-top:12px">只算行程列，請款、追加這類列不算。表格從每週五會議之後才把該週算成「沒人填」；待辦提醒（要追的事）則是從 ${md(FIRST_FRIDAY_UI)} 之後的週五才開始跳。</p>
  </section>
  <section class="sec">
    ${head(`${t.label}（${weekHead(t.mon)}）`, `${t.label}沒排行程的案件`, `工程中與暫停中共 ${t.total} 案，已排 ${t.scheduled} 案。`, `<span class="pill ${t.missing.length ? 'amber' : 'gray'}">${t.missing.length} 案</span>`)}
    <div class="gaplist">${miss || '<p class="empty">每個案子都排了。</p>'}</div>
  </section>`;
}

/* 案件頁「時程」下方：每週一個小方塊，有填實心（標記錄人縮寫），沒填空格 */
function weeksTrack(c) {
  const ws = c.weeks;
  const target = D.weekly.target;
  if (!ws.length) return '<div class="wk-sec"><h3 class="wk-h">每週行程（Ragic 週報）</h3><p class="note">這案沒有合約開始日，Ragic 也沒有任何週報列，畫不出每週軌道。</p></div>';
  const filledN = ws.filter((w) => w.filled).length;
  return `<div class="wk-sec">
    <h3 class="wk-h">每週行程（Ragic 週報）<span class="wk-sum">${ws.length} 週中 ${filledN} 週有填</span></h3>
    <p class="blk-sub">實心＝設計師有填那一週的行程，方塊裡是記錄人；空格＝沒填。停在某週之後都是空格，就是那之後沒再填。滑過或點方塊看內容。</p>
    <div class="wk-track" role="list">${ws.map((w) => `<button type="button" role="listitem" class="wk-item" data-wkc="${esc(c.id)}|${w.mon}" title="${esc(weekTitle(w))}" aria-label="${esc(weekTitle(w))}">
      <span class="wsq ${w.filled ? 'on' : ''} ${w.mon === target ? 'cur' : ''}">${w.filled ? esc(abbr(w.by)) : ''}</span><small class="tnum">${md(w.mon)}</small></button>`).join('')}</div>
    <p class="note wk-detail" id="wkDetail">點上面的方塊，這裡會顯示當週內容、記錄人、填寫日。</p>
  </div>`;
}
function showWeekDetail(cid, mon) {
  const c = byId(cid), el = document.getElementById('wkDetail'); if (!c || !el) return;
  const w = c.weeks.find((x) => x.mon === mon); if (!w) return;
  document.querySelectorAll('.wk-item .wsq').forEach((q) => q.classList.remove('sel'));
  const sq = [...document.querySelectorAll('.wk-item')].find((b) => b.dataset.wkc === cid + '|' + mon);
  if (sq) sq.querySelector('.wsq').classList.add('sel');
  el.innerHTML = w.filled
    ? `<b>${weekHead(w.mon)}</b>　記錄人：${esc(w.by.join('、') || '空白')}　填寫日：${esc(fillText(w.upd))}<br>${esc(w.text || '（沒寫內容）')}`
    : `<b>${weekHead(w.mon)}</b>　這週沒有人填。`;
}
