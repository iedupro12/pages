/*
 * Card renderer. Draws a post card on a canvas.
 * Every theme is one entry in THEMES: size, line counts, fonts and a draw routine.
 *
 *   classic  1080 x 1350   bird, speech bubble, character, X-mark lines
 *   book     1080 x 1350   bird, speech bubble, character, book icon + arrow lines
 *   plain    1080 x 1350   text only, "Bangla - English" list
 *   dialog   1080 x 1920   yellow title banner, list, "write Done" footer
 */
(function () {
  "use strict";

  var INK = "#0d0f0e";
  var BN_DIGITS = "০১২৩৪৫৬৭৮৯";
  function toBn(n) { return String(n).replace(/\d/g, function (d) { return BN_DIGITS[+d]; }); }

  function loadImage(src) {
    return new Promise(function (res, rej) {
      var im = new Image();
      im.onload = function () { res(im); };
      im.onerror = rej;
      im.src = src;
    });
  }

  /* Load every embedded image once. */
  function loadLibrary() {
    var data = window.CARD_ASSETS;
    var lib = { chars: {}, ids: [] };
    var jobs = [];
    function put(key, item, target) {
      jobs.push(loadImage(item.src).then(function (img) {
        target[key] = { img: img, x: item.x, y: item.y, w: item.w, h: item.h, frameH: item.frameH };
      }));
    }
    put("bird", data.bird, lib);
    put("bubble", data.bubble, lib);
    Object.keys(data.characters).forEach(function (id) {
      lib.ids.push(id);
      put(id, data.characters[id], lib.chars);
    });
    return Promise.all(jobs).then(function () { return lib; });
  }

  function fontStr(weight, family, size) {
    return weight + " " + size + 'px "' + family + '", "Arimo", "Hind Siliguri", sans-serif';
  }

  /* Weight used for Bangla text in a theme: bold themes use 700 when the font has it. */
  function bnWeight(T, font) { return T.bold && font.bold ? 700 : font.weight; }

  /* ================= illustrated themes (classic, book) ================= */

  /* Alpha map of the bubble + character so text never runs under them. */
  function obstacleEdge(W, H, lib, bubbleBox, chBox, ch) {
    var obs = document.createElement("canvas");
    obs.width = W; obs.height = H;
    var octx = obs.getContext("2d", { willReadFrequently: true });
    octx.drawImage(lib.bubble.img, bubbleBox.x, bubbleBox.y, bubbleBox.w, bubbleBox.h);
    octx.drawImage(ch.img, chBox.x, chBox.y, chBox.w, chBox.h);
    var px = octx.getImageData(0, 0, W, H).data;
    return function leftEdge(y0, y1) {
      var best = W;
      y0 = Math.max(0, Math.floor(y0)); y1 = Math.min(H - 1, Math.ceil(y1));
      for (var y = y0; y <= y1; y++) {
        var row = y * W;
        for (var x = 380; x < best; x++) {
          if (px[(row + x) * 4 + 3] > 40) { best = x; break; }
        }
      }
      return best;
    };
  }

  /* "X with four dots" reference mark, drawn without relying on a font. */
  function drawXMark(ctx, cx, cy, r) {
    ctx.save();
    ctx.strokeStyle = INK; ctx.fillStyle = INK;
    ctx.lineWidth = r * 0.31; ctx.lineCap = "round";
    var d = r * 0.74;
    ctx.beginPath();
    ctx.moveTo(cx - d, cy - d); ctx.lineTo(cx + d, cy + d);
    ctx.moveTo(cx + d, cy - d); ctx.lineTo(cx - d, cy + d);
    ctx.stroke();
    var dr = r * 0.23, o = r * 0.93;
    [[0, -o], [0, o], [-o, 0], [o, 0]].forEach(function (p) {
      ctx.beginPath(); ctx.arc(cx + p[0], cy + p[1], dr, 0, Math.PI * 2); ctx.fill();
    });
    ctx.restore();
  }

  /* Small two-tone book icon. (x, y) is the top-left, s the scale. */
  function drawBookIcon(ctx, x, y, s) {
    ctx.save();
    ctx.translate(x, y); ctx.scale(s, s);
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    function poly(pts, fill) {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();
      ctx.fillStyle = fill; ctx.strokeStyle = fill; ctx.lineWidth = 4;
      ctx.fill(); ctx.stroke();
    }
    poly([[3, 8], [22, 3], [22, 48], [3, 43]], "#f6d62a");          /* left page */
    poly([[24, 3], [43, 8], [43, 43], [24, 48]], "#25a79a");        /* right page */
    ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(29, 12); ctx.lineTo(29, 40); ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,.7)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(8, 12); ctx.lineTo(16, 10); ctx.stroke();
    ctx.restore();
  }

  /* Small arrow-head before the English line in the book theme. */
  function drawArrow(ctx, x, cy, s) {
    ctx.save();
    ctx.strokeStyle = INK; ctx.lineWidth = 3.2 * s; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(x, cy - 10 * s); ctx.lineTo(x + 13 * s, cy); ctx.lineTo(x, cy + 10 * s);
    ctx.moveTo(x + 11 * s, cy - 10 * s); ctx.lineTo(x + 24 * s, cy); ctx.lineTo(x + 11 * s, cy + 10 * s);
    ctx.stroke();
    ctx.restore();
  }

  function drawIllustrated(canvas, state, lib, T) {
    var W = T.w, H = T.h;
    canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);

    var ch = lib.chars[state.charId] || lib.chars[lib.ids[0]];
    var bScale = T.bubble.w / lib.bubble.w;
    var bubbleBox = { x: T.bubble.x, y: T.bubble.y, w: T.bubble.w, h: lib.bubble.h * bScale };
    var chBox = { x: ch.x, y: H - ch.frameH + ch.y, w: ch.w, h: ch.h };
    var leftEdge = obstacleEdge(W, H, lib, bubbleBox, chBox, ch);
    var EN = T.en;

    /* Shrink a line just enough to clear obstacles and the right margin. */
    function fit(text, weight, family, size, x, base, up, down) {
      var s = size;
      for (var i = 0; i < 8; i++) {
        ctx.font = fontStr(weight, family, s);
        var w = ctx.measureText(text).width;
        var limit = Math.min(W - T.rightMargin, leftEdge(base - s * up, base + s * down) - T.obstacleGap);
        if (x + w <= limit || s <= size * T.minScale + 0.01) break;
        s = Math.max(size * T.minScale, s * Math.min(0.985, (limit - x) / w));
      }
      return s;
    }

    var bird = lib.bird, bs = T.bird.w / bird.w;
    ctx.drawImage(bird.img, T.bird.x, T.bird.y, T.bird.w, bird.h * bs);

    var items = state.items || [];
    var n = items.length;
    var pitch = n >= 7 ? T.pitch : Math.min(T.maxPitch, T.span / Math.max(1, n - 1));
    var useMark = state.marker !== "num" || !T.numbered;
    var f = state.font;
    var bw = bnWeight(T, f);

    ctx.textBaseline = "alphabetic";

    items.forEach(function (it, i) {
      var bnBase = T.bnBase0 + pitch * i;
      var enBase = T.enBase0 + pitch * i;

      var bnX = useMark ? T.bnX : T.marginX;
      var bnText = useMark ? it.bn : toBn(i + 1) + ". " + it.bn;
      var s1 = fit(bnText, bw, f.family, T.bnSize, bnX, bnBase, 0.95, 0.32);
      ctx.font = fontStr(bw, f.family, s1);
      ctx.fillStyle = INK;
      ctx.fillText(bnText, bnX, bnBase);
      var k1 = s1 / T.bnSize;

      var enX = useMark ? T.enX : T.marginX;
      var enText = (T.enPrefix || "") + it.en;
      var s2 = fit(enText, EN.weight, EN.family, T.enSize, enX, enBase, 0.78, 0.24);
      ctx.font = fontStr(EN.weight, EN.family, s2);
      ctx.fillStyle = INK;
      if (T.enStroke) {
        ctx.strokeStyle = INK; ctx.lineWidth = T.enStroke; ctx.lineJoin = "round";
        ctx.strokeText(enText, enX, enBase);
      }
      ctx.fillText(enText, enX, enBase);
      var k2 = s2 / T.enSize;

      if (useMark) T.mark(ctx, T, bnBase, enBase, k1, k2);
    });

    ctx.drawImage(lib.bubble.img, bubbleBox.x, bubbleBox.y, bubbleBox.w, bubbleBox.h);
    ctx.drawImage(ch.img, chBox.x, chBox.y, chBox.w, chBox.h);
  }

  /* ================= list themes (plain, dialog) ================= */

  /* Draw "bangla - english" on one baseline, shrunk to fit the width. */
  function drawPair(ctx, T, f, it, x, base, maxW) {
    var EN = T.en, bw = bnWeight(T, f);
    var sep = " - ";
    var sb = T.bnSize, se = T.enSize;
    function widths(k) {
      ctx.font = fontStr(bw, f.family, sb * k);
      var a = ctx.measureText(it.bn).width;
      ctx.font = fontStr(EN.weight, EN.family, se * k);
      return [a, ctx.measureText(sep).width, ctx.measureText(it.en).width];
    }
    var k = 1, w = widths(k);
    var total = w[0] + w[1] + w[2];
    if (total > maxW) { k = Math.max(T.minScale, maxW / total); w = widths(k); }
    ctx.fillStyle = INK;
    ctx.font = fontStr(bw, f.family, sb * k);
    ctx.fillText(it.bn, x, base);
    ctx.font = fontStr(EN.weight, EN.family, se * k);
    ctx.fillText(sep, x + w[0], base);
    ctx.fillText(it.en, x + w[0] + w[1], base);
    return k;
  }

  function drawList(canvas, state, lib, T) {
    var W = T.w, H = T.h;
    canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = T.bg;
    ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = "alphabetic";
    if (T.pre) T.pre(ctx, state, T);

    var items = state.items || [];
    var n = items.length;
    var pitch = Math.min(T.maxPitch, (T.last - T.first) / Math.max(1, n - 1));
    var block = (n - 1) * pitch;
    var start = n > 1 ? T.first + ((T.last - T.first) - block) / 2 : (T.first + T.last) / 2;

    items.forEach(function (it, i) {
      var base = start + pitch * i;
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(T.bulletX, base - T.enSize * 0.32, T.bulletR, 0, Math.PI * 2);
      ctx.fill();
      drawPair(ctx, T, state.font, it, T.textX, base, T.right - T.textX);
    });

    if (T.post) T.post(ctx, state, T);
  }

  /* Faint light bulb behind the dialog list. */
  function drawBulb(ctx, cx, cy, r) {
    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = "#555"; ctx.strokeStyle = "#555";
    ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI * 0.78, Math.PI * 2.22);
    ctx.lineTo(cx + r * 0.42, cy + r * 1.25); ctx.lineTo(cx - r * 0.42, cy + r * 1.25); ctx.closePath();
    ctx.fill();
    ctx.fillRect(cx - r * 0.42, cy + r * 1.34, r * 0.84, r * 0.14);
    ctx.fillRect(cx - r * 0.34, cy + r * 1.55, r * 0.68, r * 0.14);
    ctx.lineWidth = r * 0.07; ctx.lineCap = "round";
    for (var a = -150; a <= -30; a += 30) {
      var rad = a * Math.PI / 180;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(rad) * r * 1.22, cy + Math.sin(rad) * r * 1.22);
      ctx.lineTo(cx + Math.cos(rad) * r * 1.5, cy + Math.sin(rad) * r * 1.5);
      ctx.stroke();
    }
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* Centered text where Latin words (like "Done") are red and use the English font. */
  function drawFooterText(ctx, T, f, text, cx, base, size, maxW) {
    var bw = bnWeight(T, f), EN = T.en;
    var parts = String(text).split(/([A-Za-z][A-Za-z' ]*[A-Za-z]|[A-Za-z])/).filter(function (p) { return p !== ""; });
    var k = 1;
    function measure(kk) {
      return parts.map(function (p) {
        var latin = /^[A-Za-z]/.test(p);
        ctx.font = latin ? fontStr(700, EN.family, size * 1.05 * kk) : fontStr(bw, f.family, size * kk);
        return { t: p, latin: latin, w: ctx.measureText(p).width };
      });
    }
    var segs = measure(k);
    var total = segs.reduce(function (a, s) { return a + s.w; }, 0);
    if (total > maxW) { k = maxW / total; segs = measure(k); total = maxW; }
    var x = cx - total / 2;
    segs.forEach(function (s) {
      ctx.font = s.latin ? fontStr(700, EN.family, size * 1.05 * k) : fontStr(bw, f.family, size * k);
      ctx.fillStyle = s.latin ? "#d40000" : INK;
      ctx.fillText(s.t, x, base);
      x += s.w;
    });
  }

  /* ================= theme table ================= */

  var SERIF = { family: "Lora", weight: 400 };
  var SERIF_B = { family: "Lora", weight: 700 };
  var SANS = { family: "Arimo", weight: 400 };

  var THEMES = {
    classic: {
      id: "classic", name: "Classic", w: 1080, h: 1350,
      counts: [5, 6, 7], count: 7, font: "hind",
      chars: true, marker: true, numbered: true, bold: false,
      style: "Short everyday spoken sentences (statements and questions) about the topic, from easy to slightly harder.",
      limits: [26, 30],
      en: SANS, enPrefix: "— ", enStroke: 0.7,
      bird: { x: 50, y: 60, w: 128 }, bubble: { x: 606, y: 132, w: 435 },
      marginX: 112, bnX: 166, enX: 126,
      bnBase0: 220, enBase0: 275, pitch: 159.5, maxPitch: 190, span: 957,
      bnSize: 50, enSize: 48, minScale: 0.62, obstacleGap: 28, rightMargin: 64,
      mark: function (ctx, T, bnBase, enBase, k1) {
        drawXMark(ctx, 132, bnBase - 19 * k1, 17.5 * k1);
      },
      draw: drawIllustrated
    },

    book: {
      id: "book", name: "Book", w: 1080, h: 1350,
      counts: [5, 6, 7], count: 7, font: "hind",
      chars: true, marker: false, numbered: false, bold: false,
      style: "Short everyday sentences people say at home or in daily life (commands, statements, questions) about the topic. Natural and easy.",
      limits: [24, 28],
      en: SANS, enPrefix: "", enStroke: 0.5,
      bird: { x: 50, y: 60, w: 128 }, bubble: { x: 606, y: 132, w: 435 },
      marginX: 112, bnX: 180, enX: 168,
      bnBase0: 214, enBase0: 272, pitch: 155.5, maxPitch: 185, span: 933,
      bnSize: 47, enSize: 47, minScale: 0.6, obstacleGap: 26, rightMargin: 60,
      mark: function (ctx, T, bnBase, enBase, k1, k2) {
        drawBookIcon(ctx, 118, bnBase - 40 * k1, 0.96 * k1);
        drawArrow(ctx, 124, enBase - 17 * k2, 0.95 * k2);
      },
      draw: drawIllustrated
    },

    plain: {
      id: "plain", name: "Plain", w: 1080, h: 1350,
      counts: [8, 12, 16], count: 16, font: "notoserif",
      chars: false, marker: false, bold: false,
      style: "Very short, common spoken phrases and commands (one to four words in English) about the topic, like a phrasebook list.",
      limits: [22, 26],
      punctuation: "Do not end lines with a danda or full stop in either language. Keep a question mark only for real questions.",
      en: SERIF, bg: "#ffffff",
      bulletX: 104, bulletR: 8.5, textX: 150, right: 1022,
      first: 168, last: 1256, maxPitch: 110,
      bnSize: 54, enSize: 58, minScale: 0.6,
      draw: drawList
    },

    dialog: {
      id: "dialog", name: "Dialog", w: 1080, h: 1920,
      counts: [10, 15, 20], count: 20, font: "notoserif",
      chars: false, marker: false, bold: true, title: true, footer: true,
      defaultTitle: "শর্ট ডায়লগ শিখুন।",
      defaultFooter: "পড়া শেষ হলে Done লিখুন",
      style: "Short everyday dialog lines: questions, replies and polite or emotional expressions (two to five words in English) about the topic.",
      limits: [26, 28],
      punctuation: "Bangla lines have no ending danda. English lines end with a full stop or a question mark.",
      en: SERIF_B, bg: "#fdfeec",
      bulletX: 188, bulletR: 8.5, textX: 218, right: 955,
      first: 374, last: 1572, maxPitch: 100,
      bnSize: 40, enSize: 42, minScale: 0.6,
      pre: function (ctx, state, T) {
        drawBulb(ctx, 640, 900, 150);
        var f = state.font, bw = bnWeight(T, f);
        ctx.fillStyle = "#ffff01";
        ctx.fillRect(125, 159, 830, 106);
        var title = state.title || T.defaultTitle;
        var size = 60;
        ctx.font = fontStr(bw, f.family, size);
        var w = ctx.measureText(title).width;
        if (w > 770) { size = size * 770 / w; ctx.font = fontStr(bw, f.family, size); w = 770; }
        ctx.fillStyle = INK;
        ctx.fillText(title, 540 - w / 2, 237);
      },
      post: function (ctx, state, T) {
        ctx.save();
        roundRect(ctx, 126, 1654, 828, 122, 22);
        ctx.lineWidth = 3; ctx.strokeStyle = INK; ctx.stroke();
        ctx.restore();
        drawFooterText(ctx, T, state.font, state.footer || T.defaultFooter, 540, 1735, 56, 740);
      },
      draw: drawList
    }
  };

  var ORDER = ["classic", "book", "plain", "dialog"];

  /*
   * state = { theme, items:[{bn,en}], marker:'mark'|'num', font:{family,weight,bold},
   *           charId, title, footer }
   */
  function draw(canvas, state, lib) {
    var T = THEMES[state.theme] || THEMES.classic;
    T.draw(canvas, state, lib, T);
  }

  window.CardRenderer = {
    THEMES: THEMES, ORDER: ORDER,
    draw: draw, loadLibrary: loadLibrary, toBn: toBn
  };
})();
