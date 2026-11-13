/* Sova website → Google Sheet, with automatic customer emails.
   - Orders go to the "Orders" tab, Notify me requests to "Notify me".
   - When you change an order's Status to Confirmed / Out for delivery / Delivered / Cancelled,
     the customer gets an email from this Gmail account (only if they gave an email).
   Backup copy of the Apps Script in the "Sova orders" Sheet (Extensions → Apps Script).
   After editing doPost: Deploy → Manage deployments → Edit → Version: New version → Deploy (keeps the same URL). */
const TZ = 'Asia/Kathmandu';
const ORDERS = 'Orders';
const NOTIFY = 'Notify me';
// New columns are added at the END so older rows stay in place.
const ORDER_HEADERS = ['Date', 'Order ref', 'Items', 'Total', 'Name', 'Phone', 'Delivery address', 'Instagram', 'Note', 'Gift', 'Gift note', 'Status', 'Email', 'Updates sent'];
const NOTIFY_HEADERS = ['Date', 'Bars', 'Phone or Instagram', 'Name', 'Status'];
const MAX_PER_HOUR = 40; // most orders (and most Notify me requests) saved per hour

// ---- Prices: the Sheet works out every total itself and never trusts the browser. ----
// If you change a price on the website (shop.html), change it here too, then
// Deploy → Manage deployments → Edit → New version. If they differ, the order's Note says "CHECK TOTAL".
const PRICES = { rose: 150, vanilla: 150, pack: 500 };
const PRODUCT_NAMES = { rose: 'Rose ma Dose', vanilla: 'la..la..la.. Vanilla', pack: 'Loofah Love Pack' };
const PACK_SIZE = 5;       // bars in one Loofah Love Pack
const MAX_QTY = 20;        // most of one item per order
const NOTIFY_BARS = ['Turmeric', 'Neem', 'Aloe vera'];
const MAX_BODY = 6000;     // biggest request accepted, in characters

// ---- Email settings -------------------------------------------------------
const SHOP_NAME = 'Sova';
const INSTAGRAM = '@sova.np9';
const WHATSAPP = ''; // e.g. '+977 98XXXXXXXX' — shown in the "Confirmed" email once you fill it in
const EMAILS = {
  'Confirmed': {
    subject: 'Your Sova order {ref} is confirmed',
    lines: ['Namaste {name}!', 'Good news: we\'ve confirmed your Sova order. Here\'s what you ordered:', '{items}', 'Total: {total}',
            'We\'ll be in touch about payment and delivery soon.{whatsapp}']
  },
  'Out for delivery': {
    subject: 'Your Sova order {ref} is on its way',
    lines: ['Namaste {name}!', 'Your Sova soaps are out for delivery and will reach you soon.', '{items}',
            'Questions? Just reply to this email.']
  },
  'Delivered': {
    subject: 'Your Sova order {ref} has been delivered',
    lines: ['Namaste {name}!', 'Your order has been delivered. We hope you love your new loofah soap!',
            'Let the bar dry between uses and it will last longer.',
            'If you share a photo, tag us on Instagram ' + INSTAGRAM + '. We\'d love to see it.']
  },
  'Cancelled': {
    subject: 'Your Sova order {ref} was cancelled',
    lines: ['Namaste {name},', 'Your Sova order {ref} has been cancelled.',
            'If you think this is a mistake, reply to this email or DM us on Instagram ' + INSTAGRAM + '.']
  }
};

// ---- One-time setup ---------------------------------------------------------
function setup() {
  sheet_(ORDERS, ORDER_HEADERS);
  sheet_(NOTIFY, NOTIFY_HEADERS);
}

// Run once after updating to this version: adds the Email + Updates sent columns and turns on automatic emails.
function setupEmailUpdates() {
  const sh = sheet_(ORDERS, ORDER_HEADERS);
  ORDER_HEADERS.forEach(function (h, i) {
    const cell = sh.getRange(1, i + 1);
    if (!cell.getValue()) cell.setValue(h).setFontWeight('bold').setBackground('#DDE7D5');
  });
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'onStatusChange') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('onStatusChange').forSpreadsheet(ss).onEdit().create();
  console.log('Automatic emails are on. Emails left today: ' + MailApp.getRemainingDailyQuota());
}

function sheet_(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.appendRow(headers);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#DDE7D5');
  }
  return sh;
}

// Clean text and stop spreadsheet formulas from running (e.g. "=HYPERLINK(...)")
function safe_(v, max) {
  v = String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max || 200);
  return /^[=+\-@]/.test(v) ? "'" + v : v;
}

function validEmail_(v) {
  return /^[^\s@<>"]+@[^\s@<>"]+\.[A-Za-z]{2,}$/.test(String(v || ''));
}

// Only plain text is accepted for text fields (never objects or lists)
function text_(v, max) {
  return typeof v === 'string' || typeof v === 'number' ? safe_(v, max) : '';
}

function validPhone_(v) {
  const s = String(v || ''), digits = s.replace(/\D/g, ''), local = digits.replace(/^977/, '');
  if (!/^\+?[\d\s-]+$/.test(s) || digits.length < 7 || digits.length > 15) return false;
  return !(/^(\d)\1+$/.test(local) || '01234567890123456789'.indexOf(local) !== -1 || '98765432109876543210'.indexOf(local) !== -1);
}

// Whole number from 0 to max, or -1 if it is anything else
function qty_(v, max) {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max ? v : -1;
}

// First name for the email greeting: letters only, so nobody can slip a link into "Namaste ...!"
function firstName_(name) {
  const first = String(name || '').replace(/^'/, '').trim().split(/\s+/)[0] || '';
  return /^[\p{L}\p{M}'’.-]{1,30}$/u.test(first) ? first : 'there';
}

function validRef_(v) {
  return typeof v === 'string' && /^SOVA-[A-Z0-9]{6,8}$/.test(v);
}

function newRef_() {
  return 'SOVA-' + Utilities.getUuid().replace(/-/g, '').slice(0, 6).toUpperCase();
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---- Website → Sheet -------------------------------------------------------
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const raw = (e && e.postData && e.postData.contents) || '';
    if (raw.length > MAX_BODY) { console.log('Rejected: request too big'); return out_({ ok: false, error: 'too_big' }); }
    let d;
    try { d = JSON.parse(raw); } catch (err) { d = null; }
    if (!d || typeof d !== 'object' || Array.isArray(d)) { console.log('Rejected: not a valid request'); return out_({ ok: false, error: 'bad_request' }); }
    console.log('Received: ' + text_(d.type, 10) + ' ' + text_(d.ref, 20));
    if (d.botcheck) { console.log('Ignored: spam trap'); return out_({ ok: true }); }

    const cache = CacheService.getScriptCache();
    const hour = Utilities.formatDate(new Date(), TZ, 'yyyyMMddHH');
    const now = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm');
    // Only requests that pass every check count towards the hourly cap, so junk can't use it up.
    const underCap = function (key) {
      const n = Number(cache.get(key + hour) || 0);
      if (n >= MAX_PER_HOUR) return false;
      cache.put(key + hour, String(n + 1), 3600);
      return true;
    };

    // ---------- Notify me ----------
    if (d.type === 'notify') {
      const bars = String(typeof d.bars === 'string' ? d.bars : '').split(',').map(function (x) { return x.trim(); })
        .filter(function (x, i, all) { return NOTIFY_BARS.indexOf(x) !== -1 && all.indexOf(x) === i; });
      const contact = typeof d.contact === 'string' ? d.contact.trim().slice(0, 40) : '';
      const isHandle = /^@?[A-Za-z0-9._]{2,30}$/.test(contact) && /[A-Za-z]/.test(contact);
      if (!bars.length || !(isHandle || validPhone_(contact))) { console.log('Rejected: bad Notify me request'); return out_({ ok: false, error: 'missing' }); }
      const key = 'n' + contact.toLowerCase() + '|' + bars.join(',');
      if (cache.get(key)) { console.log('Skipped: same Notify me request again'); return out_({ ok: true }); }
      if (!underCap('nh')) { console.log('Rejected: hourly limit'); return out_({ ok: false, error: 'busy' }); }
      cache.put(key, '1', 21600); // the same request is ignored for 6 hours
      sheet_(NOTIFY, NOTIFY_HEADERS).appendRow([now, bars.join(', '), safe_(contact, 40), text_(d.name, 60), 'Waiting']);
      console.log('Saved Notify me request');
      return out_({ ok: true });
    }

    // ---------- Order ----------
    const c = d.cart && typeof d.cart === 'object' && !Array.isArray(d.cart) ? d.cart : {};
    const q = { rose: qty_(c.rose, MAX_QTY), vanilla: qty_(c.vanilla, MAX_QTY), pack: qty_(c.pack, MAX_QTY) };
    const packRose = qty_(c.packRose, PACK_SIZE);
    if (q.rose < 0 || q.vanilla < 0 || q.pack < 0 || q.rose + q.vanilla + q.pack === 0 || (q.pack > 0 && packRose < 0)) {
      console.log('Rejected: basket is not valid'); return out_({ ok: false, error: 'bad_cart' });
    }
    const name = text_(d.name, 60), phone = text_(d.phone, 20), address = text_(d.address, 200);
    if (name.replace(/^'/, '').length < 2 || !validPhone_(phone.replace(/^'/, '')) || address.replace(/^'/, '').length < 5) {
      console.log('Rejected: name, phone or address missing or not valid'); return out_({ ok: false, error: 'missing' });
    }

    // Items and total are worked out here from our own price list.
    const lines = []; let total = 0;
    ['rose', 'vanilla', 'pack'].forEach(function (id) {
      if (q[id] > 0) {
        const label = id === 'pack' ? PRODUCT_NAMES.pack + ' (' + packRose + ' Rose + ' + (PACK_SIZE - packRose) + ' Vanilla)' : PRODUCT_NAMES[id];
        lines.push(label + ' x ' + q[id] + ' = NPR ' + (q[id] * PRICES[id])); total += q[id] * PRICES[id];
      }
    });
    const shown = Number(String(typeof d.total === 'string' || typeof d.total === 'number' ? d.total : '').replace(/\D/g, ''));
    let note = text_(d.notes, 200);
    if (shown !== total) note = ('CHECK TOTAL: website showed NPR ' + shown + '. ' + note.replace(/^'/, '')).trim().slice(0, 240);

    const phoneKey = 'p' + phone.replace(/\D/g, '');
    if (cache.get(phoneKey)) { console.log('Rejected: same phone within 2 minutes'); return out_({ ok: false, error: 'too_soon' }); }
    if (!underCap('oh')) { console.log('Rejected: hourly limit'); return out_({ ok: false, error: 'busy' }); }
    cache.put(phoneKey, '1', 120);

    const ref = validRef_(d.ref) ? d.ref : newRef_();
    const email = validEmail_(d.email) ? safe_(d.email, 80) : '';
    const gift = d.gift === 'Yes' ? 'Yes' : 'No';
    const sh = sheet_(ORDERS, ORDER_HEADERS);
    sh.appendRow([
      now, ref, lines.join(' ; '), 'NPR ' + total, name, phone, address, text_(d.instagram, 40),
      note, gift, gift === 'Yes' ? text_(d.giftNote, 150) : '', 'New', email, ''
    ]);
    console.log('Saved order ' + ref + ' in row ' + sh.getLastRow() + (shown !== total ? ' (CHECK TOTAL)' : ''));
    return out_({ ok: true, ref: ref, total: total });
  } catch (err) {
    console.error('Error: ' + err);
    return out_({ ok: false, error: 'server' });
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

function doGet() {
  return out_({ ok: true, service: 'Sova orders' });
}

// ---- Status change → customer email (runs on every edit; turned on by setupEmailUpdates) ----
function onStatusChange(e) {
  try {
    if (!e || !e.range) return;
    const sh = e.range.getSheet();
    if (sh.getName() !== ORDERS || e.range.getNumRows() !== 1 || e.range.getNumColumns() !== 1) return;
    const col = (h) => ORDER_HEADERS.indexOf(h) + 1;
    const row = e.range.getRow();
    if (row < 2 || e.range.getColumn() !== col('Status')) return;

    const status = String(e.value || '');
    const tpl = EMAILS[status];
    if (!tpl) return;

    const values = sh.getRange(row, 1, 1, ORDER_HEADERS.length).getValues()[0];
    const get = (h) => String(values[col(h) - 1] || '');
    const email = get('Email');
    const sentCell = sh.getRange(row, col('Updates sent'));
    const sent = String(sentCell.getValue() || '');
    const stamp = Utilities.formatDate(new Date(), TZ, 'MMM d HH:mm');

    if (!validEmail_(email)) { if (sent.indexOf('No email') === -1) sentCell.setValue((sent ? sent + '; ' : '') + 'No email'); return; }
    if (sent.indexOf(status + ' ✓') !== -1) return;            // already emailed this status
    if (MailApp.getRemainingDailyQuota() < 1) { sentCell.setValue((sent ? sent + '; ' : '') + status + ' NOT SENT (daily limit)'); return; }

    const data = {
      ref: validRef_(get('Order ref')) ? get('Order ref') : '', name: firstName_(get('Name')), items: get('Items').split(' ; ').join('\n'),
      total: get('Total'), whatsapp: WHATSAPP ? '\nYou can reach us on WhatsApp: ' + WHATSAPP : ''
    };
    const fill = (s) => s.replace(/\{(\w+)\}/g, function (_, k) { return data[k] || ''; });
    const subject = fill(tpl.subject).replace(/\s+/g, ' ');
    const lines = tpl.lines.map(fill);

    MailApp.sendEmail({
      to: email,
      subject: subject,
      name: SHOP_NAME,
      body: lines.join('\n\n') + '\n\n' + SHOP_NAME + ' · Kathmandu · ' + INSTAGRAM,
      htmlBody: emailHtml_(subject, lines)
    });
    sentCell.setValue((sent ? sent + '; ' : '') + status + ' ✓ ' + stamp);
    console.log('Emailed ' + status + ' for ' + data.ref);
  } catch (err) {
    console.error('Email error: ' + err);
  }
}

function esc_(s) {
  return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
}

function emailHtml_(title, lines) {
  const paras = lines.map(function (l) {
    return '<p style="margin:0 0 14px;line-height:1.55">' + esc_(l).replace(/\n/g, '<br>') + '</p>';
  }).join('');
  return '<div style="background:#F7F2E7;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#3B2A1E">' +
    '<div style="max-width:520px;margin:0 auto;background:#FFFCF5;border-radius:16px;overflow:hidden;border:1px solid #E6DCC8">' +
    '<div style="background:#2F5130;color:#F7F2E7;padding:18px 22px;font-size:22px;font-weight:bold;letter-spacing:.5px">' + SHOP_NAME + '</div>' +
    '<div style="padding:22px">' +
    '<h1 style="font-size:19px;margin:0 0 16px;color:#2F5130">' + esc_(title) + '</h1>' + paras + '</div>' +
    '<div style="padding:14px 22px;background:#EFE6D2;font-size:12px;color:#6B5646">Soap and scrub, in one little bar · Kathmandu, Nepal · Instagram ' + INSTAGRAM + '</div>' +
    '</div></div>';
}

// Adds Status dropdowns + colours to both tabs. Run once (safe to run again).
function addStatusDropdowns() {
  const tabs = [
    [ORDERS, ORDER_HEADERS, ['New', 'Confirmed', 'Paid', 'Out for delivery', 'Delivered', 'Cancelled']],
    [NOTIFY, NOTIFY_HEADERS, ['Waiting', 'Messaged', 'Ordered', 'Not interested']]
  ];
  const colours = {
    'New': '#FFF2CC', 'Confirmed': '#CFE2F3', 'Paid': '#D9EAD3', 'Out for delivery': '#FCE5CD',
    'Delivered': '#B6D7A8', 'Cancelled': '#E0E0E0',
    'Waiting': '#FFF2CC', 'Messaged': '#CFE2F3', 'Ordered': '#B6D7A8', 'Not interested': '#E0E0E0'
  };
  tabs.forEach(function (t) {
    const sh = sheet_(t[0], t[1]);
    if (sh.getMaxRows() < 2000) sh.insertRowsAfter(sh.getMaxRows(), 2000 - sh.getMaxRows());
    const col = t[1].indexOf('Status') + 1;
    const range = sh.getRange(2, col, sh.getMaxRows() - 1, 1);

    // fill empty Status cells on existing rows with the first option
    const last = sh.getLastRow();
    if (last >= 2) {
      const cells = sh.getRange(2, col, last - 1, 1);
      cells.setValues(cells.getValues().map(function (r) { return [r[0] || t[2][0]]; }));
    }

    // dropdown
    range.setDataValidation(SpreadsheetApp.newDataValidation()
      .requireValueInList(t[2], true).setAllowInvalid(false).build());

    // colours (replaces any old Status colour rules)
    const rules = sh.getConditionalFormatRules().filter(function (r) {
      return !r.getRanges().some(function (g) { return g.getColumn() === col; });
    });
    t[2].forEach(function (v) {
      rules.push(SpreadsheetApp.newConditionalFormatRule()
        .whenTextEqualTo(v).setBackground(colours[v]).setRanges([range]).build());
    });
    sh.setConditionalFormatRules(rules);
  });
}
