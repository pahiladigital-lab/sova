/* Sova: English / नेपाली switch.
   The pages are written in English. In Nepali mode this file swaps each piece of text for its translation
   from i18n-ne.js, and puts the English back when asked. Names, numbers and prices are left as they are.
   Text is only ever set as plain text, never as HTML. */
(function () {
  "use strict";
  var NE = window.SOVA_NE || {};
  var KEY = "sova-lang";
  var root = document.documentElement;
  var ATTRS = ["placeholder", "aria-label"];
  var SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, PRE: 1 };
  var lang = "en", observer = null, titleEn = document.title;
  var orig = new WeakMap(), shown = new WeakMap(), attrOrig = new WeakMap();

  // Entries such as "Code {0} applied." match any text in the {0} spot.
  var patterns = [];
  Object.keys(NE).forEach(function (k) {
    if (k.indexOf("{0}") === -1) return;
    var re = k.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\\?\{0\\?\}/g, "(.+?)").replace(/\{1\}/g, "(.+?)");
    patterns.push({ re: new RegExp("^" + re + "$"), out: NE[k] });
  });

  function norm(s) { return String(s).replace(/\s+/g, " ").trim(); }
  function tr(s) {
    var k = norm(s);
    if (!k) return null;
    if (Object.prototype.hasOwnProperty.call(NE, k)) return NE[k];
    for (var i = 0; i < patterns.length; i++) {
      var m = patterns[i].re.exec(k);
      if (m) return patterns[i].out.replace("{0}", m[1]).replace("{1}", m[2] || "");
    }
    return null;
  }
  function skipped(node) {
    for (var el = node.nodeType === 1 ? node : node.parentNode; el && el.nodeType === 1; el = el.parentNode) {
      if (SKIP[el.tagName] || el.hasAttribute("data-no-i18n")) return true;
    }
    return false;
  }

  function doText(n) {
    var cur = n.nodeValue;
    if (shown.get(n) === cur) return;           // already our translation
    var t = tr(cur);
    if (t === null) return;
    var out = /^\s*/.exec(cur)[0] + t + /\s*$/.exec(cur)[0];
    orig.set(n, cur); shown.set(n, out);
    n.nodeValue = out;
  }
  function doAttrs(el) {
    for (var i = 0; i < ATTRS.length; i++) {
      var a = ATTRS[i], cur = el.getAttribute(a);
      if (cur === null) continue;
      var saved = attrOrig.get(el) || {};
      if (saved[a] && saved[a].ne === cur) continue;
      var t = tr(cur);
      if (t === null) continue;
      saved[a] = { en: cur, ne: t }; attrOrig.set(el, saved);
      el.setAttribute(a, t);
    }
  }
  function walk(node, fn, fnEl) {
    if (node.nodeType === 3) { if (!skipped(node)) fn(node); return; }
    if (node.nodeType !== 1 || skipped(node)) return;
    var w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode: function (x) {
        if (x.nodeType === 1) return (SKIP[x.tagName] || x.hasAttribute("data-no-i18n")) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    if (fnEl) fnEl(node);
    for (var x = w.nextNode(); x; x = w.nextNode()) { if (x.nodeType === 3) fn(x); else if (fnEl) fnEl(x); }
  }
  function undoText(n) { if (shown.get(n) === n.nodeValue && orig.has(n)) { n.nodeValue = orig.get(n); shown.delete(n); } }
  function undoAttrs(el) {
    var saved = attrOrig.get(el);
    if (!saved) return;
    for (var a in saved) if (el.getAttribute(a) === saved[a].ne) el.setAttribute(a, saved[a].en);
    attrOrig.delete(el);
  }

  function watch(on) {
    if (!on) { if (observer) observer.disconnect(); return; }
    if (!observer) {
      observer = new MutationObserver(function (list) {
        if (lang !== "ne") return;
        list.forEach(function (m) {
          if (m.type === "characterData") { if (!skipped(m.target)) doText(m.target); }
          else if (m.type === "attributes") { if (!skipped(m.target)) doAttrs(m.target); }
          else Array.prototype.forEach.call(m.addedNodes, function (n) { walk(n, doText, doAttrs); });
        });
      });
    }
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }

  function paintButtons() {
    Array.prototype.forEach.call(document.querySelectorAll(".lang-btn"), function (b) {
      var toNe = lang !== "ne";
      b.querySelector(".lang-btn-text").textContent = toNe ? "नेपाली" : "English";
      b.querySelector(".lang-btn-text").lang = toNe ? "ne" : "en";
      b.setAttribute("aria-label", toNe ? "नेपालीमा हेर्नुहोस् (View in Nepali)" : "View in English");
    });
  }

  function setLang(next, save) {
    lang = next === "ne" ? "ne" : "en";
    if (save) { try { localStorage.setItem(KEY, lang); } catch (e) { /* choice just won't be remembered */ } }
    root.lang = lang;
    root.classList.toggle("lang-ne", lang === "ne");
    if (lang === "ne") {
      walk(document.body, doText, doAttrs);
      document.title = tr(titleEn) || titleEn;
      watch(true);
    } else {
      watch(false);
      walk(document.body, undoText, undoAttrs);
      document.title = titleEn;
    }
    paintButtons();
    root.classList.remove("i18n-pending");
  }

  document.addEventListener("DOMContentLoaded", function () {
    var want = "en";
    try { if (localStorage.getItem(KEY) === "ne") want = "ne"; } catch (e) { /* ignore */ }
    var q = /[?&]lang=(ne|en)\b/.exec(location.search);
    if (q) want = q[1];
    setLang(want, !!q);
    Array.prototype.forEach.call(document.querySelectorAll(".lang-btn"), function (b) {
      b.addEventListener("click", function () { setLang(lang === "ne" ? "en" : "ne", true); });
    });
  });
})();
