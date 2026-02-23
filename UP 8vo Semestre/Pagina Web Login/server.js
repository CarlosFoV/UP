require('dotenv').config();
const express  = require('express');
const session  = require('express-session');
const bcrypt   = require('bcryptjs');
const path     = require('path');
const morgan   = require('morgan');

const {
  getUserByUsername,
  getLockout,
  upsertFailedAttempt,
  resetLockout,
  insertLog,
  getLogs,
  getLogsByType,
} = require('./database/db');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Helper: obtener IP real (considera proxies como Render) ──
function getIP(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.socket.remoteAddress ||
    'desconocida'
  );
}

// ── Helper: escribir log a consola y a SQLite ─────────────
function log(eventType, username, ip, message) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [${eventType}] user=${username ?? '-'} ip=${ip ?? '-'} | ${message}`);
  try {
    insertLog.run(eventType, username ?? null, ip ?? null, message);
  } catch (e) {
    console.error('[LOG_ERROR]', e.message);
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

/** POST /login  →  autenticación */
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const ip = getIP(req);

  // Validación básica de campos vacíos
  if (!username || !password) {
    return res.status(400).json({ error: 'Por favor completa todos los campos.' });
  }

  const usernameClean = username.trim().toLowerCase();

  // ── 1. Verificar bloqueo ──────────────────────────────
  const lockout = getLockout.get(usernameClean);

  if (lockout && lockout.locked_until) {
    const lockedUntil = new Date(lockout.locked_until + ' UTC');
    const now         = new Date();

    if (now < lockedUntil) {
      const diffMs      = lockedUntil - now;
      const diffMinutes = Math.ceil(diffMs / 60000);
      const diffSeconds = Math.ceil((diffMs % 60000) / 1000);

      log('login_blocked', usernameClean, ip,
        `Intento mientras cuenta bloqueada. Desbloqueo en ${diffMinutes}m ${diffSeconds}s`);

      return res.status(429).json({
        error: `Cuenta bloqueada por demasiados intentos fallidos. Inténtalo en ${diffMinutes}m ${diffSeconds}s.`,
        locked: true,
        lockedUntil: lockedUntil.toISOString(),
      });
    } else {
      // El bloqueo expiró: limpiar
      resetLockout.run(usernameClean);
      log('lockout_expired', usernameClean, ip, 'Bloqueo expirado, contador reiniciado');
    }
  }

  // ── 2. Buscar usuario en BD ───────────────────────────
  const user = getUserByUsername.get(usernameClean);

  // ── 3. Verificar contraseña ───────────────────────────
  const passwordMatch = user ? await bcrypt.compare(password, user.password_hash) : false;

  if (!user || !passwordMatch) {
    upsertFailedAttempt.run(usernameClean);

    const updated   = getLockout.get(usernameClean);
    const remaining = Math.max(0, 5 - (updated ? updated.failed_count : 1));

    if (updated && updated.locked_until) {
      const lockedUntil = new Date(updated.locked_until + ' UTC');
      const diffMs      = lockedUntil - new Date();
      const diffMinutes = Math.ceil(diffMs / 60000);
      const diffSeconds = Math.ceil((diffMs % 60000) / 1000);

      log('account_locked', usernameClean, ip,
        `Cuenta bloqueada tras ${updated.failed_count} intentos fallidos. Desbloqueo en ${diffMinutes}m ${diffSeconds}s`);

      return res.status(429).json({
        error: `Cuenta bloqueada por demasiados intentos fallidos. Inténtalo en ${diffMinutes}m ${diffSeconds}s.`,
        locked: true,
        lockedUntil: lockedUntil.toISOString(),
      });
    }

    log('login_failed', usernameClean, ip,
      `Contraseña incorrecta. Intentos restantes: ${remaining}`);

    return res.status(401).json({
      error: 'El usuario o contraseña son incorrectos.',
      attemptsLeft: remaining,
    });
  }

  // ── 4. Login exitoso ──────────────────────────────────
  resetLockout.run(usernameClean);

  req.session.user = {
    id:       user.id,
    username: user.username,
  };

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
 *   - limit  : número de registros a devolver (default 100, max 500)
 *   - type   : filtrar por event_type (login_success, login_failed, account_locked,
 *              login_blocked, lockout_expired, logout)
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
