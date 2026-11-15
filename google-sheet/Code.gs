/* Sova website → Google Sheet, with automatic customer emails.
   - Orders go to the "Orders" tab, Notify me requests to "Notify me".
   - When you change an order's Status to Confirmed / Out for delivery / Delivered / Cancelled,
     the customer gets an email from this Gmail account (only if they gave an email).
   - Promo codes are managed in the "Promo codes" tab. Customers can check their order status on the Track page.
   Backup copy of the Apps Script in the "Sova orders" Sheet (Extensions → Apps Script).
   After editing doPost: Deploy → Manage deployments → Edit → Version: New version → Deploy (keeps the same URL). */
const TZ = 'Asia/Kathmandu';
const ORDERS = 'Orders';
const NOTIFY = 'Notify me';
// New columns are added at the END so older rows stay in place.
const ORDER_HEADERS = ['Date', 'Order ref', 'Items', 'Total', 'Name', 'Phone', 'Delivery address', 'Instagram', 'Note', 'Gift', 'Gift note', 'Status', 'Email', 'Updates sent', 'Promo', 'Discount'];
const NOTIFY_HEADERS = ['Date', 'Bars', 'Phone or Instagram', 'Name', 'Status'];
const PROMOS = 'Promo codes';
// Type is "percent" or "amount". Leave Max uses / Expires empty for no limit. Expires is a date like 2026-12-31.
const PROMO_HEADERS = ['Code', 'Type', 'Value', 'Min order', 'Max uses', 'Used', 'Expires', 'Once per phone', 'Active', 'Note'];
const SITE_URL = 'https://pahiladigital-lab.github.io/sova/'; // change this if the site moves to its own domain
const TRACK_STATUSES = ['New', 'Confirmed', 'Paid', 'Out for delivery', 'Delivered', 'Cancelled']; // the only words the Track page is ever told
const MAX_CHECKS_PER_HOUR = 300; // promo-code checks and order-status lookups, each
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

// Adds any column titles that are missing from the Orders tab (new columns always go at the end).
function addMissingHeaders_() {
  const sh = sheet_(ORDERS, ORDER_HEADERS);
  ORDER_HEADERS.forEach(function (h, i) {
    const cell = sh.getRange(1, i + 1);
    if (!cell.getValue()) cell.setValue(h).setFontWeight('bold').setBackground('#DDE7D5');
  });
  return sh;
}

// Run once after updating to this version: adds the "Promo codes" tab and the Promo + Discount columns.
// Safe to run again: it never changes codes you have already entered.
function setupPromoCodes() {
  addMissingHeaders_();
  const sh = sheet_(PROMOS, PROMO_HEADERS);
  if (sh.getLastRow() === 1) {
    sh.appendRow(['WELCOME10', 'percent', 10, 0, 100, 0, '', 'Yes', 'No', 'Example: 10% off, first 100 orders, one per phone. Set Active to Yes to switch it on.']);
  }
  const rows = Math.max(sh.getMaxRows() - 1, 1);
  const list = function (col, values) {
    sh.getRange(2, col, rows, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(values, true).setAllowInvalid(false).build());
  };
  list(PROMO_HEADERS.indexOf('Type') + 1, ['percent', 'amount']);
  list(PROMO_HEADERS.indexOf('Once per phone') + 1, ['Yes', 'No']);
  list(PROMO_HEADERS.indexOf('Active') + 1, ['Yes', 'No']);
  console.log('Promo codes tab is ready.');
}

// Run once to turn on automatic emails (already done if you ran it before).
function setupEmailUpdates() {
  addMissingHeaders_();
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

// Last 10 digits of a phone number, so +977 98… and 98… count as the same phone
function phoneTail_(v) {
  return String(v || '').replace(/\D/g, '').slice(-10);
}

// Reads and checks a basket. Returns null if it is not valid.
function cart_(c) {
  c = c && typeof c === 'object' && !Array.isArray(c) ? c : {};
  const q = { rose: qty_(c.rose, MAX_QTY), vanilla: qty_(c.vanilla, MAX_QTY), pack: qty_(c.pack, MAX_QTY) };
  const packRose = qty_(c.packRose, PACK_SIZE);
  if (q.rose < 0 || q.vanilla < 0 || q.pack < 0 || q.rose + q.vanilla + q.pack === 0 || (q.pack > 0 && packRose < 0)) return null;
  const lines = []; let subtotal = 0;
  ['rose', 'vanilla', 'pack'].forEach(function (id) {
    if (q[id] > 0) {
      const label = id === 'pack' ? PRODUCT_NAMES.pack + ' (' + packRose + ' Rose + ' + (PACK_SIZE - packRose) + ' Vanilla)' : PRODUCT_NAMES[id];
      lines.push(label + ' x ' + q[id] + ' = NPR ' + (q[id] * PRICES[id])); subtotal += q[id] * PRICES[id];
    }
  });
  return { q: q, packRose: packRose, lines: lines, subtotal: subtotal };
}

// Checks a promo code against the "Promo codes" tab. phone is optional (used for "Once per phone").
// Returns { ok:true, row, code, type, value, min, discount } or { ok:false, error, min }.
function promo_(rawCode, subtotal, phone) {
  const code = typeof rawCode === 'string' ? rawCode.trim().toUpperCase() : '';
  if (!/^[A-Z0-9]{3,20}$/.test(code)) return { ok: false, error: 'invalid' };
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(PROMOS);
  if (!sh || sh.getLastRow() < 2) return { ok: false, error: 'invalid' };
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, PROMO_HEADERS.length).getValues();
  const col = function (h) { return PROMO_HEADERS.indexOf(h); };
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (String(r[col('Code')]).trim().toUpperCase() !== code) continue;
    if (String(r[col('Active')]).trim().toLowerCase() !== 'yes') return { ok: false, error: 'invalid' };
    const type = String(r[col('Type')]).trim().toLowerCase() === 'amount' ? 'amount' : 'percent';
    const value = Number(r[col('Value')]) || 0, min = Number(r[col('Min order')]) || 0;
    const maxUses = Number(r[col('Max uses')]) || 0;
    if (value <= 0 || (type === 'percent' && value > 100)) return { ok: false, error: 'invalid' };
    const exp = r[col('Expires')];
    if (exp) {
      const expDay = exp instanceof Date ? Utilities.formatDate(exp, TZ, 'yyyy-MM-dd') : String(exp).trim().slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(expDay) && Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd') > expDay) return { ok: false, error: 'expired' };
    }
    // Uses are counted from the Orders tab itself (cancelled orders don't count),
    // so cancelling a fake order gives the use back and nobody can burn a code for good.
    let used = 0, samePhone = false;
    const orders = ss.getSheetByName(ORDERS);
    if (orders && orders.getLastRow() >= 2) {
      const data = orders.getRange(2, 1, orders.getLastRow() - 1, ORDER_HEADERS.length).getValues();
      const pc = ORDER_HEADERS.indexOf('Phone'), prc = ORDER_HEADERS.indexOf('Promo'), stc = ORDER_HEADERS.indexOf('Status');
      const tail = phone ? phoneTail_(phone) : '';
      data.forEach(function (o) {
        if (String(o[prc]).trim().toUpperCase() !== code || String(o[stc]).trim() === 'Cancelled') return;
        used++;
        if (tail && phoneTail_(o[pc]) === tail) samePhone = true;
      });
    }
    if (maxUses > 0 && used >= maxUses) return { ok: false, error: 'used_up' };
    if (subtotal < min) return { ok: false, error: 'min', min: min };
    if (samePhone && String(r[col('Once per phone')]).trim().toLowerCase() === 'yes') return { ok: false, error: 'already_used' };
    const discount = Math.min(subtotal, type === 'percent' ? Math.round(subtotal * value / 100) : Math.round(value));
    return { ok: true, row: i + 2, code: code, type: type, value: value, min: min, discount: discount, used: used };
  }
  return { ok: false, error: 'invalid' };
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

    // Promo checks and status lookups share a higher hourly cap, counted on every attempt (stops guessing).
    const underCheckCap = function (key) {
      const n = Number(cache.get(key + hour) || 0);
      if (n >= MAX_CHECKS_PER_HOUR) return false;
      cache.put(key + hour, String(n + 1), 3600);
      return true;
    };

    // ---------- Track my order: status only, and only if order number AND phone both match ----------
    if (d.type === 'track') {
      const ref = typeof d.ref === 'string' ? d.ref.trim().toUpperCase() : '';
      const tail = phoneTail_(typeof d.phone === 'string' ? d.phone : '');
      if (!validRef_(ref) || tail.length < 7) return out_({ ok: false, error: 'not_found' });
      if (!underCheckCap('th')) { console.log('Rejected: too many status lookups'); return out_({ ok: false, error: 'busy' });  }
      const tries = Number(cache.get('t' + ref) || 0);
      if (tries >= 6) { console.log('Rejected: too many tries for ' + ref); return out_({ ok: false, error: 'busy' }); }
      cache.put('t' + ref, String(tries + 1), 900); // 6 tries per order number every 15 minutes
      const osh = sheet_(ORDERS, ORDER_HEADERS);
      if (osh.getLastRow() >= 2) {
        const data = osh.getRange(2, 1, osh.getLastRow() - 1, ORDER_HEADERS.length).getValues();
        const col = function (h) { return ORDER_HEADERS.indexOf(h); };
        for (let i = data.length - 1; i >= 0; i--) {
          if (String(data[i][col('Order ref')]).trim().toUpperCase() === ref && phoneTail_(data[i][col('Phone')]) === tail) {
            const placed = data[i][col('Date')];
            console.log('Status shown for ' + ref);
            const st = String(data[i][col('Status')] || '').trim();
            return out_({ ok: true, ref: ref, status: TRACK_STATUSES.indexOf(st) !== -1 ? st : 'New',
              placed: placed instanceof Date ? Utilities.formatDate(placed, TZ, 'yyyy-MM-dd') : String(placed).slice(0, 10) });
          }
        }
      }
      return out_({ ok: false, error: 'not_found' }); // same answer whether the number or the phone is wrong
    }

    // ---------- Promo code check (shows the discount before ordering) ----------
    if (d.type === 'promo') {
      const pc = cart_(d.cart);
      if (!pc) return out_({ ok: false, error: 'bad_cart' });
      if (!underCheckCap('ph')) { console.log('Rejected: too many promo checks'); return out_({ ok: false, error: 'busy' }); }
      const pr = promo_(d.code, pc.subtotal, ''); // no phone here: this check must never reveal who has ordered before
      console.log('Promo check: ' + (pr.ok ? pr.code + ' ok' : pr.error));
      return out_(pr.ok ? { ok: true, code: pr.code, type: pr.type, value: pr.value, min: pr.min, discount: pr.discount, total: pc.subtotal - pr.discount }
                        : { ok: false, error: pr.error, min: pr.min || 0 });
    }

    // ---------- Order ----------
    const basket = cart_(d.cart);
    if (!basket) { console.log('Rejected: basket is not valid'); return out_({ ok: false, error: 'bad_cart' }); }
    const name = text_(d.name, 60), phone = text_(d.phone, 20), address = text_(d.address, 200);
    if (name.replace(/^'/, '').length < 2 || !validPhone_(phone.replace(/^'/, '')) || address.replace(/^'/, '').length < 5) {
      console.log('Rejected: name, phone or address missing or not valid'); return out_({ ok: false, error: 'missing' });
    }

    // Items, discount and total are worked out here from our own price list and promo list.
    const lines = basket.lines, subtotal = basket.subtotal;
    let note = text_(d.notes, 200), discount = 0, promoCode = '', promoRow = 0, promoUsed = 0;
    if (typeof d.promo === 'string' && d.promo.trim()) {
      const pr = promo_(d.promo, subtotal, phone);
      if (pr.ok) { discount = pr.discount; promoCode = pr.code; promoRow = pr.row; promoUsed = pr.used; }
      else note = ('Promo code ' + safe_(d.promo, 20).replace(/^'/, '').toUpperCase() + ' not applied (' + pr.error.replace('_', ' ') + '). ' + note.replace(/^'/, '')).trim().slice(0, 240);
    }
    const total = subtotal - discount;
    const shown = Number(String(typeof d.total === 'string' || typeof d.total === 'number' ? d.total : '').replace(/\D/g, ''));
    if (shown !== total && shown !== subtotal) note = ('CHECK TOTAL: website showed NPR ' + shown + '. ' + note.replace(/^'/, '')).trim().slice(0, 240);

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
      note, gift, gift === 'Yes' ? text_(d.giftNote, 150) : '', 'New', email, '',
      promoCode, promoCode ? 'NPR ' + discount : ''
    ]);
    if (promoCode) SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PROMOS).getRange(promoRow, PROMO_HEADERS.indexOf('Used') + 1).setValue(promoUsed + 1);
    console.log('Saved order ' + ref + ' in row ' + sh.getLastRow() + (promoCode ? ' with promo ' + promoCode : ''));
    return out_({ ok: true, ref: ref, subtotal: subtotal, discount: discount, total: total, promo: promoCode });
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

    const promo = /^[A-Z0-9]{3,20}$/.test(get('Promo')) ? get('Promo') : '';
    const data = {
      ref: validRef_(get('Order ref')) ? get('Order ref') : '', name: firstName_(get('Name')),
      items: get('Items').split(' ; ').join('\n') + (promo ? '\nDiscount (' + promo + '): - ' + get('Discount') : ''),
      total: get('Total'), whatsapp: WHATSAPP ? '\nYou can reach us on WhatsApp: ' + WHATSAPP : ''
    };
    // Buttons use addresses built here, never text typed by a customer.
    let cta = null;
    if ((status === 'Confirmed' || status === 'Out for delivery') && data.ref) {
      cta = { label: 'Track your order', url: SITE_URL + 'track.html?ref=' + data.ref };
    } else if (status === 'Delivered') {
      const it = get('Items');
      const n = function (re) { const m = it.match(re); return m ? Math.min(MAX_QTY, Number(m[1])) : 0; };
      const mix = it.match(/Loofah Love Pack \((\d) Rose \+ \d Vanilla\) x (\d+)/);
      const parts = [n(/Rose ma Dose x (\d+)/), n(/la\.\.la\.\.la\.\. Vanilla x (\d+)/), mix ? Math.min(MAX_QTY, Number(mix[2])) : 0, mix ? Number(mix[1]) : 3];
      if (parts[0] + parts[1] + parts[2] > 0) cta = { label: 'Order the same again', url: SITE_URL + 'shop.html?reorder=' + parts.join('-') };
    }
    const fill = (s) => s.replace(/\{(\w+)\}/g, function (_, k) { return data[k] || ''; });
    const subject = fill(tpl.subject).replace(/\s+/g, ' ');
    const lines = tpl.lines.map(fill);

    MailApp.sendEmail({
      to: email,
      subject: subject,
      name: SHOP_NAME,
      body: lines.join('\n\n') + (cta ? '\n\n' + cta.label + ': ' + cta.url : '') + '\n\n' + SHOP_NAME + ' · Kathmandu · ' + INSTAGRAM,
      htmlBody: emailHtml_(subject, lines, cta)
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

function emailHtml_(title, lines, cta) {
  const button = cta ? '<p style="margin:18px 0 4px"><a href="' + esc_(cta.url) + '" style="display:inline-block;background:#2F5130;color:#F7F2E7;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:999px">' + esc_(cta.label) + '</a></p>' : '';
  const paras = lines.map(function (l) {
    return '<p style="margin:0 0 14px;line-height:1.55">' + esc_(l).replace(/\n/g, '<br>') + '</p>';
  }).join('');
  return '<div style="background:#F7F2E7;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#3B2A1E">' +
    '<div style="max-width:520px;margin:0 auto;background:#FFFCF5;border-radius:16px;overflow:hidden;border:1px solid #E6DCC8">' +
    '<div style="background:#2F5130;color:#F7F2E7;padding:18px 22px;font-size:22px;font-weight:bold;letter-spacing:.5px">' + SHOP_NAME + '</div>' +
    '<div style="padding:22px">' +
    '<h1 style="font-size:19px;margin:0 0 16px;color:#2F5130">' + esc_(title) + '</h1>' + paras + button + '</div>' +
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
