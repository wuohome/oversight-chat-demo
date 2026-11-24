'use strict';
// 設計部監督總覽｜編輯：側邊面板（手機底部彈出、桌機右側抽屜）與所有存檔動作。
// 全部走 POST /oversightEdit（伺服器驗登入、記錄操作者）；存完重抓資料。
// 款項標記已收／改回未收、改負責人、改狀態會寫回 Ragic，但 Ragic 寫入開關預設關閉 → 先存網站並標「待同步 Ragic」。

let SHEET = null, sheetHideT, SAVING = false;

function openSheet(o) {
  SHEET = o;
  $('#sheetKicker').textContent = o.kicker || '';
  $('#sheetTitle').textContent = o.title;
  $('#sheetBody').innerHTML = o.body + '<p class="err" id="sheetErr" role="alert"></p>';
  $('#sheetSync').textContent = o.sync || '';
  $('#sheetSync').hidden = !o.sync;
  $('#sheetSave').textContent = o.save || '儲存';
  $('#sheetSave').disabled = false;
  clearTimeout(sheetHideT);
  $('#sheet').classList.add('open'); $('#sheetBack').classList.add('open');
  void $('#sheet').offsetWidth;
  $('#sheet').classList.add('on'); $('#sheetBack').classList.add('on');
  document.body.style.overflow = 'hidden';
  if (o.mount) o.mount();
  setTimeout(() => {
    if (window.innerWidth >= 1024) { const f = $('#sheetBody').querySelector('input[type=text],select,textarea'); (f || $('#sheetX')).focus({ preventScroll: true }); }
    else $('#sheet').focus({ preventScroll: true });
  }, 80);
}
function closeSheet() {
  $('#sheet').classList.remove('on'); $('#sheetBack').classList.remove('on');
  document.body.style.overflow = ''; SHEET = null;
  sheetHideT = setTimeout(() => { $('#sheet').classList.remove('open'); $('#sheetBack').classList.remove('open'); }, 240);
}
function sheetErr(msg) { const e = $('#sheetErr'); if (e) e.textContent = msg; return false; }
$('#sheetSave').onclick = async () => {
  if (!SHEET || SAVING) return;
  const ok = await SHEET.onSave();
  if (ok !== false) closeSheet();
};
$('#sheetCancel').onclick = closeSheet;
$('#sheetX').onclick = closeSheet;
$('#sheetBack').onclick = closeSheet;

const syncNote = () => (DATA.ragicWrite ? '會同步寫回 Ragic' : 'Ragic 同步尚未開啟：先存在網站，標「待同步 Ragic」');
function syncMsg(r) {
  if (!r || !r.sync || r.sync === 'synced') return '';
  if (r.sync === 'pending') return '（Ragic 同步尚未開啟，先存在網站）';
  if (r.sync === 'failed') return '（寫回 Ragic 失敗，已先存在網站）';
  if (r.sync === 'local') return '';
  return '';
}
function errText(e) {
  if (e.body && e.body.message) return e.body.message;   // 伺服器給了白話說明（歸檔失敗、沒配對…）就直接顯示
  if (e.status === 403) return '你的帳號沒有編輯權限。';
  if (e.status === 409) return (e.body && e.body.message) || '這筆要到 Ragic 修改。';
  if (e.status === 404) return '找不到這筆資料，請按重新整理再試一次。';
  if (e.status === 400) return '填的內容不符格式，請檢查後再試一次。';
  return `存不進去（${e.status || '網路'}），請再試一次。`;
}
// 送出編輯。成功回傳伺服器結果；失敗在面板或提示顯示原因並回傳 null；登入過期回登入畫面
async function postEdit(body, inSheet = false) {
  if (SAVING) return null;
  SAVING = true;
  const btn = $('#sheetSave'); if (inSheet && btn) btn.disabled = true;
  try {
    return await api('/oversightEdit', { method: 'POST', body: JSON.stringify(body) });
  } catch (e) {
    if (e.status === 409 && e.body && e.body.error === 'duplicate_payment') return { dup: e.body.existing };   // 登記收款防重複：後端也擋，交給 oversight-pay.js 跳確認
    if (e.status === 401) { closeSheet(); onAuthError(e); return null; }
    if (inSheet) sheetErr(errText(e)); else toast(errText(e));
    return null;
  } finally { SAVING = false; if (inSheet && btn) btn.disabled = false; }
}

/* 款項（登記收款）在 oversight-pay.js */
const localISO = () => { const d = new Date(Date.now() + 8 * 3600e3); return d.toISOString().slice(0, 10); };

/* ---------- 工項狀態 ---------- */
function itemSheet(c, name) {
  const x = c.items.find((i) => i.name === name);
  const isMiss = x.state === 'miss';
  openSheet({
    kicker: c.name, title: `${name}：改狀態`, sync: '只存在網站，不寫回 Ragic',
    body: `<p class="note">目前：<b>${STATE_LABEL[x.state]}</b>${x.manual ? '（人工改過）' : (x.inferred ? '（依 Ragic 週報推估）' : '（系統判斷）')}${x.count ? ` ・ ${x.count} 張照片，最後 ${md(x.last)}` : ' ・ 沒有照片'}</p>
      ${isMiss ? `<p class="note warn">估價單有「${esc(name)}」，案子已經做到清潔驗收，卻一直沒有它的照片。選「本案不做」或「確認有漏」之後，就不會再出現在待辦。</p>` : ''}
      <fieldset class="opts"><legend class="flabel">改成</legend>
        ${EDIT_STATES.map((s) => `<label class="opt" for="itemState-${s}"><input type="radio" name="itemState" id="itemState-${s}" value="${s}" ${(!isMiss && x.state === s) ? 'checked' : ''}><span>${STATE_LABEL[s]}<small>${{ done: '這項做完了', doing: '現在正在做這項', todo: '還沒進場', skip: '這案沒有這個工項', missc: '該做卻沒做或沒拍，要追' }[s]}</small></span></label>`).join('')}
        ${x.manual ? `<label class="opt" for="itemState-auto"><input type="radio" name="itemState" id="itemState-auto" value="auto"><span>回到系統判斷<small>取消人工修改</small></span></label>` : ''}
      </fieldset>
      ${x.count ? `<button class="btn quiet wide-btn" type="button" id="itemPhotos">看這項的照片（${x.count} 張）</button>` : ''}`,
    mount: () => { const b = $('#itemPhotos'); if (b) b.onclick = () => { closeSheet(); jumpPhotos(name); }; },
    onSave: async () => {
      const r = document.querySelector('input[name="itemState"]:checked');
      if (!r) return sheetErr('請選一個狀態。');
      if (r.value === x.state) return true;
      const res = await postEdit({ op: 'item_state', ragic_id: c.id, item: name, state: r.value, from_state: x.state }, true);
      if (!res) return false;
      await reload(); toast(isMiss ? `已處理「${name}」，待辦少一件` : `已把「${name}」改成${r.value === 'auto' ? '系統判斷' : STATE_LABEL[r.value]}`);
    },
  });
}

/* ---------- 待辦：已處理／暫緩／復原／備註 ---------- */
async function taskAct(act, key) {
  const t = D.tasks.find((x) => x.key === key); if (!t) return;
  const r = await postEdit({ op: 'task', key, act, sig: t.sig, title: t.title });
  if (!r) return;
  await reload();
  const chat = t.kind === 'chat';
  toast(act === 'done' ? (chat ? '已標做完了，可以復原' : '已先拿掉，可以復原') : act === 'snooze' ? `這週先不管，${md(r.until)} 再出現` : act === 'skip' ? '已標不用做，可以復原' : '已放回待辦');
}
function taskNoteSheet(key) {
  const t = D.tasks.find((x) => x.key === key); if (!t) return;
  openSheet({
    kicker: '待辦備註', title: t.title,
    body: `<div class="field"><label for="taskNoteInput">備註一行</label><input class="inp" id="taskNoteInput" type="text" value="${esc(t.note || '')}" placeholder="例如：設計師說週三補照片" autocomplete="off" maxlength="200"></div>`,
    onSave: async () => {
      const v = $('#taskNoteInput').value.trim();
      if (!v && !t.note) return sheetErr('請寫一點內容。');
      const r = await postEdit({ op: 'task', key, act: 'note', note: v, sig: t.sig, title: t.title }, true);
      if (!r) return false;
      await reload(); toast(v ? '已加備註' : '已刪除備註');
    },
  });
}

/* ---------- 案件：屋主／負責人／狀態／備註 ---------- */
async function saveOwner(c) {
  const v = $('#caseOwner').value.trim();
  if (v === (c.owner || '')) { toast('屋主沒有變動'); return; }
  const r = await postEdit({ op: 'case_field', ragic_id: c.id, field: 'owner', value: v });
  if (!r) return;
  await reload(); toast('已更新屋主（網站修正，不寫回 Ragic）');
}
async function saveCommunity(c) {
  const v = $('#caseCommunity').value.trim();
  if (v === ((c.archive && c.archive.manual) || '')) { toast('社區名沒有變動'); return; }
  if (/[\\/:*?"<>|（）()]/.test(v)) { toast('社區名不能含斜線、冒號、括號等符號'); return; }
  const r = await postEdit({ op: 'community', ragic_id: c.id, value: v });
  if (!r) return;
  await reload(); toast(v ? '已存，Drive 資料夾下次存檔時會改名' : '已清除補填的社區名');
}
async function saveTian(el) {
  const c = byId(S.caseId); if (!c || !CAN_EDIT) return;
  const r = await postEdit({ op: 'house_type', ragic_id: c.id, on: el.checked });
  if (!r) { render(false); return; }
  await reload(); toast(el.checked ? '已標為整棟透天，Drive 資料夾下次存檔時會改名' : '已取消透天標記');
}
async function changeCaseField(el) {
  const c = byId(S.caseId); if (!c || !CAN_EDIT) return;
  const field = el.id === 'caseDesigner' ? 'supervisor' : 'status';
  // 改成「已結案」一律走「標記結案」面板（先核對款項與驗收、記結案日），下拉不能繞過
  if (field === 'status' && el.value === '已結案') { render(false); closeCaseSheet(c); return; }
  const r = await postEdit({ op: 'case_field', ragic_id: c.id, field, value: el.value });
  if (!r) { render(false); return; }
  await reload(); toast(`${field === 'supervisor' ? '已改負責人' : `已改成${el.value}`}${syncMsg(r)}`);
}
// 送出到重新載入完要幾秒，這段時間再按會重送一筆（11/5 民族路4樓、洋溢、Dora 都出現成對的重複備註），所以送出中一律不收第二次
let NOTE_BUSY = false;
async function addCaseNote(c) {
  if (NOTE_BUSY) return;
  const v = $('#caseNoteInput').value.trim();
  if (!v) { toast('請先寫備註內容'); $('#caseNoteInput').focus(); return; }
  NOTE_BUSY = true;
  try {
    const r = await postEdit({ op: 'note_add', ragic_id: c.id, text: v });
    if (!r) return;
    const t = $('#caseNoteInput'); if (t) t.value = '';
    await reload(); toast(`已新增備註${syncMsg(r)}`);
  } finally { NOTE_BUSY = false; }
}

/* ---------- 漏案：配對案件／不是案子（沿用 /oversightPair） ---------- */
async function postPair(payload, msg) {
  try {
    await api('/oversightPair', { method: 'POST', body: JSON.stringify(payload) });
  } catch (e) {
    if (e.status === 401) { closeSheet(); onAuthError(e); return false; }
    if (SHEET) sheetErr(errText(e)); else toast(errText(e));
    return false;
  }
  await reload();
  // 每一種整理（配對、沒拿到案子、已結案、不是案子）6 秒內都可以按「復原」，群組就回到清單
  const g = payload.group_name;
  toast(msg, g && !payload.unpair && !payload.group_names ? async () => { if (await pairRaw({ group_name: g, unpair: true })) { await reload(); toast('已復原，這個群組回到清單'); } } : undefined);
  return true;
}
function pairSheet(i) {
  const g = D.orphans[Number(i)]; if (!g) return;
  const opts = CASES.filter((c) => c.active).sort((a, b) => a.rid - b.rid);
  const top = g.suggestions && g.suggestions[0] && g.suggestions[0].score >= 0.4 ? g.suggestions[0].id : '';
  openSheet({
    kicker: 'LINE 群組', title: `「${g.group}」配對到哪一案？`, sync: '配對存在網站，之後這個群組永久對上這案',
    save: '配對',
    body: `${g.suggestions && g.suggestions.length ? `<p class="note">系統建議：${g.suggestions.map((s) => `${esc(s.name)}（${Math.round(s.score * 100)}%）`).join('、')}</p>` : '<p class="note">沒有名字相近的案件，請從清單選，或標「不是案子」。</p>'}
      <div class="field"><label for="pairSelect">Ragic 案件</label>
      <select class="inp" id="pairSelect"><option value="">請選擇</option>${opts.map((c) => `<option value="${esc(c.id)}" ${c.id === top ? 'selected' : ''}>#${c.rid} ${esc(c.name)}（${esc(shortAddr(c.address) || '無地址')}）</option>`).join('')}</select></div>
      <p class="note">同一條路有好幾案時，看括號裡的門牌分辨。</p>`,
    onSave: async () => {
      const id = $('#pairSelect').value;
      if (!id) return sheetErr('請選一個案件。');
      const c = byId(id);
      return postPair({ group_name: g.group, ragic_id: id }, `已配對到「${c.name}」`);
    },
  });
}
function notCaseSheet(i) {
  const g = D.orphans[Number(i)]; if (!g) return;
  openSheet({
    kicker: 'LINE 群組', title: `「${g.group}」不是案子`, save: '確定',
    body: `<fieldset class="opts"><legend class="flabel">原因</legend>
      ${D.notCaseReasons.map((r, k) => `<label class="opt" for="ncReason-${k}"><input type="radio" name="ncReason" id="ncReason-${k}" value="${esc(r)}"><span>${esc(r)}</span></label>`).join('')}
      </fieldset>
      <div class="field"><label for="ncOther">說明（選「其他」時要填）</label><input class="inp" id="ncOther" type="text" autocomplete="off" maxlength="200"></div>`,
    onSave: async () => {
      const r = document.querySelector('input[name="ncReason"]:checked');
      if (!r) return sheetErr('請選原因。');
      const other = $('#ncOther').value.trim();
      if (r.value === '其他' && !other) return sheetErr('選「其他」時請寫說明。');
      return postPair({ group_name: g.group, not_a_case: true, reason: r.value, note: other }, '已標成不是案子');
    },
  });
}

/* ---------- 介紹夥伴（可多選，人事表在職同仁；寫回 Ragic 介紹人欄） ---------- */
function introSheet(c) {
  if (!c || !CAN_EDIT) return;
  const cur = new Set(c.intro ? c.intro.names : []);
  const people = D.people || [];
  openSheet({
    kicker: c.name, title: '設定介紹夥伴', save: '儲存',
    sync: `${syncNote()}（Ragic「介紹人」欄；客戶來源不動）`,
    body: `<p class="note">目前顯示：<b>${esc(introLabel(c) || '沒有紀錄')}</b>${c.intro && c.intro.via === 'group' ? '（依群組成員推測）' : c.intro && c.intro.via === 'ragic' ? `（來自 Ragic 客戶來源「${esc(c.intro.text)}」）` : c.intro && c.intro.via === 'text' ? '（Ragic 客戶來源）' : ''}。勾選後以這裡設定的為準；全部取消再儲存，就回到 Ragic 客戶來源。</p>
      <div class="field"><label for="introSearch">搜尋同仁</label><input class="inp" id="introSearch" type="search" placeholder="輸入姓名" autocomplete="off"></div>
      <fieldset class="opts" id="introList"><legend class="flabel">在職同仁（${people.length} 位，可多選）</legend>
        ${people.map((n, i) => `<label class="opt" for="intro-${i}" data-name="${esc(n)}"><input type="checkbox" id="intro-${i}" value="${esc(n)}" ${cur.has(n) ? 'checked' : ''}><span>${esc(n)}</span></label>`).join('') || '<p class="note">人事表暫時讀不到，請稍後再試。</p>'}
      </fieldset>`,
    mount: () => {
      const q = $('#introSearch');
      if (q) q.oninput = () => { const v = q.value.trim(); document.querySelectorAll('#introList .opt').forEach((l) => { l.hidden = !!v && !l.dataset.name.includes(v); }); };
    },
    onSave: async () => {
      const values = [...document.querySelectorAll('#introList input:checked')].map((i) => i.value);
      const r = await postEdit({ op: 'case_field', ragic_id: c.id, field: 'introducers', values }, true);
      if (!r) return false;
      await reload(); toast(`${values.length ? '已設定介紹夥伴' : '已清除，回到 Ragic 客戶來源'}${syncMsg(r)}`);
    },
  });
}

/* ---------- 這是我介紹的（檢視者也能按；只能加自己）／確認系統推測 ---------- */
async function claimIntro(c) {
  if (!c) return;
  if (!confirm(`把你加成「${c.name}」的介紹夥伴？`)) return;
  const r = await postEdit({ op: 'intro_claim', ragic_id: c.id });
  if (!r) return;
  await reload(); toast(r.unchanged ? '你本來就在這案的介紹夥伴裡' : `已把你加成這案的介紹夥伴（芳芳可以移除）${syncMsg(r)}`);
}
async function confirmIntro(c) {
  if (!c || !CAN_EDIT || !c.intro || !c.intro.names.length) return;
  const r = await postEdit({ op: 'case_field', ragic_id: c.id, field: 'introducers', values: c.intro.names });
  if (!r) return;
  await reload(); toast(`已確認介紹夥伴${syncMsg(r)}`);
}

/* ---------- 漏案比對：沒拿到案子／已結案／復原 ---------- */
function nodealSheet(i) {
  const g = D.orphans[Number(i)]; if (!g) return;
  openSheet({
    kicker: 'LINE 群組', title: `「${g.group}」沒拿到案子`, save: '標成沒拿到案子',
    sync: '存在網站，標過的群組移到最下面的「已處理 N 筆」，可以復原',
    body: `<p class="note">估價後沒成交的群組。原因會記成「未成交」。</p>
      <div class="field"><label for="ndNote">備註（選填）</label><input class="inp" id="ndNote" type="text" placeholder="例如：報價太高" autocomplete="off" maxlength="200"></div>`,
    onSave: async () => postPair({ group_name: g.group, not_a_case: true, reason: '未成交', note: $('#ndNote').value.trim() }, '已標成沒拿到案子'),
  });
}
function closedSheet(i) {
  const g = D.orphans[Number(i)]; if (!g) return;
  const list = D.closedCases || [];
  openSheet({
    kicker: 'LINE 群組', title: `「${g.group}」已結案`, save: '配對這個已結案案件',
    sync: '存在網站；配到已結案案件的群組不會出現在進行中案件與待辦',
    body: `<p class="note">從 Ragic 已結案（🗂️已結案）的案件選一筆配對。找不到的話按下面那顆。</p>
      <div class="field"><label for="clSearch">搜尋案名、屋主、地址</label><input class="inp" id="clSearch" type="search" placeholder="輸入關鍵字" autocomplete="off"></div>
      <fieldset class="opts" id="clList"><legend class="flabel">已結案案件（${list.length} 筆）</legend>
        ${list.map((c, k) => `<label class="opt" for="cl-${k}" data-q="${esc((c.name + ' ' + c.owner + ' ' + c.address).toLowerCase())}"><input type="radio" name="closedCase" id="cl-${k}" value="${esc(c.id)}"><span>${esc(c.name)}<small>${c.owner ? '屋主 ' + esc(c.owner) : '屋主未填'} ・ ${esc(shortAddr(c.address) || '地址未填')}</small></span></label>`).join('') || '<p class="note">Ragic 目前沒有已結案的案件。</p>'}
      </fieldset>
      <button class="btn wide-btn" type="button" id="clNoRec">Ragic 沒有這筆，直接標已結案</button>`,
    mount: () => {
      const q = $('#clSearch');
      if (q) q.oninput = () => { const v = q.value.trim().toLowerCase(); document.querySelectorAll('#clList .opt').forEach((l) => { l.hidden = !!v && !l.dataset.q.includes(v); }); };
      const b = $('#clNoRec');
      if (b) b.onclick = async () => { if (await postPair({ group_name: g.group, not_a_case: true, reason: '已結案（Ragic 無紀錄）' }, '已標成已結案（Ragic 沒有這筆）')) closeSheet(); };
    },
    onSave: async () => {
      const r = document.querySelector('input[name="closedCase"]:checked');
      if (!r) return sheetErr('請選一筆已結案案件，或按「Ragic 沒有這筆」。');
      const c = list.find((x) => x.id === r.value);
      return postPair({ group_name: g.group, ragic_id: r.value }, `已配對到已結案案件「${c ? c.name : r.value}」`);
    },
  });
}
async function undoHandled(i) {
  const h = (D.handled || [])[Number(i)]; if (!h) return;
  if (!confirm(`復原「${h.group}」？它會回到「LINE 有群組、Ragic 沒建檔」清單。`)) return;
  await postPair({ group_name: h.group, unpair: true }, '已復原');
}
