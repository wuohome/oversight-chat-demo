'use strict';
// 設計部監督總覽｜案件頁「款項」段落（依序沖帳版）與登記收款面板
// 資料來自伺服器 lib/oversight-pay.js：c.pays（每期／每筆追加款，已沖多少、差多少）、c.recon（總結與說明句）、c.ledger（原始匯款紀錄）。
// 已收總額＝Ragic 款項子表所有有匯款時間的列加總，從第 1 期依序填滿，不管記在哪一期。
// 2026-10-20 改版：款項分「合約各期」與「追加款」兩組；登記收款改成「合約的款項／追加款」二選一，輸入金額當場顯示會補到哪幾期。

const payPill = (p) => {
  if (p.status === 'paid') return `<span class="pill green">${p.kind === 'row' ? '已收' : '已收足'}</span>`;
  if (p.status === 'partial') return `<span class="pill ${p.late ? 'red' : 'amber'}">部分收（差 NT$${money(p.short)}）</span>`;
  if (p.status === 'due') return '<span class="pill red">該收未收</span>';
  if (p.status === 'unsigned') return '<span class="pill amber">待簽名・不算應收</span>';
  return `<span class="pill gray">${p.kind === 'step' ? '未到' : '未收'}</span>`;
};

function payRowHTML(p, maxAmt) {
  const w = maxAmt ? Math.max(8, Math.round((p.amt / maxAmt) * 100)) : 100;
  const fill = p.amt ? Math.min(100, Math.round((p.paid / p.amt) * 100)) : 0;
  const local = p.kind === 'extra' && /^x:L\d+$/.test(p.key || '');   // 網站登記、還沒寫進 Ragic 的追加款
  return `<div class="payrow ${p.late || p.status === 'due' ? 'due' : ''}">
    <div class="pr-top"><div class="pname">${p.kind === 'step' ? `第 ${p.idx} 期　` : ''}${esc(String(p.name).replace(/^追加：/, ''))}<small><span class="src">${esc(p.source)}</span>${p.pct != null ? ` <span class="src">${p.pct}%</span>` : ''}${p.unsigned ? ' <span class="pill amber">尚未簽核</span>' : ''}${local ? ` ${syncTag(true)}` : ''}</small></div>
      <div class="pr-amt tnum">已收 <b>NT$${money(p.paid)}</b> / 應收 NT$${money(p.amt)}</div>${payPill(p)}</div>
    <div class="pbar" style="width:${w}%" aria-hidden="true"><i class="${p.status === 'paid' ? 'ok' : p.late ? 'late' : 'part'}" style="width:${fill}%"></i></div>
    <p class="pr-basis">${esc(p.basis)}${local && CAN_EDIT ? ` <button class="linkish" type="button" data-exrm="${esc(p.key.slice(2))}">刪除這筆</button>` : ''}</p>
  </div>`;
}

function ledgerHTML(c) {
  const L = c.ledger || [];
  if (!L.length) return '<p class="log-empty">Ragic 款項子表還沒有任何一列，網站也沒有登記過收款。</p>';
  return `<div class="tablewrap scroll"><table class="ledger"><thead><tr><th>匯款日</th><th>款項（Ragic）</th><th class="num">金額</th><th>狀態</th><th>核帳／備註</th><th></th></tr></thead><tbody>
    ${L.map((l) => `<tr>
      <td class="tnum">${l.date ? esc(l.date.slice(5).replace('-', '/')) : '—'}</td><td>${esc(l.stage)}</td><td class="num tnum">NT$${money(l.amount)}</td>
      <td>${l.paid ? (l.pending ? `<span class="pill green">已收</span> ${syncTag(true)}` : '<span class="pill green">已收</span>') : '<span class="pill gray">預定・未收</span>'}</td>
      <td>${esc(l.by || '')}${l.note ? ` ${esc(l.note)}` : ''}</td>
      <td>${l.canRemove && CAN_EDIT ? `<button class="linkish" type="button" data-payrm="${esc(l.key)}">刪除這筆</button>` : l.source === 'ragic' ? '<span class="dim">要改請到 Ragic</span>' : ''}</td></tr>`).join('')}
  </tbody></table></div>`;
}

function paySectionHTML(c) {
  const r = c.recon || {};
  const steps = c.pays.filter((p) => p.kind !== 'extra'), extras = c.pays.filter((p) => p.kind === 'extra');
  const maxAmt = Math.max(0, ...c.pays.map((p) => p.amt));
  const sum = (list) => list.reduce((s, p) => s + (p.status === 'unsigned' ? 0 : p.amt || 0), 0);   // 待簽名的追加款不算進小計
  const uns = c.unsignedAmt || 0;
  const summary = r.hasContract
    ? `合約 <b>NT$${money(r.contractTotal)}</b>${r.extraTotal - uns ? `＋追加 <b>NT$${money(r.extraTotal - uns)}</b>` : ''}${uns ? `（另有待簽名 <b class="unsigned">NT$${money(uns)}</b>，不算應收）` : ''}｜累計已收 <b>NT$${money(r.paidTotal)}</b>｜${c.closed ? (c.settled ? '尾款已標收清' : `<span class="${c.closedBalance ? 'bad' : ''}">尾款未收 <b>NT$${money(c.closedBalance || 0)}</b></span>`) : `到期該收 <b>NT$${money(r.dueShould)}</b>｜<span class="${r.short ? 'bad' : ''}">到期未收 <b>NT$${money(r.short)}</b></span>`}${r.over ? `｜<span class="warn-t">多收 <b>NT$${money(r.over)}</b></span>` : ''}`
    : `累計已收 <b>NT$${money(r.paidTotal || 0)}</b>（Ragic 沒有可對照的合約，只列款項表）`;
  const group = (title, list, empty) => `<h3 class="wk-h pay-grp">${title}<span class="wk-sum tnum">${list.length ? 'NT$' + money(sum(list)) : ''}</span></h3>${list.length ? list.map((p) => payRowHTML(p, maxAmt)).join('') : `<p class="hint pay-empty">${empty}</p>`}`;
  return `<section class="csec" id="c-pay">
    ${head('款項', '款項', `${c.contractRead ? `合約來源：${esc(c.contractSource === 'line_album' ? 'LINE 相簿合約' : 'Ragic 合約')}。` : ''}收到的錢從第 1 期開始依序抵掉，前一期付滿才算下一期；屋主一次匯兩期、或只匯一半，都只要登記一次。${CAN_EDIT ? `${DATA.ragicWrite ? '登記會在 Ragic 款項子表新增一列。' : 'Ragic 同步尚未開啟，先存在網站，標「待同步 Ragic」。'}` : ''}`,
      CAN_EDIT ? '<div class="head-acts"><button class="btn primary" type="button" data-payadd>登記收款</button><button class="btn" type="button" data-extraadd>新增追加款</button></div>' : '')}
    <p class="pay-summary">${summary}</p>
    ${settleBlock(c)}
    ${r.note ? `<p class="note" style="margin-bottom:12px">${esc(r.note)}</p>` : ''}
    ${c.pays.length ? `<div class="pays payrows">${r.hasContract ? group('合約各期', steps, '沒有讀到合約各期。') + group('追加款', extras, '這案沒有追加款。屋主簽了追加工程單，按上面的「新增追加款」。') : steps.concat(extras).map((p) => payRowHTML(p, maxAmt)).join('')}</div>` : '<p class="empty">這案沒有讀到合約，Ragic 款項表也沒有任何一期。請設計師把合約上傳到 Ragic、並在款項表建期別。</p>'}
    <h3 class="wk-h" style="margin-top:20px">原始匯款紀錄（Ragic 款項子表）</h3>
    <p class="blk-sub">Ragic 每一列的日期、款項名稱、金額，讓你對照。「預定・未收」是設計師在 Ragic 先建好、還沒填匯款時間的列。</p>
    ${ledgerHTML(c)}
    ${c.contractNote ? `<p class="note" style="margin-top:12px">AI 讀合約備註：${esc(c.contractNote)}</p>` : ''}
    ${c.contractStale ? '<p class="note warn" style="margin-top:12px">Ragic 的合約檔已更換，等收集端重讀。</p>' : ''}
  </section>`;
}

/* ---------- 登記收款：輸入金額，當場顯示這筆錢會補到哪幾期 ---------- */
// 邏輯同 lib/oversight-pay.js：選「合約的款項」→ 合約各期依序補、補滿才算追加款；選「追加款」→ 先補追加款，再往合約各期
function allocPreview(c, amt, kind) {
  if (!amt) return '<p class="t">填了金額，這裡會顯示這筆錢會補到哪幾期。</p>';
  if (!(c.recon && c.recon.hasContract)) return '<p class="t">這案沒有可對照的合約，收款只會記下來、算進已收總額，不分配到各期。</p>';
  const steps = c.pays.filter((x) => x.kind !== 'extra'), extras = c.pays.filter((x) => x.kind === 'extra');
  const seq = kind === 'extra' ? [...extras, ...steps] : [...steps, ...extras];
  let left = amt; const lines = [];
  for (const p of seq) {
    if (!left) break;
    if (!p.short) continue;
    const take = Math.min(left, p.short); left -= take;
    lines.push(`<p><span>${p.kind === 'step' ? '第 ' + p.idx + ' 期 ' : ''}${esc(String(p.name).replace(/^追加：/, '追加 '))}</span><b>NT$${money(take)}${take === p.short ? '，收齊' : `，還差 NT$${money(p.short - take)}`}</b></p>`);
  }
  return `<p class="t">這筆錢會這樣補</p>${lines.join('') || '<p>每一期都已經收齊。</p>'}${left ? `<p class="over"><span>多出來的</span><b>NT$${money(left)}</b></p>` : ''}`;
}
function payAddSheet(c) {
  if (!c || !CAN_EDIT) return;
  const next = c.pays.find((p) => p.kind !== 'extra' && p.short > 0) || c.pays.find((p) => p.short > 0);
  const hasExtra = c.pays.some((p) => p.kind === 'extra');
  const options = D.stageOptions || [];
  const suggest = (c.recon && c.recon.suggestStage) || '追加款';
  openSheet({
    kicker: c.name, title: '登記收款', save: '登記',
    sync: DATA.ragicWrite ? '會在 Ragic 款項子表新增一列（款項、金額、匯款時間、核帳人）' : 'Ragic 同步尚未開啟：先存在網站，標「待同步 Ragic」，照樣計入已收總額',
    body: `<div class="field"><label for="payAmount">收到多少錢（元）</label><input class="inp tnum" id="payAmount" type="text" inputmode="numeric" value="${next ? money(next.short) : ''}" autocomplete="off"><span class="hint">系統會把屋主付的錢從第 1 期開始往後算。一次匯兩期就填加起來的總數；只匯一部分就填實際收到的數字。</span></div>
      <div class="field"><label for="payDate">匯款日</label><input class="inp" id="payDate" type="date" value="${localISO()}" max="${addDays(localISO(), 1)}"></div>
      <fieldset class="opts"><legend class="flabel">這筆是</legend>
        <label class="opt" for="pkStep"><input type="radio" name="payKind" id="pkStep" value="step" checked><span>合約的款項<small>從還沒收足的那一期開始往後補</small></span></label>
        <label class="opt" for="pkExtra"><input type="radio" name="payKind" id="pkExtra" value="extra" ${hasExtra ? '' : 'disabled'}><span>追加款<small>${hasExtra ? '先補這案的追加款' : '這案還沒有追加款，先按「新增追加款」'}</small></span></label>
      </fieldset>
      <div class="alloc" id="allocBox" aria-live="polite"></div>
      <div class="field" style="margin-top:14px"><label for="payNote">備註（選填，只存在網站）</label><input class="inp" id="payNote" type="text" placeholder="例如：匯款末五碼 12345，屋主說先匯一半" autocomplete="off" maxlength="200"></div>
      <details class="adv"><summary>進階：指定 Ragic 款項欄（給會計用）</summary>
        <div class="field"><label for="payStage">Ragic 款項欄</label><select class="inp" id="payStage"><option value="">照上面的選擇自動帶（建議）</option>${options.map((o) => `<option>${esc(o)}</option>`).join('')}</select>
        <span class="hint">平常不用選。Ragic 款項子表每一筆匯款一列，款項欄只是標示最接近的期別，不影響上面的分配。</span></div></details>`,
    mount: () => {
      const kind = () => document.querySelector('input[name=payKind]:checked').value;
      const upd = () => { $('#allocBox').innerHTML = allocPreview(c, payNum($('#payAmount').value), kind()); };
      $('#payAmount').oninput = upd;
      document.querySelectorAll('input[name=payKind]').forEach((r) => { r.onchange = upd; });
      upd();
    },
    onSave: async () => {
      const d = $('#payDate').value;
      const amt = payNum($('#payAmount').value);
      if (!d) return sheetErr('請填匯款日。');
      if (!amt) return sheetErr('請填金額。');
      const kind = document.querySelector('input[name=payKind]:checked').value;
      const stage = $('#payStage').value || (kind === 'extra' ? '追加款' : suggest);
      const payload = { op: 'pay_add', ragic_id: c.id, paid_at: d, amount: amt, stage, note: $('#payNote').value.trim() };
      const dup = dupPay(c, amt, d);
      if (dup) { payDupSheet(c, payload, dup); return false; }
      const r = await postEdit(payload, true);
      if (!r) return false;
      if (r.dup) { payDupSheet(c, payload, r.dup); return false; }
      await reload(); toast(`已登記收款 NT$${money(amt)}${syncMsg(r)}${r.detail === 'auditor_not_set' ? '（核帳人沒對上 Ragic 使用者，沒填）' : ''}`);
    },
  });
}
/* 防重複（同 lib/oversight-pay.js findDupPay）：同金額、日期相差 3 天內的已收款（Ragic 列＋網站待同步的登記，c.ledger 兩種都有；預定未收的列不算） */
function dupPay(c, amount, isoDate) {
  const day = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
  return (c.ledger || []).find((l) => l.paid && l.date && Number(l.amount) === amount && Math.abs(day(l.date) - day(isoDate)) <= 3 * 86400000) || null;
}
const dupText = (d) => `這案已經有一筆 ${Number(d.date.slice(0, 4))} 年 ${Number(d.date.slice(5, 7))} 月 ${Number(d.date.slice(8, 10))} 日、${money(d.amount)} 元的收款，確定是另一筆嗎？`;
function payDupSheet(c, payload, d) {
  openSheet({
    kicker: c.name, title: '這案已經有類似的收款', save: '確定是另一筆',
    body: `<p class="note warn">${esc(dupText(d))}</p><p class="note" style="margin-top:8px">如果是同一筆（例如設計師已經在 Ragic 填了），請按「取消」，不要再登記，不然已收會多算一次。</p>`,
    onSave: async () => {
      const r = await postEdit({ ...payload, confirm_dup: true }, true);
      if (!r) return false;
      await reload(); toast(`已登記收款 NT$${money(payload.amount)}${syncMsg(r)}`);
    },
  });
}
const payNum = (v) => Number(String(v || '').replace(/[^\d]/g, ''));

/* 刪掉網站登記、還沒寫進 Ragic 的收款（改成面板確認，跟其他動作一致） */
function payRemove(c, key) {
  if (!c || !CAN_EDIT) return;
  const l = (c.ledger || []).find((x) => x.key === key);
  openSheet({
    kicker: c.name, title: '刪掉這筆收款？', save: '刪除這筆',
    sync: 'Ragic 既有的紀錄不會被刪，只刪網站登記、還沒寫進 Ragic 的這一筆',
    body: `<p class="note">${l ? `${l.date ? esc(l.date.slice(5).replace('-', '/')) + '・' : ''}${esc(l.stage)}・NT$${money(l.amount)}${l.note ? '・' + esc(l.note) : ''}` : '這筆收款'}。刪掉後已收總額會減少。</p>`,
    onSave: async () => {
      const r = await postEdit({ op: 'pay_remove', ragic_id: c.id, pay_key: key }, true);
      if (!r) return false;
      await reload(); toast('已刪除這筆收款');
    },
  });
}
/* 刪掉網站登記、還沒寫進 Ragic 的追加款 */
function extraRemove(c, key) {
  if (!c || !CAN_EDIT) return;
  const p = c.pays.find((x) => x.key === 'x:' + key);
  openSheet({
    kicker: c.name, title: '刪掉這筆追加款？', save: '刪除這筆',
    sync: 'Ragic 既有的追加款不會被刪，只刪網站登記、還沒寫進 Ragic 的這一筆',
    body: `<p class="note">${p ? `${esc(String(p.name).replace(/^追加：/, ''))}・NT$${money(p.amt)}` : '這筆追加款'}。</p>`,
    onSave: async () => {
      const r = await postEdit({ op: 'extra_remove', ragic_id: c.id, extra_key: key }, true);
      if (!r) return false;
      await reload(); toast('已刪除這筆追加款');
    },
  });
}
