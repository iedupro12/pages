(function () {
  "use strict";

  var FONTS = [
    { id: "hind",      label: "Hind Siliguri",      family: "Hind Siliguri",      weight: 500, bold: true },
    { id: "notosans",  label: "Noto Sans Bengali",  family: "Noto Sans Bengali",  weight: 500, bold: true },
    { id: "anek",      label: "Anek Bangla",        family: "Anek Bangla",        weight: 500, bold: true },
    { id: "baloo",     label: "Baloo Da 2",         family: "Baloo Da 2",         weight: 500, bold: true },
    { id: "notoserif", label: "Noto Serif Bengali", family: "Noto Serif Bengali", weight: 500, bold: true },
    { id: "tiro",      label: "Tiro Bangla",        family: "Tiro Bangla",        weight: 400, bold: false }
  ];

  var THEMES = CardRenderer.THEMES;
  var ORDER = CardRenderer.ORDER;
  function cloneItems(a) { return a.map(function (x) { return { bn: x.bn, en: x.en }; }); }

  var $ = function (id) { return document.getElementById(id); };
  var canvas = $("card");

  var state = {
    theme: "classic",
    data: {},            // lines per theme
    fonts: {},           // font id per theme
    counts: {},          // line count per theme
    marker: "mark",
    topicMode: "random",
    title: "",
    footer: "",
    charId: null,        // pinned character, null = auto
    shownChar: null,     // character currently drawn when auto
    forceChar: null      // used while previewing a batch result
  };
  function T() { return THEMES[state.theme]; }
  function getItems() { return state.data[state.theme]; }
  function setItems(items) { state.data[state.theme] = items; }
  function getCount() { return state.counts[state.theme]; }
  var lib = null;
  var busy = false;
  var batch = { running: false, stop: false, current: null, results: [] };

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /* ---------- storage ---------- */
  function store(k, v) { try { localStorage.setItem("fbpost." + k, v); } catch (e) {} }
  function load(k, d) { try { var v = localStorage.getItem("fbpost." + k); return v == null ? d : v; } catch (e) { return d; } }

  /* ---------- random bags: every item is used once before any repeats ---------- */
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function makeBag(getList) {
    var bag = [], last = null;
    return function () {
      if (!bag.length) {
        bag = shuffle(getList().slice());
        if (bag.length > 1 && bag[0] === last) {
          var t = bag[0]; bag[0] = bag[bag.length - 1]; bag[bag.length - 1] = t;
        }
      }
      last = bag.shift();
      return last;
    };
  }
  var nextTopic = makeBag(function () { return window.DAILY_TOPICS; });
  var nextChar = makeBag(function () { return lib.ids; });

  /* ---------- rendering ---------- */
  var renderToken = 0;
  function fontById(id) {
    return FONTS.filter(function (f) { return f.id === id; })[0] || FONTS[0];
  }
  function viewState(snap) {
    var th = THEMES[snap.theme];
    return {
      theme: snap.theme,
      items: snap.items,
      marker: snap.marker,
      font: fontById(snap.fontId),
      charId: snap.charId,
      title: snap.title || th.defaultTitle || "",
      footer: snap.footer || th.defaultFooter || ""
    };
  }
  function currentSnap() {
    return {
      theme: state.theme, items: getItems(), marker: state.marker, fontId: state.fonts[state.theme],
      charId: state.forceChar || state.charId || state.shownChar, title: state.title, footer: state.footer
    };
  }

  function ensureFonts(snap) {
    var font = fontById(snap.fontId), th = THEMES[snap.theme];
    var w = th.bold && font.bold ? 700 : font.weight;
    var probe = "\u0986\u0997\u09C7 \u099B\u09BF\u09B2\u09CB\u0964";
    return Promise.all([
      document.fonts.load(w + ' 50px "' + font.family + '"', probe),
      document.fonts.load(th.en.weight + ' 48px "' + th.en.family + '"', "Where are you going? Done")
    ]).catch(function () {});
  }

  function render() {
    if (!lib) return Promise.resolve();
    var token = ++renderToken;
    var snap = currentSnap();
    return ensureFonts(snap).then(function () {
      if (token !== renderToken) return;
      if (!state.shownChar) state.shownChar = nextChar();
      snap.charId = state.forceChar || state.charId || state.shownChar;
      CardRenderer.draw(canvas, viewState(snap), lib);
    });
  }

  function renderToBlob(snap) {
    return ensureFonts(snap).then(function () {
      var c = document.createElement("canvas");
      CardRenderer.draw(c, viewState(snap), lib);
      return new Promise(function (res, rej) {
        c.toBlob(function (b) { b ? res(b) : rej(new Error("Could not export the image")); }, "image/png");
      });
    });
  }

  /* ---------- editor <-> items ---------- */
  function itemsToText(items) {
    return items.map(function (it) { return it.bn + " | " + it.en; }).join("\n");
  }
  function textToItems(text) {
    return text.split(/\r?\n/).map(function (line) {
      var i = line.indexOf("|");
      if (i < 0) return null;
      var bn = line.slice(0, i).trim(), en = line.slice(i + 1).trim();
      return bn && en ? { bn: bn, en: en } : null;
    }).filter(Boolean).slice(0, 24);
  }

  /* ---------- status log ---------- */
  var logEl = $("log");
  function log(msg, kind) {
    var li = document.createElement("li");
    li.textContent = msg;
    var cls = kind === "ok" ? "ok" : kind === "err" ? "err" : kind === "info" ? "live" : "";
    if (cls) li.className = cls;
    logEl.appendChild(li);
    while (logEl.children.length > 40) logEl.removeChild(logEl.firstChild);
    $("status").scrollTop = $("status").scrollHeight;
    var line = $("statusLine");
    line.textContent = msg;
    line.className = "statusline" + (cls ? " " + cls : "");
  }
  function resetLog() { logEl.innerHTML = ""; $("statusLine").textContent = ""; $("statusLine").className = "statusline"; }

  /* ---------- small UI helpers ---------- */
  function bindSeg(id, onPick) {
    $(id).addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b) return;
      setSeg(id, b.getAttribute("data-v"));
      onPick(b.getAttribute("data-v"));
    });
  }
  function setSeg(id, value) {
    Array.prototype.forEach.call($(id).querySelectorAll("button"), function (x) {
      x.setAttribute("aria-pressed", x.getAttribute("data-v") === String(value) ? "true" : "false");
    });
  }

  function buildFontSelect() {
    var sel = $("fontSel");
    FONTS.forEach(function (f) {
      var o = document.createElement("option");
      o.value = f.id; o.textContent = f.label;
      sel.appendChild(o);
    });
    sel.addEventListener("change", function () {
      state.fonts[state.theme] = sel.value;
      store("font." + state.theme, sel.value);
      render();
    });
  }

  function buildThemePicker() {
    var root = $("themes");
    root.innerHTML = "";
    ORDER.forEach(function (id) {
      var th = THEMES[id];
      var b = document.createElement("button");
      b.type = "button";
      b.setAttribute("data-id", id);
      b.title = th.name + " (" + th.w + " x " + th.h + ")";
      var im = document.createElement("img");
      im.src = "assets/thumbs/" + id + ".jpg";
      im.alt = "";
      im.loading = "lazy";
      b.appendChild(im);
      var t = document.createElement("span");
      t.textContent = th.name;
      b.appendChild(t);
      root.appendChild(b);
    });
    root.addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b) return;
      setTheme(b.getAttribute("data-id"));
      render();
    });
  }

  function buildCharPicker() {
    var root = $("chars");
    root.innerHTML = "";
    var auto = document.createElement("button");
    auto.type = "button";
    auto.textContent = "Auto";
    auto.setAttribute("data-id", "");
    root.appendChild(auto);
    lib.ids.forEach(function (id) {
      var b = document.createElement("button");
      b.type = "button";
      b.setAttribute("data-id", id);
      b.title = id;
      var im = document.createElement("img");
      im.src = window.CARD_ASSETS.characters[id].src;
      im.alt = id;
      b.appendChild(im);
      root.appendChild(b);
    });
    root.addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b) return;
      var id = b.getAttribute("data-id");
      state.forceChar = null;
      state.charId = id || null;
      if (!id) state.shownChar = nextChar();
      syncCharPicker();
      render();
    });
    syncCharPicker();
  }
  function syncCharPicker() {
    Array.prototype.forEach.call($("chars").querySelectorAll("button"), function (b) {
      b.setAttribute("aria-pressed", String((state.charId || "") === b.getAttribute("data-id")));
    });
    $("charName").textContent = state.charId ? state.charId : "auto";
  }

  function buildCountSeg() {
    var root = $("countSeg");
    root.innerHTML = "";
    T().counts.forEach(function (n) {
      var b = document.createElement("button");
      b.type = "button";
      b.setAttribute("data-v", n);
      b.textContent = n;
      root.appendChild(b);
    });
    setSeg("countSeg", getCount());
  }

  function syncTopicMode() {
    $("topic").hidden = state.topicMode !== "custom";
    setSeg("topicSeg", state.topicMode);
  }

  function showTopic(t) {
    var el = $("topicShown");
    el.textContent = t ? "Topic: " + t : "";
    el.title = t || "";
  }

  /* Everything that depends on the active theme. */
  function syncThemeUI() {
    var th = T();
    Array.prototype.forEach.call($("themes").querySelectorAll("button"), function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-id") === th.id));
    });
    $("themeName").textContent = th.w + " × " + th.h;
    $("charField").hidden = !th.chars;
    $("shuffleBtn").hidden = !th.chars;
    $("markerField").hidden = !th.marker;
    $("titleField").hidden = !th.title;
    $("footerField").hidden = !th.footer;
    $("titleIn").value = state.title;
    $("titleIn").placeholder = th.defaultTitle || "";
    $("footerIn").value = state.footer;
    $("footerIn").placeholder = th.defaultFooter || "";
    $("fontSel").value = state.fonts[th.id];
    $("editor").value = itemsToText(getItems());
    buildCountSeg();
    fitSheet();
  }

  function setTheme(id) {
    if (!THEMES[id]) id = "classic";
    state.theme = id;
    state.forceChar = null;
    store("theme", id);
    markGallery(null);
    syncThemeUI();
  }

  /* Scale the preview so the whole card is visible on any screen. */
  var mobileMQ = window.matchMedia("(max-width:719px)");
  function fitSheet() {
    var th = T(), view = $("view"), sheet = $("sheet");
    var aw = view.clientWidth;
    var ah;
    if (mobileMQ.matches) {
      ah = Math.min(window.innerHeight * 0.64, 780);
    } else {
      ah = view.clientHeight;
    }
    if (aw < 10 || ah < 10) return;
    var k = Math.min(aw / th.w, ah / th.h);
    if (mobileMQ.matches) k = Math.min(k, 520 / th.w);
    sheet.style.width = Math.floor(th.w * k) + "px";
    sheet.style.height = Math.floor(th.h * k) + "px";
  }

  /* ---------- generation helpers ---------- */
  function pickTopic() {
    var custom = $("topic").value.trim();
    if (state.topicMode === "custom" && custom) return custom;
    return nextTopic();
  }

  function tidy(items) {
    var th = T();
    return items.map(function (it) {
      var bn = it.bn, en = it.en;
      if (th.id === "plain") {
        bn = bn.replace(/[।.]+$/, "").trim();
        en = en.replace(/\.+$/, "").trim();
      } else if (th.id === "dialog") {
        bn = bn.replace(/।+$/, "").trim();
      }
      return { bn: bn, en: en };
    });
  }

  function requestItems(topic, logger) {
    var th = T();
    return LiveCard.generate({
      apiKey: $("apiKey").value.trim(),
      model: $("model").value.trim(),
      topic: topic,
      count: getCount(),
      initDelay: $("delay").value,
      style: th.style,
      limits: th.limits,
      punctuation: th.punctuation
    }, logger).then(tidy);
  }

  function setBusy(on) {
    busy = on;
    $("genBtn").disabled = on;
    $("bulkBtn").disabled = on;
    $("genBtn").textContent = on && !batch.running ? "Working..." : "Generate";
  }

  function needKey() {
    var key = $("apiKey").value.trim();
    if (!key) {
      log("Add your Gemini API key first", "err");
      $("apiBox").open = true;
      $("apiKey").focus();
      return true;
    }
    store("key", key);
    return false;
  }

  /* ---------- single generate ---------- */
  function onGenerate() {
    if (busy) return;
    resetLog();
    if (needKey()) return;
    store("topic", $("topic").value);

    var topic = pickTopic();
    showTopic(topic);
    log("Topic: " + topic, "info");
    setBusy(true);
    state.forceChar = null;
    markGallery(null);
    var themeAtStart = state.theme;

    requestItems(topic, log).then(function (items) {
      state.data[themeAtStart] = items;
      if (state.theme === themeAtStart) $("editor").value = itemsToText(items);
      if (!state.charId) state.shownChar = nextChar();
      return render();
    }).then(function () {
      log("Card ready", "ok");
    }).catch(function (err) {
      log(err && err.message ? err.message : String(err), "err");
    }).then(function () { setBusy(false); });
  }

  /* ---------- bulk generate ---------- */
  function updateBulk(done, total, failed, text) {
    $("bulkBar").style.width = (total ? (done / total) * 100 : 0) + "%";
    $("bulkText").textContent = text;
    $("bulkFail").textContent = failed ? failed + " failed" : "";
  }

  function addThumb(res, index) {
    var g = $("gallery");
    g.classList.add("on");
    var th = THEMES[res.snap.theme];
    var b = document.createElement("button");
    b.type = "button";
    b.title = "#" + (index + 1) + "  " + res.snap.topic;
    b.style.aspectRatio = th.w + " / " + th.h;
    var im = document.createElement("img");
    im.src = res.url;
    im.alt = "";
    b.appendChild(im);
    b.addEventListener("click", function () { showSnap(res, b); });
    res.btn = b;
    g.appendChild(b);
    g.scrollLeft = g.scrollWidth;
  }

  function markGallery(active) {
    Array.prototype.forEach.call($("gallery").querySelectorAll("button"), function (x) {
      x.setAttribute("aria-pressed", x === active ? "true" : "false");
    });
  }

  function showSnap(res, btn) {
    var s = res.snap;
    state.theme = s.theme;
    state.data[s.theme] = s.items;
    state.fonts[s.theme] = s.fontId;
    state.marker = s.marker;
    state.title = s.title || "";
    state.footer = s.footer || "";
    state.forceChar = s.charId;
    setSeg("styleSeg", s.marker);
    syncThemeUI();
    showTopic(s.topic);
    markGallery(btn);
    render();
  }

  function clearBatch() {
    batch.results.forEach(function (r) { URL.revokeObjectURL(r.url); });
    batch.results = [];
    $("gallery").innerHTML = "";
    $("gallery").classList.remove("on");
    $("bulkZip").disabled = true;
  }

  function onBulk() {
    if (busy) return;
    resetLog();
    if (needKey()) return;
    store("topic", $("topic").value);

    var total = Math.max(1, Math.min(100, parseInt($("bulkCount").value, 10) || 1));
    $("bulkCount").value = total;
    store("bulk", total);

    clearBatch();
    batch.running = true;
    batch.stop = false;
    state.forceChar = null;
    setBusy(true);
    $("bulkStop").disabled = false;
    var themeId = state.theme;

    var done = 0, failed = 0, streak = 0, i = 0;
    var gap = Math.max(0, +$("gap").value || 0);

    function finish(msg, kind) {
      batch.running = false;
      batch.current = null;
      $("bulkStop").disabled = true;
      $("bulkZip").disabled = !batch.results.length;
      updateBulk(done + failed, total, failed, msg);
      log(msg, kind || "ok");
      setBusy(false);
    }

    function tryItem(topic, attempt) {
      batch.current = requestItems(topic, function () {});
      return batch.current.catch(function (err) {
        if (batch.stop || attempt >= 2) throw err;
        return sleep(1500).then(function () { return tryItem(topic, attempt + 1); });
      });
    }

    function next() {
      if (batch.stop) { finish("Stopped at " + done + " of " + total, "info"); return; }
      if (i >= total) { finish("Batch finished: " + done + " of " + total, "ok"); return; }

      var n = i + 1;
      var topic = pickTopic();
      var charId = nextChar();
      updateBulk(i, total, failed, "Card " + n + " of " + total);
      showTopic(topic);

      tryItem(topic, 0).then(function (items) {
        streak = 0;
        var snap = {
          theme: themeId, items: items, marker: state.marker, fontId: state.fonts[themeId],
          charId: charId, topic: topic, title: state.title, footer: state.footer
        };
        return renderToBlob(snap).then(function (blob) {
          var res = { snap: snap, blob: blob, url: URL.createObjectURL(blob) };
          batch.results.push(res);
          addThumb(res, batch.results.length - 1);
          done++;
          log(n + ". " + topic, "ok");
          /* show it large while the next one is being made */
          if (state.theme === themeId) {
            state.data[themeId] = items;
            state.forceChar = charId;
            $("editor").value = itemsToText(items);
            markGallery(res.btn);
            render();
          }
          $("bulkZip").disabled = false;
        });
      }).catch(function (err) {
        if (batch.stop) return;
        failed++; streak++;
        log(n + ". failed: " + (err && err.message ? err.message : err), "err");
      }).then(function () {
        i++;
        if (streak >= 3) { finish("Stopped after 3 failures in a row", "err"); return; }
        updateBulk(done + failed, total, failed, "Card " + Math.min(i + 1, total) + " of " + total);
        return sleep(gap).then(next);
      });
    }

    next();
  }

  function onBulkStop() {
    if (!batch.running) return;
    batch.stop = true;
    $("bulkStop").disabled = true;
    if (batch.current && batch.current.cancel) batch.current.cancel();
  }

  function onBulkZip() {
    if (!batch.results.length) return;
    var btn = $("bulkZip");
    btn.disabled = true;
    var pad = function (n) { return String(n).padStart(3, "0"); };
    var enc = new TextEncoder();

    Promise.all(batch.results.map(function (r) { return r.blob.arrayBuffer(); })).then(function (bufs) {
      var files = bufs.map(function (b, i) { return { name: "card-" + pad(i + 1) + ".png", data: new Uint8Array(b) }; });
      var list = batch.results.map(function (r, i) {
        return pad(i + 1) + "\t" + r.snap.theme + "\t" + (THEMES[r.snap.theme].chars ? r.snap.charId : "-") + "\t" + r.snap.topic;
      }).join("\n");
      files.push({ name: "topics.txt", data: enc.encode(list + "\n") });
      var blob = MiniZip.build(files);
      saveBlob(blob, "cards-" + stamp() + ".zip");
    }).catch(function (e) {
      log("ZIP failed: " + e.message, "err");
    }).then(function () { btn.disabled = false; });
  }

  /* ---------- download ---------- */
  function stamp() {
    var d = new Date();
    var p = function (n) { return String(n).padStart(2, "0"); };
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  }
  function saveBlob(blob, name) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  function onDownload() {
    canvas.toBlob(function (blob) {
      if (!blob) { log("Could not export the image", "err"); return; }
      saveBlob(blob, "card-" + state.theme + "-" + stamp() + ".png");
    }, "image/png");
  }

  /* ---------- init ---------- */
  function init() {
    $("apiKey").value = load("key", "");
    $("topic").value = load("topic", "");
    $("bulkCount").value = load("bulk", "10");
    state.marker = load("marker", "mark");
    state.topicMode = load("topicMode", "random");
    state.title = load("title", "");
    state.footer = load("footer", "");

    ORDER.forEach(function (id) {
      var th = THEMES[id];
      state.data[id] = cloneItems(window.CARD_SAMPLES[id]);
      var f = load("font." + id, th.font);
      state.fonts[id] = FONTS.some(function (x) { return x.id === f; }) ? f : th.font;
      var c = +load("count." + id, th.count);
      state.counts[id] = th.counts.indexOf(c) >= 0 ? c : th.count;
    });
    var saved = load("theme", "classic");
    state.theme = THEMES[saved] ? saved : "classic";

    buildFontSelect();
    buildThemePicker();
    setSeg("styleSeg", state.marker);
    syncTopicMode();
    syncThemeUI();
    if (!$("apiKey").value) $("apiBox").open = true;

    bindSeg("countSeg", function (v) { state.counts[state.theme] = +v; store("count." + state.theme, v); });
    bindSeg("styleSeg", function (v) { state.marker = v; store("marker", v); render(); });
    bindSeg("topicSeg", function (v) {
      state.topicMode = v; store("topicMode", v); syncTopicMode();
      if (v === "custom") $("topic").focus();
    });

    var t;
    $("editor").addEventListener("input", function () {
      clearTimeout(t);
      t = setTimeout(function () {
        var items = textToItems($("editor").value);
        if (items.length) { setItems(items); render(); }
      }, 200);
    });
    $("titleIn").addEventListener("input", function () {
      state.title = $("titleIn").value; store("title", state.title); render();
    });
    $("footerIn").addEventListener("input", function () {
      state.footer = $("footerIn").value; store("footer", state.footer); render();
    });

    $("genBtn").addEventListener("click", onGenerate);
    $("bulkBtn").addEventListener("click", onBulk);
    $("bulkStop").addEventListener("click", onBulkStop);
    $("bulkZip").addEventListener("click", onBulkZip);
    $("shuffleBtn").addEventListener("click", function () {
      state.forceChar = null;
      state.charId = null;
      state.shownChar = nextChar();
      syncCharPicker();
      render();
    });
    $("dlBtn").addEventListener("click", onDownload);

    if (window.ResizeObserver) new ResizeObserver(fitSheet).observe($("view"));
    window.addEventListener("resize", fitSheet);
    window.addEventListener("orientationchange", function () { setTimeout(fitSheet, 120); });

    CardRenderer.loadLibrary().then(function (l) {
      lib = l;
      buildCharPicker();
      fitSheet();
      return render();
    });
  }

  init();
})();
