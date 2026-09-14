// A minimal local proxy for the AI panel. No frameworks, no dependencies —
// just Node's built-in http + fetch. Keeps the real API key server-side
// (never shipped to the browser) and gives the frontend one stable endpoint
// regardless of which provider you configure.
//
// Run it with:   npm run server
// (loads variables from a .env file in the project root, if present)

import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = join(__dirname, '..', '.env');

// --- tiny .env loader (KEY=VALUE per line, # comments, no quoting rules) ---
function loadEnvFile(path) {
  if (!existsSync(path)) return;
  const lines = readFileSync(path, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnvFile(ENV_PATH);

const PORT = process.env.AI_SERVER_PORT || 8787;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';
const OPENAI_KEY = process.env.OPENAI_API_KEY || '';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

function activeProvider() {
  if (ANTHROPIC_KEY) return 'anthropic';
  if (OPENAI_KEY) return 'openai';
  return null;
}

async function callAnthropic(message, history) {
  const messages = [
    ...history.map((m) => ({ role: m.role === 'bot' ? 'assistant' : 'user', content: m.text })),
    { role: 'user', content: message }
  ];
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 500, messages })
  });
  if (!res.ok) throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = (data.content || []).map((b) => (b.type === 'text' ? b.text : '')).join('\n').trim();
  return text || '(empty response)';
}

async function callOpenAI(message, history) {
  const messages = [
    ...history.map((m) => ({ role: m.role === 'bot' ? 'assistant' : 'user', content: m.text })),
    { role: 'user', content: message }
  ];
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${OPENAI_KEY}`
    },
    body: JSON.stringify({ model: OPENAI_MODEL, messages })
  });
  if (!res.ok) throw new Error(`OpenAI API error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || '(empty response)';
}

function withCors(res) {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type');
}

const server = createServer(async (req, res) => {
  withCors(res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === '/api/health' && req.method === 'GET') {
    const provider = activeProvider();
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      connected: !!provider,
      provider,
      model: provider === 'anthropic' ? ANTHROPIC_MODEL : provider === 'openai' ? OPENAI_MODEL : null
    }));
    return;
  }

  if (req.url === '/api/chat' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', async () => {
      try {
        const { message, history } = JSON.parse(body || '{}');
        const provider = activeProvider();
        if (!provider) {
          res.writeHead(503, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'No API key configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY in .env.' }));
          return;
        }
        const reply = provider === 'anthropic'
          ? await callAnthropic(message, history || [])
          : await callOpenAI(message, history || []);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ reply, provider }));
      } catch (err) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: String(err.message || err) }));
      }
    });
    return;
  }

  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(PORT, () => {
  const provider = activeProvider();
  console.log(`AI proxy listening on http://localhost:${PORT}`);
  console.log(provider ? `Using ${provider} (${provider === 'anthropic' ? ANTHROPIC_MODEL : OPENAI_MODEL})` : 'No API key set — /api/chat will return 503 until one is configured in .env');
});
