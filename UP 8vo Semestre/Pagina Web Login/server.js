require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const morgan = require('morgan');
const helmet = require('helmet');
const hpp = require('hpp');
const rateLimit = require('express-rate-limit');

const {
  getUserByUsername,
  getLockout,
  upsertFailedAttempt,
  resetLockout,
  insertLog,
  getLogs,
  getLogsByType,
} = require('./database/db');

const {
  LOCKOUT_MAX_ATTEMPTS,
  LOCKOUT_MINUTES,
  xssSanitizeMiddleware,
  loginValidators,
  logsQueryValidators,
  handleValidationErrors,
} = require('./middleware/security');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

const LOGS_JSON_PATH = path.join(__dirname, 'logs.json');
const MAX_LOGS_IN_FILE = 2000;

app.set('trust proxy', 1);

function getIP(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.socket.remoteAddress ||
    'desconocida'
  );
}

function log(eventType, username, ip, message) {
  const ts = new Date().toISOString();
  const entry = {
    timestamp: ts,
    event_type: eventType,
    username: username ?? null,
    ip: ip ?? null,
    message,
  };
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
      try {
        list = JSON.parse(raw);
      } catch {
        list = [];
      }
    }
    list.unshift(entry);
    list = list.slice(0, MAX_LOGS_IN_FILE);
    fs.writeFileSync(LOGS_JSON_PATH, JSON.stringify(list, null, 2), 'utf8');
  } catch (e) {
    console.error('[LOG_FILE_ERROR]', e.message);
  }
}

function checkActiveLockout(usernameClean, ip) {
  const lockout = getLockout.get(usernameClean);
  if (!lockout?.locked_until) return null;

  const lockedUntil = new Date(lockout.locked_until + ' UTC');
  const now = new Date();

  if (now < lockedUntil) {
    const diffMs = lockedUntil - now;
    const diffMinutes = Math.ceil(diffMs / 60000);
    const diffSeconds = Math.ceil((diffMs % 60000) / 1000);
    return { lockedUntil, diffMinutes, diffSeconds, failedCount: lockout.failed_count };
  }

  resetLockout.run(usernameClean);
  log('lockout_expired', usernameClean, ip, 'Bloqueo expirado, contador reiniciado');
  return null;
}

function lockoutResponse(res, lockedUntil, diffMinutes, diffSeconds) {
  return res.status(429).json({
    error: `Cuenta bloqueada por demasiados intentos fallidos. Inténtalo en ${diffMinutes}m ${diffSeconds}s.`,
    locked: true,
    lockedUntil: lockedUntil.toISOString(),
  });
}

// ── Seguridad (helmet, hpp, rate-limit, XSS) ─────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);
app.use(hpp());

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiadas peticiones desde esta IP. Inténtalo más tarde.' },
    keyGenerator: (req) => getIP(req),
  })
);

app.use(morgan(':method :url :status :res[content-length]b - :response-time ms | ip=:remote-addr'));

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(xssSanitizeMiddleware);

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'login-seguro-secret-key-cambiar-en-produccion',
    resave: false,
    saveUninitialized: false,
    name: 'sid',
    cookie: {
      httpOnly: true,
      secure: IS_PROD,
      sameSite: 'strict',
      maxAge: 30 * 60 * 1000,
    },
  })
);

app.use(express.static(path.join(__dirname, 'public')));

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de login desde esta IP. Inténtalo en 15 minutos.' },
  keyGenerator: (req) => getIP(req),
});

// ── Rutas ────────────────────────────────────────────────────

app.get('/', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/dashboard', (req, res) => {
  if (!req.session.user) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.post(
  '/login',
  loginLimiter,
  loginValidators,
  handleValidationErrors,
  async (req, res) => {
    const ip = getIP(req);
    const usernameClean = req.body.username;
    const { password } = req.body;

    const activeLock = checkActiveLockout(usernameClean, ip);
    if (activeLock) {
      log(
        'login_blocked',
        usernameClean,
        ip,
        `Intento mientras cuenta bloqueada. Desbloqueo en ${activeLock.diffMinutes}m ${activeLock.diffSeconds}s`
      );
      return lockoutResponse(res, activeLock.lockedUntil, activeLock.diffMinutes, activeLock.diffSeconds);
    }

    const user = getUserByUsername.get(usernameClean);
    const passwordMatch = user ? await bcrypt.compare(password, user.password_hash) : false;

    if (!user || !passwordMatch) {
      upsertFailedAttempt.run(usernameClean);
      const updated = getLockout.get(usernameClean);
      const remaining = Math.max(0, LOCKOUT_MAX_ATTEMPTS - (updated?.failed_count ?? 1));

      if (updated?.locked_until) {
        const lockedUntil = new Date(updated.locked_until + ' UTC');
        const diffMs = lockedUntil - new Date();
        const diffMinutes = Math.ceil(diffMs / 60000);
        const diffSeconds = Math.ceil((diffMs % 60000) / 1000);

        log(
          'account_locked',
          usernameClean,
          ip,
          `Cuenta bloqueada tras ${updated.failed_count} intentos. Desbloqueo en ${diffMinutes}m ${diffSeconds}s`
        );
        return lockoutResponse(res, lockedUntil, diffMinutes, diffSeconds);
      }

      log('login_failed', usernameClean, ip, `Contraseña incorrecta. Intentos restantes: ${remaining}`);
      return res.status(401).json({
        error: 'El usuario o contraseña son incorrectos.',
        attemptsLeft: remaining,
      });
    }

    resetLockout.run(usernameClean);
    req.session.user = { id: user.id, username: user.username };
    log('login_success', usernameClean, ip, 'Autenticación exitosa');
    return res.json({ success: true, redirect: '/dashboard' });
  }
);

app.post('/logout', (req, res) => {
  const username = req.session.user?.username ?? 'desconocido';
  const ip = getIP(req);
  req.session.destroy(() => {
    log('logout', username, ip, 'Sesión cerrada');
    res.redirect('/');
  });
});

app.get('/api/me', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'No autenticado' });
  res.json({ username: req.session.user.username });
});

app.get('/api/logs', logsQueryValidators, handleValidationErrors, (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'No autenticado' });

  const limit = req.query.limit ?? 100;
  const type = req.query.type;

  const rows = type ? getLogsByType.all(type, limit) : getLogs.all(limit);
  res.json({ total: rows.length, logs: rows });
});

app.listen(PORT, () => {
  console.log(`\n🚀  Servidor corriendo en http://localhost:${PORT}`);
  console.log(`    Lockout: ${LOCKOUT_MAX_ATTEMPTS} intentos → ${LOCKOUT_MINUTES} min\n`);
});
