// 背景無頭瀏覽器檢查示範頁：電腦版與手機版截圖、按鈕實按、不能有程式錯誤
// 跑法：node gen/check.cjs <網址> <截圖資料夾>
const { chromium } = require('/Users/9m/Projects/104-recruit/node_modules/playwright');
const [url, outDir] = process.argv.slice(2);
(async () => {
  const browser = await chromium.launch({ headless: true });
  const errs = [];
  for (const [name, vp] of [['desktop', { width: 1366, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 2 });
    page.on('pageerror', (e) => errs.push(`${name} pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errs.push(`${name} console: ${m.text()}`); });
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForSelector('#app:not([hidden])', { timeout: 10000 });
    await page.screenshot({ path: `${outDir}/${name}-home.png` });
    // 到待辦頁
    await page.evaluate(() => { location.hash = '#todo'; });
    await page.waitForTimeout(600);
    const todoText = await page.evaluate(() => document.querySelector('main, #app').innerText);
    console.log(name, 'todo has 對話:', /對話/.test(todoText), '看原話:', /看原話/.test(todoText), '過約定日:', /過約定日 6 天/.test(todoText));
    await page.screenshot({ path: `${outDir}/${name}-todo.png`, fullPage: name === 'mobile' });
    // 按一個對話待辦的「做完了」，再看「已做完」那摺有沒有多一件
    const btn = page.locator('[data-tdone^="chat:"]:visible').first();
    await btn.click(); await page.waitForTimeout(600);
    const after = await page.evaluate(() => document.body.innerText);
    console.log(name, 'after done toast:', /已標做完了/.test(after), 'fold:', (after.match(/群組交代的事已做完 \d+ 件/) || [''])[0]);
    // 案件頁群組交代
    await page.evaluate(() => { location.hash = '#case-201-chat'; });
    await page.waitForTimeout(600);
    const sec = await page.$('#c-chat');
    console.log(name, 'case chat section:', !!sec);
    if (sec) { await sec.scrollIntoViewIfNeeded(); await page.waitForTimeout(200); await sec.screenshot({ path: `${outDir}/${name}-case-chat.png` }); }
    await page.close();
  }
  await browser.close();
  console.log('errors:', errs.length ? errs.join('\n') : 'none');
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
