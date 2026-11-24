// 群組對話待辦示範頁的假資料：用 wuohome-decor-api 分支 chat-todos-demo 的真 handler 跑假 Ragic／假資料庫，輸出 /oversightData 整包
// 跑法：node gen/gen.mjs /Users/9m/Projects/wuohome-decor-api（寫到 data.js）
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
const REPO = process.argv[2];
const res200 = (body, status = 200) => ({ ok: status < 300, status, text: async () => JSON.stringify(body), json: async () => body });

// 全部是虛構案件、人名
const C = (name, designer, total, sign, paid) => ({ '1000170': name, '1000206': '🛠️工程中', '1000203': designer, '1000207': designer, '1000173': String(total), '1000177': sign, '1000179': [],
  _subtable_1000191: { 1: { '1000181': '簽約款', '1000182': String(paid), '1000180': sign } } });
const RAGIC = {
  '201': C('示範｜信義區林宅', '王芳瑜', 1200000, '2026/09/02', 120000),
  '202': C('示範｜板橋陳宅', '王芳瑜', 860000, '2026/10/01', 86000),
  '203': C('示範｜新店張宅', '王芳瑜', 1500000, '2026/08/12', 450000),
  '204': C('示範｜中和黃宅', '李承恩', 640000, '2026/10/20', 64000),
};
const DB = new Proxy({}, { get: (t, k) => (t[k] ||= []) });
const iso = (d, hm = '10:00') => new Date(`${d}T${hm}:00+08:00`).toISOString();
const todo = (id, rid, who, what, quote, said, due = null, done = null) => ({ id, ragic_id: rid, group_name: '', who, what, quote, said_at: iso(said), due, status: done ? 'done' : 'open',
  done_quote: done ? done[1] : null, done_who: done ? done[0] : null, done_at: done ? iso(done[2], '15:20') : null });
DB.oversight_chat_todos.push(
  todo('a1b2c3d4e5f6', '201', '師傅', '下週二來裝上櫃', '上櫃下週二早上過去裝', '2026-11-19', '2026-11-25'),
  todo('b2c3d4e5f6a1', '201', '客戶', '主臥衣櫃改成推門', '主臥衣櫃可以改推門嗎', '2026-11-20'),
  todo('c3d4e5f6a1b2', '201', '客戶', '寄浴室磁磚樣品照片', '浴室磁磚可以先拍給我看嗎', '2026-11-12', '2026-11-18'),
  todo('d4e5f6a1b2c3', '201', '師傅', '確認插座位置', '廚房插座位置要再確認', '2026-11-10', null, ['設計師', '插座位置跟師傅確認好了', '2026-11-13']),
  todo('e5f6a1b2c3d4', '202', '客戶', '補報價單給客戶', '追加的層板報價再給我一下', '2026-11-03'),
  todo('f6a1b2c3d4e5', '202', '設計師', '約客戶看木作進度', '週五下午約屋主來看木作', '2026-11-22', '2026-11-28'),
  todo('a6b5c4d3e2f1', '203', '師傅', '油漆前補批土', '油漆進場前那面牆要先補土', '2026-11-21', '2026-11-26'),
  todo('b6c5d4e3f2a1', '203', '客戶', '燈具改成暖色', '客廳燈可以換暖一點的嗎', '2026-11-15', null, ['客戶', '暖色燈有了謝謝', '2026-11-21']),
  todo('c6d5e4f3a2b1', '204', '客戶', '提供冷氣型號', '冷氣型號我再傳給你', '2026-11-23'),
);
const HR = { 1: { '3000933': '王芳瑜', '3000976': 'fang@t.test', '3000945': '在職' } };
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.startsWith('https://oauth2.googleapis.com/tokeninfo')) return res200({ aud: (await import(pathToFileURL(REPO + '/lib/auth.js'))).GOOGLE_CLIENT_ID, email: 'fang@t.test', email_verified: 'true' });
  if (u.includes('ragicforms4/20004')) return res200(HR);
  if (u.includes('/finance/6')) return res200({});
  if (u.includes('/finance/8')) return res200(RAGIC);
  const m = /\/rest\/v1\/(oversight_\w+)(?:\?(.*))?$/.exec(u);
  if (m) return res200(DB[m[1]]);
  throw new Error('unexpected fetch ' + u);
};
Object.assign(process.env, { RAGIC_BASE: 'https://example.invalid/ap15', RAGIC_KEY: 'd', SUPABASE_URL: 'https://example.invalid', SUPABASE_SERVICE_KEY: 'd', OVERSIGHT_INGEST_TOKEN: 'x' });
delete process.env.OVERSIGHT_RAGIC_WRITE;
process.env.OVERSIGHT_ALLOWED_JSON = JSON.stringify({ 'fang@t.test': { role: 'oversight', name: '王芳瑜' } });
const { default: handler } = await import(pathToFileURL(REPO + '/api/oversight.js'));
let status = 0, payload = null;
await handler({ method: 'GET', query: { action: 'data' }, headers: { authorization: 'Bearer g-demo' } }, { setHeader() {}, status(s) { status = s; return this; }, json(b) { payload = b; return this; } });
if (status !== 200) throw new Error('handler ' + status + ' ' + JSON.stringify(payload));
delete payload.session;
writeFileSync(new URL('../data.js', import.meta.url), 'window.DEMO_DATA = ' + JSON.stringify(payload) + ';\n');
