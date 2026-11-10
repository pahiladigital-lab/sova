/* Sova website → Google Sheet. Orders go to the "Orders" tab, Notify me requests to "Notify me".
   Backup copy of the Apps Script in the "Sova orders" Sheet (Extensions → Apps Script).
   After editing it there: Deploy → Manage deployments → Edit → Version: New version → Deploy (keeps the same URL). */
const TZ = 'Asia/Kathmandu';
const ORDERS = 'Orders';
const NOTIFY = 'Notify me';
const ORDER_HEADERS = ['Date', 'Order ref', 'Items', 'Total', 'Name', 'Phone', 'Delivery address', 'Instagram', 'Note', 'Gift', 'Gift note', 'Status'];
const NOTIFY_HEADERS = ['Date', 'Bars', 'Phone or Instagram', 'Name', 'Status'];
const MAX_PER_HOUR = 40; // safety cap for the whole site

function setup() {
  sheet_(ORDERS, ORDER_HEADERS);
  sheet_(NOTIFY, NOTIFY_HEADERS);
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

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (d.botcheck) return out_({ ok: true });                 // spam trap: ignore quietly

    const cache = CacheService.getScriptCache();
    const hourKey = 'h' + Utilities.formatDate(new Date(), TZ, 'yyyyMMddHH');
    const count = Number(cache.get(hourKey) || 0);
    if (count >= MAX_PER_HOUR) return out_({ ok: false, error: 'busy' });
    cache.put(hourKey, String(count + 1), 3600);

    const now = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm');

    if (d.type === 'notify') {
      sheet_(NOTIFY, NOTIFY_HEADERS).appendRow([now, safe_(d.bars, 80), safe_(d.contact, 40), safe_(d.name, 60), '']);
      return out_({ ok: true });
    }

    if (!d.items || !d.name || !d.phone || !d.address) return out_({ ok: false, error: 'missing' });
    const phoneKey = 'p' + String(d.phone).replace(/\D/g, '');
    if (cache.get(phoneKey)) return out_({ ok: false, error: 'too_soon' }); // same phone within 2 min
    cache.put(phoneKey, '1', 120);

    sheet_(ORDERS, ORDER_HEADERS).appendRow([
      now, safe_(d.ref, 20), safe_(String(d.items).replace(/\n/g, ' ; '), 400), safe_(d.total, 20),
      safe_(d.name, 60), safe_(d.phone, 20), safe_(d.address, 200), safe_(d.instagram, 40),
      safe_(d.notes, 200), safe_(d.gift, 5), safe_(d.giftNote, 150), 'New'
    ]);
    return out_({ ok: true });
  } catch (err) {
    return out_({ ok: false, error: 'server' });
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function doGet() {
  return out_({ ok: true, service: 'Sova orders' });
}
