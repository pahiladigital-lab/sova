/* Sova shop page: basket + order form.
   Orders are sent to whichever services are set up below (both during the trial). */
(function () {
  "use strict";

  /* ===================== SETTINGS ===================== */
  var CONFIG = {
    // Web3Forms key lives in config.js (shared with the "Notify me" form).
    web3formsKey: (window.SOVA_CONFIG && window.SOVA_CONFIG.web3formsKey) || "",

    // Google Sheet (Apps Script) address lives in config.js too.
    sheetUrl: (window.SOVA_CONFIG && window.SOVA_CONFIG.sheetUrl) || "",

    maxPerItem: 20,

    // Anti-spam limits (per phone/browser)
    minSecondsOnPage: 5,      // bots fill forms instantly; people can't
    cooldownMinutes: 2,       // wait between two orders
    maxOrdersPerHour: 3,      // after this, ask them to DM instead
    duplicateWindowMin: 30    // same order again within 30 min needs a second tap
  };
  /* ==================================================== */

  // Preview-only fake sending: works ONLY on this computer (localhost), never on the live site.
  var DEMO = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && /[?&]demo=1\b/.test(location.search);

  document.addEventListener("DOMContentLoaded", function () {
    var form = document.getElementById("order-form");
    if (!form) return;

    var items = Array.prototype.slice.call(document.querySelectorAll(".sp-product"));
    var lines = document.querySelector(".basket-lines");
    var sum = document.querySelector(".basket-sum");
    var place = document.querySelector(".sp-place");
    var status = document.querySelector(".sp-status");
    var f = {
      name: document.getElementById("f-name"),
      phone: document.getElementById("f-phone"),
      address: document.getElementById("f-address"),
      instagram: document.getElementById("f-ig"),
      notes: document.getElementById("f-notes"),
      gift: document.getElementById("f-gift"),
      giftNote: document.getElementById("f-giftnote"),
      bot: document.getElementById("f-botcheck")
    };
    var qty = {};
    var sending = false;
    var loadedAt = Date.now();
    var confirmDuplicate = false;
    var packRose = 3; // Loofah Love Pack mix: Rose bars per pack (the rest are Vanilla)
    var packEl = document.querySelector('.sp-product[data-id="pack"]');
    function mixText() { var size = packEl ? Number(packEl.dataset.size) : 5; return packRose + " Rose + " + (size - packRose) + " Vanilla"; }
    var LOG_KEY = "sova-order-log";

    function readLog() {
      try { var v = JSON.parse(localStorage.getItem(LOG_KEY) || "[]"); return Array.isArray(v) ? v : []; } catch (e) { return []; }
    }
    function writeLog(entry) {
      try {
        var hourAgo = Date.now() - 3600e3;
        var log = readLog().filter(function (x) { return x && x.t > hourAgo; });
        log.push(entry);
        localStorage.setItem(LOG_KEY, JSON.stringify(log.slice(-10)));
      } catch (e) { /* storage blocked: limits just don't persist */ }
    }
    function fingerprint(o) { return (o.items + "|" + o.phone.replace(/\D/g, "")).toLowerCase(); }
    items.forEach(function (it) { qty[it.dataset.id] = 0; });

    function clean(v, max) {
      return String(v || "").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
    }

    function basket() {
      var list = [], total = 0;
      items.forEach(function (it) {
        var q = qty[it.dataset.id], p = Number(it.dataset.price);
        var nm = it.dataset.id === "pack" ? it.dataset.name + " (" + mixText() + ")" : it.dataset.name;
        if (q > 0) { list.push({ name: nm, q: q, line: q * p }); total += q * p; }
      });
      return { list: list, total: total, text: list.map(function (l) { return l.name + " x " + l.q + " = NPR " + l.line; }).join("\n") };
    }

    function render() {
      var b = basket();
      lines.textContent = "";
      b.list.forEach(function (l) {
        var li = document.createElement("li");
        var a = document.createElement("span"); a.textContent = l.name + " × " + l.q;
        var c = document.createElement("span"); c.textContent = "NPR " + l.line;
        li.appendChild(a); li.appendChild(c); lines.appendChild(li);
      });
      if (!b.list.length) {
        var e = document.createElement("li"); e.className = "basket-empty";
        e.textContent = "No soaps yet. Tap + to add one."; lines.appendChild(e);
      }
      sum.textContent = b.total;
      items.forEach(function (it) {
        var q = qty[it.dataset.id];
        it.querySelector(".qty-val").textContent = q;
        it.querySelector('[data-step="-1"]').disabled = q === 0;
        it.querySelector('[data-step="1"]').disabled = q >= CONFIG.maxPerItem;
        it.classList.toggle("is-picked", q > 0);
      });
      if (packEl) {
        var size = Number(packEl.dataset.size);
        packEl.querySelector(".sp-mix-val").textContent = mixText();
        packEl.querySelector('[data-mix="-1"]').disabled = packRose <= 0;
        packEl.querySelector('[data-mix="1"]').disabled = packRose >= size;
      }
      place.disabled = sending || !b.list.length;
    }

    items.forEach(function (it) {
      it.querySelectorAll(".qty-btn[data-step]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var id = it.dataset.id;
          qty[id] = Math.max(0, Math.min(CONFIG.maxPerItem, qty[id] + Number(btn.dataset.step)));
          status.textContent = "";
          render();
        });
      });
    });

    if (packEl) {
      packEl.querySelectorAll(".mix-btn").forEach(function (btn) {
        btn.addEventListener("click", function () {
          packRose = Math.max(0, Math.min(Number(packEl.dataset.size), packRose + Number(btn.dataset.mix)));
          render();
        });
      });
    }
    var giftNoteWrap = document.querySelector(".sp-gift-note");
    if (f.gift) f.gift.addEventListener("change", function () { giftNoteWrap.hidden = !f.gift.checked; });

    function setErr(id, msg, input) {
      document.getElementById(id).textContent = msg;
      input.setAttribute("aria-invalid", msg ? "true" : "false");
      if (msg) input.setAttribute("aria-describedby", id); else input.removeAttribute("aria-describedby");
    }

    function validate() {
      var ok = true, first = null;
      var name = clean(f.name.value, 60), phone = clean(f.phone.value, 20), address = clean(f.address.value, 200);
      var digits = phone.replace(/\D/g, "");
      if (name.length < 2) { setErr("e-name", "Please enter your name.", f.name); ok = false; first = first || f.name; } else setErr("e-name", "", f.name);
      var local = digits.replace(/^977/, "");
      var fake = /^(\d)\1+$/.test(local) || "01234567890123456789".indexOf(local) !== -1 || "98765432109876543210".indexOf(local) !== -1;
      if (!/^\+?[\d\s-]+$/.test(phone) || digits.length < 7 || digits.length > 15 || fake) { setErr("e-phone", "Please enter a valid phone number.", f.phone); ok = false; first = first || f.phone; } else setErr("e-phone", "", f.phone);
      if (address.length < 5) { setErr("e-address", "Please enter your delivery address.", f.address); ok = false; first = first || f.address; } else setErr("e-address", "", f.address);
      if (first) first.focus();
      return ok;
    }

    [["name", "e-name"], ["phone", "e-phone"], ["address", "e-address"]].forEach(function (pair) {
      f[pair[0]].addEventListener("input", function () {
        if (f[pair[0]].getAttribute("aria-invalid") === "true") setErr(pair[1], "", f[pair[0]]);
      });
    });

    function makeRef() {
      var t = Date.now().toString(36).toUpperCase().slice(-5);
      var r = Math.floor(Math.random() * 1296).toString(36).toUpperCase();
      return "SOVA-" + t + (r.length < 2 ? "0" + r : r);
    }

    function viaWeb3Forms(o) {
      return fetch("https://api.web3forms.com/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          access_key: CONFIG.web3formsKey,
          subject: "New Sova order " + o.ref + " (NPR " + o.total + ")",
          from_name: "Sova website",
          botcheck: false,
          "Order ref": o.ref, "Items": o.items, "Total": "NPR " + o.total,
          "Name": o.name, "Phone": o.phone, "Delivery address": o.address,
          "Instagram": o.instagram || "-", "Note": o.notes || "-",
          "Gift": o.gift, "Gift note": o.giftNote || "-"
        })
      }).then(function (r) { return r.json().then(function (j) { if (!r.ok || !j.success) throw new Error("web3forms"); }); });
    }

    function viaSheet(o) {
      // Apps Script can't answer cross-site reads reliably, so send "no-cors": the row is added,
      // and the customer's confirmation comes from the email (Web3Forms) which we can check.
      return fetch(CONFIG.sheetUrl, {
        method: "POST", mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          type: "order", ref: o.ref, items: o.items, total: "NPR " + o.total,
          name: o.name, phone: o.phone, address: o.address, instagram: o.instagram,
          notes: o.notes, gift: o.gift, giftNote: o.giftNote
        })
      });
    }

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (sending) return;
      var b = basket();
      if (!b.list.length) { status.textContent = "Add at least one soap first."; return; }
      if (!validate()) { status.textContent = "Please check the highlighted details."; return; }

      var o = {
        ref: makeRef(), items: b.text, total: b.total,
        name: clean(f.name.value, 60), phone: clean(f.phone.value, 20), address: clean(f.address.value, 200),
        instagram: clean(f.instagram.value, 40), notes: clean(f.notes.value, 200), bot: f.bot.checked,
        gift: f.gift && f.gift.checked ? "Yes" : "No", giftNote: f.gift && f.gift.checked ? clean(f.giftNote.value, 150) : ""
      };

      // --- anti-spam checks ---
      var now = Date.now();
      if (now - loadedAt < CONFIG.minSecondsOnPage * 1000) {
        status.textContent = "Please take a moment to check your order, then tap Place order again.";
        return;
      }
      if (o.bot) { showDone(o); return; } // spam trap ticked: pretend it worked, send nothing
      var log = readLog().filter(function (x) { return x && x.t > now - 3600e3; });
      var last = log[log.length - 1];
      if (last && now - last.t < CONFIG.cooldownMinutes * 60e3) {
        status.textContent = "You've just placed an order. Please wait a couple of minutes before placing another, or DM us on Instagram @sova.np9.";
        return;
      }
      if (log.length >= CONFIG.maxOrdersPerHour) {
        status.textContent = "You've placed several orders in the last hour. For more, please DM us on Instagram @sova.np9.";
        return;
      }
      var fp = fingerprint(o);
      var dup = log.some(function (x) { return x.f === fp && now - x.t < CONFIG.duplicateWindowMin * 60e3; });
      if (dup && !confirmDuplicate) {
        confirmDuplicate = true;
        status.textContent = "This looks the same as an order you already placed. Tap Place order again only if you want a second one.";
        return;
      }
      confirmDuplicate = false;

      var jobs = [];
      if (CONFIG.web3formsKey) jobs.push(viaWeb3Forms(o));
      if (CONFIG.sheetUrl) jobs.push(viaSheet(o));
      if (!jobs.length && DEMO) jobs.push(new Promise(function (ok) { setTimeout(ok, 700); }));
      if (!jobs.length) {
        status.textContent = "Online ordering isn't switched on yet. Please DM us on Instagram @sova.np9 to order.";
        return;
      }

      sending = true; render();
      place.textContent = "Sending your order…";
      status.textContent = "";

      Promise.allSettled(jobs).then(function (res) {
        var anyOk = res.some(function (r) { return r.status === "fulfilled"; });
        sending = false; place.textContent = "Place order"; render();
        if (!anyOk) {
          status.textContent = "Sorry, your order couldn't be sent. Please check your internet and try again, or DM us on Instagram @sova.np9.";
          return;
        }
        writeLog({ t: Date.now(), f: fingerprint(o) });
        showDone(o);
      });
    });

    function showDone(o) {
      document.querySelector(".sp-ref").textContent = o.ref;
      document.querySelector(".sp-done-summary").textContent = o.items + "\nTotal: NPR " + o.total + (o.gift === "Yes" ? "\nGift: yes" + (o.giftNote ? " (note: " + o.giftNote + ")" : "") : "");
      document.querySelector(".sp-done-phone").textContent = o.phone;
      document.querySelector(".sp-layout").hidden = true;
      document.querySelector(".sp-hero").hidden = true;
      var done = document.getElementById("sp-done");
      done.hidden = false;
      window.scrollTo(0, 0);
      done.focus();
    }

    render();
  });
})();
