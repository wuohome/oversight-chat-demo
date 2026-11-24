'use strict';
// 設計部監督總覽｜「使用說明」頁：把 oversight-guide-data.js 的內容畫成頁面（目錄、步驟、表格、常見情況），並能輸出同一份內容的 Markdown。
// 編輯者看全部；檢視者看不到標 only:'editor' 的段落／步驟（後端本來就不給他們款項與編輯功能），也多一段 only:'viewer' 的首頁說明。
// 依賴 oversight.js／oversight-views.js 的全域：IS_VIEWER、S、esc、head、$、history；內容在 oversight-guide-data.js（GUIDE_SECTIONS…）。

const guideRole = () => (typeof IS_VIEWER !== 'undefined' && IS_VIEWER ? 'viewer' : 'editor');
const gShow = (x, role) => !x || typeof x === 'string' || Array.isArray(x) || !x.only || x.only === role;
const gTxt = (x) => (typeof x === 'string' ? x : Array.isArray(x) ? x[0] : x.t);
const gSections = (role) => GUIDE_SECTIONS.filter((s) => gShow(s, role));
// 步驟、條列、常見情況的單項：字串，或 {t, only}；常見情況另有 [情況, 怎麼辦] 與 {t, a, only}
const gItems = (list, role) => list.filter((x) => gShow(x, role));
const gCase = (c) => (Array.isArray(c) ? [c[0], c[1]] : [c.t, c.a]);

function guideBlockHTML(b, role) {
  const link = (s) => esc(s).replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`);
  if (!gShow(b, role)) return '';
  if (b.h) return `<h4 class="g-h">${esc(b.h)}</h4>`;
  if (b.p) return `<p class="g-p">${link(b.p)}</p>`;
  if (b.steps) return `<ol class="g-steps">${gItems(b.steps, role).map((x) => `<li>${link(gTxt(x))}</li>`).join('')}</ol>`;
  if (b.bullets) return `<ul class="g-bul">${gItems(b.bullets, role).map((x) => `<li>${link(gTxt(x))}</li>`).join('')}</ul>`;
  if (b.before) return `<div class="g-before"><p class="g-ch">按之前，你要先確認</p><ul>${b.before.map((x) => `<li>${link(x)}</li>`).join('')}</ul></div>`;
  if (b.note) return `<p class="note">${link(b.note)}</p>`;
  if (b.warn) return `<p class="note warn">${link(b.warn)}</p>`;
  if (b.table) return `<div class="tablewrap scroll"><table class="g-tbl"><thead><tr>${b.table.head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${b.table.rows.map((r) => `<tr>${r.map((c, i) => (i === 0 ? `<th scope="row">${esc(c)}</th>` : `<td data-l="${esc(b.table.head[i])}">${link(c)}</td>`)).join('')}</tr>`).join('')}</tbody></table></div>`;
  if (b.cases) {
    const rows = gItems(b.cases, role).map(gCase);
    return rows.length ? `<div class="g-cases"><p class="g-ch">常見情況</p><dl>${rows.map(([q, a]) => `<dt>${esc(q)}</dt><dd>${link(a)}</dd>`).join('')}</dl></div>` : '';
  }
  return '';
}

function viewGuide() {
  const role = guideRole(), secs = gSections(role);
  const toc = secs.map((s, i) => `<button type="button" class="g-toc-btn" data-gjump="${s.id}"><span class="g-no tnum">${i + 1}</span>${esc(s.title)}</button>`).join('');
  const body = secs.map((s, i) => `<article class="g-sec" id="g-${s.id}">
    <h3 class="g-title"><span class="g-no tnum">${i + 1}</span>${esc(s.title)}</h3>
    <p class="g-what"><b>這是做什麼的：</b>${esc(s.what)}</p>
    ${s.blocks.map((b) => guideBlockHTML(b, role)).join('')}
    <p class="g-back"><button type="button" class="linkish" data-gjump="top">回到目錄</button></p>
  </article>`).join('');
  const banner = role === 'viewer'
    ? '你是檢視者：只能看、看不到金額，所以說明裡只有編輯者才用得到的部分已經收起來了。'
    : '你是編輯者：可以看到金額、可以修改。';
  return `<section class="sec guide" id="guideTop">
    ${head('使用說明', GUIDE_TITLE, esc(GUIDE_LEAD))}
    <p class="note g-role">${esc(banner)}</p>
    <nav class="g-toc" aria-label="使用說明目錄"><p class="g-toc-h">目錄　<small>按標題跳到那一節</small></p><div class="g-toc-list">${toc}</div></nav>
    ${body}
  </section>`;
}

// 從 #guide-money 這種網址進來時，捲到那一節（oversight.js 的 route／render 呼叫）
function afterGuideRender() {
  const id = S.section && /^[a-z0-9]+$/.test(S.section) ? 'g-' + S.section : '';
  const el = id ? document.getElementById(id) : null;
  if (el) setTimeout(() => el.scrollIntoView({ behavior: 'auto', block: 'start' }), 30);
}

document.addEventListener('click', (e) => {
  const b = e.target.closest ? e.target.closest('[data-gjump]') : null;
  if (!b) return;
  const to = b.dataset.gjump;
  const el = document.getElementById(to === 'top' ? 'guideTop' : 'g-' + to);
  if (!el) return;
  history.replaceState(null, '', to === 'top' ? '#guide' : '#guide-' + to);
  const calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
});

/* ---------- Markdown（vault 備份用，內容與網站編輯者看到的同一份；檢視者專用的段落放最後、標「你可以跳過」） ---------- */
function guideMarkdown() {
  const role = 'editor', out = [];
  const cell = (s) => String(s).replace(/\|/g, '／').replace(/\n/g, ' ');
  const blockMd = (b) => {
    if (!gShow(b, role)) return '';
    if (b.h) return `#### ${b.h}\n`;
    if (b.p) return `${b.p}\n`;
    if (b.steps) return gItems(b.steps, role).map((x, i) => `${i + 1}. ${gTxt(x)}`).join('\n') + '\n';
    if (b.bullets) return gItems(b.bullets, role).map((x) => `- ${gTxt(x)}`).join('\n') + '\n';
    if (b.before) return `> [!warning] 按之前，你要先確認\n${b.before.map((x) => `> - ${x}`).join('\n')}\n`;
    if (b.note) return `> [!note] ${b.note}\n`;
    if (b.warn) return `> [!warning] ${b.warn}\n`;
    if (b.table) return `| ${b.table.head.map(cell).join(' | ')} |\n| ${b.table.head.map(() => '---').join(' | ')} |\n${b.table.rows.map((r) => `| ${r.map(cell).join(' | ')} |`).join('\n')}\n`;
    if (b.cases) return `**常見情況**\n\n${gItems(b.cases, role).map((c) => { const [q, a] = gCase(c); return `- **${q}**：${a}`; }).join('\n')}\n`;
    return '';
  };
  const skip = (s) => (s.only === 'viewer' ? '（檢視者專用，你可以跳過）' : '');
  const secs = [...GUIDE_SECTIONS.filter((s) => s.only !== 'viewer'), ...GUIDE_SECTIONS.filter((s) => s.only === 'viewer')];
  out.push(`# ${GUIDE_TITLE}\n`, `${GUIDE_LEAD}\n`);
  out.push('網站網址：https://wuohome-decor-api.vercel.app/oversight ，登入後側欄最後一項「使用說明」（手機底部分頁叫「說明」）就是同一份內容。\n');
  out.push('## 目錄\n', secs.map((s, i) => `${i + 1}. [[#${i + 1}. ${s.title}${skip(s)}|${s.title}]]${skip(s)}`).join('\n') + '\n');
  secs.forEach((s, i) => {
    out.push(`## ${i + 1}. ${s.title}${skip(s)}\n`, `**這是做什麼的：**${s.what}\n`);
    s.blocks.forEach((b) => out.push(blockMd(b)));
  });
  return out.join('\n');
}
