const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const VALID_DURATIONS = ['1 hora', '2 horas', '3 horas', '4 horas', '4+ horas'];

// Listado público de videos/VODs (para el Home)
router.get('/', (req, res) => {
  const rows = db.prepare(
    `SELECT v.*, u.username AS owner_username
     FROM videos v JOIN users u ON u.id = v.owner_id
     ORDER BY v.created_at DESC LIMIT 40`
  ).all();
  res.json(rows);
});

// Publicar un video/VOD. Nota importante: la "duración" es solo una etiqueta
// informativa para el catálogo — el reproductor NUNCA corta el video antes de
// tiempo; siempre reproduce la fuente completa, dure lo que dure (1, 2, 3,
// 4 horas o más). No hay ningún límite de tiempo impuesto por el sistema.
router.post('/', requireAuth, (req, res) => {
  const { title, videoUrl, durationLabel, category } = req.body || {};
  if (!title || !videoUrl) return res.status(400).json({ error: 'Faltan el título o el enlace del video' });
  const duration = VALID_DURATIONS.includes(durationLabel) ? durationLabel : '1 hora';

  const id = uuid();
  db.prepare(
    `INSERT INTO videos (id, owner_id, title, video_url, duration_label, category) VALUES (?,?,?,?,?,?)`
  ).run(id, req.user.id, title, videoUrl, duration, category || 'Gaming');

  res.status(201).json(db.prepare('SELECT * FROM videos WHERE id = ?').get(id));
});

router.post('/:id/view', (req, res) => {
  db.prepare('UPDATE videos SET views = views + 1 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
