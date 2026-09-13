const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const row = db.prepare(
    'SELECT monedas_verdes, monedas_doradas, balance_canjeable, kyc_verified, role FROM users WHERE id = ?'
  ).get(req.user.id);
  res.json(row);
});

// Ganar monedas verdes viendo transmisiones (llamado periódicamente por el cliente mientras ve un vivo)
router.post('/earn', requireAuth, (req, res) => {
  const amount = 10; // monedas verdes por "tick" de tiempo visto
  db.prepare('UPDATE users SET monedas_verdes = monedas_verdes + ? WHERE id = ?').run(amount, req.user.id);
  const row = db.prepare('SELECT monedas_verdes FROM users WHERE id = ?').get(req.user.id);
  res.json({ earned: amount, monedas_verdes: row.monedas_verdes });
});

// Compra de Thunderbolt Dorados. OBSOLETO: usa /api/payments/checkout (Checkout Pro
// real de MercadoPago). Se deja aquí solo por compatibilidad; nunca acredites
// monedas confiando en lo que envía el cliente sin pasar por el webhook firmado.
router.post('/buy-gold', requireAuth, (req, res) => {
  res.status(400).json({
    error: 'Usa /api/payments/checkout para comprar monedas de forma segura',
    hint: 'El frontend ya llama a ese endpoint desde el botón "Comprar más".',
  });
});

// Panel de cobro — solo creadores verificados
router.post('/cashout', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (user.role !== 'creador' || !user.kyc_verified) {
    return res.status(403).json({ error: 'Solo creadores verificados (KYC) pueden canjear' });
  }
  const MIN_CASHOUT = 100;
  if (user.balance_canjeable < MIN_CASHOUT) {
    return res.status(400).json({ error: `Necesitas al menos S/ ${MIN_CASHOUT} para canjear` });
  }
  const last = db.prepare(
    "SELECT created_at FROM cashout_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 1"
  ).get(user.id);
  if (last) {
    const hours = (Date.now() - new Date(last.created_at + 'Z').getTime()) / 3600000;
    if (hours < 24) {
      return res.status(429).json({ error: 'Solo puedes solicitar un retiro cada 24 horas' });
    }
  }
  const id = uuid();
  db.prepare('INSERT INTO cashout_requests (id, user_id, amount) VALUES (?,?,?)').run(id, user.id, user.balance_canjeable);
  db.prepare('UPDATE users SET balance_canjeable = 0 WHERE id = ?').run(user.id);
  res.json({ ok: true, message: 'Solicitud de canje registrada. Se procesa en 24-72h vía tu pasarela de pagos.', id });
});

module.exports = router;
