'use strict';
// 設計部監督總覽｜前端核心：登入、資料載入、狀態、路由、共用小工具、燈箱、提示。
// 畫面（oversight-views.js）與編輯（oversight-edit.js）是同一組全域函式，載入順序：本檔 → views → edit（皆 defer）。
// 紅黃綠、待辦、進度、款項全部由伺服器（/oversightData → dash）算好，前端只負責畫與送出編輯。
// 系統絕不替芳芳傳任何訊息。
const GOOGLE_CLIENT_ID = '18499630691-mi617tp07ptq943nlkhslf7bfu27j6cn.apps.googleusercontent.com';

let ID_TOKEN = null;
// 登入一次記住 30 天：Google 登入後伺服器發的看板通行證存在這台瀏覽器（lib/oversight-session.js），重新整理直接用；過期或被拒就清掉回登入畫面
const SESSION_KEY = 'oversight.session';
const readSession = () => { try { return localStorage.getItem(SESSION_KEY) || ''; } catch { return ''; } }; // ponytail-debt: 瀏覽器禁用儲存時退回每次 Google 登入，不影響使用
const saveSession = (t) => { try { if (t) localStorage.setItem(SESSION_KEY, t); } catch {} }; // ponytail-debt: 同上，存不了只是下次要重登
const clearSession = () => { try { localStorage.removeItem(SESSION_KEY); } catch {} }; // ponytail-debt: 同上
let DATA = null;   // /oversightData 整包
let D = null;      // DATA.dash
let CASES = [];     // 目前設計師切換之下、還沒結案的案件（工程中＋暫停；全站畫面都讀這份）
let CLOSED = [];    // 目前設計師切換之下、已結案的案件（案件列表「已結案」分頁、已結案尾款提醒；byId 兩邊都找得到）
let ALL_CASES = []; // 全部案件含已結案（不受切換影響）
let PERF = null;    // /oversightPerf 整包（只有編輯者；進業績模組才載入）
let PERF_ERR = '';  // 業績載入失敗的訊息
let PERF_LOADING = false;
let TODAY = '';
let IS_VIEWER = false;   // 全公司在職同仁（檢視者）：唯讀、看不到款項金額（後端已剔除，這裡只負責不畫編輯鈕）
let CAN_EDIT = true;
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => Number(n).toLocaleString('en-US');
const ts = (d) => { const [y, m, dd] = d.split('-').map(Number); return Date.UTC(y, m - 1, dd); };
const dayDiff = (a, b) => Math.round((ts(b) - ts(a)) / 86400000);   // b − a（a 到 b 過了幾天）
const addDays = (d, n) => new Date(ts(d) + n * 86400000).toISOString().slice(0, 10);
const md = (d) => { const [, m, dd] = d.split('-').map(Number); return m + '/' + dd; };
const pad = (n) => String(n).padStart(2, '0');
const trunc = (s, n) => (s.length > n ? s.slice(0, n) + '…' : s);
const stampTW = (iso) => { const d = new Date(new Date(iso).getTime() + 8 * 3600e3); return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; };

const STATE_LABEL = { done: '完成', doing: '進行中', miss: '疑似漏', missc: '確認有漏', skip: '本案不做', todo: '還沒開始' };
const EDIT_STATES = ['done', 'doing', 'todo', 'skip', 'missc'];
const SECTIONS = [['progress', '進度'], ['chat', '群組交代'], ['pay', '款項'], ['docs', '文件'], ['photos', '照片'], ['timeline', '時程'], ['info', '資料與備註']];
// 檢視者看不到款項與文件（後端不給資料）；文件段落只在編輯者拿得到文件資料時才有（oversight-docs.js）
const secList = () => SECTIONS.filter((s) => ((s[0] !== 'pay' && s[0] !== 'chat') || !IS_VIEWER) && (s[0] !== 'docs' || (typeof docsOn === 'function' && docsOn())));
// 左側選單分組（照物業管理系統的簡單模式）。每個舊頁面都還有入口；待辦事項、款項、最近修改是從舊首頁搬出來的區塊
const MODULES_ALL = [
  { id: 'dash', name: '總覽', short: '總覽', group: '' }, { id: 'todo', name: '待辦事項', short: '待辦', group: '' },
  { id: 'cases', name: '案件清單', short: '案件', group: '案件' }, { id: 'prospects', name: '還沒簽約', short: '簽約', group: '案件' }, { id: 'timeline', name: '全案時程', short: '時程', group: '案件' },
  { id: 'weekly', name: '每週行程', short: '行程', group: '案件' }, { id: 'photos', name: '照片', short: '照片', group: '案件' },
  { id: 'money', name: '款項', short: '款項', group: '款項與業績' }, { id: 'perf', name: '業績', short: '業績', group: '款項與業績' },
  { id: 'gap', name: '整理群組', short: '群組', group: 'LINE 群組' }, { id: 'groupmap', name: '群組對照', short: '對照', group: 'LINE 群組' },
  { id: 'log', name: '最近修改', short: '修改', group: '其他' }, { id: 'guide', name: '使用說明', short: '說明', group: '其他' },
];
// 業績、款項、群組整理、待辦、最近修改只有編輯者看得到（檢視者連選單都沒有；業績伺服器也直接 403，款項金額後端已剔除）
const EDITOR_ONLY_MODULES = new Set(['perf', 'gap', 'money', 'todo', 'log', 'prospects']);
const MODULES_LIST = () => MODULES_ALL.filter((m) => !EDITOR_ONLY_MODULES.has(m.id) || !IS_VIEWER);
const TITLES = { dash: '總覽', todo: '待辦事項', cases: '案件清單', prospects: '還沒簽約', case: '案件', gap: '整理群組', timeline: '全案時程', weekly: '每週行程', photos: '照片', money: '款項', perf: '業績', groupmap: '群組對照', log: '最近修改', guide: '使用說明' };
const WHO_ALL = '全部';   // 設計師切換：「全設計部」
const WHO_KEY = 'oversight.who';
const S = { view: 'dash', caseId: null, section: null, who: WHO_ALL, perfYear: null, perfSort: { key: 'final', dir: -1 }, sortKey: 'days', sortDir: -1, photoCase: '全部', taskCap: 4, moneyCap: 6, dashView: 'rows',
  openDone: false, openChatDone: false, openSnooze: false, logAll: false, navOrder: [], wkOpen: null, mineOnly: false, mineInit: false, openHandled: false,
  // 2026-10-20 改版：首頁一案一列、備註、案件列表分頁、群組整理、檢視者首頁
  qFilter: 'all', qOpen: {}, noteEdit: null, noteDraft: '', noteAll: {}, casesTab: 'active', cType: '全部', cq: '', cqDraft: '', cQuick: '', gapMode: 'one', gapFilter: 'all', gapIdx: 0, gapSel: {}, viewerQ: '' };

// ---------- API ----------
class HttpError extends Error { constructor(status, body) { super((body && body.error) || String(status)); this.status = status; this.body = body || {}; } }
// 等 ms 毫秒就中止的 signal；iOS 15 以前的 Safari 沒有 AbortSignal.timeout，改用 AbortController 計時（沒有這段，舊 iPhone 整個看板打不開）
function timeoutSignal(ms) {
  if (typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms);
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}
// opts.timeout（毫秒）：等太久就放棄，丟 HttpError(0, {error:'client_timeout'})，畫面才不會一直停在「載入中」
async function api(path, { timeout, ...opts } = {}) {
  let r;
  try {
    r = await fetch(path, { ...opts, ...(timeout ? { signal: timeoutSignal(timeout) } : {}), headers: { ...(opts.headers || {}), Authorization: 'Bearer ' + ID_TOKEN, ...(opts.body ? { 'Content-Type': 'application/json' } : {}) } });
  } catch (e) {
    // 只有我們自己的計時會中止（TimeoutError／舊瀏覽器是 AbortError），其他都是連不上
    throw new HttpError(0, { error: e && (e.name === 'TimeoutError' || e.name === 'AbortError') ? 'client_timeout' : 'network' });
  }
  let body = null; try { body = await r.json(); } catch {} // ponytail-debt: 非 JSON 回應時 body=null，下一行仍依 HTTP 狀態丟 HttpError；畫面只顯示狀態碼，升級路徑：顯示伺服器訊息
  if (!r.ok) throw new HttpError(r.status, body);
  return body;
}

// ---------- 登入三態 ----------
function showGate(state, email) {
  $('#app').hidden = true; $('#gate').hidden = false;
  const title = $('#gateTitle'), msg = $('#gateMsg'), btn = $('#gsiBtn'), out = $('#gateOut');
  if (state === 'denied') {
    title.textContent = '這個帳號還沒有權限';
    msg.textContent = `目前登入的是 ${email || '（不明帳號）'}，不在使用名單內。如果你是窩的家同仁，請聯絡管理部把這個 Google 帳號加進名單。`;
    btn.hidden = true; out.hidden = false;
  } else if (state === 'error') {
    title.textContent = '暫時打不開';
    msg.textContent = email || '連線出了狀況，請稍後再試一次。';
    btn.hidden = true; out.hidden = false;
  } else {
    title.textContent = '設計部案件看板';
    msg.textContent = '網站僅供窩的家同仁使用，請用公司登記的 Google 帳號登入。';
    btn.hidden = false; out.hidden = true;
  }
}
function renderGsi() {
  if (!window.google || !google.accounts || !google.accounts.id) return false;
  $('#gsiBtn').replaceChildren();
  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID, auto_select: true,
    callback: (resp) => { ID_TOKEN = resp.credential || null; if (!ID_TOKEN) return showGate('error', '沒有拿到登入憑證，請再試一次。'); load(); },
  });
  google.accounts.id.renderButton($('#gsiBtn'), { theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill', locale: 'zh_TW', width: 260 });
  return true;
}
function signOut() {
  clearSession(); ID_TOKEN = null; DATA = null; D = null; CASES = []; CLOSED = []; ALL_CASES = []; PERF = null; PERF_ERR = ''; S.whoInit = false; gmReset();
  PHOTO_CACHE.forEach((p) => p.then((u) => URL.revokeObjectURL(u), () => {})); PHOTO_CACHE.clear();
  try { google.accounts.id.disableAutoSelect(); } catch {} // ponytail-debt: Google 腳本沒載入時登出照樣繼續（只是少一個「別自動登入」提示），升級路徑：腳本載入後補呼叫
  showGate('signin'); renderGsi();
}
// 任何 API 回 401＝登入過期（30 天通行證到期，或還沒換到通行證的 Google 憑證約一小時），回登入畫面重登
function onAuthError(e) {
  if (e.status === 401) { clearSession(); ID_TOKEN = null; showGate('signin'); renderGsi(); return true; }
  if (e.status === 403) { showGate('denied', e.body.email); return true; }
  return false;
}

// ---------- 載入 ----------
function normalise(c) {
  c.active = c.status === '工程中';
  c.closed = c.status === '已結案';
  c.ragicStatus = c.status;
  c.miss = c.items.filter((x) => x.state === 'miss').map((x) => x.name);
  c.missc = c.items.filter((x) => x.state === 'missc').map((x) => x.name);
  c.kind = !c.active ? c.status : (c.noGroup ? '沒有群組' : (c.source === 'album' && c.days > D.staleDays ? '停更' : '工程中'));
  c.dueTasks = D.tasks.filter((t) => t.caseId === c.id && t.state === 'active');
  return c;
}
// 伺服器每段上游都有期限、最慢約 45 秒會回應；瀏覽器多等一點，Vercel 60 秒切斷時也接得到
const DATA_TIMEOUT_MS = 65_000;
async function fetchData() {
  DATA = await api('/oversightData', { timeout: DATA_TIMEOUT_MS });
  if (DATA.session) { ID_TOKEN = DATA.session; saveSession(DATA.session); }
  D = DATA.dash; TODAY = D.today;
  IS_VIEWER = DATA.viewer.role === 'viewer'; CAN_EDIT = !!DATA.viewer.canEdit;
  ALL_CASES = D.cases.map(normalise);
  PERF = null;   // 重抓總覽就一併作廢業績快取，下次進業績重載
  gmReset();     // 群組對照表也一併作廢（配對、類型、補填的社區名可能剛改過）
  if (!S.whoInit) { S.whoInit = true; S.who = readWho(); }
  applyWho();
  // 檢視者（租賃部）有自己的案子時預設打開「我的案子」（那是依介紹人、自宅算的 c.mine）。
  // 編輯者沒有這個開關：設計師的「我的案子」＝右上設計師切成自己（見 mineBar），非設計師根本沒有這組按鈕，S.mineOnly 永遠 false
  if (!S.mineInit) { S.mineInit = true; S.mineOnly = IS_VIEWER && ALL_CASES.some((c) => c.mine); }
  if (!IS_VIEWER) S.mineOnly = false;
}

// ---------- 設計師切換（全站）：全設計部／沈郁雯／呂鴻墀，記在 localStorage ----------
function readWho() {
  // 記住過的選擇（含「全部」）照用；第一次登入（沒記過）且登入者是設計師，預設切到自己
  try { const v = localStorage.getItem(WHO_KEY); if (v === WHO_ALL || (v && D.dsgList.includes(v))) return v; return isDsg() ? D.me : WHO_ALL; } catch { return WHO_ALL; } // ponytail-debt: 瀏覽器禁用儲存時每次都回「全設計部」；升級路徑：改存伺服器端使用者設定
}
const isDsg = () => !IS_VIEWER && !!D && D.dsgList.includes(D.me);   // 登入者是不是設計師（只有設計師才有「我的案子」）
function saveWho() { try { localStorage.setItem(WHO_KEY, S.who); } catch {} } // ponytail-debt: 儲存失敗只是下次不記得選擇，不影響使用
function applyWho() {
  if (S.who !== WHO_ALL && !D.dsgList.includes(S.who)) S.who = WHO_ALL;
  const pool = S.who === WHO_ALL ? ALL_CASES : ALL_CASES.filter((c) => c.dsg === S.who);
  CASES = pool.filter((c) => !c.closed); CLOSED = pool.filter((c) => c.closed);
}
function setWho(who, remember = true) {
  S.who = who === WHO_ALL || D.dsgList.includes(who) ? who : WHO_ALL;
  if (remember) saveWho();
  applyWho();
  if (S.view === 'case' && !byId(S.caseId)) { S.view = 'cases'; S.caseId = null; S.section = null; history.replaceState(null, '', '#cases'); }
  render(false);
}
// 設計師切換：頁面右上角的下拉選單（全設計部／沈郁雯／呂鴻墀），選擇記在 localStorage、全站共用
function whoSelect() {
  const n = (w) => (w === WHO_ALL ? ALL_CASES : ALL_CASES.filter((c) => c.dsg === w)).filter((c) => c.active || c.status === '暫停').length;
  return `<label class="whosel">設計師<select id="whoSel" aria-label="設計師切換">${[WHO_ALL, ...D.dsgList].map((w) => `<option value="${esc(w)}" ${S.who === w ? 'selected' : ''}>${w === WHO_ALL ? '全設計部' : esc(w)}（進行中 ${n(w)}）</option>`).join('')}</select></label>`;
}
// 載入失敗的原因，用白話講卡在哪一段（伺服器回的錯誤代號見 api/oversight.js handleData），再講該等還是該回報
const FAIL_WAIT = '通常是一時太慢，等 1 分鐘再按「重新整理」就好；連續兩次都這樣，請按「問題回報」。';
const FAIL_REPORT = '這種等一下不會自己好，請按「問題回報」，網站會自動附上目前畫面。';
function loadFailText(e) {
  const err = (e.body && e.body.error) || '', detail = (e.body && e.body.detail) || '';
  if (err === 'client_timeout') return [`等了 ${DATA_TIMEOUT_MS / 1000} 秒伺服器都沒回應`, FAIL_WAIT];
  if (err === 'network') return ['連不上網站', '請確認手機或電腦有連上網路，再按「重新整理」。'];
  if (err === 'ragic_timeout') return ['Ragic 案件表超過 25 秒沒回應', FAIL_WAIT];
  if (err.startsWith('ragic')) return ['Ragic 案件表讀取失敗', FAIL_REPORT];
  if (err === 'supabase_error') return detail.includes('_timeout_') ? ['網站資料庫回應太慢', FAIL_WAIT] : ['網站資料庫讀取失敗', FAIL_REPORT];
  if (e.status === 504) return ['伺服器超過 60 秒沒算完，被系統切斷', FAIL_WAIT];
  return [`網站出錯（代號 ${e.status}）`, FAIL_REPORT];
}
async function load() {
  $('#gate').hidden = true; $('#app').hidden = false;
  const t0 = Date.now();
  let tick = null;
  if (!DATA) {
    $('#main').innerHTML = '<div class="loading">載入中…</div>';
    tick = setInterval(() => { const s = Math.round((Date.now() - t0) / 1000); const el = $('#main .loading'); if (el && s >= 3) el.textContent = `載入中…已等 ${s} 秒`; }, 1000);
  }
  try { await fetchData(); } catch (e) {
    if (onAuthError(e)) return;
    // 失敗時頁尾不會畫出來，重新整理與問題回報直接放在訊息下面
    const [why, act] = loadFailText(e);
    $('#main').innerHTML = `<div class="loading load-fail"><p>載入失敗：${esc(why)}。</p><p>${esc(act)}</p>
      <p class="fail-acts"><button class="btn" type="button" id="failReload">重新整理</button><button class="btn" type="button" id="reportBtn">問題回報</button></p></div>`;
    return;
  } finally { clearInterval(tick); }
  const stamp = DATA.run.lastOkAt ? '資料更新 ' + stampTW(DATA.run.lastOkAt) : '尚無收集紀錄';
  $('#topStamp').textContent = stamp; $('#sideStamp').textContent = stamp;
  $('#viewer').textContent = DATA.viewer.name + '（' + DATA.viewer.email + '）' + (IS_VIEWER ? '・檢視模式' : '');
  route(false);
}
// 編輯完成後重抓、留在原位
async function reload() {
  const y = window.scrollY;
  try { await fetchData(); } catch (e) { if (onAuthError(e)) return; toast('重新載入失敗，請按重新整理'); return; }
  render(false); window.scrollTo({ top: y });
}

// ---------- 照片：縮圖在 private bucket，要帶登入憑證讀，所以用 fetch 轉 blob 網址 ----------
const PHOTO_CACHE = new Map();
function loadPhoto(id) {
  if (!PHOTO_CACHE.has(id)) {
    const p = fetch('/oversightPhoto?id=' + encodeURIComponent(id), { headers: { Authorization: 'Bearer ' + ID_TOKEN } })
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.blob(); }).then((b) => URL.createObjectURL(b));
    p.catch(() => PHOTO_CACHE.delete(id));
    PHOTO_CACHE.set(id, p);
  }
  return PHOTO_CACHE.get(id);
}
let photoIO = null;
function hydratePhotos(root = document) {
  const imgs = [...root.querySelectorAll('img[data-pid]:not([data-hyd])')];
  const fill = (img) => {
    img.dataset.hyd = '1';
    loadPhoto(img.dataset.pid).then((u) => { img.src = u; }, () => { img.replaceWith(Object.assign(document.createElement('div'), { className: 'ph', textContent: '照片讀不到' })); });
  };
  if (!('IntersectionObserver' in window)) return imgs.forEach(fill);
  photoIO ||= new IntersectionObserver((es) => es.forEach((en) => { if (en.isIntersecting) { photoIO.unobserve(en.target); fill(en.target); } }), { rootMargin: '300px' });
  imgs.forEach((i) => photoIO.observe(i));
}

// ---------- 小工具 ----------
/* 地址只拿掉「新北市／台北市／臺北市」，剩下要從某某區開始才拿；沒有區的照原樣 */
function shortAddr(a) {
  if (!a) return '';
  const m = a.replace(/^(新北市|台北市|臺北市)/, '');
  return /^[^\d\s]{1,3}區/.test(m) ? m : a;
}
/* 案名下方那行：屋主 ・ 地址。地址不截斷，太長就換行，門牌一定完整 */
function whoLine(c, cls = 'who', withIntro = true) {
  if (!c) return '';
  const o = c.owner ? `屋主 ${esc(c.owner)}${c.owner && c.ownerStaff ? ` <span class="sync-tag" title="屋主欄是公司在職同仁 ${esc(c.ownerStaff)}：這是同仁自己的房子，不是介紹的客戶">同仁自宅</span>` : ''}${c.ownerLocal ? ' <span class="sync-tag local" title="這個屋主是在網站改的，沒有寫回 Ragic">網站修正</span>' : ''}` : '<span class="dim">屋主未填</span>';
  const a = c.address ? esc(shortAddr(c.address)) : '<span class="dim">地址未填</span>';
  // 屋主欄沒填、但案名開頭是同仁名字：同樣標同仁自宅（依案名）
  const homeByName = c.homeBy === 'name' ? ` <span class="sync-tag" title="案名開頭是公司在職同仁 ${esc(c.homeStaff)}，通常是同仁自己的房子，不是介紹的客戶">同仁自宅（依案名）</span>` : '';
  const full = `${c.owner ? '屋主 ' + c.owner : '屋主未填'} ・ ${c.address || '地址未填'}`;
  return `<p class="${cls}" title="${esc(full)}">${o}${homeByName} ・ ${a}${withIntro ? introTag(c) : ''}</p>`;
}
/* 介紹：網站設定的介紹夥伴 → Ragic 客戶來源推出的人 → 來源文字 */
function introLabel(c) {
  const i = c.intro; if (!i) return '';
  return i.names.length ? i.names.join('、') : i.text;
}
function introTag(c) {
  const l = introLabel(c); if (!l) return '';
  const via = c.intro.via === 'local' ? '網站設定的介紹夥伴' : c.intro.via === 'group' ? '依群組成員推測（群組裡的同仁，排除固定班底、接案人、監工）' : c.intro.via === 'ragic' ? `Ragic 客戶來源「${c.intro.text}」` : 'Ragic 客戶來源';
  return ` ・ <span class="intro" title="${esc(via)}">介紹：${esc(l)}${c.intro.via === 'group' ? '（推測）' : ''}</span>`;
}
/* 我的案子 */
// 檢視者：S.mineOnly 依 c.mine（介紹人、自宅、負責人）篩；編輯者：沒有 mineOnly，「我的案子」＝右上設計師切成自己，登入者不是設計師就不顯示這組按鈕
const scopeCases = () => (S.mineOnly ? CASES.filter((c) => c.mine) : CASES);
function mineBar() {
  if (IS_VIEWER) {
    const n = CASES.filter((c) => c.mine).length;
    return `<div class="toolbar" role="group" aria-label="案件範圍"><button class="chip" type="button" data-mine="1" aria-pressed="${S.mineOnly}">我的案子 ${n}</button><button class="chip" type="button" data-mine="0" aria-pressed="${!S.mineOnly}">全部 ${CASES.length}</button></div>`;
  }
  if (!isDsg()) return '';
  const open = (c) => !c.closed;
  const n = ALL_CASES.filter((c) => open(c) && c.dsg === D.me).length, all = ALL_CASES.filter(open).length;
  return `<div class="toolbar" role="group" aria-label="案件範圍"><button class="chip" type="button" data-mine="1" aria-pressed="${S.who === D.me}">我的案子 ${n}</button><button class="chip" type="button" data-mine="0" aria-pressed="${S.who === WHO_ALL}">全部 ${all}</button></div>`;
}
const mineEmpty = () => '<p class="empty">目前沒有掛在你名下的案子。如果有你介紹的案子沒出現，請跟芳芳說，她可以在案件頁設定介紹夥伴。</p>';
// 編輯者切到某位設計師、他名下沒有任何案子時：講清楚是誰沒有、給「看全部」，不要寫成「處理完了」
const whoEmpty = () => !IS_VIEWER && S.who !== WHO_ALL && !CASES.length && !CLOSED.length;
const whoEmptyView = () => `<p class="empty">${S.who === D.me ? '你' : esc(S.who)}名下沒有案子。<button class="linkish" type="button" data-who="${WHO_ALL}">看全部</button></p>`;
/* 瓊安／小助手在不在這案的 LINE 群組 */
function memberTags(c) {
  const m = c.members;
  if (!m.hasGroup) return '<div class="members"><span class="pill mem off">瓊安 無群組</span><span class="pill mem off">小助手 無群組</span></div>';
  const j = m.joan ? '<span class="pill mem green" title="系統每天讀得到相簿照片和進度">瓊安 在群組</span>' : '<span class="pill mem amber" title="收集端回報瓊安不在這個群組，讀不到相簿">瓊安 不在群組</span>';
  const o = m.oa
    ? `<span class="pill mem green" title="收得到群組裡的聊天訊息與照片">小助手 在群組${m.oaLast ? '（最後訊息 ' + md(m.oaLast) + '）' : ''}</span>`
    : '<span class="pill mem off" title="小助手加入群組後如果一直沒人講話，系統就看不到它">小助手 沒收到過訊息</span>';
  return `<div class="members">${j}${o}</div>`;
}
function ring(pct, size = 44, stroke = 5, fs = 12) {
  if (pct == null) return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="完成度未知"><circle cx="${size / 2}" cy="${size / 2}" r="${(size - stroke) / 2}" fill="none" stroke="var(--ring-track)" stroke-width="${stroke}"/><text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" font-size="${fs}">—</text></svg>`;
  const r = (size - stroke) / 2, C = 2 * Math.PI * r, off = C * (1 - pct / 100);
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="完成度 ${pct}%">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--ring-track)" stroke-width="${stroke}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--ink)" stroke-width="${stroke}" stroke-linecap="round"
      stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" font-size="${fs}">${pct}%</text></svg>`;
}
const pctText = (c) => (c.progress == null ? '—' : c.progress + '%');
// 做到哪由伺服器決定（lib/oversight-model.js curOf：進行中裡照片最新的那項），畫面不另算，旗子和「目前工項」才不會指到兩項
function curIndex(c) {
  return c.cur ? c.items.findIndex((x) => x.name === c.cur) : -1;
}
const byId = (id) => CASES.find((c) => c.id === id) || CLOSED.find((c) => c.id === id);
/* 同步狀態標籤：Ragic 寫入開關關閉時，寫回 Ragic 的修改標「待同步 Ragic」 */
function syncTag(pending, hasRagicRow = true) {
  if (!hasRagicRow) return '<span class="sync-tag local" title="Ragic 款項表沒有這一期，只存在網站">只存網站</span>';
  if (!pending) return '';
  return `<span class="sync-tag" title="${DATA.ragicWrite ? '寫回 Ragic 失敗，已先存在網站' : 'Ragic 同步尚未開啟，已先存在網站'}">${DATA.ragicWrite ? '同步失敗，待重試' : '待同步 Ragic'}</span>`;
}

// ---------- 提示、燈箱 ----------
let toastT;
// undo：有傳就在提示上多一顆「復原」（做錯了 6 秒內可以撤回）；沒傳就是純提示
function toast(msg, undo) {
  const t = $('#toast');
  t.textContent = msg;
  if (undo) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'toast-undo'; b.textContent = '復原';
    b.onclick = async () => { t.classList.remove('on'); clearTimeout(toastT); await undo(); };
    t.append(' ', b);
  }
  t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), undo ? 7000 : 3200);
}

let LB = { list: [], i: 0 };
function openLB(list, i) { LB = { list, i }; drawLB(); $('#lb').classList.add('on'); $('#lbClose').focus(); }
// 原圖：存到公司 Google Drive 的照片，燈箱先放大縮圖，原圖抓到後自動換成清楚版；沒存到的只顯示縮圖。原圖不開公開連結，這裡帶登入憑證向後端要（後端驗過才從 Drive 串流）
const ORIG_CACHE = new Map();
function loadOriginal(id) {
  if (!ORIG_CACHE.has(id)) {
    if (ORIG_CACHE.size >= 12) ORIG_CACHE.delete(ORIG_CACHE.keys().next().value);   // 只留最近 12 張（一張可能數 MB）
    const p = fetch('/oversightOriginal?id=' + encodeURIComponent(id), { headers: { Authorization: 'Bearer ' + ID_TOKEN } })
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.blob(); }).then((b) => URL.createObjectURL(b));
    p.catch(() => ORIG_CACHE.delete(id));
    ORIG_CACHE.set(id, p);
  }
  return ORIG_CACHE.get(id);
}
function drawLB() {
  const p = LB.list[LB.i];
  const cap = (note) => `${esc(p.caseName)} ・ ${esc(p.item)} ・ ${p.date ? md(p.date) : ''}<small>第 ${LB.i + 1}／${LB.list.length} 張 ・ ${note}</small>`;
  $('#lbStage').innerHTML = photoHTML(p, true);
  $('#lbCap').innerHTML = cap(p.orig ? '縮圖，原圖載入中…' : '縮圖（原圖還沒存到公司 Drive，在 LINE 相簿）');
  $('#lbDl').innerHTML = p.orig ? '<button class="btn primary" type="button" data-lbdl="1">下載原圖</button>' : '<span class="lb-wait">原圖還在存檔中，存好後這裡會出現下載鈕</span>';
  $('#lbPrev').disabled = LB.i === 0; $('#lbNext').disabled = LB.i === LB.list.length - 1;
  hydratePhotos($('#lbStage'));
  if (p.orig && p.pid) {
    const cur = LB.i, list = LB.list;
    loadOriginal(p.pid).then((u) => {
      if (LB.list !== list || LB.i !== cur) return;                       // 已經翻到別張或關掉了
      const img = $('#lbStage img'); if (!img) return;
      const full = new Image();
      full.onload = () => { if (LB.list === list && LB.i === cur) { img.src = u; $('#lbCap').innerHTML = cap('原圖（公司 Google Drive 存檔）'); } };
      full.src = u;
    }, () => { if (LB.list === list && LB.i === cur) $('#lbCap').innerHTML = cap('原圖讀不到，先顯示縮圖'); });
  }
}
// 下載原圖：走 /oversightOriginal?download=1（後端加 Content-Disposition，檔名用 Drive 上的檔名）；要帶登入憑證，所以用 fetch 轉 blob 再存檔
async function downloadOriginal() {
  const p = LB.list[LB.i]; if (!p || !p.orig || !p.pid) return;
  try {
    const r = await fetch('/oversightOriginal?id=' + encodeURIComponent(p.pid) + '&download=1', { headers: { Authorization: 'Bearer ' + ID_TOKEN } });
    if (!r.ok) throw new Error(String(r.status));
    const cd = r.headers.get('Content-Disposition') || '';
    const m = /filename\*=UTF-8''([^;]+)/i.exec(cd);
    let name = 'photo.jpg'; try { name = m ? decodeURIComponent(m[1]) : name; } catch { /* ponytail-debt: 檔名解不開就用預設名 */ }
    const u = URL.createObjectURL(await r.blob());
    const a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 4000);
  } catch (e) { toast('原圖下載失敗，請稍後再試'); }
}
function closeLB() { $('#lb').classList.remove('on'); }

// ---------- 路由：#dash／#cases／#gap／#timeline／#photos／#case-40／#case-40-pay ----------
// 段落名稱只用英文字母、數字、-
const HASH_RE = /^#case-(\d{1,12})(?:-([a-z0-9]+))?$/;
function hashOf(view, caseId, section) { return view === 'case' ? `#case-${caseId}${section ? '-' + section : ''}` : '#' + view; }
function parseHash() {
  const h = location.hash, m = HASH_RE.exec(h);
  if (m) return { view: 'case', caseId: m[1], section: secList().some((s) => s[0] === m[2]) ? m[2] : null };
  const g = /^#guide(?:-([a-z0-9]+))?$/.exec(h);   // #guide＝使用說明；#guide-money＝直接捲到那一節
  if (g) return { view: 'guide', caseId: null, section: g[1] || null };
  const v = h.slice(1);
  return { view: MODULES_LIST().some((m) => m.id === v) ? v : 'dash', caseId: null, section: null };
}
function route(scrollTop = true) {
  const r = parseHash();
  // 連結指到別位設計師的案子：自動切回全設計部（不然 LINE 裡貼的案件連結會打不開）
  if (r.view === 'case' && !byId(r.caseId) && ALL_CASES.some((c) => c.id === r.caseId)) { S.who = WHO_ALL; applyWho(); }
  if (r.view === 'case' && !byId(r.caseId)) { r.view = 'cases'; r.caseId = null; r.section = null; }
  Object.assign(S, r);
  render(scrollTop);
}
function go(view, extra = {}) {
  Object.assign(S, { view, section: null }, extra);
  history.pushState(null, '', hashOf(S.view, S.caseId, S.section));
  render(true);
}
window.addEventListener('popstate', () => route(true));
window.addEventListener('resize', () => { if (typeof updateStickyBar === 'function') updateStickyBar(); });

// ---------- 畫面骨架 ----------
function renderNav() {
  const active = S.view === 'case' ? 'cases' : S.view;
  const gap = IS_VIEWER ? 0 : gapCount();
  const counts = { prospects: !IS_VIEWER && typeof prospectStats === 'function' && prospectsOk() ? prospectStats().n : null, todo: IS_VIEWER ? null : todoItems().length, cases: CASES.length, gap, weekly: weeklyOf().thisWeek.missing.length };
  const MODULES = MODULES_LIST();
  let last = null;
  $('#nav').innerHTML = MODULES.map((m) => {
    const head = m.group !== last && m.group ? `<div class="grp">${esc(m.group)}</div>` : '';
    last = m.group;
    return `${head}<button type="button" data-go="${m.id}" ${m.id === active ? 'aria-current="page"' : ''}>
      <span>${m.name}</span>${counts[m.id] ? `<span class="count tnum">${counts[m.id]}</span>` : ''}
    </button>`;
  }).join('');
}
function gapCount() { return D.orphans.length; }

/* 每頁頂端：麵包屑「首頁 / 頁名」＋大標題；設計師切換是右上角下拉選單（案件頁、使用說明、群組對照、最近修改不受設計師切換影響，不放） */
function pageHead() {
  const v = S.view;
  const home = '<button class="crumb-home" type="button" data-go="dash">首頁</button>';
  if (v === 'case') return `<div class="crumb">${home} / <button class="crumb-home" type="button" data-go="cases">案件清單</button> / ${esc((byId(S.caseId) || {}).name || '案件')}</div>`;
  const withWho = !['guide', 'groupmap', 'log', 'prospects'].includes(v);
  return `<div class="crumb">${v === 'dash' ? '首頁 / 總覽' : `${home} / ${TITLES[v]}`}</div>
    <div class="pagehead"><h1>${TITLES[v]}</h1><div class="head-tools">${withWho ? whoSelect() : ''}${v === 'perf' && PERF ? perfHeadExtra() : ''}</div></div>`;
}

function render(scrollTop = true) {
  if (!D) return;
  const v = S.view;
  let html = v === 'dash' ? viewDash() : v === 'todo' ? viewTodo() : v === 'cases' ? viewCases() : v === 'case' ? viewCase() : v === 'gap' ? viewGap() : v === 'timeline' ? viewTimeline() : v === 'weekly' ? viewWeekly() : v === 'money' ? viewMoney() : v === 'perf' ? viewPerf() : v === 'groupmap' ? viewGroupMap() : v === 'log' ? viewLog() : v === 'prospects' ? viewProspects() : v === 'guide' ? viewGuide() : viewPhotos();
  html += `<footer class="foot"><span>案名、地址、屋主、款項取自 Ragic；進度與照片取自 LINE 設計群組相簿，沒有群組的案子依 Ragic 週報推估。照片只放縮圖，原圖在 LINE 相簿。修改會記在「最近修改」。資料更新 ${esc(DATA.run.lastOkAt ? stampTW(DATA.run.lastOkAt) : '—')}。</span><button class="btn" type="button" data-go="guide">使用說明</button><button class="btn" type="button" id="reportBtn">問題回報</button></footer>`;
  const banner = IS_VIEWER ? '<div class="viewbar" role="note"><b>檢視模式</b>　你可以看每個案子的進度、照片、時程和每週行程，不能修改。款項金額不顯示。</div>' : '';
  $('#main').innerHTML = pageHead() + banner + html;
  $('#pageTitle').textContent = v === 'case' ? (byId(S.caseId) || {}).name || '案件' : TITLES[v];
  renderNav();
  if (scrollTop) window.scrollTo({ top: 0 });
  const sel = $('#photoSel'); if (sel) sel.onchange = (e) => { S.photoCase = e.target.value; render(false); };
  hydratePhotos();
  if (v === 'weekly' && scrollTop) { const tw = $('.tablewrap.scroll'); if (tw) tw.scrollLeft = tw.scrollWidth; }   // 手機先看到最近幾週
  if (v === 'case') afterCaseRender();
  if (v === 'guide') afterGuideRender();
}

// ---------- 案件頁：段落跳轉列 ----------
const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function scrollToSection(sec, smooth = true) {
  const el = document.getElementById('c-' + sec); if (!el) return;
  el.scrollIntoView({ behavior: smooth && !reduceMotion() ? 'smooth' : 'auto', block: 'start' });
  setActiveSection(sec);
}
function setActiveSection(sec) {
  document.querySelectorAll('.subnav button').forEach((b) => b.setAttribute('aria-current', String(b.dataset.sec === sec)));
  const b = $(`.subnav button[data-sec="${sec}"]`);
  if (b && b.scrollIntoView) { const nav = b.parentElement; nav.scrollLeft = b.offsetLeft - nav.clientWidth / 2 + b.clientWidth / 2; }
}
function afterCaseRender() {
  updateStickyBar();
  if (S.noteEdit) { const t = $('#noteDraft'); if (t) t.focus({ preventScroll: true }); }
  if (S.section) setTimeout(() => scrollToSection(S.section, false), 30);
  else setActiveSection('progress');
}
let spyRaf = 0;
// 案件頁頂端那排常用動作捲出畫面後，變成黏在頂端的小列（案名＋登記收款／新增追加款／標記結案）
function updateStickyBar() {
  const top = $('.top'); if (top) document.documentElement.style.setProperty('--topbar-h', top.offsetHeight + 'px');   // 手機上頂列會換行變高，黏住的列要貼在它下面
  const h = $('#heroActs'), bar = $('#stickyBar');
  const sn = $('.subnav'); document.documentElement.style.setProperty('--subnav-h', (sn ? sn.offsetHeight : 64) + 'px');   // 段落跳轉列的實際高度，跳段時標題才不會被它蓋住
  if (!h || !bar) { document.documentElement.style.setProperty('--sbh', '0px'); return; }
  const on = h.getBoundingClientRect().bottom < 60;
  bar.classList.toggle('on', on);
  document.documentElement.style.setProperty('--sbh', on ? bar.offsetHeight + 'px' : '0px');
  // 黏住的案件列還沒出現時也量一次它「出現後」的高度（手機會換行變高），跳段時標題才不會被後來冒出來的它蓋住
  if (!on) { bar.classList.add('on'); document.documentElement.style.setProperty('--sbh-full', bar.offsetHeight + 'px'); bar.classList.remove('on'); } else document.documentElement.style.setProperty('--sbh-full', bar.offsetHeight + 'px');
}
window.addEventListener('scroll', () => {
  if (S.view !== 'case' || spyRaf) return;
  spyRaf = requestAnimationFrame(() => {
    spyRaf = 0;
    updateStickyBar();
    const nav = $('.subnav'); if (!nav) return;
    const line = nav.getBoundingClientRect().bottom + 24;
    let cur = secList()[0][0];
    for (const [sec] of secList()) { const el = document.getElementById('c-' + sec); if (el && el.getBoundingClientRect().top <= line) cur = sec; }
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) cur = secList().at(-1)[0];
    setActiveSection(cur);
  });
}, { passive: true });

// ---------- 事件 ----------
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && SHEET) { closeSheet(); return; }
  if (!$('#lb').classList.contains('on')) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[data-case][tabindex]')) { e.preventDefault(); go('case', { caseId: e.target.dataset.case }); }
    if (e.key === 'Enter' && e.target.id === 'cfQ') { e.preventDefault(); S.cq = (S.cqDraft ?? '').trim(); render(false); const q = $('#cfQ'); if (q) q.focus(); }
    if (e.key === 'Enter' && e.target.id === 'caseOwner') { e.preventDefault(); $('#caseOwnerSave').click(); }
    if (e.key === 'Enter' && e.target.id === 'caseCommunity') { e.preventDefault(); $('#caseCommunitySave').click(); }
    { const jl = $('#jumpList'); if (e.key === 'Escape' && jl && !jl.hidden) closeJump(); }
    return;
  }
  if (e.key === 'Escape') closeLB();
  if (e.key === 'ArrowLeft') $('#lbPrev').click();
  if (e.key === 'ArrowRight') $('#lbNext').click();
});
document.addEventListener('toggle', (e) => {
  if (e.target.id === 'doneBox') S.openDone = e.target.open;
  if (e.target.id === 'chatDoneBox') S.openChatDone = e.target.open;
  if (e.target.id === 'snoozeBox') S.openSnooze = e.target.open;
  if (e.target.id === 'handledBox') S.openHandled = e.target.open;
}, true);

document.addEventListener('click', (e) => {
  if (!e.target.closest('.jump')) { const jl = $('#jumpList'); if (jl && !jl.hidden) closeJump(); }
  const t = e.target.closest('button,[data-case],[role=button]');
  if (!t) return;
  if (t.closest('#sheet')) return;
  const d = t.dataset;
  if (typeof docClick === 'function' && CAN_EDIT && docClick(d)) return;   // 文件（oversight-docs.js）
  if (typeof prospectClick === 'function' && CAN_EDIT && prospectClick(d)) return;   // 還沒簽約（oversight-prospects.js）
  if (typeof uxClick === 'function' && uxClick(t, d)) return;               // 結案、追加款、備註、首頁一案一列、群組整理（oversight-actions.js）
  // 檢視者沒有任何編輯動作（伺服器也會擋，這裡只是不讓畫面看起來能按）
  if (!CAN_EDIT && (['payadd', 'payrm', 'tdone', 'tsnooze', 'tundo', 'tskip', 'treopen', 'tnote', 'pair', 'notcase', 'intro', 'introok', 'nodeal', 'closed', 'undo', 'finish', 'close', 'reopen', 'extraadd', 'exrm', 'noteopen', 'notesave', 'qsnooze', 'gact', 'gbulk', 'gundo'].some((k) => d[k] !== undefined) || ['caseOwnerSave', 'caseNoteAdd', 'caseCommunitySave'].includes(t.id))) return;
  if (d.mine !== undefined) { if (IS_VIEWER) { S.mineOnly = d.mine === '1'; render(false); } else setWho(d.mine === '1' && isDsg() ? D.me : WHO_ALL); return; }
  if (d.go) { setNav(false); go(d.go); return; }
  if (d.goto) { const [view, el] = d.goto.split('|'); go(view); setTimeout(() => { const n = el && document.getElementById(el); if (n) n.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' }); }, 30); return; }   // 換頁並捲到那一塊（首頁「其他要整理的」用）
  if (t.id === 'menuBtn') { setNav(!document.body.classList.contains('nav-open')); return; }
  if (t.id === 'navBack') { setNav(false); return; }
  if (d.cq !== undefined) { setCasesQuick(d.cq); return; }
  if (d.csearch !== undefined) { S.cq = (S.cqDraft ?? S.cq).trim(); render(false); return; }
  if (d.cclear !== undefined) { S.cq = ''; S.cqDraft = ''; S.cType = '全部'; S.cQuick = ''; render(false); return; }
  if (d.jump) { const el = document.getElementById(d.jump); if (el) el.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' }); return; }
  if (d.sec) { history.replaceState(null, '', hashOf('case', S.caseId, d.sec)); S.section = d.sec; scrollToSection(d.sec); return; }
  if (d.case) { go('case', { caseId: d.case, section: d.csec || null }); return; }
  if (d.sort) { if (S.sortKey === d.sort) S.sortDir *= -1; else { S.sortKey = d.sort; S.sortDir = ['name', 'designer', 'cur', 'status', 'type', 'intro'].includes(d.sort) ? 1 : -1; } render(false); return; }
  if (d.who) { setWho(d.who); return; }
  if (d.psign) { signSheet(d.psign, d.pname || '', d.pcur || ''); return; }
  if (d.psettle) { settleSheet(d.psettle, d.pname || '', d.pbal || ''); return; }
  if (d.punsettle) { unsettle(d.punsettle, d.pname || ''); return; }
  if (d.pyear) { S.perfYear = d.pyear; render(false); return; }
  if (d.pstack) { S.perfStack = d.pstack; render(false); return; }
  if (d.psort) { const ps = S.perfSort; if (ps.key === d.psort) ps.dir *= -1; else { ps.key = d.psort; ps.dir = ['name', 'owner', 'designer', 'status', 'signDate'].includes(d.psort) ? 1 : -1; } render(false); return; }
  if (t.id === 'perfCsv') { downloadPerfCsv(); return; }
  if (t.id === 'perfRetry') { PERF = null; PERF_ERR = ''; render(false); return; }
  if (d.more) { if (d.more === 'task') S.taskCap = 999; else if (d.more === 'money') S.moneyCap = 999; else S.logAll = true; render(false); return; }
  if (d.dview) { S.dashView = d.dview; render(false); return; }
  if (d.citem) {
    const [cid, item] = d.citem.split('|');
    go('case', { caseId: cid });
    setTimeout(() => { const el = document.getElementById('pg-' + item); if (el) jumpPhotos(item); else scrollToSection('progress'); }, 60);
    return;
  }
  if (d.item) { const c = byId(S.caseId); if (c) { jumpPhotos(d.item); if (CAN_EDIT) itemSheet(c, d.item); } return; }
  if (d.intro !== undefined) { introSheet(byId(S.caseId)); return; }
  if (d.introok !== undefined) { confirmIntro(byId(S.caseId)); return; }
  if (d.claim !== undefined) { claimIntro(byId(S.caseId)); return; }   // 檢視者唯一能做的寫入：把自己加成介紹夥伴
  if (d.payadd !== undefined) { payAddSheet(byId(S.caseId)); return; }
  if (d.payrm) { payRemove(byId(S.caseId), d.payrm); return; }
  if (d.tdone || d.tsnooze) { taskAct(d.tdone ? 'done' : 'snooze', d.tdone || d.tsnooze); return; }
  if (d.tundo) { taskAct('undo', d.tundo); return; }
  if (d.tskip) { taskAct('skip', d.tskip); return; }
  if (d.treopen) { taskAct('reopen', d.treopen); return; }
  if (d.tnote) { taskNoteSheet(d.tnote); return; }
  if (d.lbdl !== undefined) { downloadOriginal(); return; }
  if (d.lb) { const [cid, g, i] = d.lb.split('|'); openLB(photoList(byId(cid), g), Number(i)); return; }
  if (d.wall) { const i = Number(d.wall); const p = window.__wall[i]; const c = byId(p.caseId); const list = photoList(c, p.item); openLB(list, Math.max(0, list.findIndex((x) => x.pid === p.pid))); return; }
  if (d.wkcell) { S.wkOpen = S.wkOpen === d.wkcell ? null : d.wkcell; render(false); const el = document.getElementById('wkPanel'); if (el) el.scrollIntoView({ behavior: 'auto', block: 'nearest' }); return; }
  if (d.wkc) { const [cid, mon] = d.wkc.split('|'); showWeekDetail(cid, mon); return; }
  if (d.pair) { pairSheet(d.pair); return; }
  if (d.nodeal !== undefined) { nodealSheet(d.nodeal); return; }
  if (d.closed !== undefined) { closedSheet(d.closed); return; }
  if (d.undo !== undefined) { undoHandled(d.undo); return; }
  if (d.finish !== undefined) { closeCaseSheet(byId(d.finish)); return; }
  if (d.notcase) { notCaseSheet(d.notcase); return; }
  if (d.prev !== undefined || d.next !== undefined) { stepCase(d.prev !== undefined ? -1 : 1); return; }
  if (d.jumpTo) { closeJump(); go('case', { caseId: d.jumpTo }); return; }
  if (t.id === 'caseOwnerSave') { saveOwner(byId(S.caseId)); return; }
  if (t.id === 'caseCommunitySave') { saveCommunity(byId(S.caseId)); return; }
  if (t.id === 'caseNoteAdd') { addCaseNote(byId(S.caseId)); return; }
  if (t.id === 'reportBtn') { const b = document.getElementById('wh-bug-report-btn'); if (b) b.click(); else toast('問題回報元件還沒載入，請稍後再試'); return; }
  if (t.id === 'refreshBtn' || t.id === 'failReload') { load(); return; }
  if (t.id === 'signOutBtn' || t.id === 'gateOut') { signOut(); return; }
  if (t.id === 'themeBtn') {
    const nx = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';   // 預設淺色，深色是選項，記在這台瀏覽器
    document.documentElement.dataset.theme = nx;
    try { localStorage.setItem(THEME_KEY, nx); } catch {} // ponytail-debt: 瀏覽器禁用儲存時下次開啟回到淺色；升級路徑：改存伺服器端使用者設定
    syncThemeBtn();
  }
});
const THEME_KEY = 'oversight.theme';
function syncThemeBtn() { const b = $('#themeBtn'); if (b) b.textContent = '外觀：' + (document.documentElement.dataset.theme === 'dark' ? '深色' : '淺色'); }
// 手機：左上漢堡鈕打開同一份分組選單（抽屜），點選單項目或背景就收起
function setNav(open) {
  document.body.classList.toggle('nav-open', !!open);
  const b = $('#menuBtn'); if (b) b.setAttribute('aria-expanded', String(!!open));
}
document.addEventListener('input', (e) => {
  if (e.target.id === 'jumpIn') drawJump(e.target.value);
  if (e.target.id === 'cfQ') S.cqDraft = e.target.value;   // 案件清單關鍵字：按搜尋（或 Enter）才套用，打字時不重畫
  if (e.target.id === 'noteDraft') S.noteDraft = e.target.value;   // 備註打到一半、畫面重畫也不會丟
  if (e.target.id === 'vSearch') { S.viewerQ = e.target.value; const pos = e.target.selectionStart; render(false); const n = $('#vSearch'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }
});
document.addEventListener('focusin', (e) => { if (e.target.id === 'jumpIn') drawJump(e.target.value); });
document.addEventListener('change', (e) => {
  if (e.target.id === 'whoSel' || e.target.id === 'cfDsg') { setWho(e.target.value); return; }   // 頁面右上角（或案件清單篩選列）的設計師下拉，全站共用同一個選擇
  if (e.target.id === 'perfYearSel') { S.perfYear = e.target.value; render(false); return; }
  if (e.target.id === 'cfStatus') { S.casesTab = e.target.value; S.cQuick = ''; render(false); return; }
  if (e.target.id === 'cfType') { S.cType = e.target.value; render(false); return; }
  if (e.target.id === 'caseDesigner' || e.target.id === 'caseStatus') changeCaseField(e.target);
  if (e.target.id === 'caseTian') saveTian(e.target);
  if (e.target.matches && e.target.matches('input[data-gsel]')) { S.gapSel[e.target.dataset.gsel] = e.target.checked; render(false); }   // 群組整理清單勾選
});

$('#lbPrev').onclick = () => { if (LB.i > 0) { LB.i--; drawLB(); } };
$('#lbNext').onclick = () => { if (LB.i < LB.list.length - 1) { LB.i++; drawLB(); } };
$('#lbClose').onclick = closeLB;
$('#lb').addEventListener('click', (e) => { if (e.target.id === 'lb') closeLB(); });

// 這台瀏覽器有 30 天通行證就直接載入；沒有才到登入畫面。Google 的 script 是 async 載入的，按鈕一律先備好（通行證過期時要用）
document.addEventListener('DOMContentLoaded', () => {
  syncThemeBtn();
  const saved = readSession();
  if (saved) { ID_TOKEN = saved; load(); } else showGate('signin');
  let tries = 0;
  const wait = setInterval(() => { if (renderGsi() || ++tries > 60) clearInterval(wait); }, 150);
});
