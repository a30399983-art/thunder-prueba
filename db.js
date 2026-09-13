// db.js — Base de datos real (SQLite) de Thunder.
// Un solo archivo en disco (data/thunder.db) que persiste usuarios, saldos,
// regalos, mensajes de chat, salas en vivo y anuncios entre reinicios del servidor.

const camino = require('path');
const Base_de_datos = require('better-sqlite3');

const ruta_bd = camino.join('/tmp', 'thunder.db');
const base_de_datos = new Base_de_datos(ruta_bd);
base_de_datos.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'espectador',   -- espectador | creador | moderador
  kyc_verified INTEGER NOT NULL DEFAULT 0,
  monedas_verdes INTEGER NOT NULL DEFAULT 500,
  monedas_doradas INTEGER NOT NULL DEFAULT 0,
  balance_canjeable REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  category TEXT DEFAULT 'General',
  status TEXT NOT NULL DEFAULT 'offline',    -- offline | en_vivo | finalizado
  source_urls TEXT DEFAULT '[]',              -- JSON array: enlaces/IDs de las fuentes (multi-live)
  overlay_gifts INTEGER NOT NULL DEFAULT 1,
  overlay_alert INTEGER NOT NULL DEFAULT 1,
  overlay_logo_url TEXT DEFAULT '',
  viewers INTEGER NOT NULL DEFAULT 0,
  started_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  room_id TEXT NOT NULL REFERENCES rooms(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, room_id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(id),
  channel TEXT NOT NULL DEFAULT 'general',    -- general | vip
  user_id TEXT NOT NULL REFERENCES users(id),
  username TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS gifts_catalog (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL,
  tier TEXT NOT NULL,       -- basico | medio | vip
  currency TEXT NOT NULL,   -- verde | dorada
  cost INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS gift_events (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(id),
  sender_id TEXT NOT NULL REFERENCES users(id),
  sender_name TEXT NOT NULL,
  gift_id TEXT NOT NULL REFERENCES gifts_catalog(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  currency TEXT NOT NULL,
  cost_total INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ads (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  model TEXT NOT NULL,        -- cpc | cpm
  placement TEXT NOT NULL,    -- banner | destacado | interrupcion
  daily_budget REAL NOT NULL,
  destination_url TEXT NOT NULL,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  spend REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cashout_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  amount REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendiente',  -- pendiente | pagado | rechazado
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  video_url TEXT NOT NULL,
  duration_label TEXT NOT NULL DEFAULT '1 hora', -- 1 hora | 2 horas | 3 horas | 4 horas | 4+ horas
  category TEXT DEFAULT 'Gaming',
  views INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payment_intents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  gold_amount INTEGER NOT NULL,
  price REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendiente',   -- pendiente | aprobado | rechazado
  provider TEXT NOT NULL DEFAULT 'mercadopago',
  provider_payment_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// Semilla del catálogo de regalos (solo si está vacío)
const giftCount = db.prepare('SELECT COUNT(*) c FROM gifts_catalog').get().c;
if (giftCount === 0) {
  const insertGift = db.prepare(
    'INSERT INTO gifts_catalog (id, name, emoji, tier, currency, cost) VALUES (?,?,?,?,?,?)'
  );
  const seed = [
    ['g_rosa', 'Rosa', '🌹', 'basico', 'verde', 20],
    ['g_chispa', 'Chispa', '✨', 'basico', 'verde', 35],
    ['g_carita', 'Carita feliz', '😊', 'basico', 'verde', 15],
    ['g_trebol', 'Trébol', '🍀', 'basico', 'verde', 25],
    ['g_corazon', 'Corazón dorado', '💛', 'medio', 'dorada', 150],
    ['g_estrella', 'Estrella fugaz', '🌠', 'medio', 'dorada', 220],
    ['g_fuegos', 'Fuegos', '🎆', 'medio', 'dorada', 180],
    ['g_rayo3d', 'Rayo 3D', '⚡', 'vip', 'dorada', 900],
    ['g_thunderbird', 'Thunderbird', '🦅', 'vip', 'dorada', 1500],
    ['g_lluvia', 'Lluvia de rayos', '🌩️', 'vip', 'dorada', 2200],
  ];
  const tx = db.transaction((rows) => rows.forEach((r) => insertGift.run(...r)));
  tx(seed);
}

module.exports = db;
