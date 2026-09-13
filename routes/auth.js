const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const db = require('../db');
const { signToken, requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/register', (req, res) => {
  const { username, email, password, role } = req.body || {};
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Faltan username, email o password' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  }
  const exists = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
  if (exists) return res.status(409).json({ error: 'Ese usuario o correo ya está registrado' });

  const id = uuid();
  const hash = bcrypt.hashSync(password, 10);
  const finalRole = role === 'creador' ? 'creador' : 'espectador';
  db.prepare(
    `INSERT INTO users (id, username, email, password_hash, role) VALUES (?,?,?,?,?)`
  ).run(id, username, email, hash, finalRole);

  const user = db.prepare('SELECT id, username, email, role, kyc_verified, monedas_verdes, monedas_doradas FROM users WHERE id = ?').get(id);
  const token = signToken({ id: user.id, username: user.username, role: user.role });
  res.status(201).json({ token, user });
});

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Faltan credenciales' });

  const row = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(username, username);
  if (!row) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });

  const ok = bcrypt.compareSync(password, row.password_hash);
  if (!ok) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });

  const token = signToken({ id: row.id, username: row.username, role: row.role });
  const { password_hash, ...user } = row;
  res.json({ token, user });
});

router.get('/me', requireAuth, (req, res) => {
  const row = db.prepare(
    'SELECT id, username, email, role, kyc_verified, monedas_verdes, monedas_doradas, balance_canjeable FROM users WHERE id = ?'
  ).get(req.user.id);
  if (!row) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json({ user: row });
});

// Simulación de verificación KYC (en producción esto lo hace un proveedor externo:
// Onfido, Didit, Truora, etc. — aquí queda el punto de integración marcado).
router.post('/kyc/verify', requireAuth, (req, res) => {
  db.prepare('UPDATE users SET kyc_verified = 1, role = ? WHERE id = ?').run('creador', req.user.id);
  res.json({ ok: true, message: 'KYC verificado (simulado). Ya puedes recibir y canjear regalos como creador.' });
});

module.exports = router;
