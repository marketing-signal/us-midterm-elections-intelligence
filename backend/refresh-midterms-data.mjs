// Hourly data refresh for the Midterms Intelligence page.
// Run: node refresh-midterms-data.mjs  (Node 18+)
// Reads ./midterms-data.json, updates the live fields, writes it back.
// Env: SIGNAL_API_BASE, SIGNAL_API_KEY

import { readFile, writeFile } from 'node:fs/promises';

const FILE = process.env.DATA_FILE || './midterms-data.json';
const QUERY = 'midterm OR midterms OR "midterm election" OR "midterm elections"';
const TZ = 'America/New_York';
const FIGURES = {
  'Donald Trump': 'Donald_Trump',
  'Republican Party': 'Republican_Party_(United_States)',
  'Democratic Party': 'Democratic_Party_(United_States)',
};

// ---- ADAPTER: the one piece to wire to your Signal AI API access ----------
// Must return the JSON the Signal content API returns for explore/get calls.
// Replace the path and body with your account's documented endpoints and auth.
async function signal(action, body) {
  const res = await fetch(`${process.env.SIGNAL_API_BASE}/content/${action}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.SIGNAL_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Signal ${action} failed: ${res.status}`);
  return res.json();
}
// ---------------------------------------------------------------------------

const ymd = (d) => d.toISOString().slice(0, 10);
const filters = (start, end, extra = {}) => ({
  query: QUERY, start_date: start, end_date: end, timezone: TZ, ...extra,
});

async function main() {
  const data = JSON.parse(await readFile(FILE, 'utf8'));
  const now = new Date();
  const today = ymd(now);
  const yesterday = ymd(new Date(now.getTime() - 864e5));

  // 1. Daily volume since Oct 1 (data.daily = one count per day)
  const daily = await signal('explore', {
    filters: filters(data.start, today), interval: 'day',
  });
  const byDay = Object.fromEntries(daily.records.map((r) => [r.period, r.story_count]));
  const days = [];
  for (let d = new Date(data.start + 'T00:00:00Z'); ymd(d) <= today; d = new Date(d.getTime() + 864e5)) {
    days.push(byDay[ymd(d)] ?? 0);
  }
  data.daily = days;

  // 2. Last 24 hours panel
  const win = filters(yesterday, today);
  const [vol, sent, states, latest] = await Promise.all([
    signal('explore', { filters: win, interval: 'day' }),
    signal('explore', {
      filters: win,
      dimensions: [{ dimension: 'sentiment', include: Object.values(FIGURES) }],
    }),
    signal('explore', {
      filters: win,
      dimensions: [{ dimension: 'location', top_k: 25 }],
    }),
    signal('get', { filters: win, page_size: 8, sort: 'published_date desc' }),
  ]);

  const sentOut = {};
  for (const [name, id] of Object.entries(FIGURES)) {
    const n = (s) => vol && sent.records.find((r) => r.entity_id === id && r.sentiment === s)?.story_count ?? 0;
    sentOut[name] = [n('negative'), n('neutral'), n('positive')];
  }
  const US_STATES = ['Washington', 'Michigan', 'Texas', 'New York', 'Florida', 'California',
    'Ohio', 'Pennsylvania', 'Georgia', 'Arizona', 'North Carolina', 'Wisconsin', 'Nevada'];
  const stateRows = states.records
    .map((r) => [String(r.location).replace(/\s*\(state\)|\s*State\s*$/gi, '').trim(), r.story_count])
    .filter(([n]) => US_STATES.includes(n))
    .slice(0, 5);

  const fmtTime = (iso) =>
    new Date(iso).toLocaleTimeString('en-US', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });

  data.last24 = {
    window: `${yesterday} to ${today} (ET), through ${fmtTime(now)} ET`,
    vol: vol.records.map((r) => [r.period, r.story_count]),
    sent: sentOut,
    states: stateRows,
    events: data.last24?.events ?? [],   // optional: fill from the events API
  };

  // 3. Latest-stories feed: [id, source, title, hh:mm]
  data.feeds.latest = latest.articles.map((a) => [a.id, a.source_name, a.title, fmtTime(a.published_date)]);

  data.generatedAt = now.toISOString();
  await writeFile(FILE, JSON.stringify(data));
  console.log('Updated', FILE, data.generatedAt);
}

main().catch((e) => { console.error(e); process.exit(1); });
