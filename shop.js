/* Sova shop page: basket + order form.
   Each order is emailed to Sova (Web3Forms) and saved in the private Google Sheet (addresses in config.js).
   The Sheet works out its own total from its own price list, so nothing here is trusted for money. */
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
      email: document.getElementById("f-email"),
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

    // Promo code. The Sheet decides whether a code is real and what it is worth; this page only shows the result.
    var promoEl = {
      input: document.getElementById("f-promo"), btn: document.querySelector(".promo-btn"), msg: document.querySelector(".promo-msg"),
      line: document.querySelector(".basket-discount"), code: document.querySelector(".promo-code"), off: document.querySelector(".basket-off")
    };
    var promo = null;        // { code, type, value, min } once the Sheet has accepted it; { code, pending:true } if the reply couldn't be read
    var promoBusy = false, promoChecks = [];
    function discountFor(total) {
      if (!promo || promo.pending || !total || total < (promo.min || 0)) return 0;
      var d = promo.type === "percent" ? Math.round(total * promo.value / 100) : Math.round(promo.value);
      return Math.max(0, Math.min(total, d));
    }

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
      var off = discountFor(total);
      return {
        list: list, subtotal: total, discount: off, total: total - off,
        text: list.map(function (l) { return l.name + " x " + l.q + " = NPR " + l.line; }).join("\n"),
        cart: { rose: qty.rose || 0, vanilla: qty.vanilla || 0, pack: qty.pack || 0, packRose: packRose }
      };
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
      if (promoEl.line) {
        promoEl.line.hidden = !b.discount;
        promoEl.off.textContent = b.discount;
        promoEl.code.textContent = promo ? "(" + promo.code + ")" : "";
        if (promo && !promo.pending && b.list.length && !b.discount && promo.min > b.subtotal) {
          promoEl.msg.textContent = "Code " + promo.code + " needs an order of NPR " + promo.min + " or more.";
        } else if (promo && !promo.pending && b.discount) {
          promoEl.msg.textContent = "Code " + promo.code + " applied.";
        }
      }
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
      if (bar) {
        var count = 0; items.forEach(function (it) { count += qty[it.dataset.id]; });
        bar.querySelector(".sp-bar-count").textContent = count;
        bar.querySelector(".sp-bar-unit").textContent = count === 1 ? "item" : "items";
        bar.querySelector(".sp-bar-total").textContent = "NPR " + b.total;
        syncBar();
      }
    }

    /* Phone basket bar: shows while there is something in the basket and the summary is off screen */
    var bar = document.querySelector(".sp-bar");
    var summaryEl = document.querySelector(".sp-summary");
    var summarySeen = false, typing = false;
    function syncBar() {
      if (!bar) return;
      var has = false; items.forEach(function (it) { if (qty[it.dataset.id] > 0) has = true; });
      bar.hidden = !(has && !summarySeen && !typing && !document.querySelector(".sp-layout").hidden);
    }
    function bump(el) {
      if (!el) return;
      el.classList.remove("is-bump"); void el.offsetWidth; el.classList.add("is-bump");
    }
    if (bar) {
      if ("IntersectionObserver" in window) {
        new IntersectionObserver(function (en) { summarySeen = en[0].isIntersecting; syncBar(); }, { threshold: 0.15 }).observe(summaryEl);
      } else { summarySeen = true; }
      form.addEventListener("focusin", function (e) { typing = /^(INPUT|TEXTAREA)$/.test(e.target.tagName) && e.target.type !== "checkbox"; syncBar(); });
      form.addEventListener("focusout", function () { typing = false; syncBar(); });
      bar.querySelector(".sp-bar-go").addEventListener("click", function () {
        var filled = clean(f.name.value, 60).length >= 2 && clean(f.phone.value, 20).length >= 7 && clean(f.address.value, 200).length >= 5;
        var target = filled ? summaryEl : document.getElementById("sp-details");
        target.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
        if (!filled) f.name.focus({ preventScroll: true });
      });
    }

    items.forEach(function (it) {
      it.querySelectorAll(".qty-btn[data-step]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var id = it.dataset.id;
          var before = qty[id];
          qty[id] = Math.max(0, Math.min(CONFIG.maxPerItem, qty[id] + Number(btn.dataset.step)));
          status.textContent = "";
          render();
          if (qty[id] > before) { bump(it.querySelector(".qty-val")); bump(document.querySelector(".basket-total strong")); bump(bar); }
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
    /* ---- promo code ---- */
    var PROMO_ERR = {
      invalid: "Sorry, that code isn't valid.",
      expired: "Sorry, that code has expired.",
      used_up: "Sorry, that code has been fully used.",
      already_used: "This code has already been used with this phone number.",
      busy: "Too many tries. Please wait a little and try again."
    };
    function setPromo(p, msg) {
      promo = p;
      promoEl.input.readOnly = !!p;
      promoEl.btn.textContent = p ? "Remove" : "Apply";
      promoEl.msg.textContent = msg || "";
      render();
    }
    function checkPromo() {
      if (promoBusy) return;
      if (promo) { promoEl.input.value = ""; setPromo(null, ""); promoEl.input.focus(); return; }
      var code = clean(promoEl.input.value, 20).toUpperCase().replace(/\s+/g, "");
      promoEl.input.value = code;
      if (!code) { promoEl.msg.textContent = "Type your code first."; return; }
      if (!/^[A-Z0-9]{3,20}$/.test(code)) { promoEl.msg.textContent = PROMO_ERR.invalid; return; }
      var b = basket();
      if (!b.list.length) { promoEl.msg.textContent = "Add a soap first, then apply your code."; return; }
      var now = Date.now();
      promoChecks = promoChecks.filter(function (t) { return t > now - 600e3; });
      if (promoChecks.length >= 8) { promoEl.msg.textContent = PROMO_ERR.busy; return; }
      promoChecks.push(now);
      if (!CONFIG.sheetUrl) {
        if (DEMO) { setPromo({ code: code, type: "percent", value: 10, min: 0 }, ""); return; }
        promoEl.msg.textContent = "Promo codes aren't switched on yet."; return;
      }
      promoBusy = true; promoEl.btn.disabled = true; promoEl.msg.textContent = "Checking…";
      fetch(CONFIG.sheetUrl, {
        method: "POST", redirect: "follow",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ type: "promo", code: code, cart: b.cart })
      }).then(function (r) { return r.json(); }).then(function (j) {
        var val = j ? Number(j.value) : 0;
        if (j && j.ok && (j.type === "percent" || j.type === "amount") && val > 0 && val < 1e6 && !(j.type === "percent" && val > 100)) {
          setPromo({ code: code, type: j.type, value: val, min: Math.max(0, Number(j.min) || 0) }, "");
        } else if (j && (j.error === "busy" || j.error === "server")) {
          // The checker is busy. Keep the code with the order; the Sheet checks it again when the order is saved.
          setPromo({ code: code, pending: true }, "We'll check code " + code + " and apply it when we confirm your order.");
        } else if (j && j.error === "min") {
          promoEl.msg.textContent = "This code needs an order of NPR " + (Number(j.min) || 0) + " or more.";
        } else {
          promoEl.msg.textContent = PROMO_ERR[j && j.error] || PROMO_ERR.invalid;
        }
      }).catch(function () {
        // The reply couldn't be read. Keep the code with the order; Sova applies it when confirming.
        setPromo({ code: code, pending: true }, "We'll check code " + code + " and apply it when we confirm your order.");
      }).then(function () { promoBusy = false; promoEl.btn.disabled = false; });
    }
    if (promoEl.btn) {
      promoEl.btn.addEventListener("click", checkPromo);
      promoEl.input.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); checkPromo(); } });
    }

    /* ---- "Order the same again" link from the Delivered email: shop.html?reorder=rose-vanilla-packs-roseInPack ---- */
    (function () {
      var m = /[?&]reorder=(\d{1,2})-(\d{1,2})-(\d{1,2})-(\d)(?:&|$)/.exec(location.search);
      if (!m) return;
      var cap = function (n) { return Math.max(0, Math.min(CONFIG.maxPerItem, Number(n))); };
      qty.rose = cap(m[1]); qty.vanilla = cap(m[2]); qty.pack = cap(m[3]);
      packRose = Math.max(0, Math.min(packEl ? Number(packEl.dataset.size) : 5, Number(m[4])));
      if (qty.rose + qty.vanilla + qty.pack > 0) { var note = document.querySelector(".sp-reorder"); if (note) note.hidden = false; }
    })();

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
      var email = clean(f.email.value, 80);
      if (email && !/^[^\s@<>"]+@[^\s@<>"]+\.[A-Za-z]{2,}$/.test(email)) { setErr("e-email", "Please check your email, or leave it empty.", f.email); ok = false; first = first || f.email; } else setErr("e-email", "", f.email);
      if (address.length < 5) { setErr("e-address", "Please enter your delivery address.", f.address); ok = false; first = first || f.address; } else setErr("e-address", "", f.address);
      if (first) first.focus();
      return ok;
    }

    [["name", "e-name"], ["phone", "e-phone"], ["address", "e-address"], ["email", "e-email"]].forEach(function (pair) {
      f[pair[0]].addEventListener("input", function () {
        if (f[pair[0]].getAttribute("aria-invalid") === "true") setErr(pair[1], "", f[pair[0]]);
      });
    });

    // Order number: 6 random characters, without look-alikes such as 0/O or 1/I.
    function makeRef() {
      var alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789", out = "", i;
      var buf = new Uint8Array(6);
      if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(buf);
      else for (i = 0; i < 6; i++) buf[i] = Math.floor(Math.random() * 256);
      for (i = 0; i < 6; i++) out += alphabet.charAt(buf[i] % alphabet.length);
      return "SOVA-" + out;
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
          "Promo code": o.promo ? o.promo + (o.discount ? " (- NPR " + o.discount + ")" : " (not applied yet: check it in the Sheet)") : "-",
          "Name": o.name, "Phone": o.phone, "Email": o.email || "-", "Delivery address": o.address,
          "Instagram": o.instagram || "-", "Note": o.notes || "-",
          "Gift": o.gift, "Gift note": o.giftNote || "-"
        })
      }).then(function (r) { return r.json().then(function (j) { if (!r.ok || !j.success) throw new Error("web3forms"); }); });
    }

    function viaSheet(o) {
      // Plain-text POST (no preflight). The Sheet replies {ok:true} when the row is saved,
      // or {ok:false, error:"..."} when it refuses the order. If the reply can't be read, it counts as "not confirmed".
      return fetch(CONFIG.sheetUrl, {
        method: "POST", redirect: "follow",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          type: "order", ref: o.ref, cart: o.cart, items: o.items, total: "NPR " + o.total,
          name: o.name, phone: o.phone, email: o.email, address: o.address, instagram: o.instagram,
          notes: o.notes, gift: o.gift, giftNote: o.giftNote, promo: o.promo, lang: document.documentElement.lang === "ne" ? "ne" : "en"
        })
      }).then(function (r) { return r.json(); }).then(function (j) {
        if (!j || !j.ok) { var err = new Error("sheet"); err.code = (j && j.error) || "unknown"; throw err; }
        return j;
      });
    }

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (sending) return;
      var b = basket();
      if (!b.list.length) { status.textContent = "Add at least one soap first."; return; }
      if (!validate()) { status.textContent = "Please check the highlighted details."; return; }

      var o = {
        ref: makeRef(), items: b.text, total: b.total, cart: b.cart, subtotal: b.subtotal, discount: b.discount, promo: promo ? promo.code : "",
        name: clean(f.name.value, 60), phone: clean(f.phone.value, 20), address: clean(f.address.value, 200), email: clean(f.email.value, 80),
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

      var jobs = [], names = [];
      if (CONFIG.web3formsKey) { jobs.push(viaWeb3Forms(o)); names.push("email"); }
      if (CONFIG.sheetUrl) { jobs.push(viaSheet(o)); names.push("sheet"); }
      if (!jobs.length && DEMO) { jobs.push(new Promise(function (ok) { setTimeout(ok, 700); })); names.push("demo"); }
      if (!jobs.length) {
        status.textContent = "Online ordering isn't switched on yet. Please DM us on Instagram @sova.np9 to order.";
        return;
      }

      sending = true; render();
      place.textContent = "Sending your order…";
      status.textContent = "";

      Promise.allSettled(jobs).then(function (res) {
        // "Thank you" only when a channel confirmed it received the order.
        var anyOk = res.some(function (r) { return r.status === "fulfilled"; });
        var sheetIdx = names.indexOf("sheet");
        var sheetCode = sheetIdx !== -1 && res[sheetIdx].status === "rejected" && res[sheetIdx].reason ? res[sheetIdx].reason.code : "";
        sending = false; place.textContent = "Place order"; render();
        if (!anyOk) {
          status.textContent = sheetCode === "too_soon"
            ? "We already have an order from this phone number in the last couple of minutes. Please wait a moment, or DM us on Instagram @sova.np9."
            : "Sorry, your order couldn't be sent. Please check your internet and try again, or DM us on Instagram @sova.np9.";
          return;
        }
        writeLog({ t: Date.now(), f: fingerprint(o) });
        // The Sheet's own sums win: show the total and discount it actually saved.
        var saved = sheetIdx !== -1 && res[sheetIdx].status === "fulfilled" ? res[sheetIdx].value : null;
        if (saved && typeof saved.total === "number" && typeof saved.discount === "number") {
          o.total = saved.total; o.discount = saved.discount;
          if (o.promo && !saved.promo) o.promoRefused = true;
        }
        showDone(o);
      });
    });

    function showDone(o) {
      document.querySelector(".sp-ref").textContent = o.ref;
      document.querySelector(".sp-done-summary").textContent = o.items + (o.discount ? "\nDiscount (" + o.promo + "): - NPR " + o.discount : "") + "\nTotal: NPR " + o.total + (o.promo && !o.discount ? "\nPromo code " + o.promo + (o.promoRefused ? ": sorry, it couldn't be used on this order" : ": we'll check it when we confirm") : "") + (o.gift === "Yes" ? "\nGift: yes" + (o.giftNote ? " (note: " + o.giftNote + ")" : "") : "");
      document.querySelector(".sp-done-phone").textContent = o.phone;
      document.querySelector(".sp-done-email-addr").textContent = o.email;
      document.querySelector(".sp-done-email").hidden = !o.email;
      var track = document.querySelector(".sp-track");
      if (track) track.href = "track.html?ref=" + encodeURIComponent(o.ref);
      var re = document.querySelector(".sp-reorder"); if (re) re.hidden = true;
      document.querySelector(".sp-layout").hidden = true;
      syncBar();
      document.querySelector(".sp-hero").hidden = true;
      var done = document.getElementById("sp-done");
      done.hidden = false;
      window.scrollTo(0, 0);
      done.focus();
    }

    render();
  });
})();
