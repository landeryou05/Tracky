import express from 'express';
import pg from 'pg';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const { DATABASE_URL, OIDC_ISSUER } = process.env;
const pool = new pg.Pool({ connectionString: DATABASE_URL });
const jwks = createRemoteJWKSet(new URL('jwks/', OIDC_ISSUER));

// The form fields, named exactly as in App.jsx
const TIME_FIELDS = ['cardIn', 'cardOut', 'startTime', 'finishTime', 'workTime', 'driveTime', 'rest'];
const MILE_FIELDS = ['startMiles', 'finishMiles'];

// New table name, so nothing from earlier versions gets in the way
await pool.query(`
  CREATE TABLE IF NOT EXISTS daily_entries (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    log_date DATE NOT NULL,
    data JSONB NOT NULL,
    UNIQUE (user_id, log_date)
  )
`);

const app = express();
app.use(express.json());

// Checks the authentik token and works out who is calling
async function auth(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    const { payload } = await jwtVerify(token, jwks, { issuer: OIDC_ISSUER });
    req.userId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: 'unauthorized' });
  }
}

// Stops a database hiccup from crashing the whole API
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const isBlankOrWhole = (v, max) => v === '' || (/^\d+$/.test(String(v)) && Number(v) <= max);

// Checks the form data and keeps only the fields we expect
function cleanEntry(body) {
  const entry = {};
  for (const f of TIME_FIELDS) {
    const { hours = '', minutes = '' } = body?.[f] ?? {};
    if (!isBlankOrWhole(hours, 24) || !isBlankOrWhole(minutes, 59)) return null;
    entry[f] = { hours: String(hours), minutes: String(minutes) };
  }
  for (const f of MILE_FIELDS) {
    const v = String(body?.[f] ?? '').trim();
    if (v !== '' && !(Number.isFinite(Number(v)) && Number(v) >= 0)) return null;
    entry[f] = v;
  }
  return entry;
}

// Get my entries between two dates
app.get('/api/logs', auth, wrap(async (req, res) => {
  const { from, to } = req.query;
  if (!isDate(from) || !isDate(to)) return res.status(400).json({ error: 'bad dates' });
  const { rows } = await pool.query(
    `SELECT to_char(log_date, 'YYYY-MM-DD') AS log_date, data
     FROM daily_entries
     WHERE user_id = $1 AND log_date BETWEEN $2 AND $3
     ORDER BY log_date`,
    [req.userId, from, to]
  );
  res.json(rows);
}));

// Save (create or update) my entry for a date
app.put('/api/logs/:date', auth, wrap(async (req, res) => {
  const { date } = req.params;
  const entry = cleanEntry(req.body);
  if (!isDate(date) || !entry) return res.status(400).json({ error: 'bad input' });
  await pool.query(
    `INSERT INTO daily_entries (user_id, log_date, data)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (user_id, log_date) DO UPDATE SET data = EXCLUDED.data`,
    [req.userId, date, JSON.stringify(entry)]
  );
  res.json({ ok: true });
}));

// Delete my entry for a date
app.delete('/api/logs/:date', auth, wrap(async (req, res) => {
  if (!isDate(req.params.date)) return res.status(400).json({ error: 'bad date' });
  await pool.query(
    'DELETE FROM daily_entries WHERE user_id = $1 AND log_date = $2',
    [req.userId, req.params.date]
  );
  res.json({ ok: true });
}));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'server error' });
});

app.listen(3000, () => console.log('API listening on 3000'));