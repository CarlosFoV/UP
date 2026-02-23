require('dotenv').config();
const express  = require('express');
const session  = require('express-session');
const bcrypt   = require('bcryptjs');
const path     = require('path');

const {
  getUserByUsername,
  getLockout,
  upsertFailedAttempt,
  resetLockout,
} = require('./database/db');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

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

      return res.status(429).json({
        error: `Cuenta bloqueada por demasiados intentos fallidos. Inténtalo en ${diffMinutes}m ${diffSeconds}s.`,
        locked: true,
        lockedUntil: lockedUntil.toISOString(),
      });
    } else {
      // El bloqueo expiró: limpiar
      resetLockout.run(usernameClean);
    }
  }

  // ── 2. Buscar usuario en BD ───────────────────────────
  const user = getUserByUsername.get(usernameClean);

  // ── 3. Verificar contraseña ───────────────────────────
  const passwordMatch = user ? await bcrypt.compare(password, user.password_hash) : false;

  if (!user || !passwordMatch) {
    // Registrar intento fallido
    upsertFailedAttempt.run(usernameClean);

    // Consultar cuántos intentos lleva ahora
    const updated = getLockout.get(usernameClean);
    const remaining = Math.max(0, 5 - (updated ? updated.failed_count : 1));

    if (updated && updated.locked_until) {
      const lockedUntil = new Date(updated.locked_until + ' UTC');
      const diffMs      = lockedUntil - new Date();
      const diffMinutes = Math.ceil(diffMs / 60000);
      const diffSeconds = Math.ceil((diffMs % 60000) / 1000);

      return res.status(429).json({
        error: `Cuenta bloqueada por demasiados intentos fallidos. Inténtalo en ${diffMinutes}m ${diffSeconds}s.`,
        locked: true,
        lockedUntil: lockedUntil.toISOString(),
      });
    }

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

  return res.json({ success: true, redirect: '/dashboard' });
});

/** POST /logout */
app.post('/logout', (req, res) => {
  req.session.destroy(() => {
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

// ── Iniciar servidor ──────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀  Servidor corriendo en http://localhost:${PORT}\n`);
});
