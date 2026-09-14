# Adding a game

The hub no longer ships any placeholder games — it's an empty shell that
loads **your own** HTML games from `public/games/`.

## Steps

1. Drop your game's folder/file into `public/games/`, e.g.
   `public/games/asteroids/index.html` or `public/games/asteroids.html`.
2. Add an entry to `src/games-list.json`:

```json
{
  "id": "asteroids",
  "title": "Asteroids",
  "genre": "Arcade",
  "file": "asteroids/index.html",
  "mono": "AS",
  "gradFrom": "#F2A65A",
  "gradTo": "#E15A7A",
  "thumb": ""
}
```

3. Run `npm run dev` (or refresh) — it shows up in the grid.

## Field reference

| Field      | Required | Notes                                                                 |
|------------|----------|------------------------------------------------------------------------|
| `id`       | yes      | Unique string.                                                        |
| `title`    | yes      | Shown on the tile and in the modal.                                    |
| `genre`    | no       | Free text, shown as a small tag. Also searchable.                     |
| `file`     | yes      | Path **relative to `public/games/`** to the game's HTML entry point.  |
| `mono`     | no       | 1–2 letters shown on the cover when there's no `thumb`.                |
| `gradFrom` / `gradTo` | no | Cover gradient colors (hex) used when there's no `thumb`.    |
| `thumb`    | no       | Path relative to `public/games/` to a thumbnail image, if you have one.|

## How it's loaded

Clicking a tile opens the game in an `<iframe src="/games/<file>">` inside a
large modal, plus an "Open in new tab" link for games that want the full
window (fullscreen APIs, keyboard capture, etc). Nothing about the game
itself is modified — whatever you drop in `public/games/` runs as-is.

## Using the helper script

```bash
npm run add-game
```

Walks you through the fields above and appends the entry to
`src/games-list.json`. You can also hand-edit the JSON directly.
