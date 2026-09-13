const express = require('express');
const { v4: uuid } = require('uuid');
const db = require('../db');
const config = require('../config');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Paquetes de Thunderbolt Dorados en venta. Ajusta precios/cantidades a gusto.
// priceUSD es lo que se cobra vía PayPal (fuera de Perú); price es en Soles (MercadoPago).
const GOLD_PACKAGES = [
  { id: 'pack_500', gold: 500, price: 15, priceUSD: 4 },
  { id: 'pack_1200', gold: 1200, price: 30, priceUSD: 8 },
  { id: 'pack_3000', gold: 3000, price: 65, priceUSD: 17 },
];

router.get('/gold-packages', (req, res) => res.json(GOLD_PACKAGES));

// Crea la orden de pago y devuelve la URL del checkout de MercadoPago.
router.post('/checkout', requireAuth, async (req, res) => {
  const { packageId } = req.body || {};
  const pack = GOLD_PACKAGES.find((p) => p.id === packageId);
  if (!pack) return res.status(400).json({ error: 'Paquete de monedas no válido' });

  if (config.PAYMENTS.PROVIDER !== 'mercadopago' || !config.PAYMENTS.MERCADOPAGO_ACCESS_TOKEN) {
    return res.status(402).json({
      error: 'La pasarela de pago aún no está configurada',
      hint: 'Pega tu MERCADOPAGO_ACCESS_TOKEN y PAYMENTS_PROVIDER=mercadopago en el archivo .env (ver README, sección de pagos).',
    });
  }

  const intentId = uuid();
  db.prepare(
    `INSERT INTO payment_intents (id, user_id, gold_amount, price, provider) VALUES (?,?,?,?,'mercadopago')`
  ).run(intentId, req.user.id, pack.gold, pack.price);

  try {
    const mpRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.PAYMENTS.MERCADOPAGO_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        items: [
          {
            title: `${pack.gold} Thunderbolt Dorados — Thunder`,
            quantity: 1,
            currency_id: 'PEN',
            unit_price: pack.price,
          },
        ],
        external_reference: intentId,
        back_urls: {
          success: `${config.APP_BASE_URL}/?pago=exito`,
          failure: `${config.APP_BASE_URL}/?pago=fallo`,
          pending: `${config.APP_BASE_URL}/?pago=pendiente`,
        },
        auto_return: 'approved',
        notification_url: `${config.APP_BASE_URL}/api/payments/webhook/mercadopago`,
      }),
    });
    const data = await mpRes.json();
    if (!mpRes.ok) {
      console.error('Error de MercadoPago:', data);
      return res.status(502).json({ error: 'MercadoPago rechazó la solicitud', detail: data.message || data });
    }
    res.json({ checkoutUrl: data.init_point, intentId });
  } catch (e) {
    console.error(e);
    res.status(502).json({ error: 'No se pudo contactar a MercadoPago' });
  }
});

// Webhook: MercadoPago llama aquí solo (no el navegador del usuario) cuando el
// pago cambia de estado. Volvemos a consultar el pago directamente a la API
// de MercadoPago con nuestro token antes de acreditar nada — así nadie puede
// falsificar una notificación desde afuera.
router.post('/webhook/mercadopago', express.json(), async (req, res) => {
  try {
    const paymentId = req.query['data.id'] || req.body?.data?.id || req.query.id;
    const topic = req.query.topic || req.body?.type;
    if (topic !== 'payment' || !paymentId) return res.sendStatus(200);

    const verifyRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${config.PAYMENTS.MERCADOPAGO_ACCESS_TOKEN}` },
    });
    const payment = await verifyRes.json();
    const intentId = payment.external_reference;
    const intent = db.prepare('SELECT * FROM payment_intents WHERE id = ?').get(intentId);
    if (!intent || intent.status === 'aprobado') return res.sendStatus(200);

    if (payment.status === 'approved') {
      db.prepare('UPDATE users SET monedas_doradas = monedas_doradas + ? WHERE id = ?').run(intent.gold_amount, intent.user_id);
      db.prepare('UPDATE payment_intents SET status = ?, provider_payment_id = ? WHERE id = ?').run('aprobado', String(paymentId), intent.id);
      req.app.get('io')?.to(intent.user_id).emit('wallet:updated', {});
    } else if (['rejected', 'cancelled'].includes(payment.status)) {
      db.prepare('UPDATE payment_intents SET status = ?, provider_payment_id = ? WHERE id = ?').run('rechazado', String(paymentId), intent.id);
    }
    res.sendStatus(200);
  } catch (e) {
    console.error('Error en webhook de MercadoPago:', e);
    res.sendStatus(200); // respondemos 200 igual para que MP no reintente indefinidamente
  }
});

// El cliente consulta esto tras volver del checkout para saber si ya se acreditó
router.get('/status/:intentId', requireAuth, (req, res) => {
  const intent = db.prepare('SELECT * FROM payment_intents WHERE id = ? AND user_id = ?').get(req.params.intentId, req.user.id);
  if (!intent) return res.status(404).json({ error: 'No encontrado' });
  res.json({ status: intent.status });
});

// =====================================================================
// PAYPAL — para cobrar a espectadores fuera de Perú, en dólares.
// A diferencia de Stripe, sí se puede abrir como negocio desde Perú.
// =====================================================================
const PAYPAL_BASE = () =>
  config.PAYMENTS.PAYPAL_MODE === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';

async function getPaypalToken() {
  const auth = Buffer.from(`${config.PAYMENTS.PAYPAL_CLIENT_ID}:${config.PAYMENTS.PAYPAL_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(`${PAYPAL_BASE()}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || 'No se pudo autenticar con PayPal');
  return data.access_token;
}

// Crea la orden en PayPal y devuelve el enlace de aprobación (a donde se redirige al usuario)
router.post('/paypal/checkout', requireAuth, async (req, res) => {
  const { packageId } = req.body || {};
  const pack = GOLD_PACKAGES.find((p) => p.id === packageId);
  if (!pack) return res.status(400).json({ error: 'Paquete de monedas no válido' });

  if (!config.PAYMENTS.PAYPAL_CLIENT_ID || !config.PAYMENTS.PAYPAL_CLIENT_SECRET) {
    return res.status(402).json({
      error: 'PayPal aún no está configurado',
      hint: 'Pega tu PAYPAL_CLIENT_ID y PAYPAL_CLIENT_SECRET en el archivo .env (ver README, sección de pagos).',
    });
  }

  const intentId = uuid();
  db.prepare(
    `INSERT INTO payment_intents (id, user_id, gold_amount, price, provider) VALUES (?,?,?,?,'paypal')`
  ).run(intentId, req.user.id, pack.gold, pack.priceUSD);

  try {
    const token = await getPaypalToken();
    const orderRes = await fetch(`${PAYPAL_BASE()}/v2/checkout/orders`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: intentId,
            description: `${pack.gold} Thunderbolt Dorados — Thunder`,
            amount: { currency_code: 'USD', value: pack.priceUSD.toFixed(2) },
          },
        ],
        application_context: {
          return_url: `${config.APP_BASE_URL}/api/payments/paypal/capture?intentId=${intentId}`,
          cancel_url: `${config.APP_BASE_URL}/?pago=cancelado`,
          user_action: 'PAY_NOW',
          brand_name: 'Thunder',
        },
      }),
    });
    const order = await orderRes.json();
    if (!orderRes.ok) {
      console.error('Error de PayPal:', order);
      return res.status(502).json({ error: 'PayPal rechazó la solicitud', detail: order.message || order });
    }
    db.prepare('UPDATE payment_intents SET provider_payment_id = ? WHERE id = ?').run(order.id, intentId);
    const approveLink = order.links.find((l) => l.rel === 'approve')?.href;
    res.json({ checkoutUrl: approveLink, intentId });
  } catch (e) {
    console.error(e);
    res.status(502).json({ error: 'No se pudo contactar a PayPal' });
  }
});

// El usuario vuelve aquí después de aprobar el pago en PayPal. Capturamos el
// pago llamando directamente a la API de PayPal con nuestras credenciales —
// nunca acreditamos solo por lo que diga la URL de retorno.
router.get('/paypal/capture', async (req, res) => {
  const { token: orderId, intentId } = req.query;
  const intent = db.prepare('SELECT * FROM payment_intents WHERE id = ?').get(intentId);
  if (!intent) return res.redirect(`${config.APP_BASE_URL}/?pago=error`);

  try {
    const authToken = await getPaypalToken();
    const captureRes = await fetch(`${PAYPAL_BASE()}/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
    });
    const capture = await captureRes.json();
    const status = capture.status || capture.purchase_units?.[0]?.payments?.captures?.[0]?.status;

    if (captureRes.ok && (status === 'COMPLETED' || status === 'APPROVED')) {
      if (intent.status !== 'aprobado') {
        db.prepare('UPDATE users SET monedas_doradas = monedas_doradas + ? WHERE id = ?').run(intent.gold_amount, intent.user_id);
        db.prepare(`UPDATE payment_intents SET status='aprobado' WHERE id=?`).run(intent.id);
      }
      return res.redirect(`${config.APP_BASE_URL}/?pago=exito`);
    }
    db.prepare(`UPDATE payment_intents SET status='rechazado' WHERE id=?`).run(intent.id);
    res.redirect(`${config.APP_BASE_URL}/?pago=fallo`);
  } catch (e) {
    console.error('Error capturando pago de PayPal:', e);
    res.redirect(`${config.APP_BASE_URL}/?pago=error`);
  }
});

// =====================================================================
// CONVERSOR DE MONEDA (solo visual) — para mostrar "≈ $X USD" al lado de
// los precios en Soles. No mueve dinero real; el cobro siempre lo procesa
// MercadoPago o PayPal en su propia moneda. Se cachea 1 hora para no
// martillar la API externa gratuita.
// =====================================================================
let fxCache = { rate: null, ts: 0 };
router.get('/fx-rate', async (req, res) => {
  const ONE_HOUR = 60 * 60 * 1000;
  if (fxCache.rate && Date.now() - fxCache.ts < ONE_HOUR) {
    return res.json({ penToUsd: fxCache.rate, cached: true });
  }
  try {
    const r = await fetch('https://api.frankfurter.app/latest?from=PEN&to=USD');
    const data = await r.json();
    const rate = data.rates?.USD;
    if (!rate) throw new Error('Sin tasa');
    fxCache = { rate, ts: Date.now() };
    res.json({ penToUsd: rate, cached: false });
  } catch (e) {
    res.json({ penToUsd: null }); // el frontend simplemente oculta el equivalente si no hay tasa
  }
});

module.exports = router;
