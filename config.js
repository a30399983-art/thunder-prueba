// config.js — CENTRO DE CONFIGURACIÓN DE THUNDER
// ---------------------------------------------------------------
// Aquí, y solo aquí, pegas tus propias claves cuando las tengas.
// Nada de esto se puede generar por ti: son cuentas que TÚ debes
// abrir con cada proveedor. Mientras no las pongas, el sistema
// sigue funcionando en "modo demo" (simulado) donde corresponda.
// ---------------------------------------------------------------
require('dotenv').config();

module.exports = {
  // Puerto del servidor y origen permitido (tu dominio en producción)
  PORT: process.env.PORT || 4000,
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',

  // Cambia esto por un texto largo y aleatorio antes de publicar en producción
  JWT_SECRET: process.env.JWT_SECRET || 'thunder-dev-secret-cambiar-en-produccion',

  // La URL pública real de tu web una vez publicada (ej. https://thunder.onrender.com
  // o https://www.thunder.pe). MercadoPago la necesita para avisarte cuando alguien
  // paga (webhook) y para saber a dónde devolver al usuario tras pagar.
  APP_BASE_URL: process.env.APP_BASE_URL || 'http://localhost:4000',

  // ------------------------------------------------------------
  // 1) PASARELA DE PAGO (para comprar Thunderbolt Dorados y para
  //    pagar los canjes de los creadores). En Perú lo más común es
  //    Culqi o MercadoPago. Abre una cuenta de negocio con
  //    cualquiera de las dos, y pega aquí sus llaves:
  // ------------------------------------------------------------
  PAYMENTS: {
    PROVIDER: process.env.PAYMENTS_PROVIDER || null, // 'culqi' | 'mercadopago' | null (demo)
    CULQI_PUBLIC_KEY: process.env.CULQI_PUBLIC_KEY || '',
    CULQI_SECRET_KEY: process.env.CULQI_SECRET_KEY || '',
    MERCADOPAGO_ACCESS_TOKEN: process.env.MERCADOPAGO_ACCESS_TOKEN || '',
    // PayPal — para cobrar a espectadores fuera de Perú, en dólares u otras monedas.
    // Se puede abrir como negocio directamente desde Perú (a diferencia de Stripe).
    PAYPAL_CLIENT_ID: process.env.PAYPAL_CLIENT_ID || '',
    PAYPAL_CLIENT_SECRET: process.env.PAYPAL_CLIENT_SECRET || '',
    PAYPAL_MODE: process.env.PAYPAL_MODE || 'sandbox', // 'sandbox' (pruebas) | 'live' (real)
  },

  // ------------------------------------------------------------
  // 2) VERIFICACIÓN DE IDENTIDAD (KYC) para que un creador pueda
  //    canjear dinero real. Proveedores usados en LatAm: Truora,
  //    Didit, Metamap, Onfido. Pega aquí tu API key cuando la
  //    tengas — mientras tanto, el botón de KYC queda simulado.
  // ------------------------------------------------------------
  KYC: {
    PROVIDER: process.env.KYC_PROVIDER || null, // 'truora' | 'didit' | 'metamap' | null (demo)
    API_KEY: process.env.KYC_API_KEY || '',
  },

  // ------------------------------------------------------------
  // 3) SERVIDOR DE VIDEO / STREAMING.
  //    Thunder ya soporta AHORA MISMO, sin nada adicional:
  //      a) Transmitir con la cámara del navegador (WebRTC local).
  //      b) Insertar el enlace/ID de un vivo ya existente en una
  //         plataforma que permita "embed" (YouTube Live, Kick,
  //         Twitch) — se muestra directo dentro del stage.
  //    Para que MUCHOS espectadores vean a la vez una transmisión
  //    que sale directo de la cámara/RTMP de un creador (sin pasar
  //    por YouTube/Kick), se necesita un servidor de medios (SFU):
  //    LiveKit, Mux, Cloudflare Stream o un mediasoup propio.
  //    Cuando tengas ese servidor, pega su URL/clave aquí:
  // ------------------------------------------------------------
  STREAMING: {
    SFU_URL: process.env.STREAMING_SFU_URL || '',      // ej: wss://tu-livekit.tudominio.com
    SFU_API_KEY: process.env.STREAMING_SFU_API_KEY || '',
    RTMP_INGEST_URL: process.env.RTMP_INGEST_URL || '', // si usas tu propio servidor RTMP
  },
};
