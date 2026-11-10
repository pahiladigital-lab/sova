/* Sova shop page: basket + order form.
   Orders are sent to whichever services are set up below (both during the trial). */
(function () {
  "use strict";

  /* ===================== SETTINGS ===================== */
  var CONFIG = {
    // Web3Forms: paste the Access Key you get at web3forms.com (sent to sovasoap.np9@gmail.com).
    web3formsKey: "f83d0dd9-c195-4c33-a450-ebd180110913",

    // Google Form: the form's "formResponse" address and the entry IDs of each question.
    googleForm: {
      action: "",          // e.g. "https://docs.google.com/forms/d/e/XXXX/formResponse"
      fields: {            // e.g. "entry.123456789"
        ref: "", items: "", total: "", name: "", phone: "", address: "", instagram: "", notes: ""
      }
    },

    maxPerItem: 20
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
      bot: document.getElementById("f-botcheck")
    };
    var qty = {};
    var sending = false;
    items.forEach(function (it) { qty[it.dataset.id] = 0; });

    function clean(v, max) {
      return String(v || "").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
    }

    function basket() {
      var list = [], total = 0;
      items.forEach(function (it) {
        var q = qty[it.dataset.id], p = Number(it.dataset.price);
        if (q > 0) { list.push({ name: it.dataset.name, q: q, line: q * p }); total += q * p; }
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
      place.disabled = sending || !b.list.length;
    }

    items.forEach(function (it) {
      it.querySelectorAll(".qty-btn").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var id = it.dataset.id;
          qty[id] = Math.max(0, Math.min(CONFIG.maxPerItem, qty[id] + Number(btn.dataset.step)));
          status.textContent = "";
          render();
        });
      });
    });

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
      if (!/^\+?[\d\s-]+$/.test(phone) || digits.length < 7 || digits.length > 15) { setErr("e-phone", "Please enter a valid phone number.", f.phone); ok = false; first = first || f.phone; } else setErr("e-phone", "", f.phone);
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
          botcheck: o.bot,
          "Order ref": o.ref, "Items": o.items, "Total": "NPR " + o.total,
          "Name": o.name, "Phone": o.phone, "Delivery address": o.address,
          "Instagram": o.instagram || "-", "Note": o.notes || "-"
        })
      }).then(function (r) { return r.json().then(function (j) { if (!r.ok || !j.success) throw new Error("web3forms"); }); });
    }

    function viaGoogleForm(o) {
      var g = CONFIG.googleForm, body = new URLSearchParams();
      Object.keys(g.fields).forEach(function (k) { if (g.fields[k]) body.append(g.fields[k], k === "total" ? "NPR " + o.total : (o[k] || "")); });
      // Google doesn't let websites read its reply ("no-cors"), so a finished request counts as sent.
      return fetch(g.action, { method: "POST", mode: "no-cors", body: body });
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
        instagram: clean(f.instagram.value, 40), notes: clean(f.notes.value, 200), bot: f.bot.checked
      };

      var jobs = [];
      if (CONFIG.web3formsKey) jobs.push(viaWeb3Forms(o));
      if (CONFIG.googleForm.action) jobs.push(viaGoogleForm(o));
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
        showDone(o);
      });
    });

    function showDone(o) {
      document.querySelector(".sp-ref").textContent = o.ref;
      document.querySelector(".sp-done-summary").textContent = o.items + "\nTotal: NPR " + o.total;
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
