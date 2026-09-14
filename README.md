<<<<<<< HEAD
# ember
=======
# ember

A browser new-tab page: a vertical sidebar (tabs, pinned shortcuts, chrome
controls), an AI panel that can call a real model, notes, account/settings,
and a game hub that loads your own local HTML games — all client-side
except the small optional AI proxy.

## Structure

```
.
├── index.html            entry HTML + app shell
├── vite.config.js
├── .env.example          copy to .env to enable real AI replies
├── public/
│   ├── favicon.svg
│   └── games/            put your own game files/folders here
├── scripts/
│   ├── server.js         local proxy that calls a real LLM API
│   └── add-game.js       CLI helper for adding a catalog entry
└── src/
    ├── main.js           app bootstrap, routing, sidebar, all panels
    ├── state.js          shared state + localStorage persistence
    ├── icons.js          inline SVG icon set
    ├── games-list.json   your game catalog (starts empty)
    ├── ai.js             AI panel logic: real API call + offline fallback
    └── style.css         all styles
```

## Getting started

```bash
npm install
npm run dev       # start the app at http://localhost:5173
```

## Enabling real AI replies

By default the AI panel runs a small offline responder (capitals, math,
dice rolls, jokes, the time) — no network calls, clearly labeled "Offline"
in the UI. To get real model responses:

1. `cp .env.example .env`
2. Fill in `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY`) in `.env`.
3. In a second terminal: `npm run server` — starts a local proxy on
   `localhost:8787` that holds the key server-side and forwards chat
   requests to the real API.
4. Reload the app. The AI panel detects the proxy, the model chip switches
   from "Ember Local · Offline" to the connected provider, and messages
   get real answers. If the proxy isn't running, it just falls back to the
   offline responder — nothing breaks either way.

Your API key never reaches the browser; only `scripts/server.js` reads it.

## Adding your own games

The hub ships with an empty game catalog. See `ADDING-GAMES.md` — in
short: drop an HTML game into `public/games/`, or paste a full
`https://` widget/game URL, add an entry to `src/games-list.json`
(or run `npm run add-game`), and it shows up as a tile that opens the
game in an embedded iframe.

## Build

```bash
npm run build     # static build in dist/
npm run preview   # preview that build
```
>>>>>>> e1cb53f (Prepare for GitHub Pages)
