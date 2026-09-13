# ⚡ Thunder — Backend + Frontend completo

Plataforma de streaming en vivo, comunidades tipo Discord (Thunder Vips),
marketplace con anuncios (Thunder Place) y economía de regalos (Thunder Birds).

Esto ya **no es una maqueta**: es una aplicación real con servidor, base de
datos y tiempo real por WebSocket, probada de punta a punta.

---

## 1. Qué funciona ya, de verdad, sin configurar nada más

- **Logo propio**: el "thornado" (tornado + rayo) con el wordmark THUNDER debajo,
  en el ícono de la pestaña del navegador, en el login y en la barra lateral.
- **Registro e inicio de sesión reales** (contraseñas cifradas, sesión con JWT).
- **Base de datos real** (SQLite en `data/thunder.db`) con usuarios, salas,
  suscripciones, mensajes de chat, regalos, videos, anuncios y solicitudes de canje.
- **Chat en vivo real** (general y VIP-only) vía WebSocket — lo que escribes
  lo ven todos los que están conectados a esa sala, y queda guardado.
- **Canal de voz** con presencia en tiempo real (unirse, silenciar, pedir la
  palabra). El audio en sí viaja por WebRTC del navegador.
- **Regalos reales**: descuentan tu saldo de verdad en la base de datos y
  disparan la animación correspondiente a todos los que están viendo
  (chiquito a un costado / grande a pantalla completa, según el nivel).
- **Billetera real**: Monedas Verdes, Thunderbolt Dorados, y panel de cobro
  con sus reglas (mínimo de canje, comisión, KYC).
- **Ir en vivo sin OBS**: pega el enlace/ID de donde ya estás transmitiendo
  (YouTube, Kick, Twitch, TikTok) y si es un enlace de YouTube se incrusta
  como video real dentro de Thunder. También puedes transmitir directo con
  la cámara de tu navegador (sin ningún programa externo).
- **Videos / VODs de cualquier duración**: cualquier creador (gamers incluidos)
  puede publicar un video de 1, 2, 3, 4 horas o más. El reproductor NUNCA
  corta el video antes de tiempo — la "duración" es solo una etiqueta para
  el catálogo; la reproducción siempre llega hasta el final de la fuente.
- **Gestor de anuncios real**: crear anuncios, guardarlos en base de datos,
  listarlos.
- **Seguridad de base ya activada**: cabeceras de seguridad (Helmet),
  compresión de respuestas, límite de peticiones por minuto (anti-abuso) y
  un límite más estricto en login/registro (anti fuerza-bruta). El
  `JWT_SECRET` se genera solo, al azar, la primera vez que corres el
  servidor — no necesitas inventarlo tú.

## 2. Qué necesita TUS propias credenciales (no se puede generar por ti)

Todo esto tiene su "enchufe" ya listo en **`config.js`** (y en `.env`).
Mientras no lo completes, el sistema sigue funcionando en modo demo/seguro:

| Necesitas configurar | Para qué | Dónde pegarlo |
|---|---|---|
| Culqi o MercadoPago (cuenta de negocio) | Cobrar la compra de Thunderbolt Dorados y pagar los canjes | `.env` → `PAYMENTS_PROVIDER`, `MERCADOPAGO_ACCESS_TOKEN` |
| Un proveedor de KYC (Truora, Didit, Metamap) | Verificar identidad real antes de dejar canjear dinero | `.env` → `KYC_PROVIDER`, `KYC_API_KEY` |
| Un servidor de medios (LiveKit, Mux, Cloudflare Stream, o tu propio mediasoup/RTMP) | Que una transmisión de cámara/RTMP la vean MUCHOS espectadores a la vez, no solo tú | `.env` → `STREAMING_SFU_URL`, etc. |
| Tu dominio propio | Publicarlo con una URL fija (ej. `thunder.pe`) | Se configura en tu hosting, no en el código |

**Importante y honesto:** ningún chat de IA puede abrirte esas cuentas por
ti — son trámites que hace una persona o empresa directamente con el
proveedor (regularmente piden tu RUC/DNI, cuenta bancaria, etc.). Lo que sí
te dejo es el código ya escrito y con el punto exacto donde va cada clave,
para que cuando las tengas, sea copiar y pegar.

### Cómo activar el cobro real con MercadoPago (ya está integrado)

1. Crea tu cuenta en [mercadopago.com.pe](https://www.mercadopago.com.pe)
   como cuenta de negocio.
2. Entra a **mercadopago.com.pe/developers/panel** → "Crear aplicación" →
   modelo **Checkout Pro**.
3. Copia el **Access Token** (empieza probando con el de "credenciales de
   prueba").
4. En tu `.env`, pon:
   ```
   PAYMENTS_PROVIDER=mercadopago
   MERCADOPAGO_ACCESS_TOKEN=el_token_que_copiaste
   APP_BASE_URL=https://tu-dominio-real.com
   ```
   `APP_BASE_URL` es indispensable: es la URL pública donde MercadoPago te
   avisa cuando alguien paga. **No funciona con `localhost`** — necesitas
   tenerlo ya publicado (ver sección 4) antes de que los webhooks lleguen.
5. Reinicia el servidor. El botón "Comprar más" de la Billetera ya va a
   abrir el checkout real de MercadoPago, y en cuanto el pago se apruebe,
   las Thunderbolt Dorados se acreditan solas — el servidor verifica el
   pago directamente con MercadoPago antes de entregar nada, así nadie
   puede inventarse un pago falso.

### Cómo activar el cobro en dólares con PayPal (para fuera de Perú, ya integrado)

Stripe no se puede abrir directamente desde Perú sin crear una empresa en
EE.UU., así que para cobrar internacionalmente sin ese trámite, ya dejé
PayPal conectado — sí se puede abrir como negocio desde Perú.

1. Crea una cuenta de negocio en [paypal.com](https://www.paypal.com).
2. Entra a [developer.paypal.com/dashboard/applications](https://developer.paypal.com/dashboard/applications)
   → "Create App".
3. Copia el **Client ID** y el **Secret**.
4. En tu `.env`, pon:
   ```
   PAYPAL_CLIENT_ID=tu_client_id
   PAYPAL_CLIENT_SECRET=tu_secret
   PAYPAL_MODE=sandbox
   ```
   Deja `PAYPAL_MODE=sandbox` mientras pruebas (no cobra de verdad). Cuando
   todo funcione, cámbialo a `PAYPAL_MODE=live`.
5. Reinicia el servidor. En la hoja de "Comprar Thunderbolt Dorados" ahora
   aparecen dos botones por paquete: 🇵🇪 MercadoPago (Soles) y 🌎 PayPal
   (dólares) — el espectador elige el que le convenga. El servidor siempre
   vuelve a confirmar el pago directo con PayPal antes de acreditar nada.

**MercadoPago y PayPal funcionan en paralelo, no hace falta elegir uno.**
Ambos pueden estar configurados al mismo tiempo.

### El conversor de moneda (solo visual, no mueve dinero)

Ya agregué un endpoint (`/api/payments/fx-rate`) que trae la tasa Soles→Dólar
de una API gratuita y la cachea 1 hora, para mostrar el equivalente
aproximado (ej. "≈ $4 USD") al lado del balance en Soles en la Billetera.
No necesitas configurar nada para esto — funciona solo en cuanto el
servidor tenga salida normal a internet (cualquier hosting real la tiene).
Esto es puramente informativo: el cobro real siempre lo hace MercadoPago en
Soles o PayPal en dólares, nunca este conversor.

---

## 3. Cómo correrlo en tu computadora (para probarlo ya)

```bash
cd thunder-backend
npm install
cp .env.example .env
npm start
```

Abre `http://localhost:4000` en tu navegador. Regístrate como "Creador",
entra a Thunder Birds, dale a "🎥 Iniciar transmisión" y prueba tu cámara.
Abre una segunda pestaña (o el navegador de tu celular en la misma red) para
ver el chat y los regalos llegando en tiempo real entre las dos.

## 4. Cómo publicarlo en la web de verdad (con URL pública)

Ya dejé los archivos de despliegue listos (`Procfile`, `render.yaml`,
`railway.json`) para que sea prácticamente un clic:

1. Crea una cuenta gratis en **Railway.app** o **Render.com**.
2. Sube esta carpeta a un repositorio de GitHub (o usa "deploy desde
   carpeta" que ambos ofrecen).
3. En Render: elige "New → Blueprint" y selecciona el repo — leerá
   `render.yaml` solo y generará el `JWT_SECRET` automáticamente.
   En Railway: "New Project → Deploy from GitHub" — detecta Node.js solo.
4. Si más adelante tienes tu pasarela de pago o KYC, agrega esas variables
   en el panel de "Environment/Variables" del hosting (mismos nombres que
   en `.env.example`).
5. Te dan una URL pública al toque (ej. `https://thunder.onrender.com`).
   Si quieres tu propio dominio (ej. `www.thunder.pe`), lo conectas desde
   ese mismo panel en 2 minutos (apuntando un CNAME).

Alternativa con más control (y más trabajo): alquilar un VPS (DigitalOcean,
Hetzner, AWS Lightsail), instalar Node.js, clonar el proyecto, y correrlo
detrás de Nginx con PM2 para que se mantenga siempre encendido.

**Importante sobre la base de datos en producción:** SQLite guarda todo en
un archivo (`data/thunder.db`). El `render.yaml` de este proyecto viene
configurado para el **plan gratis de Render** (que no permite discos
persistentes) — así que ahora mismo la base de datos se reinicia cada vez
que el servicio se actualiza o reinicia. Para probar y lanzar ya, no hay
problema. Cuando quieras que los datos (usuarios, saldos, chat) queden
guardados para siempre, sube el servicio al plan "Starter" de Render y
descomenta el bloque `disk:` que dejé como comentario dentro de
`render.yaml` (con instrucciones ahí mismo). En Railway, el equivalente es
agregar un volumen apuntando a la carpeta `data/` (si tu plan lo permite).

## 5. Estructura del proyecto

```
thunder-backend/
  server.js          → servidor Express + Socket.io (tiempo real, seguridad)
  db.js              → esquema y conexión a la base de datos SQLite
  config.js          → CENTRO de configuración (tus claves van aquí vía .env)
  Procfile / render.yaml / railway.json → despliegue de un clic
  middleware/auth.js → verificación de sesión (JWT)
  routes/
    auth.js          → registro, login, KYC
    wallet.js        → monedas, compra, canje
    rooms.js         → salas en vivo, suscripciones, anuncios
    gifts.js         → catálogo de regalos
    videos.js        → VODs de cualquier duración (1, 2, 3, 4+ horas)
  public/
    index.html       → todo el frontend (una sola página, con el logo Thunder)
  data/
    thunder.db       → tu base de datos (se crea sola al iniciar)
```

## 6. Modelo de datos (resumen)

- **users**: cuenta, rol (espectador/creador), monedas, KYC.
- **rooms**: una sala por creador, con sus fuentes de transmisión y overlays.
- **subscriptions**: quién es VIP de qué sala.
- **chat_messages**: historial de chat, separado por canal (general/vip).
- **gifts_catalog** / **gift_events**: catálogo y cada regalo enviado.
- **videos**: VODs publicados (título, enlace, duración informativa, categoría).
- **ads**: anuncios publicados en Thunder Place.
- **cashout_requests**: solicitudes de canje de los creadores.

## 7. Seguridad antes de publicar en producción (checklist)

- [ ] Cambia `JWT_SECRET` por un valor propio y largo.
- [ ] Pon `CORS_ORIGIN` con tu dominio real (no `*`) una vez que lo tengas.
- [ ] Conecta un proveedor de pago real antes de permitir compras reales.
- [ ] Conecta un proveedor de KYC real antes de permitir canjes reales.
- [ ] Considera pasar de SQLite a PostgreSQL si esperas mucho tráfico
      simultáneo (SQLite es perfecto para arrancar, no para millones de
      usuarios a la vez).
