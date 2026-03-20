const express = require('express');
const mysql = require('mysql2');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE');
  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} ${res.statusCode} - ${duration}ms`);
  });
  next();
});

let db = null;
let dbConnectedAt = null;
let connectionAttempts = 0;

function createConnection() {
  return mysql.createConnection({
    host:     process.env.DB_HOST,
    user:     process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
}

function initDatabase() {
  const tables = [
    `CREATE TABLE IF NOT EXISTS visits (
      id INT AUTO_INCREMENT PRIMARY KEY,
      method VARCHAR(10) DEFAULT 'GET',
      endpoint VARCHAR(200) NOT NULL,
      status_code INT DEFAULT 200,
      response_time_ms INT DEFAULT 0,
      ip_address VARCHAR(50),
      visited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_endpoint (endpoint),
      INDEX idx_visited_at (visited_at)
    )`,
    `CREATE TABLE IF NOT EXISTS metrics (
      id INT AUTO_INCREMENT PRIMARY KEY,
      cpu_load FLOAT,
      memory_used_mb FLOAT,
      memory_total_mb FLOAT,
      uptime_seconds INT,
      recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS messages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      author VARCHAR(100) NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
  ];

  tables.forEach((sql, i) => {
    db.query(sql, (err) => {
      if (err) console.error(`Table ${i+1} creation failed:`, err.message);
      else console.log(`✅ Table ${i+1}/3 ready`);
    });
  });

  setTimeout(() => {
    db.query('SELECT COUNT(*) as count FROM messages', (err, results) => {
      if (!err && results[0].count === 0) {
        db.query(
          "INSERT INTO messages (author, content) VALUES (?, ?)",
          ['System', 'Welcome to FiftyFive Technologies 3-Tier App!'],
          () => console.log('✅ Seed message inserted')
        );
      }
    });
  }, 1000);
}

function connectWithRetry() {
  connectionAttempts++;
  console.log(`Attempting DB connection... (attempt #${connectionAttempts})`);
  db = createConnection();

  db.connect((err) => {
    if (err) {
      console.error('DB connection failed, retrying in 5s...', err.message);
      db.destroy();
      db = null;
      setTimeout(connectWithRetry, 5000);
      return;
    }
    dbConnectedAt = new Date();
    console.log('✅ Connected to MySQL successfully');
    initDatabase();

    db.on('error', (err) => {
      console.error('DB error:', err.message);
      if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNREFUSED' || err.code === 'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR') {
        db = null;
        dbConnectedAt = null;
        setTimeout(connectWithRetry, 5000);
      }
    });
  });
}

connectWithRetry();

function logVisit(method, endpoint, statusCode, responseTime, ip) {
  if (!db) return;
  db.query(
    'INSERT INTO visits (method, endpoint, status_code, response_time_ms, ip_address) VALUES (?, ?, ?, ?, ?)',
    [method, endpoint, statusCode, responseTime, ip],
    (err) => { if (err) console.error('Log visit error:', err.message); }
  );
}

function recordMetrics() {
  if (!db) return;
  const memUsed = (os.totalmem() - os.freemem()) / 1024 / 1024;
  const memTotal = os.totalmem() / 1024 / 1024;
  db.query(
    'INSERT INTO metrics (cpu_load, memory_used_mb, memory_total_mb, uptime_seconds) VALUES (?, ?, ?, ?)',
    [os.loadavg()[0].toFixed(2), memUsed.toFixed(2), memTotal.toFixed(2), Math.floor(os.uptime())],
    (err) => { if (err) console.error('Metrics error:', err.message); }
  );
}

setInterval(recordMetrics, 30000);

// ════════ ROUTES ════════

app.get('/', (req, res) => {
  const start = Date.now();
  const response = {
    status: 'OK',
    message: 'Backend is running!',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    endpoints: ['/', '/health', '/visits', '/visits/log', '/visits/stats', '/messages', '/metrics', '/system']
  };
  logVisit(req.method, '/', 200, Date.now() - start, req.ip);
  res.json(response);
});

app.get('/health', (req, res) => {
  const start = Date.now();
  if (!db) return res.status(500).json({ status: 'error', db: 'not connected yet' });
  db.ping((err) => {
    const duration = Date.now() - start;
    if (err) {
      logVisit(req.method, '/health', 500, duration, req.ip);
      return res.status(500).json({ status: 'error', db: 'unreachable', detail: err.message });
    }
    logVisit(req.method, '/health', 200, duration, req.ip);
    res.json({
      status: 'ok',
      db: 'connected',
      db_connected_at: dbConnectedAt,
      connection_attempts: connectionAttempts,
      app_uptime_seconds: Math.floor(process.uptime()),
      response_time_ms: duration
    });
  });
});

app.get('/visits', (req, res) => {
  const start = Date.now();
  if (!db) return res.status(500).json({ status: 'error' });
  db.query('SELECT COUNT(*) as total FROM visits', (err, results) => {
    const duration = Date.now() - start;
    if (err) return res.status(500).json({ status: 'error', detail: err.message });
    logVisit(req.method, '/visits', 200, duration, req.ip);
    res.json({ status: 'ok', total_visits: results[0].total });
  });
});

app.get('/visits/log', (req, res) => {
  if (!db) return res.status(500).json({ status: 'error' });
  const limit = parseInt(req.query.limit) || 20;
  db.query('SELECT * FROM visits ORDER BY visited_at DESC LIMIT ?', [limit], (err, results) => {
    if (err) return res.status(500).json({ status: 'error', detail: err.message });
    res.json({ status: 'ok', count: results.length, recent_visits: results });
  });
});

app.get('/visits/stats', (req, res) => {
  if (!db) return res.status(500).json({ status: 'error' });
  db.query(
    `SELECT endpoint, COUNT(*) as hits, AVG(response_time_ms) as avg_ms, MAX(visited_at) as last_visited
     FROM visits GROUP BY endpoint ORDER BY hits DESC`,
    (err, results) => {
      if (err) return res.status(500).json({ status: 'error', detail: err.message });
      res.json({ status: 'ok', stats: results });
    }
  );
});

app.get('/messages', (req, res) => {
  const start = Date.now();
  if (!db) return res.status(500).json({ status: 'error' });
  db.query('SELECT * FROM messages ORDER BY created_at DESC', (err, results) => {
    const duration = Date.now() - start;
    if (err) return res.status(500).json({ status: 'error', detail: err.message });
    logVisit(req.method, '/messages', 200, duration, req.ip);
    res.json({ status: 'ok', count: results.length, messages: results });
  });
});

app.post('/messages', (req, res) => {
  const start = Date.now();
  if (!db) return res.status(500).json({ status: 'error' });
  const { author, content } = req.body;
  if (!author || !content) return res.status(400).json({ status: 'error', message: 'author and content required' });
  db.query('INSERT INTO messages (author, content) VALUES (?, ?)', [author, content], (err, result) => {
    const duration = Date.now() - start;
    if (err) return res.status(500).json({ status: 'error', detail: err.message });
    logVisit(req.method, '/messages', 201, duration, req.ip);
    res.status(201).json({ status: 'ok', message: 'Created!', id: result.insertId, author, content });
  });
});

app.delete('/messages/:id', (req, res) => {
  if (!db) return res.status(500).json({ status: 'error' });
  db.query('DELETE FROM messages WHERE id = ?', [req.params.id], (err, result) => {
    if (err) return res.status(500).json({ status: 'error', detail: err.message });
    if (result.affectedRows === 0) return res.status(404).json({ status: 'error', message: 'Not found' });
    res.json({ status: 'ok', message: `Message ${req.params.id} deleted` });
  });
});

app.get('/metrics', (req, res) => {
  if (!db) return res.status(500).json({ status: 'error' });
  db.query('SELECT * FROM metrics ORDER BY recorded_at DESC LIMIT 10', (err, results) => {
    if (err) return res.status(500).json({ status: 'error', detail: err.message });
    res.json({ status: 'ok', metrics: results });
  });
});

app.get('/system', (req, res) => {
  const start = Date.now();
  const memUsed = (os.totalmem() - os.freemem()) / 1024 / 1024;
  const memTotal = os.totalmem() / 1024 / 1024;
  logVisit(req.method, '/system', 200, Date.now() - start, req.ip);
  res.json({
    status: 'ok',
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    cpu_cores: os.cpus().length,
    cpu_load_1m: os.loadavg()[0].toFixed(2),
    memory: {
      used_mb: memUsed.toFixed(2),
      total_mb: memTotal.toFixed(2),
      percent: ((memUsed / memTotal) * 100).toFixed(1) + '%'
    },
    node_version: process.version,
    app_uptime_seconds: Math.floor(process.uptime())
  });
});

app.use((req, res) => {
  logVisit(req.method, req.path, 404, 0, req.ip);
  res.status(404).json({ status: 'error', message: `Route ${req.path} not found` });
});

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
  console.log(`Routes: /, /health, /visits, /visits/log, /visits/stats, /messages, /metrics, /system`);
});
