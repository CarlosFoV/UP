const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'login.db');
const db = new Database(DB_PATH);

// Habilitar WAL para mejor rendimiento
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    username    TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS login_lockouts (
    username     TEXT PRIMARY KEY,
    failed_count INTEGER DEFAULT 0,
    last_failed  DATETIME,
    locked_until DATETIME
  );
`);

// ── Usuarios ─────────────────────────────────────────────

const getUserByUsername = db.prepare(
  'SELECT * FROM users WHERE username = ?'
);

const createUser = db.prepare(
  'INSERT OR IGNORE INTO users (username, password_hash) VALUES (?, ?)'
);

// ── Control de bloqueos ───────────────────────────────────

const getLockout = db.prepare(
  'SELECT * FROM login_lockouts WHERE username = ?'
);

const upsertFailedAttempt = db.prepare(`
  INSERT INTO login_lockouts (username, failed_count, last_failed, locked_until)
  VALUES (?, 1, CURRENT_TIMESTAMP, NULL)
  ON CONFLICT(username) DO UPDATE SET
    failed_count = failed_count + 1,
    last_failed  = CURRENT_TIMESTAMP,
    locked_until = CASE
      WHEN failed_count + 1 >= 5
        THEN datetime(CURRENT_TIMESTAMP, '+5 minutes')
      ELSE NULL
    END
`);

const resetLockout = db.prepare(
  'DELETE FROM login_lockouts WHERE username = ?'
);

module.exports = {
  getUserByUsername,
  createUser,
  getLockout,
  upsertFailedAttempt,
  resetLockout,
};
