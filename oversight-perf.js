'use strict';
// 設計部監督總覽｜業績模組 + 儀表板「款項總覽」（2026-10-20，Joan：「我還要算設計部的業績，全年度業績是多少」）
// 依賴 oversight.js、oversight-views.js 的全域：D、S、CASES、ALL_CASES、PERF、$、esc、money、md、head、api、onAuthError。
// 業績資料來自 /oversightPerf（lib/oversight-perf.js 算好；只有編輯者拿得到，檢視者伺服器直接 403），這裡只負責畫。
// 款項總覽用的是 /oversightData 每案的 fin（合約金額＝原合約＋已簽追加）、paidTotal（累計已收）、dueAmt（到期未收）。

const GRP_ALL = '全設計部';
const fullDate = (d) => (d ? d.replace(/-/g, '/') : '—');
const SRC_LABEL = { manual: '人工設定', ragic_sign: 'Ragic 簽約日', contract: '合約檔', ragic_start: 'Ragic 施工起日', created: '建檔日（備援）' };
// 簽約日顯示：只填到月的標「日未確認」
const signText = (r) => (!r.signDate ? '' : r.signApprox ? `${r.signDate.slice(0, 4)} 年 ${Number(r.signDate.slice(5, 7))} 月（日未確認）` : fullDate(r.signDate));
const signCur = (r) => (r.signSrc === 'manual' || r.signSrc === 'ragic_sign' ? (r.signApprox ? r.signDate.slice(0, 7) : r.signDate) : '');
const attr = (s) => esc(String(s ?? ''));

/* ===================== 儀表板：款項總覽 ===================== */
// 進行中＝工程中＋暫停中。合約金額＝原合約＋已簽追加（追加減已扣）。未到期＝合約金額 − 累計已收 − 到期未收（每案算完再加總，多收的案子不會抵掉別案）
// 到期未收全站同一個口徑（2026-11-11）：進行中已到期的款＋已結案還沒收的尾款。list 可以含已結案的案子，只取它們的尾款
function moneyCalc(list) {
  const L = list.filter((c) => c.status === '工程中' || c.status === '暫停');
  const C = list.filter((c) => c.closed && c.closedBalance > 0);
  const r = { n: L.length, working: L.filter((c) => c.status === '工程中').length, paused: L.filter((c) => c.status === '暫停').length, fin: 0, paid: 0, due: 0, fut: 0, noTotal: 0, noTotalAll: 0, extra: 0, uns: 0, dueN: L.filter((c) => c.dueAmt > 0).length, closedDue: 0, closedN: C.length };
  for (const c of L) {
    r.paid += c.paidTotal || 0; r.due += c.dueAmt || 0;
    if (c.fin && c.fin.final != null) { r.fin += c.fin.final; r.fut += Math.max(0, c.fin.final - (c.paidTotal || 0) - (c.dueAmt || 0)); r.extra += c.fin.add - c.fin.cut; r.uns += c.fin.unsigned || 0; } else r.noTotal++;
  }
  // 已結案還在收尾款的案子：合約金額、累計已收也算進來，跟下方「收了沒」逐案加總對得起來
  for (const c of C) { r.closedDue += c.closedBalance; r.paid += c.paidTotal || 0; if (c.fin && c.fin.final != null) r.fin += c.fin.final; else r.noTotalAll++; }
  r.noTotalAll += r.noTotal;
  r.dueAll = r.due + r.closedDue;
  return r;
}
// 到期未收的小字：幾案、其中幾案是已結案的尾款（首頁、款項頁、業績頁共用同一句）
const dueSub = (n, closedN) => (n ? `${n} 案${closedN ? `（含已結案尾款 ${closedN} 案）` : ''}` : '沒有到期未收');
function moneyOverview() {
  const cur = moneyCalc([...CASES, ...CLOSED]);
  const cols = [[WHO_ALL, GRP_ALL], ...D.dsgList.map((w) => [w, w])];
  const other = ALL_CASES.filter((c) => c.dsg === D.dsgOther);
  const calcs = cols.map(([w]) => moneyCalc(w === WHO_ALL ? ALL_CASES : ALL_CASES.filter((c) => c.dsg === w)));
  const oc = moneyCalc(other);
  if (oc.n) { cols.push([null, D.dsgOther]); calcs.push(oc); }
  const stillN = cur.n + cur.closedN;   // 還在收錢＝進行中（工程中＋暫停）加已結案尾款沒收齊的，全頁只用這一個案數
  const pct = (n) => (cur.fin ? Math.round((n / cur.fin) * 100) : 0);
  const cell = (lab, num, sub, cls = '') => `<div class="mo-kpi ${cls}"><span class="lab">${lab}</span><span class="num tnum">${num}</span><span class="sub">${sub}</span></div>`;
  const row = (lab, f) => `<tr><th scope="row">${lab}</th>${calcs.map((c, i) => `<td class="num tnum ${cols[i][0] === S.who ? 'cur' : ''}">${f(c)}</td>`).join('')}</tr>`;
  return `<section class="sec money-ov" id="moneyOv">
    <div class="lead-head"><div><h3 class="blk-title">款項總覽${S.who === WHO_ALL ? '' : `・${esc(S.who)}`}</h3>
      <p class="blk-sub">${stillN} 案還在收錢（工程中 ${cur.working}、暫停 ${cur.paused}、已結案尾款 ${cur.closedN}）${cur.noTotalAll ? `，其中 ${cur.noTotalAll} 案沒有合約金額、沒算進合約總額` : ''}。不分哪一年簽約。合約總額＝原合約＋已簽追加；未到期＝合約總額 − 累計已收 − 到期未收。</p></div></div>
    <div class="mo-grid">
      <div class="mo-kpis">
        ${cell('還在收錢的案子', `${stillN}<small> 案</small>`, `工程中 ${cur.working}、暫停 ${cur.paused}、已結案尾款 ${cur.closedN}`)}
        ${cell('還在收錢的案子：合約總額', `<small>NT$</small>${money(cur.fin)}`, (cur.extra ? `含已簽追加 ${cur.extra > 0 ? '+' : '−'}${money(Math.abs(cur.extra))}` : '沒有追加款') + (cur.uns ? `；另有待簽名 ${money(cur.uns)} 不算` : ''))}
        ${cell('累計已收', `<small>NT$</small>${money(cur.paid)}`, cur.fin ? `佔合約總額 ${pct(cur.paid)}%` : '—')}
        ${cell('到期未收', `<small>NT$</small>${money(cur.dueAll)}`, dueSub(cur.dueN + cur.closedN, cur.closedN), cur.dueAll ? 'red' : '')}
        ${cell('未到期', `<small>NT$</small>${money(cur.fut)}`, cur.fin ? `佔合約總額 ${pct(cur.fut)}%` : '—')}
      </div>
      <div class="tablewrap scroll mo-cmp"><table aria-label="全設計部與兩位設計師的款項比較">
        <thead><tr><th></th>${cols.map(([w, label], i) => `<th class="num ${w === S.who ? 'cur' : ''}">${w ? `<button type="button" data-who="${esc(w)}" title="切換到${esc(label)}">${esc(label)}</button>` : esc(label)}</th>`).join('')}</tr></thead>
        <tbody>
          ${row('還在收錢的案數', (c) => `${c.n + c.closedN} 案`)}
          ${row('合約總額', (c) => money(c.fin))}
          ${row('累計已收', (c) => money(c.paid))}
          ${row('到期未收', (c) => (c.dueAll ? `<b class="bad">${money(c.dueAll)}</b>` : '0'))}
          ${row('未到期', (c) => money(c.fut))}
        </tbody></table></div>
    </div>
    ${cur.noTotalAll ? `<p class="note" style="margin-top:10px">沒有合約金額的 ${cur.noTotalAll} 案（Ragic「合約總價款」空白、也沒讀到合約檔），沒算進合約總額，累計已收仍有計入。</p>` : ''}
  </section>`;
}

/* ===================== 款項（原本首頁的「款項總覽」「收了沒」搬來） ===================== */
// 收了沒：每案累計已收／到期未收／未到期，照比例畫成一條。已結案還沒收齊尾款的也列（2026-11-11 起跟首頁同一個到期未收）
// 未到期以合約金額為準（跟上面款項總覽同一條）：合約金額 − 累計已收 − 到期未收。
// 2026-11-11 真資料：沒有分期表的案子（#28、#31、#38）與分期加總有尾差的案子（#51 差 5,000），用分期算會跟上面對不起來
const futOf = (c) => (c.closed ? 0 : c.fin && c.fin.final != null ? Math.max(0, c.fin.final - (c.paidTotal || 0) - (c.dueAmt || 0)) : c.futAmt);
function moneyByCase() {
  const closedSC = (S.mineOnly ? CLOSED.filter((c) => c.mine) : CLOSED).filter((c) => c.closedBalance > 0);
  const SC = [...scopeCases(), ...closedSC];
  const dueAll = SC.reduce((s, c) => s + c.dueAmt, 0);
  const paidAll = SC.reduce((s, c) => s + c.paidAmt, 0), futAll = SC.reduce((s, c) => s + futOf(c), 0), unsignedAll = SC.reduce((s, c) => s + (c.unsignedAmt || 0), 0), totalAll = paidAll + dueAll + futAll;
  const dueCases = SC.filter((c) => c.dueAmt > 0);
  const moneyCases = SC.filter((c) => c.paidAmt + c.dueAmt + futOf(c) > 0).sort((a, b) => b.dueAmt - a.dueAmt || (b.paidAmt + b.dueAmt + futOf(b)) - (a.paidAmt + a.dueAmt + futOf(a)));
  const pctOf = (n) => (totalAll ? (n / totalAll) * 100 : 0);
  return `<section class="sec money-sec" id="moneySec">
    <div class="lead-head"><div><h3 class="blk-title">收了沒</h3><p class="blk-sub">下面列的 ${moneyCases.length} 案（有金額可算的），合約總額共 NT$${money(totalAll)}，照比例分成累計已收、到期未收、未到期。${closedSC.length ? `已結案還沒收齊尾款的 ${closedSC.length} 案也列在裡面。` : ''}</p></div></div>
    <div class="money-total">
      <div class="mt-figs">
        <div><span class="lab"><i class="sw paid"></i>累計已收</span><b class="tnum">NT$${money(paidAll)}</b><small class="tnum">${Math.round(pctOf(paidAll))}%</small></div>
        <div class="due"><span class="lab"><i class="sw due"></i>到期未收</span><b class="tnum">NT$${money(dueAll)}</b><small class="tnum">${esc(dueCases.map((c) => c.name).join('、') || '—')}</small></div>
        <div><span class="lab"><i class="sw fut"></i>未到期</span><b class="tnum">NT$${money(futAll)}</b><small class="tnum">${Math.round(pctOf(futAll))}%</small></div>
        ${unsignedAll ? `<div class="unsigned"><span class="lab">追加單待簽名（不算在上面）</span><b class="tnum">NT$${money(unsignedAll)}</b><small class="tnum">${esc(SC.filter((c) => c.unsignedAmt > 0).map((c) => c.name).join('、'))}</small></div>` : ''}
      </div>
      <div class="stack big" aria-hidden="true"><i class="paid" style="width:${pctOf(paidAll)}%"></i><i class="due" style="width:${pctOf(dueAll)}%"></i><i class="fut" style="width:${pctOf(futAll)}%"></i></div>
    </div>
    <div class="money">
      ${moneyCases.slice(0, S.moneyCap).map((c) => {
        const tot = c.paidAmt + c.dueAmt + futOf(c);   // 標題金額＝這條加起來（合約＋已簽追加），不再只寫原合約
        return `<div class="money-row" data-case="${esc(c.id)}" data-csec="pay" role="button" tabindex="0">
          <div class="money-name"><span>${esc(c.name)}${c.closed ? ' <span class="pill gray">已結案</span>' : c.status === '暫停' ? ' <span class="pill amber">暫停</span>' : ''}</span><span>合約金額 NT$${money(tot)}</span></div>
          <div class="stack" aria-hidden="true"><i class="paid" style="width:${c.paidAmt / tot * 100}%"></i><i class="due" style="width:${c.dueAmt / tot * 100}%"></i><i class="fut" style="width:${futOf(c) / tot * 100}%"></i></div>
          <div class="money-legend"><span>累計已收 <b>${money(c.paidAmt)}</b></span>${c.dueAmt ? `<span class="due">${c.closed ? '尾款未收' : '到期未收'} <b>${money(c.dueAmt)}</b></span>` : ''}${c.closed ? '' : `<span>未到期 <b>${money(futOf(c))}</b></span>`}${c.unsignedAmt ? `<span class="unsigned">待簽名 <b>${money(c.unsignedAmt)}</b>（不算）</span>` : ''}</div>
        </div>`;
      }).join('') || '<p class="empty">沒有款項資料。</p>'}
    </div>
    ${moneyCases.length > S.moneyCap ? `<button class="btn more" type="button" data-more="money">看全部 ${moneyCases.length} 案款項</button>` : ''}
  </section>`;
}
function viewMoney() {
  if (S.mineOnly && !scopeCases().length) return mineBar() + mineEmpty();
  if (whoEmpty()) return mineBar() + whoEmptyView();
  return `${mineBar()}${moneyOverview()}${moneyByCase()}`;
}

/* ===================== 業績 ===================== */
async function loadPerf() {
  if (PERF_LOADING || PERF || PERF_ERR) return;
  PERF_LOADING = true;
  try { PERF = (await api('/oversightPerf')).perf; } catch (e) {
    if (onAuthError(e)) { PERF_LOADING = false; return; }
    PERF_ERR = e.status === 403 ? '業績只有編輯者看得到。' : `業績載入失敗（${e.status || '網路'}）。`;
  }
  PERF_LOADING = false;
  if (S.view === 'perf' || S.view === 'dash') render(false);   // 首頁上方也有今年業績一排
}

// 總覽上方的「今年合約金額／實收金額」兩張卡（瓊安 2026-11-05：合約金額＝今年簽的約；實收＝今年真的收到的錢，往年簽的也算）。只有編輯者看得到
// 回傳 { y, state: 'loading'|'err'|'ok', msg, s, split(f), oldRecv }；業績資料還沒載入時順手去載（載完會重畫）
function yearFigures() {
  const y = TODAY.slice(0, 4);
  if (!PERF) {
    if (!PERF_ERR) loadPerf();
    return { y, state: PERF_ERR ? 'err' : 'loading', msg: PERF_ERR };
  }
  const B = PERF.byYear[y];
  if (!B) return { y, state: 'err', msg: '還沒有這一年的資料' };
  const key = S.who === WHO_ALL ? '全設計部' : (B.sums[S.who] ? S.who : '其他');
  const s = B.sums[key];
  const mine = (r) => S.who === WHO_ALL || r.designer === S.who || (key === '其他' && !D.dsgList.includes(r.designer));
  const oldRecv = B.detail.filter((r) => mine(r) && !r.signedThisYear).reduce((t, r) => t + (r.paidYear || 0), 0);
  // 瓊安 2026-11-05：合資、獨資、自購也占設計師時間，要算進總數，但分開寫出來，免得業績看起來虛高
  const split = (f) => {
    const T = B.sumsByType?.[key];
    const parts = T ? PERF.caseTypes.filter((t) => T[t]?.[f] > 0) : [];
    if (!parts.length || (parts.length === 1 && parts[0] === '設計')) return '';
    return `<span class="sub">${parts.map((t) => `${t === '設計' ? '設計案' : t} ${wan(T[t][f])}`).join('・')}</span>`;
  };
  return { y, state: 'ok', s, split, oldRecv };
}

// 圖表刻度：最大值往上取「好讀的整數」，分 4 格
function niceAxis(max) {
  if (!(max > 0)) return { top: 1000000, step: 250000 };
  const raw = max / 4, pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 1.5, 2, 2.5, 4, 5, 10].map((m) => m * pow).find((x) => x >= raw);
  return { top: step * 4, step };
}
const wan = (n) => (n >= 1e8 ? `${+(n / 1e8).toFixed(2)}億` : `${(+(n / 1e4).toFixed(1)).toLocaleString('en-US')}萬`);

function perfChart(y, groups) {
  const byType = S.perfStack === 'type';
  const mons = PERF.byYear[y].monthly.map((m) => (byType ? { ...m, ...m.types } : m));
  if (byType) groups = PERF.caseTypes.filter((t) => mons.some((m) => m[t]));
  const max = Math.max(0, ...mons.map((m) => m.total));
  const ax = niceAxis(max);
  const ticks = [0, 1, 2, 3, 4].map((i) => i * ax.step);
  const cls = byType ? { 設計: 'a', 合資: 'b', 獨資: 'c', 小吳哥自購: 'd' } : { [PERF.designers[0]]: 'a', [PERF.designers[1]]: 'b', 其他: 'c' };
  const bars = mons.map((m) => {
    const segs = groups.map((g) => (m[g] ? `<i class="s-${cls[g]}" style="flex:${m[g]} 0 0" title="${esc(g)} ${money(m[g])}"></i>` : '')).join('');
    const tip = `${m.m} 月實收 NT$${money(m.total)}${groups.map((g) => (m[g] ? `（${g} ${money(m[g])}）` : '')).join('')}`;
    return `<div class="pc-col" title="${esc(tip)}">
      ${m.total ? `<span class="pc-val tnum" style="bottom:calc(${(m.total / ax.top) * 100}% + 3px)">${wan(m.total)}</span><div class="pc-stack" style="height:${(m.total / ax.top) * 100}%">${segs}</div>` : ''}
      <span class="pc-mon">${m.m}月</span></div>`;
  }).join('');
  const label = `${y} 年每月實收：` + mons.map((m) => `${m.m} 月 ${money(m.total)}`).join('、');
  return `<div class="pchart">
    <div class="pc-y" aria-hidden="true">${ticks.map((t) => `<span style="bottom:${(t / ax.top) * 100}%">${t === 0 ? '0' : wan(t)}</span>`).join('')}</div>
    <div class="pc-plot" role="img" aria-label="${esc(label)}">
      ${ticks.map((t) => `<div class="pc-grid" style="bottom:${(t / ax.top) * 100}%"></div>`).join('')}
      <div class="pc-bars">${bars}</div>
    </div>
  </div>
  <div class="pc-legend">${groups.map((g) => `<span><i class="sw s-${cls[g]}"></i>${esc(g)}</span>`).join('')}<span class="dim">刻度單位：萬元（NT$）</span></div>
  ${max ? '' : '<p class="note" style="margin-top:8px">這一年沒有任何一筆有匯款時間的收款。</p>'}`;
}

// 今年合約金額算哪幾案：今年簽約、而且有合約金額（跟伺服器 sums.signedN 同一條，卡片與表尾才會是同一個案數）
const soldOf = (r) => r.signedThisYear && r.final != null;
function perfRows(y) {
  let rows = PERF.byYear[y].detail.filter((r) => S.who === WHO_ALL || r.designer === S.who);
  const { key, dir } = S.perfSort;
  const val = (r) => ({ caseType: PERF.caseTypes.indexOf(r.caseType), name: r.name, owner: r.owner, designer: r.designer, signDate: r.signDate || '', contract: r.contract ?? -1, add: r.add, cut: r.cut, final: r.final ?? -1, paidYear: r.paidYear, status: r.status })[key];
  return rows.sort((a, b) => { const x = val(a), z = val(b); return (typeof x === 'string' ? x.localeCompare(z, 'zh-Hant') : x - z) * dir || a.name.localeCompare(b.name, 'zh-Hant'); });
}

// 依案件類型分欄：設計案一欄，合資、獨資、小吳哥自購各一欄，最後一欄是全部類型合計（＝加總，數字跟沒分類之前的總數一致）
// 範圍跟著頂列設計師切換（全設計部／沈郁雯／呂鴻墀）
function typeTable(y, B) {
  const g = S.who === WHO_ALL ? GRP_ALL : S.who;
  if (!B.sumsByType[g]) return '';
  const T = PERF.caseTypes, st = B.sumsByType[g], dn = PERF.dueNow[g].byType;
  const sum = (f) => T.reduce((t, k) => t + f(k), 0);
  const row = (lab, f, fmt = (v) => `NT$${money(v)}`, bad = false) => `<tr><th scope="row">${lab}</th>${T.map((k) => `<td class="num tnum">${fmt(f(k))}</td>`).join('')}<td class="num tnum"><b class="${bad && sum(f) ? 'bad' : ''}">${fmt(sum(f))}</b></td></tr>`;
  return `<div class="perf-block">
    <h3 class="blk-title">${y} 年依案件類型分欄・${esc(g)}</h3>
    <p class="blk-sub">設計案是一般客戶的設計案；合資、獨資、小吳哥自購投資各自一欄，不混進設計案的總數。最右欄是全部類型加總。</p>
    <div class="tablewrap scroll"><table class="perf-tbl type-sum" aria-label="依案件類型的業績">
      <thead><tr><th></th>${T.map((k) => `<th class="num">${esc(k)}${k === '設計' ? '案' : ''}</th>`).join('')}<th class="num">全部合計</th></tr></thead>
      <tbody>
        ${row(`${y} 年簽的合約`, (k) => st[k].signed)}
        ${row('　簽約案數', (k) => st[k].signedN, (v) => `${v} 案`)}
        ${row(`${y} 年收進來的錢`, (k) => st[k].received)}
        ${row('到期未收（不分年）', (k) => dn[k].total, undefined, true)}
      </tbody></table></div></div>`;
}

// 明細表尾：每一種案件類型各一列小計（只列有案子的類型），再接總合計——不同類型不混在同一個小計裡
function typeFoot(rows, y) {
  const sumOf = (arr, k) => arr.reduce((t, r) => t + (r[k] || 0), 0);
  const kinds = PERF.caseTypes.filter((t) => rows.some((r) => r.caseType === t));
  if (kinds.length < 2) return '';
  return kinds.map((t) => {
    const all = rows.filter((r) => r.caseType === t), sold = all.filter(soldOf);
    return `<tr><th colspan="5">小計・${esc(t)}（今年簽約 ${sold.length} 案）</th><td class="num tnum">${money(sumOf(sold, 'contract'))}</td><td class="num tnum">${money(sumOf(sold, 'add'))}</td><td class="num tnum">−${money(sumOf(sold, 'cut'))}</td><td class="num tnum"><b>${money(sumOf(sold, 'final'))}</b></td><td class="num tnum"><b>${money(sumOf(all, 'paidYear'))}</b></td><td></td><td></td></tr>`;
  }).join('');
}

function dqBlock() {
  const q = PERF.dq;
  const list = (arr, f = (x) => '', act = () => '') => arr.map((x) => `${esc(x.name)}${f(x)}${act(x)}`).join('、');
  const signBtn = (x) => ` <button class="linkish" type="button" data-psign="${attr(x.id)}" data-pname="${attr(x.name)}">設定簽約日</button>`;
  const settleBtn = (x) => `${signBtn(x)} <button class="linkish" type="button" data-psettle="${attr(x.id)}" data-pname="${attr(x.name)}" data-pbal="${attr(x.balance)}">尾款已收清（未入 Ragic）</button>`;
  const undoBtn = (x) => ` <button class="linkish" type="button" data-punsettle="${attr(x.id)}" data-pname="${attr(x.name)}">復原</button>`;
  const items = [
    [q.noSign, '沒有簽約日（合約檔、Ragic 施工起日、建檔日都沒有）', '不會算進任何一年的合約金額', () => '', signBtn],
    [q.signFromCreated, '簽約日只能用 Ragic 建檔日', '舊案的建檔日多半是匯入日（2025/12、2026/01），可能不準；可以人工設定簽約日', (x) => `（${fullDate(x.date)}${x.final != null ? '・' + money(x.final) : ''}）`, signBtn],
    [q.signManual, '簽約日是人工設定的', '已寫回 Ragic「簽約日」欄；只到月的寫在 Ragic 備註', (x) => `（${x.date.length === 7 ? x.date.slice(0, 4) + ' 年 ' + Number(x.date.slice(5)) + ' 月（日未確認）' : fullDate(x.date)}）`, signBtn],
    [q.noContractTotal, '合約金額空白', '合約金額算不出來，不計入', (x) => (x.paid ? `（已收 ${money(x.paid)}）` : '')],
    [q.contractFromFile, '合約金額 Ragic 空白、改用合約檔讀到的總價', 'AI 讀合約檔，請核對', (x) => `（${money(x.contract)}）`],
    [q.takeEmpty, '接案人空白（退回看監工）', '', (x) => `（${esc(x.designer)}）`],
    [q.noDesigner, '接案人和監工都不是兩位設計師（歸「其他」）', '', (x) => `（接案 ${esc(x.take || '空白')}、監工 ${esc(x.watch || '空白')}）`],
    [q.overpaid, '累計已收比合約金額還多', '可能是追加款沒登在追加款子表，或收款記錯', (x) => `（多 ${money(x.paid - x.final)}）`],
    [q.closedUnpaid, '已結案、帳上還沒收齊', '已算進「到期未收」。確定已收、只是沒入 Ragic 的，按「尾款已收清（未入 Ragic）」', (x) => `（差 ${money(x.balance)}）`, settleBtn],
    [q.settled, '已確認收清、未入 Ragic', '不算應收；收進來的錢沒有加（匯款日不知道）。補登到 Ragic 後請按復原', (x) => `（${money(x.amount)}）`, undoBtn],
    [q.extraUnsigned, '追加款項目寫「尚未簽核」', '不算進合約金額', (x) => `（${x.n} 筆 ${money(x.amount)}）`],
    [q.undatedReceipts, '網站登記的收款沒有日期', '算在實收總額、但不屬於任何一年', (x) => `（${x.n} 筆 ${money(x.amount)}）`],
  ].filter((x) => x[0].length);
  const n = items.filter((x) => x[0] !== q.signManual && x[0] !== q.settled).length;
  return `<details class="fold perf-dq" ${n ? '' : ''}><summary>資料品質（${n ? n + ' 類要留意' : '沒有發現問題'}）</summary><div class="fold-list">
    ${items.map(([arr, title, hint, f, act]) => `<div class="dq-item"><b>${title}　${arr.length} 案</b>${hint ? `<small>${hint}</small>` : ''}<p>${list(arr, f, act)}</p></div>`).join('') || '<p class="note">每案的簽約日、合約金額、負責人都齊。</p>'}
  </div></details>`;
}

// 業績頁標題列右邊的「年份」下拉（pageHead 呼叫；業績還沒載入時沒有）
function perfHeadExtra() {
  if (!PERF) return '';
  const y = perfYearNow();
  return `<label class="whosel">年份<select id="perfYearSel" aria-label="年份">${PERF.years.map((v) => `<option value="${v}" ${String(v) === y ? 'selected' : ''}>${v} 年</option>`).join('')}</select></label>`;
}
function perfYearNow() {
  const yrs = PERF.years;
  if (!S.perfYear || !yrs.includes(Number(S.perfYear))) S.perfYear = String(yrs.includes(Number(TODAY.slice(0, 4))) ? TODAY.slice(0, 4) : yrs[0]);
  return S.perfYear;
}

// 「介紹人帶來的業績」：誰介紹的案子、帶進多少簽的合約與收進來的錢。跟著頁面年份與頂部設計師切換；沒有介紹人的歸最後一列
const NO_INTRO_UI = '沒有介紹人';
function introTable(y, B) {
  const g = S.who === WHO_ALL ? GRP_ALL : (B.sumsByIntro[S.who] ? S.who : '其他');
  const m = B.sumsByIntro[g] || {};
  const names = Object.keys(m).sort((a, b) => (a === NO_INTRO_UI) - (b === NO_INTRO_UI) || m[b].signed - m[a].signed || m[b].received - m[a].received || a.localeCompare(b, 'zh-Hant'));
  const amt = (e) => (e.signedN ? money(e.signed) + (e.pendingN ? `<small class="dim">另 ${e.pendingN} 案待補</small>` : '') : e.pendingN ? '<span class="dim">待補</span>' : '<span class="dash">—</span>');
  const list = (e) => e.cases.map((c) => (ALL_CASES.some((x) => x.id === c.id) ? `<button class="linkish" type="button" data-case="${esc(c.id)}">${esc(c.name)}</button>` : esc(c.name))).join('、');
  const multi = names.some((n) => m[n].cases.some((c) => names.some((o) => o !== n && m[o].cases.some((x) => x.id === c.id))));
  return `<section class="card" id="introSec">
    <h2>介紹人帶來的業績 <small>${y} 年・${esc(g)}・誰介紹的案子、帶進多少簽的合約</small></h2>
    <div class="tablewrap scroll"><table class="clean intro-tbl">
      <thead><tr><th>介紹人</th><th class="r">案數</th><th class="r">簽的合約</th><th class="r">收進來的錢</th><th>案子</th></tr></thead>
      <tbody>${names.map((n) => `<tr><td>${n === NO_INTRO_UI ? `<span class="dim">${NO_INTRO_UI}</span>` : `<b>${esc(n)}</b>`}</td><td class="r tnum">${m[n].caseN}</td><td class="r tnum">${amt(m[n])}</td><td class="r tnum">${m[n].received ? money(m[n].received) : '<span class="dash">—</span>'}</td><td class="cases">${list(m[n])}</td></tr>`).join('') || '<tr><td colspan="5" class="empty-row">這一年沒有簽約或收款的案子。</td></tr>'}</tbody>
    </table></div>
    <p class="card-note">簽的合約＝該年簽約的案子的原合約＋已簽追加；收進來的錢＝該年實際收到的錢，往年簽約今年才收的也算。介紹人沿用案件頁「介紹夥伴」的判定（網站設定 → Ragic 客戶來源 → 群組成員推測），同仁自宅的那位同仁不算介紹人。${multi ? '有案子是多位同仁一起介紹的，每人各列一次，所以各列加起來會比總數多。' : ''}</p>
  </section>`;
}

function viewPerf() {
  const hd = () => '<p class="finding">簽的合約＝原合約＋已簽追加－追加減，算在簽約那一年；收進來的錢＝真的收到的錢，算在匯款那一年。</p>';
  if (!PERF) {
    if (!PERF_ERR) loadPerf();
    return `<section class="sec">${hd()}${PERF_ERR ? `<p class="empty">${esc(PERF_ERR)}</p><button class="btn" type="button" id="perfRetry">再試一次</button>` : '<div class="loading">業績計算中…（要讀 Ragic 全部案件，約需幾秒）</div>'}</section>`;
  }
  const y = perfYearNow(), B = PERF.byYear[y];
  const yrs = PERF.years;
  const hasOther = B.sums['其他'].signed || B.sums['其他'].received || PERF.dueNow['其他'].total;
  const gs = [GRP_ALL, ...PERF.designers, ...(hasOther ? ['其他'] : [])];
  const seriesGs = [...PERF.designers, ...(B.monthly.some((m) => m['其他']) ? ['其他'] : [])];
  // 卡片只算「設計案」（一般客戶設計案）；合資、獨資、小吳哥自購各自一欄在下方「依案件類型」表，不混進同一個總數
  const card = (g) => {
    const s = B.sumsByType[g]['設計'], dt = PERF.dueNow[g].byType['設計'], d = { ...dt, settled: dt.settled };
    return `<article class="perf-card ${g === S.who || (g === GRP_ALL && S.who === WHO_ALL) ? 'sel' : ''}">
      <h3>${esc(g)}<small class="dim"> ・ 設計案</small></h3>
      <dl>
        <div><dt>${y} 年簽的合約</dt><dd class="tnum"><small>NT$</small>${money(s.signed)}</dd><small>${y} 年簽約 ${s.signedN} 案</small></div>
        <div><dt>${y} 年收進來的錢</dt><dd class="tnum"><small>NT$</small>${money(s.received)}</dd><small>${y} 年有收款 ${s.receivedN} 案</small></div>
        <div><dt>到期未收</dt><dd class="tnum ${d.total ? 'bad' : ''}"><small>NT$</small>${money(d.total)}</dd><small>${d.total ? `不分年・${dueSub(d.n, d.closedN)}` : '沒有到期未收'}</small>${d.settled && d.settled.n ? `<small class="settled-line">已確認收清、未入 Ragic：NT$${money(d.settled.total)}（${d.settled.n} 案）</small>` : ''}</div>
      </dl></article>`;
  };
  const rows = perfRows(y);
  const sold = rows.filter(soldOf), pend = rows.filter((r) => r.signedThisYear && r.final == null), oldPaid = rows.filter((r) => !r.signedThisYear);
  const sum = (arr, k) => arr.reduce((t, r) => t + (r[k] || 0), 0);
  const ps = S.perfSort;
  const th = (k, label, cls = '') => `<th class="${cls}" aria-sort="${ps.key === k ? (ps.dir > 0 ? 'ascending' : 'descending') : 'none'}"><button type="button" data-psort="${k}">${label}${ps.key === k ? (ps.dir > 0 ? ' ↑' : ' ↓') : ''}</button></th>`;
  const mrows = B.monthly;
  // 上方 4 張數字卡（範圍＝頂部設計師切換，全部案件類型合計；分類型的數字在下面「依案件類型分欄」）
  const key = S.who === WHO_ALL ? GRP_ALL : (B.sums[S.who] ? S.who : '其他');
  const ys = B.sums[key], dn = PERF.dueNow[key];
  return `<section class="sec perf">
    ${hd()}
    <div class="kpis kpis4">
      <div class="kpi"><span class="lab">${y} 年簽的合約</span><span class="num tnum">${money(ys.signed)}</span><span class="sub">${y} 年簽約 ${ys.signedN} 案・含已簽追加</span></div>
      <div class="kpi"><span class="lab">${y} 年收進來的錢</span><span class="num tnum">${money(ys.received)}</span><span class="sub">已收到匯款、金額對得上的錢</span></div>
      <div class="kpi"><span class="lab">到期未收</span><span class="num tnum ${dn.total ? 'red' : ''}">${money(dn.total)}</span><span class="sub">不分年・${dueSub(dn.n, dn.closedN)}</span></div>
      <div class="kpi"><span class="lab">${y} 年有收款</span><span class="num tnum">${ys.receivedN} 案</span><span class="sub">收進來的錢來自這幾案</span></div>
    </div>
    ${introTable(y, B)}
    ${typeTable(y, B)}
    <details class="fold"><summary>各設計師比較（設計案）</summary><div class="perf-cards fold-pad">${gs.map(card).join('')}</div></details>
    ${PERF.dueNow[GRP_ALL].settled.n ? `<p class="note perf-note">已確認收清、未入 Ragic：<b>NT$${money(PERF.dueNow[GRP_ALL].settled.total)}（${PERF.dueNow[GRP_ALL].settled.n} 案）</b>。這些錢不算應收，但<b>收進來的錢沒有加上去</b>（匯款日不知道，不能憑空歸到某一年）。請設計師把收款補登到 Ragic 款項子表，補登後實收才會正確歸年；補登後可以在資料品質區按「復原」拿掉標記。</p>` : ''}
    <p class="note perf-note">簽的合約＝該年簽約的案子的原合約＋已簽追加（追加減已扣，待簽名的追加單不算）。收進來的錢＝該年有匯款時間的收款（含網站登記、還沒寫回 Ragic 的）。到期未收不分年：進行中的案子依合約到期條件算，已結案的案子是合約金額減累計已收的尾款；首頁、款項頁都是這個數。</p>

    <div class="perf-block">
      <h3 class="blk-title">${y} 年每月實收</h3>
      <p class="blk-sub">依匯款時間，可以按負責設計師或案件類型分色。</p>
      <div class="toolbar" role="group" aria-label="分色方式"><button class="chip" type="button" data-pstack="dsg" aria-pressed="${S.perfStack !== 'type'}">依設計師</button><button class="chip" type="button" data-pstack="type" aria-pressed="${S.perfStack === 'type'}">依案件類型</button></div>
      <div class="panel">${perfChart(y, seriesGs)}</div>
      <details class="fold"><summary>每月金額表（依案件類型）</summary><div class="tablewrap scroll"><table class="perf-tbl" style="min-width:420px"><thead><tr><th>月份</th>${PERF.caseTypes.map((t) => `<th class="num">${esc(t)}</th>`).join('')}<th class="num">合計</th></tr></thead>
        <tbody>${mrows.map((m) => `<tr><td>${m.m} 月</td>${PERF.caseTypes.map((t) => `<td class="num tnum">${m.types[t] ? money(m.types[t]) : '—'}</td>`).join('')}<td class="num tnum"><b>${m.total ? money(m.total) : '—'}</b></td></tr>`).join('')}</tbody></table></div></details>
      <details class="fold"><summary>每月金額表（依設計師）</summary><div class="tablewrap scroll"><table class="perf-tbl" style="min-width:420px"><thead><tr><th>月份</th>${seriesGs.map((g) => `<th class="num">${esc(g)}</th>`).join('')}<th class="num">合計</th></tr></thead>
        <tbody>${mrows.map((m) => `<tr><td>${m.m} 月</td>${seriesGs.map((g) => `<td class="num tnum">${m[g] ? money(m[g]) : '—'}</td>`).join('')}<td class="num tnum"><b>${m.total ? money(m.total) : '—'}</b></td></tr>`).join('')}</tbody></table></div></details>
    </div>

    <div class="perf-block">
      <div class="lead-head"><div><h3 class="blk-title">${y} 年案件明細</h3>
        <p class="blk-sub">${S.who === WHO_ALL ? '全設計部' : esc(S.who)}：${y} 年簽約 ${sold.length} 案${pend.length ? `、另 ${pend.length} 案今年簽約但合約金額空白（不算進合約金額）` : ''}${oldPaid.length ? `；灰色的 ${oldPaid.length} 案是往年簽約、${y} 年有收款，只算實收` : ''}。點欄位名稱排序。</p></div>
        <button class="btn" type="button" id="perfCsv">下載 CSV</button></div>
      <div class="tablewrap scroll"><table class="perf-tbl">
        <thead><tr>${th('name', '案名')}${th('caseType', '類型')}${th('owner', '屋主')}${th('designer', '設計師')}${th('signDate', '簽約日')}${th('contract', '原合約', 'num')}${th('add', '追加', 'num')}${th('cut', '追加減', 'num')}${th('final', '合約金額', 'num')}${th('paidYear', y + ' 年實收', 'num')}${th('status', '狀態')}<th>操作</th></tr></thead>
        <tbody>${rows.map((r) => `<tr class="${r.signedThisYear ? '' : 'off'}">
          <td class="name">${esc(r.name)}</td><td>${r.caseType === '設計' ? '<span class="dash">設計</span>' : `<b>${esc(typeText(r.caseType, r.jointSource))}</b>`}</td><td>${esc(r.owner) || '<span class="dash">—</span>'}</td><td>${esc(r.designer)}</td>
          <td class="tnum" title="簽約日來源：${esc(SRC_LABEL[r.signSrc] || '沒有簽約日')}">${r.signDate ? signText(r) : '<span class="dash">—</span>'} <span class="sync-tag ${r.signSrc === 'manual' || r.signSrc === 'ragic_sign' ? 'ok' : r.signSrc === 'created' ? '' : 'local'}" title="簽約日來源">${esc(({ manual: '人工', ragic_sign: 'Ragic', contract: '合約', ragic_start: '施工起', created: '建檔日' })[r.signSrc] || '無')}</span>${r.signDate && !r.signedThisYear ? ` <span class="sync-tag local" title="這案不是 ${y} 年簽約，只是 ${y} 年有收款，不算進 ${y} 年合約金額">往年簽約</span>` : ''}</td>
          <td class="num tnum">${r.contract != null ? money(r.contract) : '<span class="dash">—</span>'}${r.contractFrom === 'contract_file' ? ' <span class="sync-tag" title="Ragic 合約總價空白，這是 AI 讀合約檔的總價">合約檔</span>' : ''}</td>
          <td class="num tnum">${r.add ? money(r.add) : '<span class="dash">0</span>'}</td><td class="num tnum">${r.cut ? '−' + money(r.cut) : '<span class="dash">0</span>'}</td>
          <td class="num tnum"><b>${r.final != null ? money(r.final) : '<span class="dash">—</span>'}</b></td>
          <td class="num tnum">${r.paidYear ? money(r.paidYear) : '<span class="dash">0</span>'}</td><td>${esc(r.status)}${r.settled ? ' <span class="sync-tag ok" title="已確認收清、未入 Ragic">尾款已收清</span>' : ''}</td>
          <td>${perfActs(r)}</td></tr>`).join('') || '<tr><td colspan="12" class="empty">這一年沒有案件。</td></tr>'}</tbody>
        ${rows.length ? `<tfoot>${typeFoot(rows, y)}<tr><th colspan="5">合計（合約金額只算 ${y} 年簽約的 ${sold.length} 案；實收含灰色的往年案）</th><td class="num tnum">${money(sum(sold, 'contract'))}</td><td class="num tnum">${money(sum(sold, 'add'))}</td><td class="num tnum">−${money(sum(sold, 'cut'))}</td><td class="num tnum"><b>${money(sum(sold, 'final'))}</b></td><td class="num tnum"><b>${money(sum(rows, 'paidYear'))}</b></td><td></td><td></td></tr></tfoot>` : ''}
      </table></div>
    </div>
    ${dqBlock()}
  </section>`;
}

/* ---------- CSV：Excel 開得起中文（UTF-8 BOM）；開頭是 = + - @ 的文字前面補單引號，避免被當公式執行 ---------- */
function csvCell(v) {
  let s = v == null ? '' : String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function downloadPerfCsv() {
  if (!PERF) return;
  const y = S.perfYear, rows = perfRows(y);
  const head1 = ['案名', '案件類型', '合資來源', '屋主', '設計師', '簽約日', '簽約日來源', '原合約', '追加', '追加減', '合約金額', y + ' 年實收', '狀態', y + ' 年成交'];
  const lines = [head1, ...rows.map((r) => [r.name, r.caseType, r.jointSource || '', r.owner, r.designer, r.signDate || '', SRC_LABEL[r.signSrc] || '', r.contract ?? '', r.add, -r.cut, r.final ?? '', r.paidYear, r.status, r.signedThisYear ? '是' : '否'])];
  const blob = new Blob(['﻿' + lines.map((l) => l.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `設計部業績明細_${y}${S.who === WHO_ALL ? '' : '_' + S.who}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* ---------- 人工修正：簽約日、尾款已收清（都寫回 Ragic；尾款已收清不新增假匯款列） ---------- */
function perfActs(r) {
  let h = `<button class="linkish" type="button" data-psign="${attr(r.id)}" data-pname="${attr(r.name)}" data-pcur="${attr(signCur(r))}">設定簽約日</button>`;
  if (r.status === '已結案') h += r.settled
    ? ` <button class="linkish" type="button" data-punsettle="${attr(r.id)}" data-pname="${attr(r.name)}">復原收清</button>`
    : ` <button class="linkish" type="button" data-psettle="${attr(r.id)}" data-pname="${attr(r.name)}" title="尾款已收清（未入 Ragic）：確定已收到、只是沒登進 Ragic">尾款已收清</button>`;
  return h;
}
function signSheet(id, name, cur) {
  openSheet({
    kicker: name, title: '設定簽約日', save: '儲存簽約日',
    sync: `${syncNote()}（Ragic「簽約日」欄；只到月的寫在 Ragic 備註）`,
    body: `<p class="note">簽約日決定這案的合約金額算在哪一年。可以只填到月，例如 2025-12，畫面會顯示「2025 年 12 月（日未確認）」。留空＝清除人工設定，Ragic 簽約日改回合約上的簽約日（沒有就空白），畫面退回合約簽約日 → Ragic 施工起日 → 建檔日。</p>
      <div class="field"><label for="sgDate">簽約日（YYYY-MM 或 YYYY-MM-DD）</label><input class="inp" id="sgDate" type="text" inputmode="numeric" placeholder="2025-12" autocomplete="off" maxlength="10" value="${attr(cur || '')}"></div>`,
    onSave: async () => {
      const v = $('#sgDate').value.trim();
      if (v && !/^\d{4}-\d{2}(-\d{2})?$/.test(v)) return sheetErr('格式要像 2025-12 或 2025-12-02。');
      const r = await postEdit({ op: 'sign_date', ragic_id: id, value: v }, true);
      if (!r) return false;
      toast(`${v ? '簽約日已存' : '已清除人工簽約日'}${syncMsg(r)}`); await reload();
    },
  });
}
function settleSheet(id, name, bal) {
  openSheet({
    kicker: name, title: '尾款已收清（未入 Ragic）', save: '標記已收清',
    sync: `${syncNote()}（Ragic「尾款已收清」欄）。可以復原；不新增匯款列`,
    body: `<p class="note">確定這案的尾款已經收到、只是 Ragic 款項子表沒登那筆匯款。標記後這案的「到期未收」歸 0。<b>收進來的錢不會增加</b>（不知道匯款日，不能歸到某一年）；請設計師補登到 Ragic 款項子表，補登後實收才會正確歸年，到時再按「復原」拿掉這個標記。</p>
      ${bal ? `<p class="note">目前帳上差額：NT$${money(Number(bal))}</p>` : ''}
      <div class="field"><label for="stNote">備註（選填）</label><input class="inp" id="stNote" type="text" placeholder="例如：Joan 表示已收" autocomplete="off" maxlength="200"></div>`,
    onSave: async () => {
      const r = await postEdit({ op: 'settled', ragic_id: id, on: true, note: $('#stNote').value.trim() }, true);
      if (!r) return false;
      toast(`已標記尾款已收清${syncMsg(r)}`); await reload();
    },
  });
}
async function unsettle(id, name) {
  if (!window.confirm(`復原「${name}」的尾款已收清標記？復原後到期未收會回來。`)) return;
  const r = await postEdit({ op: 'settled', ragic_id: id, on: false });
  if (r) { toast('已復原'); await reload(); }
}
/* 案件頁款項區／資料區的入口（只有編輯者；款項區只在已結案的案子出現） */
function settleBlock(c) {
  if (!CAN_EDIT || c.status !== '已結案') return '';
  return c.settled
    ? `<p class="note" style="margin-bottom:12px">已標記「尾款已收清（未入 Ragic）」：到期未收歸 0，收進來的錢沒增加。補登到 Ragic 款項子表後，實收才會正確歸年。<button class="btn" type="button" data-punsettle="${attr(c.id)}" data-pname="${attr(c.name)}">復原</button></p>`
    : `<p class="note ${c.closedBalance > 0 ? 'warn' : ''}" style="margin-bottom:12px">${c.closedBalance > 0 ? `已結案・尾款未收 NT$${money(c.closedBalance)}（「待辦事項」會繼續提醒）。收到了請按「登記收款」；` : '已結案：'}如果尾款其實收了、只是沒登進 Ragic，可以標記。不寫回 Ragic，不新增匯款列。<button class="btn" type="button" data-psettle="${attr(c.id)}" data-pname="${attr(c.name)}" data-pbal="${c.closedBalance || ''}">尾款已收清（未入 Ragic）</button></p>`;
}
function signField(c) {
  if (!CAN_EDIT) return '';
  const cur = c.signManual ? (c.signManual.length === 7 ? `${c.signManual.slice(0, 4)} 年 ${Number(c.signManual.slice(5))} 月（日未確認）` : fullDate(c.signManual)) : '';
  return `<div class="field"><span class="flabel">簽約日（網站）</span><p class="ro">${cur ? esc(cur) : '沒有人工設定（用合約簽約日，沒有就用施工起日）'}${cur ? ' <span class="sync-tag ok">人工設定</span>' : ''}</p>
    <div class="inline"><button class="btn" type="button" data-psign="${attr(c.id)}" data-pname="${attr(c.name)}" data-pcur="${attr(c.signManual || '')}">設定簽約日</button></div></div>`;
}
