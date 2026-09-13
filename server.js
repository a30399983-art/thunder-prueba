const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid');

// --- Autogenera un JWT_SECRET propio en .env si nunca se configuró uno ---
// (esto SÍ lo puede hacer el sistema por ti: no necesita ninguna cuenta externa)
const envPath = path.join(__dirname, '.env');
if (!fs.existsSync(envPath)) {
  const randomSecret = require('crypto').randomBytes(48).toString('hex');
  fs.writeFileSync(envPath, `PORT=4000\nCORS_ORIGIN=*\nJWT_SECRET=${randomSecret}\n`);
  console.log('🔐 Se generó un JWT_SECRET propio en .env (primera vez que corre el servidor).');
}

const config = require('./config');
const db = require('./db');
const { SECRET } = require('./middleware/auth');

const authRoutes = require('./routes/auth');
const walletRoutes = require('./routes/wallet');
const roomRoutes = require('./routes/rooms');
const giftRoutes = require('./routes/gifts');
const videoRoutes = require('./routes/videos');
const paymentRoutes = require('./routes/payments');

const app = express();
app.set('trust proxy', 1); // necesario detrás de Railway/Render/Nginx para que el rate-limit funcione bien

app.use(helmet({
  contentSecurityPolicy: false, // lo relajamos porque servimos HTML/CSS/JS propio + fuentes de Google + embeds de video
  crossOriginEmbedderPolicy: false,
}));
app.use(compression());
app.use(cors({ origin: config.CORS_ORIGIN }));
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Límite general para evitar abuso/DoS básico
app.use('/api/', rateLimit({ windowMs: 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false }));
// Límite más estricto para registro/login (evita fuerza bruta de contraseñas)
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/gifts', giftRoutes);
app.use('/api/videos', videoRoutes);
app.use('/api/payments', paymentRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// Historial de chat de una sala/canal
app.get('/api/rooms/:id/messages', (req, res) => {
  const channel = req.query.channel === 'vip' ? 'vip' : 'general';
  const rows = db
    .prepare('SELECT * FROM chat_messages WHERE room_id = ? AND channel = ? ORDER BY created_at DESC LIMIT 50')
    .all(req.params.id, channel);
  res.json(rows.reverse());
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: config.CORS_ORIGIN } });
app.set('io', io);

// --------- Autenticación de sockets (opcional: se puede entrar como invitado a mirar) ---------
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (token) {
    try {
      socket.user = jwt.verify(token, SECRET);
    } catch (e) {
      // token inválido: sigue como invitado, solo no podrá chatear/regalar
    }
  }
  next();
});

const roomViewers = {}; // roomId -> Set(socket.id)
const roomVoice = {};   // roomId -> Map(userId -> {username, muted})

function commissionSplit(costTotal) {
  const commission = Math.round(costTotal * 0.25 * 100) / 100; // 25% plataforma
  const forCreator = costTotal - commission;
  return { commission, forCreator };
}

io.on('connection', (socket) => {
  socket.on('room:join', ({ roomId }) => {
    socket.join(roomId);
    socket.data.roomId = roomId;
    roomViewers[roomId] = roomViewers[roomId] || new Set();
    roomViewers[roomId].add(socket.id);
    db.prepare('UPDATE rooms SET viewers = ? WHERE id = ?').run(roomViewers[roomId].size, roomId);
    io.to(roomId).emit('room:viewers', { roomId, count: roomViewers[roomId].size });
  });

  socket.on('disconnect', () => {
    const roomId = socket.data.roomId;
    if (roomId && roomViewers[roomId]) {
      roomViewers[roomId].delete(socket.id);
      db.prepare('UPDATE rooms SET viewers = ? WHERE id = ?').run(roomViewers[roomId].size, roomId);
      io.to(roomId).emit('room:viewers', { roomId, count: roomViewers[roomId].size });
    }
    if (roomId && roomVoice[roomId] && socket.user) {
      roomVoice[roomId].delete(socket.user.id);
      io.to(roomId).emit('voice:update', { participants: [...roomVoice[roomId].values()] });
    }
  });

  // ---------- CHAT ----------
  socket.on('chat:send', ({ roomId, channel, body }) => {
    if (!socket.user) return socket.emit('error:auth', { message: 'Inicia sesión para chatear' });
    const text = String(body || '').trim().slice(0, 300);
    if (!text) return;
    const ch = channel === 'vip' ? 'vip' : 'general';

    if (ch === 'vip') {
      const sub = db.prepare('SELECT id FROM subscriptions WHERE user_id = ? AND room_id = ?').get(socket.user.id, roomId);
      if (!sub) return socket.emit('error:auth', { message: 'Debes suscribirte para chatear en el canal VIP' });
    }

    const id = uuid();
    db.prepare(
      'INSERT INTO chat_messages (id, room_id, channel, user_id, username, body) VALUES (?,?,?,?,?,?)'
    ).run(id, roomId, ch, socket.user.id, socket.user.username, text);

    io.to(roomId).emit('chat:new', { id, roomId, channel: ch, username: socket.user.username, body: text, created_at: new Date().toISOString() });
  });

  // ---------- REGALOS ----------
  socket.on('gift:send', ({ roomId, giftId, quantity }) => {
    if (!socket.user) return socket.emit('error:auth', { message: 'Inicia sesión para enviar regalos' });
    const qty = Math.max(1, Math.min(50, parseInt(quantity, 10) || 1));

    const gift = db.prepare('SELECT * FROM gifts_catalog WHERE id = ?').get(giftId);
    const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId);
    if (!gift || !room) return socket.emit('error:generic', { message: 'Regalo o sala no válidos' });

    const costTotal = gift.cost * qty;
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(socket.user.id);
    const balanceField = gift.currency === 'dorada' ? 'monedas_doradas' : 'monedas_verdes';

    if (user[balanceField] < costTotal) {
      return socket.emit('error:funds', { message: 'No tienes saldo suficiente para este regalo' });
    }

    db.prepare(`UPDATE users SET ${balanceField} = ${balanceField} - ? WHERE id = ?`).run(costTotal, user.id);

    // Solo las monedas doradas (premium) se convierten en dinero real para el creador
    if (gift.currency === 'dorada') {
      const { forCreator } = commissionSplit(costTotal * 0.05); // tasa de conversión a soles, ajustable
      db.prepare('UPDATE users SET balance_canjeable = balance_canjeable + ? WHERE id = ?').run(forCreator, room.owner_id);
    }

    const id = uuid();
    db.prepare(
      'INSERT INTO gift_events (id, room_id, sender_id, sender_name, gift_id, quantity, currency, cost_total) VALUES (?,?,?,?,?,?,?,?)'
    ).run(id, roomId, user.id, user.username, gift.id, qty, gift.currency, costTotal);

    io.to(roomId).emit('gift:new', {
      id, roomId, sender: user.username, gift: { name: gift.name, emoji: gift.emoji, tier: gift.tier }, quantity: qty,
    });
  });

  // ---------- VOZ (presencia; el audio real viaja por WebRTC en el cliente) ----------
  socket.on('voice:join', ({ roomId }) => {
    if (!socket.user) return;
    roomVoice[roomId] = roomVoice[roomId] || new Map();
    roomVoice[roomId].set(socket.user.id, { userId: socket.user.id, username: socket.user.username, muted: false });
    io.to(roomId).emit('voice:update', { participants: [...roomVoice[roomId].values()] });
  });
  socket.on('voice:leave', ({ roomId }) => {
    if (!socket.user || !roomVoice[roomId]) return;
    roomVoice[roomId].delete(socket.user.id);
    io.to(roomId).emit('voice:update', { participants: [...roomVoice[roomId].values()] });
  });
  socket.on('voice:mute', ({ roomId, muted }) => {
    if (!socket.user || !roomVoice[roomId]?.has(socket.user.id)) return;
    roomVoice[roomId].get(socket.user.id).muted = !!muted;
    io.to(roomId).emit('voice:update', { participants: [...roomVoice[roomId].values()] });
  });
  socket.on('voice:raise-hand', ({ roomId }) => {
    if (!socket.user) return;
    io.to(roomId).emit('voice:raised-hand', { username: socket.user.username });
  });
});

server.listen(config.PORT, () => {
  console.log(`⚡ Thunder backend escuchando en http://localhost:${config.PORT}`);
});
