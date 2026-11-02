const express = require('express');
const { Pool } = require('pg');

if (typeof process.loadEnvFile === 'function') {
  process.loadEnvFile();
}

const app = express();
const port = Number(process.env.PORT || 8000);
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'interlink',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD
});

app.get('/healthz', (_request, response) => {
  response.status(200).json({ status: 'ok' });
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
    `SELECT id, display_name, email, wallet_address, kyc_status, created_at
     FROM interlink_submissions ORDER BY created_at DESC LIMIT 500`
  );
  response.json(result.rows);
});

app.get('/api/submissions.csv', async (_request, response) => {
  const result = await pool.query(
    `SELECT id, display_name, email, wallet_address, kyc_status, created_at
     FROM interlink_submissions ORDER BY created_at DESC`
  );
  const escapeCsv = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const rows = [['id', 'display_name', 'email', 'wallet_address', 'kyc_status', 'created_at'], ...result.rows.map((row) => [row.id, row.display_name, row.email, row.wallet_address, row.kyc_status, row.created_at.toISOString()])];
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

initializeDatabase()
  .then(() => app.listen(port, '0.0.0.0', () => console.log(`Server running on port ${port}`)))
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
