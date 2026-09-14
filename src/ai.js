// AI panel logic. Two layers:
//  1. A real network call to the local proxy (scripts/server.js), which
//     forwards to a real LLM API using a server-side key.
//  2. An offline local responder used automatically when the proxy isn't
//     running or isn't configured, so the panel always works.

export const AI_SUGGESTIONS = [
  'What is the capital of France?',
  'What does a cow say?',
  'Roll a six-sided die',
  'Plan a 3-day trip to Tokyo'
];

export const AI_LIMIT = 60;
const SERVER_URL = 'http://localhost:8787';

let health = { checked: false, connected: false, provider: null, model: null };

export async function checkHealth() {
  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 1500);
    const res = await fetch(`${SERVER_URL}/api/health`, { signal: ctrl.signal });
    clearTimeout(timeout);
    if (!res.ok) throw new Error('bad status');
    const data = await res.json();
    health = { checked: true, connected: !!data.connected, provider: data.provider, model: data.model };
  } catch {
    health = { checked: true, connected: false, provider: null, model: null };
  }
  return health;
}

export function getHealth() {
  return health;
}

async function callRealAI(message, history) {
  const res = await fetch(`${SERVER_URL}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message, history: history.slice(-10) })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Server error ${res.status}`);
  }
  const data = await res.json();
  return data.reply;
}

/* ---------------- offline fallback ---------------- */
const FACTS = {
  'capital of france': 'Paris is the capital of France.',
  'capital of japan': 'Tokyo is the capital of Japan.',
  'capital of italy': 'Rome is the capital of Italy.'
};
const JOKES = [
  "I organized my desk with a search algorithm. It's still O(n) mess.",
  'I told my plant a pun. It just grew more leaves in embarrassment.',
  "My favorite unit of time is the 'just one more tab'."
];
function safeMath(expr) {
  if (!/^[\d\s+\-*/().]+$/.test(expr)) return null;
  try {
    const val = Function('"use strict";return (' + expr + ')')();
    return typeof val === 'number' && isFinite(val) ? val : null;
  } catch {
    return null;
  }
}
function offlineReply(raw) {
  const msg = raw.trim();
  const lower = msg.toLowerCase();
  for (const key in FACTS) if (lower.includes(key)) return FACTS[key];
  if (lower.includes('cow') && lower.includes('say')) return 'A cow says "moo."';
  if (lower.includes('exit liquidity')) {
    return "Best way not to be exit liquidity: don't buy something just because it's already up a lot — ask what you'd think of it if the price were flat.";
  }
  if (lower.includes('trip') && lower.includes('tokyo')) {
    return 'A simple 3-day Tokyo outline:\nDay 1 — Asakusa in the morning, Ueno Park in the afternoon.\nDay 2 — Shibuya and Harajuku, then a quiet evening in Shimokitazawa.\nDay 3 — A day trip to Kamakura or Nikko, back for dinner in Shinjuku.';
  }
  if (lower.includes('joke')) return JOKES[Math.floor(Math.random() * JOKES.length)];
  if (lower.includes('roll') && lower.includes('die')) return `You rolled a ${1 + Math.floor(Math.random() * 6)}.`;
  if (lower.includes('flip a coin') || lower.includes('coin flip')) return Math.random() < 0.5 ? 'Heads.' : 'Tails.';
  if (lower === 'time' || lower.includes('what time')) return "It's " + new Date().toLocaleTimeString() + ' on this device.';
  if (lower === 'date' || lower.includes('what date') || lower.includes("today's date")) {
    return 'Today is ' + new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) + '.';
  }
  const mathExpr = msg.replace(/[^\d+\-*/().\s]/g, '').trim();
  if (mathExpr.length > 0 && /\d/.test(mathExpr)) {
    const result = safeMath(mathExpr);
    if (result !== null) return `${mathExpr.trim()} = ${result}`;
  }
  return "The AI proxy isn't running (or has no API key set), so I'm answering from a small offline responder — capitals, arithmetic, dice/coin flips, jokes, and the time are about all I can do here. Run \"npm run server\" with a key in .env for real answers.";
}

/* ---------------- public entry point ---------------- */
export async function getReply(message, history) {
  if (health.connected) {
    try {
      return { text: await callRealAI(message, history), live: true };
    } catch (err) {
      return { text: `The AI proxy returned an error (${err.message}). Falling back to the offline responder:\n\n${offlineReply(message)}`, live: false };
    }
  }
  return { text: offlineReply(message), live: false };
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}
export function getUsage() {
  const raw = JSON.parse(localStorage.getItem('ember-ai-usage') || 'null');
  if (!raw || raw.date !== todayKey()) return { date: todayKey(), count: 0 };
  return raw;
}
export function bumpUsage() {
  const u = getUsage();
  u.count++;
  localStorage.setItem('ember-ai-usage', JSON.stringify(u));
  return u;
}
