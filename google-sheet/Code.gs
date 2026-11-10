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
const MAX_PER_HOUR = 40; // safety cap for the whole site

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

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ---- Website → Sheet -------------------------------------------------------
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    console.log('Received: ' + (d.type || 'unknown') + (d.ref ? ' ' + d.ref : ''));
    if (d.botcheck) { console.log('Ignored: spam trap'); return out_({ ok: true }); }

    const cache = CacheService.getScriptCache();
    const hourKey = 'h' + Utilities.formatDate(new Date(), TZ, 'yyyyMMddHH');
    const count = Number(cache.get(hourKey) || 0);
    if (count >= MAX_PER_HOUR) { console.log('Rejected: hourly limit'); return out_({ ok: false, error: 'busy' }); }
    cache.put(hourKey, String(count + 1), 3600);

    const now = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm');

    if (d.type === 'notify') {
      sheet_(NOTIFY, NOTIFY_HEADERS).appendRow([now, safe_(d.bars, 80), safe_(d.contact, 40), safe_(d.name, 60), 'Waiting']);
      console.log('Saved Notify me request');
      return out_({ ok: true });
    }

    const missing = ['items', 'name', 'phone', 'address'].filter(function (k) { return !d[k]; });
    if (missing.length) { console.log('Rejected: missing ' + missing.join(', ')); return out_({ ok: false, error: 'missing' }); }
    const phoneKey = 'p' + String(d.phone).replace(/\D/g, '');
    if (cache.get(phoneKey)) { console.log('Rejected: same phone within 2 minutes'); return out_({ ok: false, error: 'too_soon' }); }
    cache.put(phoneKey, '1', 120);

    const email = validEmail_(d.email) ? safe_(d.email, 80) : '';
    const sh = sheet_(ORDERS, ORDER_HEADERS);
    sh.appendRow([
      now, safe_(d.ref, 20), safe_(String(d.items).replace(/\n/g, ' ; '), 400), safe_(d.total, 20),
      safe_(d.name, 60), safe_(d.phone, 20), safe_(d.address, 200), safe_(d.instagram, 40),
      safe_(d.notes, 200), safe_(d.gift, 5), safe_(d.giftNote, 150), 'New', email, ''
    ]);
    console.log('Saved order ' + d.ref + ' in row ' + sh.getLastRow());
    return out_({ ok: true });
  } catch (err) {
    console.error('Error: ' + err);
    return out_({ ok: false, error: 'server' });
  } finally {
    try { lock.releaseLock(); } catch (e) {}
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
      ref: get('Order ref'), name: get('Name').split(' ')[0] || 'there', items: get('Items').split(' ; ').join('\n'),
      total: get('Total'), whatsapp: WHATSAPP ? '\nYou can reach us on WhatsApp: ' + WHATSAPP : ''
    };
    const fill = (s) => s.replace(/\{(\w+)\}/g, function (_, k) { return data[k] || ''; });
    const subject = fill(tpl.subject);
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
