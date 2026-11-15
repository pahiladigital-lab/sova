/* Sova: Track my order.
   Sends the order number and phone to the private Google Sheet, which answers with the status only
   (never names, addresses or items), and only when both match. */
(function () {
  "use strict";
  var URL_ = (window.SOVA_CONFIG && window.SOVA_CONFIG.sheetUrl) || "";
  var DEMO = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && /[?&]demo=([a-z]+)\b/.exec(location.search);
  var STEPS = { "new": 0, "confirmed": 1, "paid": 1, "out for delivery": 2, "delivered": 3 };
  var MSG = [
    "We've received your order. We'll contact you soon to confirm payment and delivery.",
    "Your order is confirmed. We're getting your soaps ready.",
    "Your soaps are on the way!",
    "Delivered. Enjoy your Sova!"
  ];
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  document.addEventListener("DOMContentLoaded", function () {
    var form = document.getElementById("track-form");
    if (!form) return;
    var ref = document.getElementById("t-ref"), phone = document.getElementById("t-phone");
    var go = form.querySelector(".tr-go"), status = form.querySelector(".tr-status");
    var result = document.getElementById("tr-result");
    var busy = false, tries = [];

    // Links from our emails and the thank-you screen fill in the order number: track.html?ref=SOVA-XXXXXX
    var m = /[?&]ref=(SOVA-[A-Za-z0-9]{6,8})(?:&|$)/i.exec(location.search);
    if (m) { ref.value = m[1].toUpperCase(); }

    function setErr(id, msg, input) {
      document.getElementById(id).textContent = msg;
      input.setAttribute("aria-invalid", msg ? "true" : "false");
      if (msg) input.setAttribute("aria-describedby", id); else input.removeAttribute("aria-describedby");
    }
    function cleanRef(v) {
      var s = String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (s.indexOf("SOVA") === 0) s = s.slice(4);
      return /^[A-Z0-9]{6,8}$/.test(s) ? "SOVA-" + s : "";
    }

    function show(j) {
      var key = String(j.status || "").trim().toLowerCase();
      var cancelled = key === "cancelled";
      var at = Object.prototype.hasOwnProperty.call(STEPS, key) ? STEPS[key] : 0;
      result.querySelector(".tr-ref").textContent = String(j.ref || "").slice(0, 13);
      var d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(j.placed || ""));
      result.querySelector(".tr-date").textContent = d ? Number(d[3]) + " " + MONTHS[Number(d[2]) - 1] + " " + d[1] : "";
      result.querySelector(".tr-placed").hidden = !d;
      var steps = result.querySelectorAll(".tr-steps li");
      Array.prototype.forEach.call(steps, function (li, i) {
        li.classList.toggle("is-done", !cancelled && i < at);
        li.classList.toggle("is-current", !cancelled && i === at);
        if (!cancelled && i === at) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
      });
      result.classList.toggle("is-cancelled", cancelled);
      result.querySelector(".tr-msg").textContent = cancelled
        ? "This order was cancelled. If that's a surprise, please message us on Instagram @sova.np9."
        : MSG[at];
      result.hidden = false;
      result.focus();
    }

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (busy) return;
      var r = cleanRef(ref.value), digits = phone.value.replace(/\D/g, ""), ok = true;
      if (!r) { setErr("e-ref", "Please check your order number. It looks like SOVA-AB12CD.", ref); ok = false; } else { setErr("e-ref", "", ref); ref.value = r; }
      if (!/^\+?[\d\s-]+$/.test(phone.value.trim()) || digits.length < 7 || digits.length > 15) { setErr("e-tphone", "Please enter the phone number you ordered with.", phone); ok = false; } else setErr("e-tphone", "", phone);
      status.textContent = "";
      if (!ok) { (r ? phone : ref).focus(); return; }

      var now = Date.now();
      tries = tries.filter(function (t) { return t > now - 600e3; });
      if (tries.length >= 8) { status.textContent = "Too many tries. Please wait a few minutes, or message us on Instagram @sova.np9."; return; }
      tries.push(now);
      result.hidden = true;

      var job;
      if (DEMO) {
        job = new Promise(function (res) { setTimeout(function () {
          var st = { "new": "New", confirmed: "Confirmed", out: "Out for delivery", delivered: "Delivered", cancelled: "Cancelled" }[DEMO[1]];
          res(st ? { ok: true, ref: r, status: st, placed: "2026-11-12" } : { ok: false, error: "not_found" });
        }, 500); });
      } else if (URL_) {
        job = fetch(URL_, {
          method: "POST", redirect: "follow",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({ type: "track", ref: r, phone: phone.value.trim().slice(0, 20) })
        }).then(function (res) { return res.json(); });
      } else {
        status.textContent = "Order tracking isn't switched on yet. Please message us on Instagram @sova.np9.";
        return;
      }

      busy = true; go.disabled = true; go.textContent = "Checking…";
      job.then(function (j) {
        if (j && j.ok) show(j);
        else if (j && j.error === "busy") status.textContent = "Too many tries. Please wait a few minutes, or message us on Instagram @sova.np9.";
        else status.textContent = "We couldn't find an order with that number and phone. Please check both and try again.";
      }).catch(function () {
        status.textContent = "We couldn't check right now. Please try again in a moment, or message us on Instagram @sova.np9.";
      }).then(function () { busy = false; go.disabled = false; go.textContent = "Check my order"; });
    });

    [[ref, "e-ref"], [phone, "e-tphone"]].forEach(function (p) {
      p[0].addEventListener("input", function () { if (p[0].getAttribute("aria-invalid") === "true") setErr(p[1], "", p[0]); });
    });
  });
})();
