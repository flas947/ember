# Adding a game

The hub no longer ships any placeholder games — it's an empty shell that
loads **your own** HTML games from `public/games/`, or a direct external
`https://` URL such as a Playgama widget.

## Steps

1. Either drop your game's folder/file into `public/games/`, e.g.
   `public/games/asteroids/index.html`, or use an external game URL such as
   `https://widgets.playgama.com/...`.
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

Or, for a Playgama widget:

```json
{
  "id": "playgama-demo",
  "title": "Playgama Demo",
  "genre": "Arcade",
  "file": "https://widgets.playgama.com/your-widget-url",
  "mono": "PG",
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
| `file`     | yes      | Either a path **relative to `public/games/`** or a full `https://` URL to the game's HTML/widget entry point. |
| `mono`     | no       | 1–2 letters shown on the cover when there's no `thumb`.                |
| `gradFrom` / `gradTo` | no | Cover gradient colors (hex) used when there's no `thumb`.    |
| `thumb`    | no       | Path relative to `public/games/` or a full `https://` URL to a thumbnail image, if you have one. |

## How it's loaded

Clicking a tile opens the game in an iframe inside a large modal.

- Local game entries use `/games/<file>`.
- External `https://` entries are loaded directly in the iframe as-is.

Nothing about local game files is modified — whatever you drop in
`public/games/` runs as-is. External URLs are passed through directly
without the local HTML sanitizer.

## Using the helper script

```bash
npm run add-game
```

Walks you through the fields above and appends the entry to
`src/games-list.json`. You can also hand-edit the JSON directly.
