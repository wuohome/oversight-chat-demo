'use strict';
// 設計部監督總覽｜常用動作（2026-10-20 易用性改版）：案件頁頂端的金額與動作列、標記結案、新增追加款、備註、首頁整列「這週先不管」。
// 全部沿用既有的 POST /oversightEdit（case_field／pay_add／extra_add／note_add／task_batch）。
// 依賴 oversight.js／oversight-edit.js／oversight-pay.js 的全域：D、DATA、S、byId、esc、money、md、openSheet、sheetErr、postEdit、reload、toast、syncMsg…

/* ---------- 案件頁頂端：合約／追加款／已收／到期還沒收，一排常用動作，備註 ---------- */
function heroActions(c) {
  if (!CAN_EDIT) return '';
  const r = c.recon || {};
  const dueLab = c.closed ? '尾款未收' : '到期未收';
  const due = c.settled ? '已標收清' : 'NT$' + money(c.dueAmt || 0);
  return `<section class="hero-acts" id="heroActs">
    <div class="money-line">
      <div class="ml"><span>合約</span><b>${r.hasContract ? 'NT$' + money(r.contractTotal) : '—'}</b></div>
      <div class="ml"><span>追加款</span><b>${r.extraTotal ? 'NT$' + money(r.extraTotal - (c.unsignedAmt || 0)) : '沒有'}</b>${c.unsignedAmt ? `<small class="unsigned">另有待簽名 NT$${money(c.unsignedAmt)}（不算）</small>` : ''}</div>
      <div class="ml"><span>累計已收</span><b>NT$${money(r.paidTotal || 0)}</b></div>
      <div class="ml ${c.dueAmt ? 'bad' : ''}"><span>${dueLab}</span><b>${due}</b></div>
    </div>
    <div class="actbar">
      <button class="btn primary" type="button" data-payadd="${esc(c.id)}">登記收款</button>
      <button class="btn" type="button" data-extraadd="${esc(c.id)}">新增追加款</button>
      ${c.closed ? `<button class="btn" type="button" data-reopen="${esc(c.id)}">改回工程中</button>` : `<button class="btn" type="button" data-close="${esc(c.id)}">標記結案</button>`}
      <button class="btn quiet" type="button" data-noteopen="${esc(c.id)}">加備註</button>
    </div>
    ${noteBlock(c, 'case')}
  </section>
  <div class="sticky-bar" id="stickyBar"><b>${esc(c.name)}</b><button class="btn primary sm" type="button" data-payadd="${esc(c.id)}">登記收款</button><button class="btn sm" type="button" data-extraadd="${esc(c.id)}">新增追加款</button>${c.closed ? '' : `<button class="btn sm" type="button" data-close="${esc(c.id)}">標記結案</button>`}</div>`;
}

/* ---------- 標記結案：先列出結案前要知道的事，再選結案日 ---------- */
function closeCaseSheet(c) {
  if (!c || !CAN_EDIT || c.closed) return;
  const rest = c.pays.reduce((s, p) => s + (p.status === 'unsigned' ? 0 : p.short || 0), 0);   // 待簽名的追加單不算應收（全站同一條）
  const last = c.items[c.items.length - 1];
  const checks = [
    c.pays.length
      ? [rest === 0, rest === 0 ? '款項都收齊了' : `還有 NT$${money(rest)} 沒收（含還沒到期的）`]
      : [false, '這案沒有款項資料可對照，結案前請自己確認款項'],
    last.state === 'done' ? [true, '清潔驗收已完成'] : last.state === 'skip' ? [true, '清潔驗收標「本案不做」'] : [false, `清潔驗收目前是「${STATE_LABEL[last.state]}」`],
    [true, '照片縮圖會保留 90 天，原圖一直在 LINE 相簿'],
  ];
  openSheet({
    kicker: c.name, title: '標記結案', save: '確定結案',
    sync: DATA.ragicWrite ? '會把 Ragic 狀態改成「已結案」。結案後這案不再出現在進行中的待辦；沒收齊的尾款照樣在「待辦事項」提醒。' : 'Ragic 同步尚未開啟：先存在網站，標「待同步 Ragic」。沒收齊的尾款照樣在「待辦事項」提醒。',
    body: `${checks.map(([ok, t]) => `<div class="check"><i class="${ok ? 'ok' : 'no'}">${ok ? '好' : '!'}</i><span>${esc(t)}</span></div>`).join('')}
      ${rest ? '<p class="note warn" style="margin-top:8px">還有錢沒收也可以先結案，例如尾款約好下個月付。結案後款項提醒會繼續：這案會留在「待辦事項」，標「已結案・尾款未收」，直到收齊，或你按「尾款已收清」。</p>' : ''}
      <div class="field" style="margin-top:12px"><label for="closeDate">結案日</label><input class="inp" id="closeDate" type="date" value="${localISO()}" max="${addDays(localISO(), 1)}"></div>
      <div class="field"><label for="closeNote">備註（選填）</label><input class="inp" id="closeNote" type="text" placeholder="例如：尾款 11/15 付" autocomplete="off" maxlength="180"></div>`,
    onSave: async () => {
      const d = $('#closeDate').value;
      if (!d) return sheetErr('請填結案日。');
      const r = await postEdit({ op: 'case_field', ragic_id: c.id, field: 'status', value: '已結案', closed_at: d }, true);
      if (!r) return false;
      const note = $('#closeNote').value.trim();
      if (note) await postEdit({ op: 'note_add', ragic_id: c.id, text: '結案：' + note }, true);
      await reload();
      toast(`「${c.name}」已結案，移到案件清單的「已結案」${syncMsg(r)}`, () => reopenCase(c.id));
    },
  });
}
async function reopenCase(id) {
  const c = byId(id); if (!c || !CAN_EDIT) return;
  const r = await postEdit({ op: 'case_field', ragic_id: id, field: 'status', value: '工程中' });
  if (!r) return;
  await reload(); toast(`「${c.name}」已改回工程中${syncMsg(r)}`);
}

/* ---------- 新增追加款：寫進 Ragic 追加款子表 ---------- */
function extraSheet(c) {
  if (!c || !CAN_EDIT) return;
  openSheet({
    kicker: c.name, title: '新增追加款', save: '新增',
    sync: DATA.ragicWrite ? '會在 Ragic 追加款子表新增一列（追加日期、項目、金額），寫完會讀回確認' : 'Ragic 同步尚未開啟：先存在網站，標「待同步 Ragic」，照樣計入應收',
    body: `<p class="note">屋主簽了追加工程單才新增。收到這筆錢之後，用「登記收款」選「追加款」。追加減（扣款）請到 Ragic 追加款子表處理。</p>
      <div class="field"><label for="exName">追加什麼</label><input class="inp" id="exName" type="text" maxlength="60" placeholder="例如：冷氣、結構補強" autocomplete="off"></div>
      <div class="field"><label for="exAmt">金額（元）</label><input class="inp tnum" id="exAmt" type="text" inputmode="numeric" autocomplete="off"></div>
      <div class="field"><label for="exDate">屋主簽追加單的日期</label><input class="inp" id="exDate" type="date" value="${localISO()}" max="${addDays(localISO(), 1)}"></div>`,
    onSave: async () => {
      const item = $('#exName').value.trim(), amt = payNum($('#exAmt').value), d = $('#exDate').value;
      if (!item) return sheetErr('請寫追加什麼。');
      if (!amt) return sheetErr('請填金額。');
      if (!d) return sheetErr('請填日期。');
      const r = await postEdit({ op: 'extra_add', ragic_id: c.id, item, amount: amt, date: d }, true);
      if (!r) return false;
      await reload(); toast(`已新增追加款「${item}」NT$${money(amt)}${syncMsg(r)}`);
    },
  });
}

/* ---------- 備註（待辦事項一列、案件頁頂端共用同一份） ---------- */
function noteOpen(id) {
  S.noteEdit = id; S.noteDraft = ''; render(false);
  const t = $('#noteDraft'); if (t) { t.focus({ preventScroll: true }); t.scrollIntoView({ block: 'nearest' }); }
}
async function noteSave(id) {
  if (NOTE_BUSY) return;   // 與案件頁共用同一個旗標（oversight-edit.js），送出中再按不重送
  const t = $('#noteDraft'); const v = (t ? t.value : S.noteDraft).trim();
  if (!v) { const e = $('#noteErr'); if (e) e.textContent = '請寫一點內容。'; if (t) t.focus(); return; }
  NOTE_BUSY = true;
  try {
    const r = await postEdit({ op: 'note_add', ragic_id: id, text: v });
    if (!r) return;
    S.noteEdit = null; S.noteDraft = '';
    await reload(); toast(`已加備註${syncMsg(r)}`);
  } finally { NOTE_BUSY = false; }
}

/* ---------- 待辦事項整案「這週先不管」：對這案每一件待辦各送一個暫緩（一次寫入） ---------- */
async function snoozeCase(id) {
  const ts_ = D.tasks.filter((t) => t.caseId === id && t.state === 'active');
  if (!ts_.length) return;
  const items = ts_.map((t) => ({ key: t.key, sig: t.sig, title: t.title }));
  const r = await postEdit({ op: 'task_batch', act: 'snooze', items });
  if (!r) return;
  await reload();
  toast(`這案先不管，${md(r.until)} 再出現`, async () => { if (await postEdit({ op: 'task_batch', act: 'undo', items })) { await reload(); toast('已放回待辦'); } });
}

/* ---------- 點擊分流（由 oversight.js 的全域 click 轉進來；回傳 true＝已處理） ---------- */
function uxClick(t, d) {
  // 不需要編輯權限的（檢視者也能用）
  if (d.back !== undefined) { const cur = byId(S.caseId); S.casesTab = cur && cur.closed ? 'closed' : 'active'; go('cases'); return true; }
  if (d.ctab) { S.casesTab = d.ctab; render(false); return true; }
  if (d.jumpsec) { scrollToSection(d.jumpsec); return true; }
  if (d.qf) {   // 總覽的數字卡、待辦事項頁的快篩：切到那一類待辦（在別頁就先跳到待辦事項）
    S.qFilter = d.qf;
    if (S.view !== 'todo') go('todo'); else render(false);
    return true;
  }
  if (d.noteall) { S.noteAll[d.noteall] = !S.noteAll[d.noteall]; render(false); return true; }
  if (d.claim) { claimIntro(byId(d.claim)); return true; }   // 檢視者首頁搜尋結果的「這是我介紹的」
  if (!CAN_EDIT) return false;
  // 以下都需要編輯權限（伺服器也會擋）
  if (d.close) { closeCaseSheet(byId(d.close)); return true; }
  if (d.reopen) { reopenCase(d.reopen); return true; }
  if (d.extraadd !== undefined) { extraSheet(byId(d.extraadd) || byId(S.caseId)); return true; }
  if (d.exrm) { extraRemove(byId(S.caseId), d.exrm); return true; }
  if (d.payadd) { payAddSheet(byId(d.payadd)); return true; }
  if (d.noteopen) { noteOpen(d.noteopen); return true; }
  if (d.notecancel) { S.noteEdit = null; S.noteDraft = ''; render(false); return true; }
  if (d.notesave) { noteSave(d.notesave); return true; }
  if (d.qsnooze) { snoozeCase(d.qsnooze); return true; }
  return typeof gapClick === 'function' ? gapClick(t, d) : false;   // 群組整理（oversight-gap.js）
}
