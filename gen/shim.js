// 示範頁用：不連任何伺服器。看板資料用 data.js 的假資料；按「做完了／不用做／還沒做完／復原」只改這頁記憶體裡的資料，重新整理就回到原樣
(function () {
  try { localStorage.setItem('oversight.session', 'demo'); } catch (e) {}
  var DATA = window.DEMO_DATA;
  var today = DATA.dash.today;
  var addDays = function (d, n) { return new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10); };
  var ok = function (body) { return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })); };
  function applyTask(b) {
    var t = DATA.dash.tasks.find(function (x) { return x.key === b.key; }); if (!t) return {};
    var me = DATA.viewer.name || '王芳瑜';
    var aiDone = t.chat && t.chat.status === 'done';
    if (b.act === 'done') { t.state = 'done'; t.skip = false; t.aiClosed = false; t.doneAt = today; t.doneBy = me; }
    else if (b.act === 'skip') { t.state = 'done'; t.skip = true; t.aiClosed = false; t.doneAt = today; t.doneBy = me; }
    else if (b.act === 'snooze') { t.state = 'snooze'; t.until = addDays(today, 7); t.doneAt = today; t.doneBy = me; return { until: t.until }; }
    else if (b.act === 'reopen') { t.state = 'active'; t.aiClosed = false; t.skip = false; }
    else if (b.act === 'undo') {
      t.skip = false;
      if (aiDone) { t.state = 'done'; t.aiClosed = true; t.doneAt = t.chat.doneAt; t.doneBy = '群組裡' + t.chat.doneWho + '說做好了'; }
      else { t.state = 'active'; t.aiClosed = false; }
    }
    else if (b.act === 'note') { t.note = b.note || null; t.noteAt = b.note ? today : null; }
    return {};
  }
  window.fetch = function (path, opts) {
    var p = String(path);
    if (p.indexOf('/oversightData') === 0) return ok(JSON.parse(JSON.stringify(DATA)));
    if (p.indexOf('/oversightEdit') === 0) {
      var b = {}; try { b = JSON.parse(opts && opts.body || '{}'); } catch (e) {}
      if (b.op === 'task') return ok(applyTask(b));
      return Promise.resolve(new Response(JSON.stringify({ error: '示範頁只開放待辦的按鈕' }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
    }
    return Promise.resolve(new Response(JSON.stringify({ error: '示範頁沒有這塊資料' }), { status: 400, headers: { 'Content-Type': 'application/json' } }));
  };
})();
