// ============================================================
// sb-data.js — ชั้นข้อมูล Supabase สำหรับ records.html (v2)
// โหลดไฟล์นี้ใน <head> ของ records.html (ก่อน inline script)
// records.html มี api() ที่เช็ก SB_ACTIONS อยู่แล้ว → ทุก action route มาที่นี่
// ไม่แตะ Apps Script เลย (ตัดขาดจาก V1)
// ห่อใน IIFE → ไม่ชนตัวแปรกับ records.html
// ============================================================
(function () {
// ============================================================
// ⚠️  กุยช่ายสวรรค์ — แก้ URL + KEY ตรงนี้เมื่อมี Supabase ของแบรนด์ใหม่
//    ตอนนี้ยังชี้ไปฐานข้อมูลเดิมของ Maru (ข้อมูลจะปนกัน)
// ============================================================
  const SB_URL = 'https://nmrdgdzlraxffcaizclr.supabase.co';
  const SB_KEY = 'sb_publishable_mWMlYxXgd1CwcJAV3eLkwg__fUKXxSZ';
  const SB_CH = [
    { key: 'cash', label: 'เงินสด', group: 'store' },
    { key: 'transfer', label: 'เงินโอน', group: 'store' },
    { key: 'thaihelp', label: 'ไทยช่วยไทย', group: 'store' },
    { key: 'lineman', label: 'LineMan', group: 'delivery' },
    { key: 'grab', label: 'Grab', group: 'delivery' },
    { key: 'shopee', label: 'ShopeeFood', group: 'delivery' },
    { key: 'robinhood', label: 'Robinhood', group: 'delivery' }
  ];
  const SB_DOW = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];
  const H = { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY };
  const EDGE_URL = SB_URL + '/functions/v1/secure-api';

  // ===== LINE: Flex รายงานสิ้นวัน + ส่งผ่าน Edge (self-contained — records ไม่โหลด shared.js) =====
function mwMoney(n){ return Math.round(Number(n) || 0).toLocaleString('en-US'); }
function mwNum(v){ return Number(v) || 0; }
function mwDateDM(s){ var p = String(s).split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
function mwNowStr(){
  try{
    var parts = new Intl.DateTimeFormat('en-GB', { timeZone:'Asia/Bangkok', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:false }).formatToParts(new Date());
    var o = {}; parts.forEach(function(p){ o[p.type]=p.value; });
    return o.day + '/' + o.month + '/' + o.year + ' ' + o.hour + ':' + o.minute;
  }catch(e){ return ''; }
}

// ส่งข้อความ Flex เข้า LINE (fire-and-forget ปลอดภัย — ไม่ throw)
async function maruNotifyLine(messages){
  // ยิง Edge ตรง ๆ ไม่ผ่าน api() — เพราะบางหน้า (records) เขียนทับ api แล้วไม่รู้จัก EDGE_ACTIONS
  try{
    if(!messages || !messages.length) return { ok:false };
    const res = await fetch(EDGE_URL, {
      method:'POST',
      headers:{ 'Content-Type':'application/json', apikey:SB_KEY },
      body: JSON.stringify({ action:'notifyLine', messages: messages })
    });
    if(!res.ok) return { ok:false, error:'Edge HTTP ' + res.status };
    return await res.json();
  }catch(e){ return { ok:false, error:String(e && e.message || e) }; }
}

// Flex: รายงานสรุปยอดขายสิ้นวัน (เหมือนของเดิมใน Apps Script)
function maruBuildDailyFlex(data, total, totalExp, recon){
  var ch = data.sales || {};
  var dow = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];
  var d = new Date(data.date + 'T00:00:00');
  var net = total - totalExp;

  function row(label, amount, opts){
    opts = opts || {};
    return { type:'box', layout:'horizontal', spacing:'sm', contents:[
      { type:'text', text:label, size:'sm', color: opts.muted ? '#9CA3AF' : '#4B5563', flex:5 },
      { type:'text', text:'฿' + mwMoney(amount), size:'sm', color: opts.color || '#111827',
        weight: opts.bold ? 'bold' : 'regular', align:'end', flex:4 }
    ]};
  }
  function sectionHeader(emoji, title, accent){
    return { type:'box', layout:'horizontal', spacing:'sm', margin:'md', contents:[
      { type:'text', text: emoji + ' ' + title, size:'sm', weight:'bold', color: accent || '#143D26', flex:0 }
    ]};
  }
  function separator(){ return { type:'separator', margin:'md', color:'#F0E4C4' }; }

  var header = { type:'box', layout:'vertical', spacing:'xs', backgroundColor:'#143D26', paddingAll:'lg', contents:[
    { type:'text', text:'🥟 กุยช่ายสวรรค์', size:'lg', weight:'bold', color:'#E6B83C' },
    { type:'text', text:'รายงานสรุปยอดขายสิ้นวัน', size:'xs', color:'#D4CFC4' },
    { type:'box', layout:'horizontal', margin:'sm', contents:[
      { type:'text', text:'📅 ' + mwDateDM(data.date), size:'sm', color:'#FFFFFF', flex:5 },
      { type:'text', text:'วัน' + dow[d.getDay()], size:'sm', color:'#E6B83C', align:'end', flex:4 }
    ]}
  ]};

  var bodyContents = [];
  bodyContents.push({ type:'box', layout:'vertical', spacing:'none', contents:[
    { type:'text', text:'ยอดขายรวม', size:'xs', color:'#9CA3AF' },
    { type:'text', text:'฿' + mwMoney(total), size:'3xl', weight:'bold', color:'#B8891F' }
  ]});

  bodyContents.push(separator());
  bodyContents.push(sectionHeader('🏪', 'ยอดขายหน้าร้าน', '#1E7A45'));
  bodyContents.push(row('เงินสด', ch.cash));
  bodyContents.push(row('เงินโอน', ch.transfer));
  bodyContents.push(row('ไทยช่วยไทย', ch.thaihelp));

  bodyContents.push(separator());
  bodyContents.push(sectionHeader('🛵', 'ยอดขาย Delivery', '#1B98A4'));
  bodyContents.push(row('LineMan', ch.lineman));
  bodyContents.push(row('Grab', ch.grab));
  bodyContents.push(row('ShopeeFood', ch.shopee));
  bodyContents.push(row('Robinhood', ch.robinhood));

  bodyContents.push(separator());
  bodyContents.push(row('🧾 ค่าใช้จ่ายรวม', totalExp, { color:'#D02C2C' }));
  bodyContents.push({ type:'box', layout:'horizontal', spacing:'sm', margin:'sm', paddingAll:'sm',
    backgroundColor: net >= 0 ? '#ECFDF5' : '#FEF2F2', cornerRadius:'md', contents:[
      { type:'text', text:'✨ กำไรสุทธิ', size:'md', weight:'bold', color:'#143D26', flex:5 },
      { type:'text', text:'฿' + mwMoney(net), size:'lg', weight:'bold', color: net >= 0 ? '#059669' : '#DC2626', align:'end', flex:4 }
  ]});

  if(recon && (mwNum(recon.openingCash) || mwNum(recon.actualCash))){
    var open = mwNum(recon.openingCash), cashIn = mwNum(recon.cashIn), refund = mwNum(recon.refund);
    var cashSales = mwNum(ch.cash);
    var expected = open + cashSales + cashIn - refund - totalExp;
    var actual = mwNum(recon.actualCash);
    var diff = actual - expected;
    bodyContents.push(separator());
    bodyContents.push(sectionHeader('💵', 'ปิดรอบเงินสด', '#1E9E50'));
    bodyContents.push(row('เงินสดเริ่มต้น', open, { muted:true }));
    if(cashIn) bodyContents.push(row('เงินเข้า', cashIn, { muted:true }));
    if(refund) bodyContents.push(row('คืนเงิน', -refund, { muted:true }));
    bodyContents.push(row('เงินที่ควรมี', expected, { bold:true }));
    bodyContents.push(row('เงินจริงในลิ้นชัก', actual, { bold:true }));
    var diffLabel, diffColor, diffBg;
    if(diff === 0){ diffLabel='พอดี ✓'; diffColor='#059669'; diffBg='#ECFDF5'; }
    else if(diff > 0){ diffLabel='เกิน ฿' + mwMoney(diff); diffColor='#059669'; diffBg='#ECFDF5'; }
    else { diffLabel='ขาด ฿' + mwMoney(Math.abs(diff)) + ' ⚠️'; diffColor='#DC2626'; diffBg='#FEF2F2'; }
    bodyContents.push({ type:'box', layout:'horizontal', spacing:'sm', margin:'sm', paddingAll:'sm',
      backgroundColor:diffBg, cornerRadius:'md', contents:[
        { type:'text', text:'ส่วนต่าง', size:'sm', weight:'bold', color:'#143D26', flex:4 },
        { type:'text', text:diffLabel, size:'sm', weight:'bold', color:diffColor, align:'end', flex:5 }
    ]});
  }

  if((recon && recon.closeStaff) || data.note){
    bodyContents.push(separator());
    if(recon && recon.closeStaff){
      bodyContents.push({ type:'box', layout:'horizontal', spacing:'sm', contents:[
        { type:'text', text:'👤 พนักงานปิดรอบ', size:'xs', color:'#9CA3AF', flex:5 },
        { type:'text', text:recon.closeStaff, size:'sm', weight:'bold', color:'#143D26', align:'end', flex:5, wrap:true }
      ]});
    }
    if(data.note){
      bodyContents.push({ type:'box', layout:'vertical', spacing:'xs', margin:'sm', paddingAll:'sm',
        backgroundColor:'#F6F0DB', cornerRadius:'md', contents:[
          { type:'text', text:'📝 หมายเหตุประจำวัน', size:'xs', color:'#8A6A00', weight:'bold' },
          { type:'text', text:String(data.note), size:'sm', color:'#143D26', wrap:true }
      ]});
    }
  }

  var footer = { type:'box', layout:'vertical', paddingAll:'sm', contents:[
    { type:'text', text:'บันทึกอัตโนมัติ · ' + mwNowStr(), size:'xxs', color:'#9CA3AF', align:'center' }
  ]};

  return {
    type:'flex',
    altText:'🥟 กุยช่ายสวรรค์ · รายงานสิ้นวัน ' + mwDateDM(data.date) + ' · ยอดขายรวม ฿' + mwMoney(total),
    contents:{ type:'bubble', size:'mega', header:header,
      body:{ type:'box', layout:'vertical', spacing:'sm', paddingAll:'lg', contents:bodyContents },
      footer:footer, styles:{ footer:{ separator:true, separatorColor:'#F0E4C4' } } }
  };
}


  // ย่อ/บีบรูปก่อนอัป (records.html ใช้ตัวนี้ทำพรีวิว+อัป) — เผื่อหน้านี้ไม่ได้โหลด shared.js
  window.maruCompressImage = function (file, maxDim, quality) {
    maxDim = maxDim || 1280; quality = quality || 0.8;
    return new Promise(function (resolve) {
      if (!file) { resolve(null); return; }
      var reader = new FileReader();
      reader.onload = function () {
        var raw = reader.result;
        function rawResult() { return { base64: String(raw).split(',')[1] || '', mime: file.type || 'image/jpeg', name: file.name || 'receipt', dataUrl: raw }; }
        var img = new Image();
        img.onload = function () {
          try {
            var w = img.width, h = img.height;
            if (Math.max(w, h) > maxDim) { var sc = maxDim / Math.max(w, h); w = Math.round(w * sc); h = Math.round(h * sc); }
            var c = document.createElement('canvas'); c.width = w; c.height = h;
            c.getContext('2d').drawImage(img, 0, 0, w, h);
            var dataUrl = c.toDataURL('image/jpeg', quality);
            var base64 = dataUrl.split(',')[1] || '';
            if (!base64 || base64.length >= String(raw).length) { resolve(rawResult()); return; }
            resolve({ base64: base64, mime: 'image/jpeg', name: (file.name || 'receipt').replace(/\.[^.]+$/, '') + '.jpg', dataUrl: dataUrl });
          } catch (e) { resolve(rawResult()); }
        };
        img.onerror = function () { resolve(rawResult()); };
        img.src = raw;
      };
      reader.onerror = function () { resolve(null); };
      reader.readAsDataURL(file);
    });
  };

  async function sbGet(path) {
    const res = await fetch(SB_URL + '/rest/v1/' + path, { headers: H });
    if (!res.ok) throw new Error('Supabase ' + res.status + ': ' + (await res.text()).slice(0, 150));
    return res.json();
  }
  async function sbWrite(method, path, body) {
    const res = await fetch(SB_URL + '/rest/v1/' + path, {
      method: method,
      headers: Object.assign({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }, H),
      body: body ? JSON.stringify(body) : undefined
    });
    if (res.ok) return true;
    throw new Error(method + ' ' + path + ' → ' + res.status + ': ' + (await res.text()).slice(0, 150));
  }
  function fmtD(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function dm(s) { const p = String(s).split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
  function dtDM(v) { if (!v) return ''; const d = new Date(v); if (isNaN(d.getTime())) return ''; const p = function (n) { return ('0' + n).slice(-2); }; return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); }
  function b64ToBlob(b64, mime) { const bin = atob(b64), len = bin.length, arr = new Uint8Array(len); for (let i = 0; i < len; i++) arr[i] = bin.charCodeAt(i); return new Blob([arr], { type: mime || 'image/jpeg' }); }
  async function uploadImg(receipt) {
    if (!receipt || !receipt.base64) return '';
    const isPng = String(receipt.mime || '').indexOf('png') >= 0;
    const path = Date.now() + '_' + Math.random().toString(36).slice(2, 8) + (isPng ? '.png' : '.jpg');
    const res = await fetch(SB_URL + '/storage/v1/object/receipts/' + path, {
      method: 'POST', headers: Object.assign({ 'Content-Type': receipt.mime || 'image/jpeg' }, H), body: b64ToBlob(receipt.base64, receipt.mime)
    });
    if (!res.ok) throw new Error('อัปรูปไม่สำเร็จ (' + res.status + '): ' + (await res.text()).slice(0, 150));
    return SB_URL + '/storage/v1/object/public/receipts/' + path;
  }

  // ---------- READS ----------
  async function getConfig() { return { channels: SB_CH, today: fmtD(new Date()) }; }

  async function getDailyReport(p) {
    const date = p.date;
    const [sr, er] = await Promise.all([
      sbGet('sales?select=*&sale_date=eq.' + encodeURIComponent(date) + '&limit=1'),
      sbGet('expenses?select=exp_date,item,amount,receipt_url,type&exp_date=eq.' + encodeURIComponent(date))
    ]);
    let sale = null;
    if (sr.length) { const v = sr[0]; sale = {}; SB_CH.forEach(function (c) { sale[c.key] = v[c.key]; }); sale.openingCash = v.cash_open; sale.cashIn = v.cash_in; sale.refund = v.refund; sale.actualCash = v.cash_actual; sale.closeStaff = v.closed_by; sale.note = v.note; }
    const expenses = []; er.forEach(function (r) { if ((r.type || 'pos') === 'pos') expenses.push({ item: r.item, amount: r.amount, existingUrl: r.receipt_url }); });
    return { date: date, sales: sale, expenses: expenses };
  }

  async function getExpensesReport(p) {
    const start = p.start || '0000-01-01', end = p.end || '9999-12-31', type = p.type || 'all';
    const [expRows, salesRows] = await Promise.all([
      sbGet('expenses?select=exp_date,item,amount,receipt_url,type,created_at'),
      sbGet('sales?select=sale_date,total')
    ]);
    const items = []; let total = 0, posTotal = 0, bizTotal = 0, totalExpAll = 0;
    expRows.forEach(function (r) {
      const d = r.exp_date; if (d < start || d > end) return;
      const t = r.type || 'pos'; totalExpAll += Number(r.amount) || 0;
      if (type !== 'all' && t !== type) return;
      const amt = Number(r.amount) || 0;
      items.push({ date: d, dateDM: dm(d), item: r.item || '', amount: amt, url: r.receipt_url || '', type: t, ts: dtDM(r.created_at) });
      total += amt; if (t === 'biz') bizTotal += amt; else posTotal += amt;
    });
    items.sort(function (a, b) { return b.date.localeCompare(a.date); });
    let totalSales = 0, daysWithSales = 0;
    salesRows.forEach(function (r) { const d = r.sale_date; if (d < start || d > end) return; const t = Number(r.total) || 0; if (t > 0) { totalSales += t; daysWithSales++; } });
    const sD = new Date(start + 'T00:00:00'), eD = new Date(end + 'T00:00:00');
    const daysInRange = Math.max(1, Math.round((eD - sD) / 86400000) + 1);
    return { items: items, summary: { count: items.length, total: total, byType: { pos: posTotal, biz: bizTotal } }, sales: { total: totalSales, daysWithSales: daysWithSales, daysInRange: daysInRange, totalExpenseAll: totalExpAll } };
  }

  async function getDashboardData(p) {
    const start = p.start, end = p.end;
    const sD = new Date(start + 'T00:00:00'), eD = new Date(end + 'T00:00:00');
    const days = Math.round((eD - sD) / 86400000) + 1;
    const prevEnd = new Date(sD.getTime() - 86400000), prevStart = new Date(prevEnd.getTime() - (days - 1) * 86400000);
    const prevStartStr = fmtD(prevStart), prevEndStr = fmtD(prevEnd);
    const [salesRows, expRows] = await Promise.all([
      sbGet('sales?select=sale_date,total,cash,transfer,thaihelp,lineman,grab,shopee,robinhood,cash_diff&order=sale_date.asc'),
      sbGet('expenses?select=exp_date,item,amount')
    ]);
    const chanTotal = {}; SB_CH.forEach(function (c) { chanTotal[c.key] = 0; });
    const byDay = {}, byDow = [0,0,0,0,0,0,0], byDowCnt = [0,0,0,0,0,0,0];
    let totalSales = 0, cash = 0, transfer = 0, thaihelp = 0, delivery = 0, dayCount = 0, prevTotal = 0, cashDiff = 0;
    salesRows.forEach(function (r) {
      const dd = r.sale_date, dayTotal = Number(r.total) || 0;
      if (dd >= start && dd <= end) {
        totalSales += dayTotal; dayCount++; byDay[dd] = dayTotal;
        var di = new Date(dd + 'T00:00:00').getDay(); byDow[di] += dayTotal; byDowCnt[di]++;
        cashDiff += Number(r.cash_diff) || 0;
        SB_CH.forEach(function (c) { const v = Number(r[c.key]) || 0; chanTotal[c.key] += v; if (c.group === 'store') { if (c.key === 'cash') cash += v; else if (c.key === 'transfer') transfer += v; else if (c.key === 'thaihelp') thaihelp += v; } else delivery += v; });
      } else if (dd >= prevStartStr && dd <= prevEndStr) prevTotal += dayTotal;
    });
    let totalExpenses = 0; const expByCat = {};
    expRows.forEach(function (r) { const dd = r.exp_date; if (dd >= start && dd <= end) { const a = Number(r.amount) || 0; totalExpenses += a; const c = r.item || 'อื่นๆ'; expByCat[c] = (expByCat[c] || 0) + a; } });
    const byDayArr = Object.keys(byDay).sort().map(function (k) { return { date: k, total: byDay[k] }; });
    const byChannelArr = SB_CH.map(function (c) { return { label: c.label, total: chanTotal[c.key] }; }).filter(function (o) { return o.total > 0; }).sort(function (a, b) { return b.total - a.total; });
    const expByCatArr = Object.keys(expByCat).map(function (k) { return { category: k, total: expByCat[k] }; }).sort(function (a, b) { return b.total - a.total; });
    let bestDay = null; byDayArr.forEach(function (o) { if (!bestDay || o.total > bestDay.total) bestDay = o; });
    function dowAvg(i) { return byDowCnt[i] > 0 ? byDow[i] / byDowCnt[i] : 0; }
    let bestDowIdx = 0; for (let i = 1; i < 7; i++) { if (dowAvg(i) > dowAvg(bestDowIdx)) bestDowIdx = i; }
    return { range: { start: start, end: end }, summary: { totalSales: totalSales, cash: cash, transfer: transfer, thaihelp: thaihelp, delivery: delivery, totalExpenses: totalExpenses, netProfit: totalSales - totalExpenses, dayCount: dayCount, avgPerDay: dayCount ? totalSales / dayCount : 0, prevTotal: prevTotal, growth: prevTotal > 0 ? ((totalSales - prevTotal) / prevTotal * 100) : null, bestDay: bestDay, bestDow: byDayArr.length ? SB_DOW[bestDowIdx] : null, bestDowAvg: byDayArr.length ? Math.round(dowAvg(bestDowIdx)) : 0, cashDiff: cashDiff }, byChannel: byChannelArr, byDay: byDayArr, byDow: byDow, byDowCount: byDowCnt, dowNames: SB_DOW, expByCat: expByCatArr };
  }

  // ---------- WRITES ----------
  async function addBusinessExpense(p) {
    const data = (p && p.data) || {};
    if (!data.date || !(Number(data.amount) > 0)) return { ok: false, error: 'กรอกวันที่และยอดเงินให้ครบ' };
    let url = data.existingUrl || '';
    try { if (data.receipt && data.receipt.base64) url = await uploadImg(data.receipt); } catch (e) { return { ok: false, error: String(e.message || e) }; }
    try {
      await sbWrite('POST', 'expenses', { exp_date: data.date, item: data.item || '', amount: Number(data.amount) || 0, receipt_url: url, type: 'biz', created_at: new Date().toISOString() });
    } catch (e) { return { ok: false, error: String(e.message || e) }; }
    return { ok: true, msg: 'บันทึกค่าใช้จ่าย ✓', url: url };
  }

  async function saveDailyReport(p) {
    const data = (p && p.data) || {};
    const date = data.date, sales = data.sales || {}, recon = data.recon || {}, exps = (data.expenses || []).slice();
    if (!date) return { ok: false, error: 'ไม่มีวันที่' };
    try {
      // อัปรูปใบเสร็จ (POS) ที่แนบมาใหม่
      for (let i = 0; i < exps.length; i++) {
        if (exps[i].receipt && exps[i].receipt.base64) { try { exps[i].existingUrl = await uploadImg(exps[i].receipt); } catch (e) {} }
      }
      let total = 0; SB_CH.forEach(function (c) { total += Number(sales[c.key]) || 0; });
      let posSum = 0; exps.forEach(function (e) { posSum += Number(e.amount) || 0; });
      const open = Number(recon.openingCash) || 0, cashIn = Number(recon.cashIn) || 0, refund = Number(recon.refund) || 0, actual = Number(recon.actualCash) || 0;
      const cashSales = Number(sales.cash) || 0;
      const expected = open + cashSales + cashIn - refund - posSum;
      const diff = actual - expected;
      const base = {
        sale_date: date,
        cash: Number(sales.cash) || 0, transfer: Number(sales.transfer) || 0, thaihelp: Number(sales.thaihelp) || 0,
        lineman: Number(sales.lineman) || 0, grab: Number(sales.grab) || 0, shopee: Number(sales.shopee) || 0, robinhood: Number(sales.robinhood) || 0,
        total: total, cash_open: open, cash_in: cashIn, refund: refund, cash_expected: expected, cash_actual: actual, cash_diff: diff,
        closed_by: recon.closeStaff || '', note: data.note || ''
      };
      // upsert sales ตามวันที่
      const existing = await sbGet('sales?select=id&sale_date=eq.' + encodeURIComponent(date) + '&limit=1');
      if (existing.length) await sbWrite('PATCH', 'sales?sale_date=eq.' + encodeURIComponent(date), Object.assign({ created_at: new Date().toISOString() }, base));
      else await sbWrite('POST', 'sales', Object.assign({ created_at: new Date().toISOString() }, base));
      // แทนที่ค่าใช้จ่าย POS ของวันนั้น (ลบเก่า + ใส่ใหม่)
      await sbWrite('DELETE', 'expenses?exp_date=eq.' + encodeURIComponent(date) + '&type=eq.pos');
      const posRows = exps.filter(function (e) { return (Number(e.amount) || 0) > 0 || (e.item || '').trim(); })
        .map(function (e) { return { exp_date: date, item: e.item || '', amount: Number(e.amount) || 0, receipt_url: e.existingUrl || '', type: 'pos', created_at: new Date().toISOString() }; });
      if (posRows.length) await sbWrite('POST', 'expenses', posRows);
      // ส่งแจ้งเตือนเข้า LINE (Flex รายงานสิ้นวัน) ผ่าน Edge — ไม่บล็อกถ้าพลาด
      var lineMsg = 'บันทึกรายงานสิ้นวันแล้ว ✓';
      try {
        var flex = maruBuildDailyFlex({ date: date, sales: sales, note: data.note || '' }, total, posSum, recon);
        var lr = await maruNotifyLine([flex]);
        console.log('[LINE notify result]', lr);
        if (lr && lr.ok) lineMsg = 'บันทึก + ส่งเข้า LINE แล้ว ✓ (' + date + ')';
        else lineMsg = 'บันทึกแล้ว ✓ · LINE ไม่สำเร็จ: ' + (lr && (lr.error || lr.body || ('HTTP ' + lr.status)) || '?');
      } catch (e) { lineMsg = 'บันทึกแล้ว ✓ · LINE error: ' + String(e && e.message || e); }
      return { ok: true, msg: lineMsg };
    } catch (e) { return { ok: false, error: String(e.message || e) }; }
  }

  var ACTIONS = {
    getConfig: getConfig,
    getDailyReport: getDailyReport,
    getExpensesReport: getExpensesReport,
    getDashboardData: getDashboardData,
    addBusinessExpense: addBusinessExpense,
    saveDailyReport: saveDailyReport
  };

  // เขียนทับ api() ของ records ทั้งหมด → ทุก action วิ่งเข้า Supabase เท่านั้น (ตัดขาด Apps Script)
  window.SB_ACTIONS = ACTIONS;
  var _sharedApi = window.api;   // api เดิมจาก shared.js (Supabase reads + Edge เช่น notifyLine/getAlerts)
  window.api = async function (action, params) {
    if (ACTIONS[action]) return ACTIONS[action](params || {});
    // action อื่น (เช่น notifyLine → Edge) ส่งต่อให้ api เดิมของ shared.js
    if (typeof _sharedApi === 'function') return _sharedApi(action, params);
    throw new Error('v2 ยังไม่รองรับ action นี้: ' + action);
  };
  console.log('✅ sb-data.js โหลดแล้ว — records ใช้ Supabase ล้วน (ตัด Apps Script)');
})();
