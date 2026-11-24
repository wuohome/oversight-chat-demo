'use strict';
// 設計部監督總覽｜群組整理（原「漏案比對」，2026-10-20 易用性改版）
// 第一段「LINE 有群組、Ragic 沒建檔」改成「一次一個」：系統先猜它是哪一案，按一下就分好；也可以切成清單勾選一次處理多個。
// 比對二～四維持原樣，摺疊在下面。動作沿用 POST /oversightPair（配對、沒拿到案子、已結案、不是案子、復原）。
// 依賴 oversight.js／oversight-edit.js 的全域：D、S、byId、esc、md、dayDiff、TODAY、api、reload、toast、openSheet、pairSheet、closedSheet、notCaseSheet…

const GAP_FILTERS = [['all', '全部'], ['closed', '名稱像已結案'], ['active', '像進行中案件'], ['old', '兩個月以上沒新相簿'], ['recent', '最近有動靜']];
const GUESS_MIN = 0.3;   // 進行中案件的猜測：名稱相似度低於這個不當成猜測（0.2x 多半是巧合）
const gname = (g) => String(g || '').replace(/^[^\p{L}\p{N}]+/u, '').trim();   // 去掉開頭的 📐 等符號

/* 每個沒歸類的群組：照片數、相簿、系統猜的（已結案案件／進行中案件） */
function gapItems() {
  const closedBy = Object.fromEntries((D.closedCases || []).map((c) => [c.id, c]));
  return D.orphans.map((g, i) => {
    const ent = Object.entries(g.albums || {});
    const top = g.suggestions && g.suggestions[0] && g.suggestions[0].score >= GUESS_MIN ? g.suggestions[0] : null;
    return { ...g, i, photos: ent.reduce((s, [, v]) => s + v[0], 0), albumNames: ent.map(([k]) => k),
      closedHit: g.closedGuess && closedBy[g.closedGuess] ? closedBy[g.closedGuess] : null, activeHit: top && byId(top.id) ? top : null };
  });
}
const gapOld = (o) => !o.last || dayDiff(o.last, TODAY) > 60;
function gapView() {
  const all = gapItems(), f = S.gapFilter;
  const list = all.filter((o) => (f === 'all' ? true : f === 'closed' ? !!o.closedHit : f === 'active' ? !!o.activeHit : f === 'old' ? gapOld(o) : !gapOld(o)));
  return { all, list, cnt: { all: all.length, closed: all.filter((o) => o.closedHit).length, active: all.filter((o) => o.activeHit).length, old: all.filter(gapOld).length, recent: all.filter((o) => !gapOld(o)).length } };
}

function viewGap() {
  const stale = D.staleIds.map(byId).filter(Boolean).sort((a, b) => b.days - a.days);
  const noGroup = D.noGroupIds.map(byId).filter(Boolean);
  const noMember = D.noMemberIds.map(byId).filter(Boolean);
  const { all, list, cnt } = gapView();
  const total = all.length + (D.handled || []).length, done = (D.handled || []).length;
  if (S.gapIdx >= list.length) S.gapIdx = Math.max(0, list.length - 1);
  const o = list[S.gapIdx];
  const sel = Object.keys(S.gapSel).filter((k) => S.gapSel[k] && all.some((x) => x.group === k));
  const card = o ? `<article class="tcard" id="gapCard">
      <p class="eyebrow">第 ${S.gapIdx + 1} / ${list.length} 個</p>
      <h3>${esc(gname(o.group))}</h3>
      <div class="facts2"><span>${o.photos} 張照片</span><span>${o.last ? '最近相簿日期 ' + md(o.last) + (gapOld(o) ? '（' + dayDiff(o.last, TODAY) + ' 天前）' : '') : '還沒有相簿'}</span>${o.albumNames.length ? `<span>相簿：${esc(o.albumNames.slice(0, 6).join('、'))}${o.albumNames.length > 6 ? '…' : ''}</span>` : ''}</div>
      ${o.closedHit ? `<div class="guess"><div><b>系統猜：已結案的「${esc(o.closedHit.name)}」</b><p class="hint">${esc(shortAddr(o.closedHit.address) || '地址未填')}</p></div><button class="btn primary" type="button" data-gact="closed" data-gref="${esc(o.closedHit.id)}">對，就是它</button></div>`
        : o.activeHit ? `<div class="guess"><div><b>系統猜：進行中的「${esc(o.activeHit.name)}」</b><p class="hint">名稱${o.activeHit.score >= 0.5 ? '很像' : '有點像'}（相似度 ${Math.round(o.activeHit.score * 100)}%），請確認</p></div><button class="btn primary" type="button" data-gact="pair" data-gref="${esc(o.activeHit.id)}">對，配對</button></div>`
          : gapOld(o) ? '<div class="guess soft"><div><b>兩個月以上沒有新相簿</b><p class="hint">多半是做完結案，或估價後沒拿到案子。</p></div></div>' : ''}
      <div class="choices">
        <button class="choice" type="button" data-gact="pair"><b>是進行中的案子</b><small>選它對應哪一案</small><kbd>按 1</kbd></button>
        <button class="choice" type="button" data-gact="nodeal"><b>沒拿到案子</b><small>估價後沒成交</small><kbd>按 2</kbd></button>
        <button class="choice" type="button" data-gact="closed"><b>已經做完結案</b><small>選它是哪一個舊案</small><kbd>按 3</kbd></button>
        <button class="choice" type="button" data-gact="notcase"><b>不是案子</b><small>行銷、廠商、內部群組</small><kbd>按 4</kbd></button>
      </div>
      <div class="tnav"><button class="btn sm" type="button" data-gnav="-1" ${S.gapIdx ? '' : 'disabled'}>上一個</button><button class="btn sm quiet" type="button" data-gnav="1" ${S.gapIdx < list.length - 1 ? '' : 'disabled'}>先跳過</button></div>
    </article>` : `<p class="empty" style="margin-top:16px">${all.length ? '這一類都整理完了。' : '所有 LINE 群組都歸類了。'}</p>`;
  const rows = `<div class="glist">${list.map((x) => `<label class="grow2" for="gs-${x.i}"><input type="checkbox" id="gs-${x.i}" data-gsel="${esc(x.group)}" ${S.gapSel[x.group] ? 'checked' : ''}><div><b>${esc(gname(x.group))}</b><p>${x.photos} 張 ・ ${x.last ? md(x.last) : '沒有相簿'}${x.closedHit ? ' ・ 名稱像已結案' : ''}${x.activeHit ? ' ・ 像進行中案件' : ''}</p></div></label>`).join('') || '<p class="hint" style="padding:12px 0">這一類都整理完了。</p>'}</div>
    <div class="bulk ${sel.length ? 'on' : ''}" id="bulkBar"><span>已選 <b class="tnum">${sel.length}</b> 個</span><button class="btn sm" type="button" data-gbulk="closed">都標「已經做完結案」</button><button class="btn sm" type="button" data-gbulk="nodeal">都標「沒拿到案子」</button><button class="btn sm" type="button" data-gbulk="notcase">都標「不是案子」</button><button class="btn sm" type="button" data-gbulk="clear">取消選取</button></div>`;
  return `
  ${S.who === WHO_ALL ? '' : `<p class="note" style="margin-bottom:16px">目前切換在「${esc(S.who)}」：下面的比對二～四只列他負責的案子。上面的群組整理是 LINE 裡還沒對到任何案子的群組，沒有負責人，不分設計師，一律全列。</p>`}
  <section class="sec">
    <div class="gap-top"><div><p class="finding">這些群組在 LINE 有、Ragic 進行中案件沒有對到。已整理 <b class="tnum">${done}</b> / ${total}。標過的隨時可以在最下面「已處理」復原。</p></div>
      <div class="segc" role="group" aria-label="整理方式"><button type="button" data-gmode="one" aria-pressed="${S.gapMode === 'one'}">一次一個</button><button type="button" data-gmode="list" aria-pressed="${S.gapMode === 'list'}">清單勾選</button></div></div>
    <div class="gprog" aria-hidden="true"><i style="width:${total ? (done / total) * 100 : 0}%"></i></div>
    <div class="chips" style="margin-top:14px" role="group" aria-label="篩選">${GAP_FILTERS.map(([k, l]) => `<button class="chip" type="button" data-gf="${k}" aria-pressed="${S.gapFilter === k}">${l} <b class="tnum">${cnt[k]}</b></button>`).join('')}</div>
    ${S.gapMode === 'one' ? card : rows}
  </section>

  ${docsQuotesBlock()}

  <section class="sec gap-more">
    <details class="fold"><summary>比對二：Ragic 工程中、LINE 超過 ${D.staleDays} 天沒動 <span class="pill ${stale.length ? 'red' : 'gray'}" style="margin-left:8px">${stale.length} 案</span></summary>
      <div class="fl"><p class="blk-sub" style="margin:0 0 10px">群組還在，但很久沒有新照片。可能停工、可能設計師沒拍。</p><div class="gaplist">
      ${stale.map((c) => `<div class="gapitem"><div><h3>${esc(c.name)}</h3>${whoLine(c)}<p>${esc(c.designer || '未指派')} ・ 最後一張 ${md(c.last)}「${esc(c.cur || '—')}」・ 已經 <b style="color:var(--red-ink)">${c.days} 天</b>沒新照片</p></div>
        <div class="acts"><button class="btn primary" type="button" data-case="${esc(c.id)}" data-csec="progress">看這案</button></div></div>`).join('') || '<p class="empty">沒有停更的案子。</p>'}
      </div></div></details>
    <details class="fold"><summary>比對三：Ragic 有建檔、LINE 找不到群組 <span class="pill gray" style="margin-left:8px">${noGroup.length} 案</span></summary>
      <div class="fl"><p class="blk-sub" style="margin:0 0 10px">灰色的是已知原因，不算警示。這些案子的進度依 Ragic 週報推估。</p><div class="gaplist">
      ${noGroup.map((c) => `<div class="gapitem ${c.noGroupReason ? 'known' : ''}"><div><h3>${esc(c.name)}　${statusPill(c)}</h3>${whoLine(c)}<p>${esc(c.designer || '未指派')} ・ Ragic #${c.rid} ・ ${esc(c.noGroupReason || '還沒有配對到 LINE 群組（在上面整理群組時配對，或請設計師把公司帳號加進群組）')}</p></div>
        <div class="acts">${c.noGroupReason ? '<span class="pill gray">已知原因</span>' : `<button class="btn" type="button" data-case="${esc(c.id)}">看這案</button>`}</div></div>`).join('') || '<p class="empty">每個工程中的案子都配到群組了。</p>'}
      </div></div></details>
    <details class="fold"><summary>比對四：群組裡沒有瓊安也沒有小助手 <span class="pill ${noMember.length ? 'amber' : 'gray'}" style="margin-left:8px">${noMember.length} 案</span></summary>
      <div class="fl"><p class="blk-sub" style="margin:0 0 10px">群組有配對，但瓊安不在群組、小助手也沒收到過訊息，系統兩邊都看不到這個群組。沒有群組的案子在「比對三」，不重複列。小助手加入群組後如果一直沒人講話，系統就看不到它，所以這裡的「沒收到過訊息」不代表它一定不在群組。</p><div class="gaplist">
      ${noMember.map((c) => `<div class="gapitem"><div><h3>${esc(c.name)}</h3>${whoLine(c)}<p>${esc(c.designer || '未指派')} ・ 群組：${esc(c.group)}</p>${memberTags(c)}</div>
        <div class="acts"><button class="btn" type="button" data-case="${esc(c.id)}">看這案</button></div></div>`).join('') || '<p class="empty">沒有這種案子。</p>'}
      </div></div></details>
  </section>
  ${handledHTML()}`;
}

/* 底部「已處理」：標成沒拿到案子／已結案／不是案子的群組，依原因分組，每筆可復原 */
function handledHTML() {
  const H = D.handled || [];
  if (!H.length) return '';
  const KINDS = [['nodeal', '未成交（沒拿到案子）'], ['closed', '已結案'], ['notcase', '不是案子']];
  const row = (h) => {
    const i = H.indexOf(h);
    const where = h.kind === 'closed' ? (h.noRecord ? 'Ragic 沒有這筆' : `配到已結案案件 #${esc(h.caseId)} ${esc(h.caseName)}`) : esc(h.reason || '');
    return `<div class="fold-row"><div><b>${esc(h.group)}</b><span>${where}${h.note ? `・${esc(h.note)}` : ''}・${esc(h.by || '')} ${h.at ? esc(stampTW(h.at)) : ''}${h.photos ? `・${h.photos} 張照片${h.last ? '，最後 ' + md(h.last) : ''}` : ''}</span></div>${CAN_EDIT ? `<button class="btn" type="button" data-undo="${i}">復原</button>` : ''}</div>`;
  };
  return `<details class="fold" id="handledBox" ${S.openHandled ? 'open' : ''} style="margin-top:28px"><summary>已處理 ${H.length} 筆</summary><div class="fold-list">
    ${KINDS.map(([k, label]) => { const list = H.filter((h) => h.kind === k); return list.length ? `<p class="kicker" style="margin-top:10px">${label}・${list.length} 筆</p>${list.map(row).join('')}` : ''; }).join('')}
    <p class="note" style="margin:10px 0">按「復原」，這個群組就回到上面的清單。已結案的群組縮圖，照案件結案滿 90 天的規則清除；沒拿到案子、不是案子的，從標記日起滿 90 天清除。原圖都在 LINE 相簿。</p>
  </div></details>`;
}

/* ---------- 動作 ---------- */
// 送出一筆配對／標記，不重抓資料（連續整理時由呼叫端在最後一起重抓）
async function pairRaw(payload) {
  try { await api('/oversightPair', { method: 'POST', body: JSON.stringify(payload) }); return true; } catch (e) {
    if (e.status === 401) { closeSheet(); onAuthError(e); return false; }
    toast(errText(e)); return false;
  }
}
// 整理完一個：重抓資料（自動換下一個）、提示列附復原
async function gapDone(label, undoPayloads) {
  await reload();
  toast(`已整理：${label}`, async () => {
    for (const p of undoPayloads) if (!(await pairRaw(p))) return;
    await reload(); toast('已復原，這個群組回到清單');
  });
}
function gapCurrent() { const { list } = gapView(); return list[S.gapIdx] || null; }

async function gapAct(kind, ref) {
  const o = gapCurrent(); if (!o) return;
  const g = o.group, short = gname(g), undo = [{ group_name: g, unpair: true }];
  if (kind === 'nodeal') { if (await pairRaw({ group_name: g, not_a_case: true, reason: '未成交' })) await gapDone(`「${short}」沒拿到案子`, undo); return; }
  if (kind === 'notcase') { notCaseSheet(o.i); return; }
  if (kind === 'closed' && ref) {
    const c = (D.closedCases || []).find((x) => x.id === ref);
    if (await pairRaw({ group_name: g, ragic_id: ref })) await gapDone(`「${short}」→ 已結案的「${c ? c.name : ref}」`, undo);
    return;
  }
  if (kind === 'pair' && ref) {
    const c = byId(ref);
    if (await pairRaw({ group_name: g, ragic_id: ref })) await gapDone(`「${short}」→ 配對「${c ? c.name : ref}」`, undo);
    return;
  }
  if (kind === 'closed') { closedSheet(o.i); return; }
  if (kind === 'pair') { pairSheet(o.i); return; }
}

// 清單勾選的批次：沒拿到案子可直接送；不是案子先選原因
async function gapBulk(kind) {
  const names = Object.keys(S.gapSel).filter((k) => S.gapSel[k] && D.orphans.some((x) => x.group === k));
  if (kind === 'clear') { S.gapSel = {}; render(false); return; }
  if (!names.length) return;
  const undo = names.map((g) => ({ group_name: g, unpair: true }));
  const run = async (reason, label) => {
    if (!(await pairRaw({ group_names: names, not_a_case: true, reason }))) return false;
    S.gapSel = {}; await gapDone(`${names.length} 個群組都標「${label}」`, undo); return true;
  };
  if (kind === 'nodeal') { await run('未成交', '沒拿到案子'); return; }
  if (kind === 'closed') {
    // 已經做完結案（瓊安 2026-11-05：「名稱像已結案」那頁要能一次標）：猜得到 Ragic 已結案案件的逐一配對過去，猜不到的標「已結案（Ragic 沒有這筆）」
    const items = gapItems().filter((o) => names.includes(o.group));
    const hit = items.filter((o) => o.closedHit), miss = items.filter((o) => !o.closedHit);
    openSheet({
      kicker: `${names.length} 個 LINE 群組`, title: '都標成「已經做完結案」', save: '確定',
      body: `<p class="hint">先核對每個群組配到的舊案，有錯就按取消、改用「一次一個」。</p><ul class="bulk-list">
        ${hit.map((o) => `<li><b>${esc(gname(o.group))}</b> → ${esc(o.closedHit.name)}</li>`).join('')}
        ${miss.map((o) => `<li><b>${esc(gname(o.group))}</b> → Ragic 沒有這筆，標「已結案（Ragic 無紀錄）」</li>`).join('')}</ul>`,
      onSave: async () => {
        for (const o of hit) if (!(await pairRaw({ group_name: o.group, ragic_id: o.closedHit.id }))) return false;
        if (miss.length && !(await pairRaw({ group_names: miss.map((o) => o.group), not_a_case: true, reason: '已結案（Ragic 無紀錄）' }))) return false;
        S.gapSel = {}; await gapDone(`${names.length} 個群組都標「已經做完結案」`, undo); return true;
      },
    });
    return;
  }
  openSheet({
    kicker: `${names.length} 個 LINE 群組`, title: '都標成「不是案子」', save: '確定',
    body: `<fieldset class="opts"><legend class="flabel">原因</legend>
      ${D.notCaseReasons.map((r, k) => `<label class="opt" for="bnc-${k}"><input type="radio" name="bncReason" id="bnc-${k}" value="${esc(r)}" ${k === 0 ? 'checked' : ''}><span>${esc(r)}</span></label>`).join('')}</fieldset>`,
    onSave: async () => (await run(document.querySelector('input[name="bncReason"]:checked').value, '不是案子')) && true,
  });
}

// 點擊分流（oversight-actions.js 的 uxClick 轉進來）
function gapClick(t, d) {
  if (d.gmode) { S.gapMode = d.gmode; render(false); return true; }
  if (d.gf) { S.gapFilter = d.gf; S.gapIdx = 0; render(false); return true; }
  if (d.gnav) { S.gapIdx = Math.max(0, S.gapIdx + Number(d.gnav)); render(false); return true; }
  if (d.gact) { gapAct(d.gact, d.gref || ''); return true; }
  if (d.gbulk) { gapBulk(d.gbulk); return true; }
  return false;
}

// 鍵盤：1 是進行中的案子、2 沒拿到案子、3 已經做完結案、4 不是案子（「一次一個」模式、沒有開面板、不在輸入欄時）
document.addEventListener('keydown', (e) => {
  if (S.view !== 'gap' || S.gapMode !== 'one' || !CAN_EDIT || SHEET || e.ctrlKey || e.metaKey || e.altKey) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '') || (e.target && e.target.isContentEditable)) return;
  const kind = { 1: 'pair', 2: 'nodeal', 3: 'closed', 4: 'notcase' }[e.key];
  if (!kind) return;
  e.preventDefault();
  if (!gapCurrent()) return;
  gapAct(kind, '');   // 鍵盤是「我要自己選」；一鍵確認系統猜的，按卡片上那顆「對，就是它」
});
