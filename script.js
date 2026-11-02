/* Sova — script.js (no libraries) */
(function () {
  "use strict";

  document.documentElement.classList.add("js");
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  document.addEventListener("DOMContentLoaded", function () {
    var year = document.querySelector("[data-year]");
    if (year) year.textContent = new Date().getFullYear();

    initHeader();
    initReveal();
    initFloaters();
    initProductCard();
    initHowTo();
    initFlips();
    initStepper();
    initStickyButton();
  });

  /* Header shadow once the page scrolls */
  function initHeader() {
    var header = document.querySelector(".site-header");
    if (!header) return;
    var onScroll = function () { header.classList.toggle("is-scrolled", window.scrollY > 8); };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* Scroll-reveal sections */
  function initReveal() {
    var items = document.querySelectorAll(".reveal");
    if (reduceMotion || !("IntersectionObserver" in window)) {
      items.forEach(function (el) { el.classList.add("is-visible"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: "0px 0px -40px 0px" });
    items.forEach(function (el) { io.observe(el); });
  }

  /* Floating leaves & bubbles in the hero */
  function initFloaters() {
    var box = document.querySelector(".hero-float");
    if (!box || reduceMotion) return;
    var leafSvg = '<svg viewBox="0 0 24 24"><path d="M12 2c6 4 9 9 9 13a9 9 0 0 1-18 0c0-4 3-9 9-13z" fill="currentColor"/><path d="M12 7v15" stroke="#F7F2E7" stroke-width="1.4" stroke-linecap="round"/></svg>';
    var count = window.innerWidth < 720 ? 9 : 14;
    var frag = document.createDocumentFragment();
    for (var i = 0; i < count; i++) {
      var isLeaf = i % 3 === 0;
      var el = document.createElement("span");
      el.className = "floater " + (isLeaf ? "leaf" : "bubble");
      if (isLeaf) el.innerHTML = leafSvg;
      var size = isLeaf ? rand(16, 28) : rand(10, 34);
      el.style.setProperty("--size", size + "px");
      el.style.setProperty("--dur", rand(14, 26) + "s");
      el.style.setProperty("--delay", (-rand(0, 24)) + "s");
      el.style.setProperty("--sway", rand(-60, 60) + "px");
      el.style.setProperty("--op", (isLeaf ? rand(45, 75) : rand(55, 90)) / 100);
      el.style.left = rand(0, 100) + "%";
      frag.appendChild(el);
    }
    box.appendChild(frag);

    // Pause the drift when the hero is off-screen (saves battery)
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        box.style.display = entries[0].isIntersecting ? "" : "none";
      }).observe(document.querySelector(".hero"));
    }
  }

  /* Product card: hover on desktop, tap to toggle on touch */
  function initProductCard() {
    var card = document.querySelector(".product-card");
    if (!card) return;
    card.addEventListener("click", function () {
      var on = card.getAttribute("aria-pressed") === "true";
      card.setAttribute("aria-pressed", String(!on));
    });
  }

  /* How-to-use: auto-cycles through the 3 steps while visible */
  function initHowTo() {
    var wrap = document.querySelector(".howto");
    if (!wrap) return;
    var steps = Array.prototype.slice.call(wrap.querySelectorAll(".howto-step"));
    var toggle = wrap.querySelector(".howto-toggle");
    var active = 0, timer = null, playing = !reduceMotion, inView = false;

    function setActive(i) {
      active = i;
      steps.forEach(function (s, idx) {
        s.classList.toggle("is-active", idx === i);
        var b = s.querySelector(".howto-btn");
        if (idx === i) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current");
      });
    }
    function tick() { setActive((active + 1) % steps.length); }
    function sync() {
      clearInterval(timer);
      timer = null;
      if (playing && inView) timer = setInterval(tick, 2800);
      wrap.classList.toggle("is-paused", !playing);
      toggle.setAttribute("aria-pressed", String(playing));
    }

    steps.forEach(function (s, idx) {
      s.querySelector(".howto-btn").addEventListener("click", function () {
        setActive(idx);
        playing = false;
        sync();
      });
    });
    toggle.addEventListener("click", function () { playing = !playing; sync(); });

    if (reduceMotion) toggle.hidden = true;

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
        sync();
      }, { threshold: 0.3 }).observe(wrap);
    }
    sync();
  }

  /* Coming-soon flip cards */
  function initFlips() {
    document.querySelectorAll(".flip").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var on = btn.getAttribute("aria-pressed") === "true";
        btn.setAttribute("aria-pressed", String(!on));
      });
    });
  }

  /* How-to-order stepper (accessible tabs) */
  function initStepper() {
    var root = document.querySelector(".stepper");
    if (!root) return;
    var tabs = Array.prototype.slice.call(root.querySelectorAll('[role="tab"]'));
    var panels = Array.prototype.slice.call(root.querySelectorAll('[role="tabpanel"]'));
    var prev = root.querySelector(".st-prev");
    var next = root.querySelector(".st-next");
    var current = 0;

    function go(i, focusTab) {
      current = Math.max(0, Math.min(tabs.length - 1, i));
      root.setAttribute("data-step", current);
      tabs.forEach(function (t, idx) {
        var sel = idx === current;
        t.setAttribute("aria-selected", String(sel));
        t.tabIndex = sel ? 0 : -1;
        t.classList.toggle("is-done", idx < current);
        panels[idx].hidden = !sel;
      });
      prev.disabled = current === 0;
      next.disabled = current === tabs.length - 1;
      next.textContent = current === tabs.length - 1 ? "All done!" : "Next step";
      if (focusTab) tabs[current].focus();
    }

    tabs.forEach(function (t, idx) {
      t.addEventListener("click", function () { go(idx); });
      t.addEventListener("keydown", function (e) {
        if (e.key === "ArrowRight") { e.preventDefault(); go((current + 1) % tabs.length, true); }
        else if (e.key === "ArrowLeft") { e.preventDefault(); go((current - 1 + tabs.length) % tabs.length, true); }
        else if (e.key === "Home") { e.preventDefault(); go(0, true); }
        else if (e.key === "End") { e.preventDefault(); go(tabs.length - 1, true); }
      });
    });
    prev.addEventListener("click", function () { go(current - 1); });
    next.addEventListener("click", function () { go(current + 1); });
    go(0);
  }

  /* Sticky "Order on Instagram": shows after the hero, hides near the order section & footer */
  function initStickyButton() {
    var btn = document.querySelector(".sticky-order");
    var hero = document.querySelector(".hero-ctas");
    var orderCta = document.querySelector(".order-cta");
    var footer = document.querySelector(".site-footer");
    if (!btn || !("IntersectionObserver" in window)) { if (btn) btn.classList.add("is-shown"); return; }

    var state = { hero: true, order: false, footer: false };
    var update = function () {
      btn.classList.toggle("is-shown", !state.hero && !state.order && !state.footer);
    };
    var watch = function (el, key) {
      if (!el) return;
      new IntersectionObserver(function (entries) {
        // hero counts as "visible" while it's on screen or still below the fold
        var e = entries[0];
        state[key] = e.isIntersecting || (key === "hero" && e.boundingClientRect.top > 0);
        update();
      }).observe(el);
    };
    watch(hero, "hero");
    watch(orderCta, "order");
    watch(footer, "footer");
  }

  function rand(min, max) { return Math.round(min + Math.random() * (max - min)); }
})();
