/*
 * Gemini Live API client (raw WebSocket).
 *
 * Flow, as described in the Live API WebSocket guide:
 *   1. open  wss://...BidiGenerateContent?key=API_KEY
 *   2. first message = { setup }  (model, system prompt, tool declaration)
 *   3. wait for setupComplete, then pause 1-2 seconds
 *   4. send { realtimeInput: { text } } with the user prompt
 *   5. receive { toolCall } carrying the structured card data
 *   6. answer with { toolResponse } and close
 *
 * gemini-3.8-live answers in audio, so the structured result is requested
 * through a function call. Any audio the model returns is ignored.
 */
(function () {
  "use strict";

  var ENDPOINT = "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";
  var TOOL_NAME = "build_card";

  var SYSTEM_PROMPT = [
    "You are the content engine for a Bangla Facebook page that teaches spoken English with image cards titled \"Let us learn English\".",
    "",
    "Your only job is to turn a topic into a list of short Bangla sentences with their natural English translation.",
    "",
    "Rules:",
    "1. Never answer in free text and never speak. For every request, call the function " + TOOL_NAME + " exactly once with the full list.",
    "2. Produce exactly the number of items the user asks for.",
    "3. bn is simple, natural, everyday spoken Bangla written in Bangla script. No transliteration, no English words inside it.",
    "4. en is the correct, natural English version of bn. Beginner level, present the way people really speak.",
    "5. Keep every line short so that it fits on one line of the card. Use the character limits given in the request (default: bn at most 26 characters, en at most 30).",
    "6. Unless the request gives its own punctuation instruction: statements in bn end with the Bangla danda (\u0964), questions end with a question mark, exclamations with an exclamation mark, and en ends with matching punctuation.",
    "7. Keep the items related to the topic and let them progress from easy to slightly harder.",
    "8. Do not add numbering, bullet marks, quotes, notes, emoji or any decoration inside the strings.",
    "9. Do not repeat sentences."
  ].join("\n");

  var TOOL = {
    functionDeclarations: [{
      name: TOOL_NAME,
      description: "Return the final list of Bangla and English sentence pairs used to render the card.",
      behavior: "BLOCKING",
      parameters: {
        type: "OBJECT",
        properties: {
          items: {
            type: "ARRAY",
            description: "Ordered sentence pairs for the card.",
            items: {
              type: "OBJECT",
              properties: {
                bn: { type: "STRING", description: "Bangla sentence, short, no numbering." },
                en: { type: "STRING", description: "English translation, short, no numbering." }
              },
              required: ["bn", "en"]
            }
          }
        },
        required: ["items"]
      }
    }]
  };

  var EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu;
  var LEAD = /^\s*(?:[\u203B\u2022\-\u2013\u2014*]+|[0-9\u09E6-\u09EF]+[.)])\s*/;

  function clean(s) {
    return String(s == null ? "" : s)
      .replace(EMOJI, "")
      .replace(LEAD, "")
      .replace(/^\s*[\u2014\u2013-]\s*/, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalize(list, count) {
    if (!Array.isArray(list)) throw new Error("The model did not return a list");
    var out = [];
    list.forEach(function (it) {
      if (!it) return;
      var bn = clean(it.bn), en = clean(it.en);
      if (bn && en) out.push({ bn: bn, en: en });
    });
    if (!out.length) throw new Error("The model returned an empty list");
    return count ? out.slice(0, count) : out;
  }

  /* Fallback: if the model spoke JSON instead of calling the tool, read it from the transcript. */
  function itemsFromText(text) {
    var m = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!m) return null;
    try {
      var v = JSON.parse(m[0]);
      return Array.isArray(v) ? v : v.items;
    } catch (e) { return null; }
  }

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /**
   * opts: { apiKey, model, topic, count, initDelay, style, limits, punctuation }
   * log(message, kind)  kind: 'info' | 'ok' | 'err'
   * returns Promise<[{bn,en}]>
   */
  function generate(opts, log) {
    log = log || function () {};
    var cancelFn = null;
    var promise = new Promise(function (resolve, reject) {
      var settled = false, ws = null, transcript = "", queue = Promise.resolve();
      var delay = Math.max(0, +opts.initDelay || 1500);
      var model = (opts.model || "gemini-3.8-live").replace(/^models\//, "");

      var timer = setTimeout(function () { finish(new Error("Timed out waiting for the model")); }, 60000);

      function finish(err, val) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { if (ws && ws.readyState <= 1) ws.close(1000); } catch (e) {}
        if (err) reject(err); else resolve(val);
      }

      function send(obj) { ws.send(JSON.stringify(obj)); }
      cancelFn = function () { finish(new Error("Cancelled")); };

      function buildPrompt() {
        return [
          "Topic: " + (opts.topic || "everyday spoken English for beginners"),
          "Number of items: " + opts.count,
          opts.style ? "Style: " + opts.style : "",
          opts.limits ? "Limits: bn at most " + opts.limits[0] + " characters, en at most " + opts.limits[1] + " characters." : "",
          opts.punctuation ? "Punctuation: " + opts.punctuation : "",
          "Variation seed: " + Math.random().toString(36).slice(2, 8),
          "Call " + TOOL_NAME + " now."
        ].filter(Boolean).join("\n");
      }

      function handle(msg) {
        if (settled) return;

        if (msg.error) {
          finish(new Error(msg.error.message || "API error"));
          return;
        }

        if (msg.setupComplete) {
          log("Setup complete. Waiting " + delay + " ms", "ok");
          sleep(delay).then(function () {
            if (settled) return;
            send({ realtimeInput: { text: buildPrompt() } });
            log("Prompt sent", "ok");
          });
          return;
        }

        if (msg.toolCall) {
          var calls = msg.toolCall.functionCalls || [];
          var call = null;
          calls.forEach(function (c) { if (c.name === TOOL_NAME) call = c; });
          if (!call) return;
          try {
            var items = normalize(call.args && call.args.items, opts.count);
            send({ toolResponse: { functionResponses: [{ id: call.id, name: call.name, response: { result: "ok" } }] } });
            log("Card data received (" + items.length + " lines)", "ok");
            finish(null, items);
          } catch (e) { finish(e); }
          return;
        }

        var sc = msg.serverContent;
        if (sc) {
          if (sc.outputTranscription && sc.outputTranscription.text) transcript += sc.outputTranscription.text;
          if (sc.turnComplete) {
            var fromText = itemsFromText(transcript);
            if (fromText) {
              try { finish(null, normalize(fromText, opts.count)); } catch (e) { finish(e); }
            } else {
              finish(new Error("The model finished without returning card data"));
            }
          }
        }
      }

      try {
        ws = new WebSocket(ENDPOINT + "?key=" + encodeURIComponent(opts.apiKey));
      } catch (e) { finish(e); return; }

      log("Connecting to Live API", "info");

      ws.onopen = function () {
        log("Connected. Sending setup with system prompt", "info");
        send({
          setup: {
            model: "models/" + model,
            generationConfig: { responseModalities: ["AUDIO"] },
            outputAudioTranscription: {},
            systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
            tools: [TOOL]
          }
        });
      };

      ws.onmessage = function (ev) {
        /* Frames can arrive as Blob; keep order with a promise chain. */
        queue = queue.then(function () {
          return typeof ev.data === "string" ? ev.data : ev.data.text();
        }).then(function (text) {
          var msg;
          try { msg = JSON.parse(text); } catch (e) { return; }
          handle(msg);
        });
      };

      ws.onerror = function () { /* details arrive in onclose */ };

      ws.onclose = function (ev) {
        if (settled) return;
        var why = ev.reason ? ev.reason : "no reason given";
        finish(new Error("Connection closed (" + ev.code + "): " + why));
      };
    });
    promise.cancel = function () { if (cancelFn) cancelFn(); };
    return promise;
  }

  window.LiveCard = { generate: generate, SYSTEM_PROMPT: SYSTEM_PROMPT, TOOL: TOOL };
})();
