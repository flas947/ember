#!/usr/bin/env node
// Small interactive CLI for appending an entry to src/games-list.json.
import { createInterface } from 'node:readline/promises';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, '..', 'src', 'games-list.json');

async function main() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => rl.question(q);

  const raw = await readFile(DATA_PATH, 'utf-8');
  const games = JSON.parse(raw);

  console.log(`Adding a game (${games.length} in the catalog now).`);
  console.log('The game file itself should already be sitting in public/games/.\n');

  const id = (await ask('Unique id (e.g. "asteroids"): ')).trim();
  const title = (await ask('Title: ')).trim();
  const genre = (await ask('Genre (free text, optional): ')).trim();
  const file = (await ask('File path, relative to public/games/ (e.g. "asteroids/index.html"): ')).trim();
  const mono = (await ask('Monogram, 1-2 letters for the cover if no thumbnail (optional): ')).trim().slice(0, 2);
  const gradFrom = (await ask('Cover gradient color 1, hex (optional, default #F2A65A): ')).trim() || '#F2A65A';
  const gradTo = (await ask('Cover gradient color 2, hex (optional, default #E15A7A): ')).trim() || '#E15A7A';
  const thumb = (await ask('Thumbnail path, relative to public/games/ (optional): ')).trim();

  games.push({ id, title, genre, file, mono, gradFrom, gradTo, thumb });
  await writeFile(DATA_PATH, JSON.stringify(games, null, 2) + '\n');
  console.log(`\nAdded "${title}". Run "npm run dev" to see it in the hub.`);
  rl.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
