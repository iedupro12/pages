# Post Card Generator

Static HTML, CSS and JavaScript. No build step, no server needed.

Open `index.html` in a browser, paste your Gemini API key, type a topic, press Generate.

## Themes

Pick a theme in the panel. Each one has its own size, line counts, font and prompt style.

| Theme | Size | Lines | Notes |
|-------|------|-------|-------|
| Classic | 1080 x 1350 | 5 / 6 / 7 | bird, bubble, character, X mark or numbers |
| Book | 1080 x 1350 | 5 / 6 / 7 | bird, bubble, character, book icon + arrow |
| Plain | 1080 x 1350 | 8 / 12 / 16 | text only, "Bangla - English" list |
| Dialog | 1080 x 1920 | 10 / 15 / 20 | yellow title, list, "write Done" footer (title and footer are editable) |

Reference images are in `refs/`. To add a theme, add an entry to `THEMES` in `js/card.js`
(size, counts, fonts, layout numbers, `draw`), a sample in `js/samples.js` and a thumbnail
`assets/thumbs/<id>.jpg`, then add the id to `ORDER`.

## How the Gemini call works

1. Opens a WebSocket to the Live API (`BidiGenerateContent`).
2. First message is `setup`: model `gemini-3.8-live`, the system prompt, and a `build_card` function declaration.
3. After `setupComplete` the app waits 1.5 seconds (editable under Advanced).
4. Sends the topic with `realtimeInput.text`.
5. The model answers by calling `build_card` with `{ items: [{ bn, en }] }`. That is the structured output.
6. The app replies with a `toolResponse`, closes the socket and draws the card.

gemini-3.8-live replies in audio, so the structure comes from the function call. Audio is ignored.

## Topics and bulk mode

- `js/topics.js` holds 100 daily-life topics. Each generation takes the next one from a shuffled list, so no topic repeats until all 100 are used. Switch to Custom to type your own.
- Bulk: set a number (1 to 100) and press Generate batch. Every card gets a new topic and a different character (no repeats until all characters are used, never the same one twice in a row). Failed cards retry twice, then are skipped.
- Stop ends the batch after cancelling the running request. Download ZIP saves all finished cards as `card-001.png` ... plus `topics.txt`.
- Advanced has the wait before the prompt and the gap between batch items.

## Files

- `index.html`, `css/style.css`, `js/app.js` - interface
- `js/card.js` - canvas renderer and theme table, PNG export
- `js/samples.js` - starting lines for each theme
- `js/live.js` - WebSocket client and system prompt
- `js/assets-data.js` - generated from `assets/`
- `assets/` - bird, speech bubble and the characters (`c1.png` ... `c8.png`)
- `fonts/` - bundled Bangla fonts, Arimo and Lora for English (open licenses)
- `refs/` - reference theme images and API guide
- `assets/thumbs/` - theme previews shown in the panel

## Adding characters

Drop a new PNG into `assets/` (1080 x 1080, transparent, person at the bottom right), then run:

    pip install pillow
    python3 tools/build_assets.py

Every PNG except `bird.png` and `bubble.png` is treated as a character and can be picked at random.

## Note on the API key

The key is stored in this browser only and sent only to Google. For a public site, use short-lived ephemeral tokens instead of a raw key.
