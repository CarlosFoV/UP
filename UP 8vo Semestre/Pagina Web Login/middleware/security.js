const xss = require('xss');
const ldapEscape = require('ldap-escape');
const { body, query, validationResult } = require('express-validator');

const LOCKOUT_MAX_ATTEMPTS = parseInt(process.env.LOCKOUT_MAX_ATTEMPTS, 10) || 5;
const LOCKOUT_MINUTES = parseInt(process.env.LOCKOUT_MINUTES, 10) || 5;

const LOG_EVENT_TYPES = new Set([
  'login_success',
  'login_failed',
  'account_locked',
  'login_blocked',
  'lockout_expired',
  'logout',
]);

/** Sanitiza strings en body/query/params contra XSS */
function sanitizeValue(val) {
  if (typeof val === 'string') return xss(val);
  if (Array.isArray(val)) return val.map(sanitizeValue);
  if (val && typeof val === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(val)) {
      out[k] = sanitizeValue(v);
    }
    return out;
  }
  return val;
}

function xssSanitizeMiddleware(req, _res, next) {
  if (req.body) req.body = sanitizeValue(req.body);
  if (req.query) req.query = sanitizeValue(req.query);
  if (req.params) req.params = sanitizeValue(req.params);
  next();
}

/** Usuario seguro: alfanumérico + guión bajo; escapado LDAP (anti inyección LDAP) */
function normalizeUsername(raw) {
  const trimmed = String(raw).trim().toLowerCase();
  return ldapEscape.escapeFilter(trimmed);
}

const loginValidators = [
  body('username')
    .trim()
    .notEmpty()
    .withMessage('El usuario es obligatorio.')
    .isLength({ max: 32 })
    .withMessage('Usuario demasiado largo.')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Usuario inválido (solo letras, números y _).')
    .customSanitizer((v) => normalizeUsername(v)),
  body('password')
    .notEmpty()
    .withMessage('La contraseña es obligatoria.')
    .isLength({ max: 128 })
    .withMessage('Contraseña demasiado larga.'),
];

const logsQueryValidators = [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 500 })
    .withMessage('limit debe ser entre 1 y 500.')
    .toInt(),
  query('type')
    .optional()
    .isIn([...LOG_EVENT_TYPES])
    .withMessage('Tipo de evento no válido.'),
];

function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: errors.array()[0].msg,
    });
  }
  next();
}

module.exports = {
  LOCKOUT_MAX_ATTEMPTS,
  LOCKOUT_MINUTES,
  LOG_EVENT_TYPES,
  xssSanitizeMiddleware,
  loginValidators,
  logsQueryValidators,
  handleValidationErrors,
  normalizeUsername,
};
