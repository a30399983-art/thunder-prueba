const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Listado público de salas (Home / feed de vivos)
router.get('/', (req, res) => {
  const rows = db.prepare(
    `SELECT r.id, r.title, r.category, r.status, r.viewers, r.started_at,
            u.username AS owner_username
     FROM rooms r JOIN users u ON u.id = r.owner_id
     ORDER BY r.status = 'en_vivo' DESC, r.viewers DESC`
  ).all();
  res.json(rows);
});

// ------- Anuncios (Thunder Place / Ads Manager) -------
// OJO: estas dos rutas van antes de '/:id' para que "ads" no se
// confunda con un id de sala.
router.get('/ads/mine', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM ads WHERE owner_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.json(rows);
});

router.post('/ads', requireAuth, (req, res) => {
  const { title, model, placement, dailyBudget, destinationUrl } = req.body || {};
  if (!title || !model || !placement || !destinationUrl) {
    return res.status(400).json({ error: 'Faltan campos del anuncio' });
  }
  const id = uuid();
  db.prepare(
    `INSERT INTO ads (id, owner_id, title, model, placement, daily_budget, destination_url) VALUES (?,?,?,?,?,?,?)`
  ).run(id, req.user.id, title, model, placement, dailyBudget || 0, destinationUrl);
  res.status(201).json(db.prepare('SELECT * FROM ads WHERE id = ?').get(id));
});

router.get('/:id', (req, res) => {
  const row = db.prepare(
    `SELECT r.*, u.username AS owner_username FROM rooms r JOIN users u ON u.id = r.owner_id WHERE r.id = ?`
  ).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Sala no encontrada' });
  row.source_urls = JSON.parse(row.source_urls || '[]');
  res.json(row);
});

// Crear/asegurar la sala del creador autenticado
router.post('/', requireAuth, (req, res) => {
  const { title, category } = req.body || {};
  const existing = db.prepare('SELECT * FROM rooms WHERE owner_id = ?').get(req.user.id);
  if (existing) return res.json(existing);
  const id = uuid();
  db.prepare('INSERT INTO rooms (id, owner_id, title, category) VALUES (?,?,?,?)')
    .run(id, req.user.id, title || `Vivo de ${req.user.username}`, category || 'General');
  res.status(201).json(db.prepare('SELECT * FROM rooms WHERE id = ?').get(id));
});

// Publicar transmisión: enlaces/ID de fuente (sin OBS) + overlays. Ver server.js
// para el punto de integración real con un servidor de media (RTMP/WebRTC).
router.post('/:id/go-live', requireAuth, (req, res) => {
  const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(req.params.id);
  if (!room) return res.status(404).json({ error: 'Sala no encontrada' });
  if (room.owner_id !== req.user.id) return res.status(403).json({ error: 'No eres dueño de esta sala' });

  const { sources = [], overlayGifts = true, overlayAlert = true, overlayLogoUrl = '' } = req.body || {};
  const clean = (sources || []).map((s) => String(s).trim()).filter(Boolean);
  if (clean.length === 0) return res.status(400).json({ error: 'Agrega al menos un enlace o ID de transmisión' });

  db.prepare(
    `UPDATE rooms SET status='en_vivo', source_urls=?, overlay_gifts=?, overlay_alert=?, overlay_logo_url=?, started_at=datetime('now') WHERE id=?`
  ).run(JSON.stringify(clean), overlayGifts ? 1 : 0, overlayAlert ? 1 : 0, overlayLogoUrl, room.id);

  req.app.get('io').emit('room:live', { roomId: room.id, sources: clean });
  res.json({ ok: true, sources: clean });
});

router.post('/:id/end', requireAuth, (req, res) => {
  const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(req.params.id);
  if (!room || room.owner_id !== req.user.id) return res.status(403).json({ error: 'No autorizado' });
  db.prepare(`UPDATE rooms SET status='finalizado' WHERE id=?`).run(room.id);
  req.app.get('io').emit('room:ended', { roomId: room.id });
  res.json({ ok: true });
});

// Suscribirse a un canal VIP
router.post('/:id/subscribe', requireAuth, (req, res) => {
  const id = uuid();
  try {
    db.prepare('INSERT INTO subscriptions (id, user_id, room_id) VALUES (?,?,?)').run(id, req.user.id, req.params.id);
  } catch (e) { /* ya estaba suscrito */ }
  res.json({ ok: true, subscribed: true });
});

router.get('/:id/subscribed', requireAuth, (req, res) => {
  const row = db.prepare('SELECT id FROM subscriptions WHERE user_id = ? AND room_id = ?').get(req.user.id, req.params.id);
  res.json({ subscribed: !!row });
});

module.exports = router;
