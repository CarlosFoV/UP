require('dotenv').config();
const express  = require('express');
const session  = require('express-session');
const bcrypt   = require('bcryptjs');
const path     = require('path');
const fs       = require('fs');
const morgan   = require('morgan');

const {
  getUserByUsername,
  insertLog,
  getLogs,
  getLogsByType,
} = require('./database/db');

const app  = express();
const PORT = process.env.PORT || 3000;

const LOGS_JSON_PATH = path.join(__dirname, 'logs.json');
const MAX_LOGS_IN_FILE = 2000;

// ── Helper: obtener IP real (considera proxies como Render) ──
function getIP(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.socket.remoteAddress ||
    'desconocida'
  );
}

// ── Helper: escribir log a consola, SQLite y archivo JSON ──
function log(eventType, username, ip, message) {
  const ts = new Date().toISOString();
  const entry = { timestamp: ts, event_type: eventType, username: username ?? null, ip: ip ?? null, message };
  console.log(`[${ts}] [${eventType}] user=${username ?? '-'} ip=${ip ?? '-'} | ${message}`);
  try {
    insertLog.run(eventType, username ?? null, ip ?? null, message);
  } catch (e) {
    console.error('[LOG_ERROR]', e.message);
  }
  try {
    let list = [];
    if (fs.existsSync(LOGS_JSON_PATH)) {
      const raw = fs.readFileSync(LOGS_JSON_PATH, 'utf8');
      try { list = JSON.parse(raw); } catch (_) { list = []; }
    }
    list.unshift(entry);
    list = list.slice(0, MAX_LOGS_IN_FILE);
    fs.writeFileSync(LOGS_JSON_PATH, JSON.stringify(list, null, 2), 'utf8');
  } catch (e) {
    console.error('[LOG_FILE_ERROR]', e.message);
  }
}

// ── Middleware ────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Morgan: log de cada petición HTTP a consola
app.use(morgan(':method :url :status :res[content-length]b - :response-time ms | ip=:remote-addr'));

app.use(session({
  secret: process.env.SESSION_SECRET || 'login-seguro-secret-key-cambiar-en-produccion',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    maxAge: 30 * 60 * 1000, // 30 minutos
  },
}));

// ── Rutas ─────────────────────────────────────────────────

/** GET /  →  sirve index.html */
app.get('/', (req, res) => {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/** GET /dashboard  →  página protegida */
app.get('/dashboard', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/');
  }
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

/** POST /login  →  autenticación (sin bloqueo por intentos) */
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const ip = getIP(req);

  if (!username || !password) {
    return res.status(400).json({ error: 'Por favor completa todos los campos.' });
  }

  const usernameClean = username.trim().toLowerCase();
  const user = getUserByUsername.get(usernameClean);
  const passwordMatch = user ? await bcrypt.compare(password, user.password_hash) : false;

  if (!user || !passwordMatch) {
    log('login_failed', usernameClean, ip, 'Usuario o contraseña incorrectos');
    return res.status(401).json({
      error: 'El usuario o contraseña son incorrectos.',
    });
  }

  req.session.user = { id: user.id, username: user.username };
  log('login_success', usernameClean, ip, 'Autenticación exitosa');
  return res.json({ success: true, redirect: '/dashboard' });
});

/** POST /logout */
app.post('/logout', (req, res) => {
  const username = req.session.user?.username ?? 'desconocido';
  const ip = getIP(req);
  req.session.destroy(() => {
    log('logout', username, ip, 'Sesión cerrada');
    res.redirect('/');
  });
});

/** GET /api/me  →  info del usuario autenticado (para dashboard.html) */
app.get('/api/me', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  res.json({ username: req.session.user.username });
});

/**
 * GET /api/logs  →  consulta de logs (requiere sesión activa)
 * Query params:
 *   - limit  : número de registros (default 100, max 500)
 *   - type   : filtrar por event_type (login_success, login_failed, logout)
 */
app.get('/api/logs', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const type  = req.query.type;

  const rows = type
    ? getLogsByType.all(type, limit)
    : getLogs.all(limit);

  res.json({ total: rows.length, logs: rows });
});

// ── Iniciar servidor ──────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀  Servidor corriendo en http://localhost:${PORT}\n`);
});
