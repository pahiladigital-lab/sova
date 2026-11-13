/* Sova "Notify me" for coming-soon bars. Requests are emailed via Web3Forms (key in config.js). */
(function () {
  "use strict";

  var KEY = (window.SOVA_CONFIG && window.SOVA_CONFIG.web3formsKey) || "";
  var SHEET = (window.SOVA_CONFIG && window.SOVA_CONFIG.sheetUrl) || "";
  var MIN_SECONDS = 3;       // bots fill forms instantly
  var COOLDOWN_MIN = 2;      // between two requests from the same browser
  var LOG_KEY = "sova-notify-log";

  document.addEventListener("DOMContentLoaded", function () {
    var panel = document.getElementById("notify");
    var form = document.getElementById("notify-form");
    if (!panel || !form) return;

    var contact = document.getElementById("n-contact");
    var name = document.getElementById("n-name");
    var bot = document.getElementById("n-bot");
    var status = form.querySelector(".notify-status");
    var submit = form.querySelector('button[type="submit"]');
    var done = panel.querySelector(".notify-done");
    var boxes = Array.prototype.slice.call(form.querySelectorAll('input[name="variant"]'));
    var openedAt = 0, sending = false;

    function clean(v, max) { return String(v || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max); }
    function lastSent() { try { return Number(localStorage.getItem(LOG_KEY)) || 0; } catch (e) { return 0; } }
    function markSent() { try { localStorage.setItem(LOG_KEY, String(Date.now())); } catch (e) { /* ignore */ } }

    // "Notify me" buttons under each card open the form with that bar ticked
    document.querySelectorAll(".notify-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        panel.hidden = false;
        form.hidden = false; done.hidden = true;
        document.querySelectorAll(".notify-btn").forEach(function (b) { b.setAttribute("aria-expanded", "true"); });
        boxes.forEach(function (b) { if (b.value === btn.dataset.variant) b.checked = true; });
        if (!openedAt) openedAt = Date.now();
        status.textContent = "";
        var calm = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        panel.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "center" });
        setTimeout(function () { contact.focus({ preventScroll: true }); }, 350);
      });
    });

    function validContact(v) {
      var digits = v.replace(/\D/g, "");
      if (/^@?[A-Za-z0-9._]{2,30}$/.test(v) && /[A-Za-z]/.test(v)) return true;          // Instagram handle
      return /^\+?[\d\s-]+$/.test(v) && digits.length >= 7 && digits.length <= 15 && !/^(\d)\1+$/.test(digits); // phone
    }

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (sending) return;
      var picked = boxes.filter(function (b) { return b.checked; }).map(function (b) { return b.value; });
      var c = clean(contact.value, 40), n = clean(name.value, 60);
      if (!picked.length) { status.textContent = "Tick at least one bar."; return; }
      if (!validContact(c)) { status.textContent = "Please enter a phone number or Instagram handle."; contact.focus(); return; }
      if (Date.now() - openedAt < MIN_SECONDS * 1000) { status.textContent = "Please check your details, then tap Notify me again."; return; }
      if (bot.checked) { showDone(picked); return; } // spam trap: pretend, send nothing
      if (Date.now() - lastSent() < COOLDOWN_MIN * 60e3) { status.textContent = "You're already on the list. Please wait a couple of minutes before sending again."; return; }
      if (!KEY && !SHEET) { status.textContent = "This isn't switched on yet. Please follow @sova.np9 on Instagram for news."; return; }

      sending = true; submit.disabled = true; submit.textContent = "Sending…"; status.textContent = "";
      var jobs = [];
      if (KEY) jobs.push(fetch("https://api.web3forms.com/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          access_key: KEY, subject: "Notify me: " + picked.join(", "), from_name: "Sova website", botcheck: false,
          "Request": "Tell me when these launch", "Bars": picked.join(", "), "Phone or Instagram": c, "Name": n || "-"
        })
      }).then(function (r) { return r.json().then(function (j) { if (!r.ok || !j.success) throw new Error("send"); }); }));
      if (SHEET) jobs.push(fetch(SHEET, {
        method: "POST", redirect: "follow", headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ type: "notify", bars: picked.join(", "), contact: c, name: n })
      }).then(function (r) { return r.json(); }).then(function (j) { if (!j || !j.ok) throw new Error("sheet"); }));
      Promise.allSettled(jobs).then(function (res) {
        if (res.some(function (r) { return r.status === "fulfilled"; })) { markSent(); showDone(picked); }
        else status.textContent = "Sorry, that didn't send. Please try again, or follow @sova.np9 on Instagram for launch news.";
      }).then(function () {
        sending = false; submit.disabled = false; submit.textContent = "Notify me";
      });
    });

    function showDone(picked) {
      done.querySelector(".notify-done-what").textContent = picked.join(", ");
      form.hidden = true; done.hidden = false; done.focus();
    }
  });
})();
