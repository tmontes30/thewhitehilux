// Funciones de Firebase de la tienda The White Hilux (región São Paulo).
//  - crearPreferencia: recibe el carrito, recalcula precios y stock, guarda el pedido y crea el pago en Mercado Pago
//    (Checkout Pro con la API de Orders: POST /v1/orders → checkout_url).
//  - webhook: Mercado Pago avisa los pagos (evento "Order"); si está aprobado (processed/accredited) marca el pedido
//    pagado, calcula la promesa de entrega, descuenta stock y manda correos. Es idempotente: un aviso repetido no
//    descuenta ni manda correos dos veces.
//  - alertaEntregas: cada mañana avisa (correo + notificación push) los pedidos que vencen en 2 días o menos.
//  - probarPush: manda una notificación de prueba a los dispositivos del admin (pide sesión de admin).
//  Push: los dispositivos se suscriben desde el panel (Ajustes → Notificaciones) y quedan en pushSubs/*.
//
// El código compartido con la tienda (shared/) se copia desde web/ con `node sync.js` (corre solo antes de deploy).

const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { setGlobalOptions, logger } = require('firebase-functions/v2');
const { defineSecret, defineString } = require('firebase-functions/params');
const admin = require('firebase-admin');
const { FieldPath, FieldValue } = require('firebase-admin/firestore');
const { MercadoPagoConfig, Order, Payment, WebhookSignatureValidator } = require('mercadopago');
const webpush = require('web-push');

const base = require('./shared/catalog.js');
const core = require('./shared/core.js');
const { buildOrder, priceCart, couponCode, newOrderId, toMercadoPagoItems, OrderError } = require('./shared/order.js');
const { orderHtml, alertHtml, sendEmail } = require('./shared/email.js');

admin.initializeApp();
const db = admin.firestore();

const REGION = 'southamerica-east1';
setGlobalOptions({ region: REGION, maxInstances: 5 });

const MP_ACCESS_TOKEN = defineSecret('MP_ACCESS_TOKEN');
const MP_WEBHOOK_SECRET = defineSecret('MP_WEBHOOK_SECRET'); // "none" = sin validar firma
const RESEND_API_KEY = defineSecret('RESEND_API_KEY'); // "none" = sin correos
const SITE_URL = defineString('SITE_URL', { default: 'https://thewhitehilux.cavedevz.com' });
const ORDER_EMAIL = defineString('ORDER_EMAIL', { default: 'tmontes30@gmail.com' });
const RESEND_FROM = defineString('RESEND_FROM', { default: 'The White Hilux <onboarding@resend.dev>' });
const VAPID_PRIVATE_KEY = defineSecret('VAPID_PRIVATE_KEY');
const VAPID_PUBLIC_KEY = defineString('VAPID_PUBLIC_KEY');
const ADMINS = ['tmontes30@gmail.com'];

const EMULATOR = process.env.FUNCTIONS_EMULATOR === 'true';
const CATALOG = db.doc('tienda/catalogo');
const ORDERS = db.collection('pedidos');
const COUPONS = db.collection('cupones');
const PUSH_SUBS = db.collection('pushSubs');
const PAID = ['pagado', 'preparando', 'despachado', 'entregado'];

const secret = (s) => {
  const v = (s.value() || '').trim();
  return v && v !== 'none' ? v : '';
};
const mail = () => ({ key: secret(RESEND_API_KEY), from: RESEND_FROM.value() });

async function loadCatalog(tx) {
  const snap = tx ? await tx.get(CATALOG) : await CATALOG.get();
  return { snap, data: core.mergeCatalog(base, snap.exists ? snap.data() : null) };
}

// Cupón por código (colección privada cupones/{CODIGO})
async function findCoupon(raw) {
  const code = couponCode(raw);
  if (!code) return { code: '', coupon: null };
  const snap = await COUPONS.doc(code).get();
  return { code, coupon: snap.exists ? snap.data() : null };
}

// Cuerpo de la order de Mercado Pago (CLP sin decimales, montos como texto; el envío va como un ítem más)
function mpOrderBody(orderId, order, siteUrl) {
  const [firstName, ...rest] = order.customer.name.split(/\s+/);
  const items = toMercadoPagoItems(order).map((i) => ({
    external_code: i.code.slice(0, 30), // máx. 30
    title: i.title.slice(0, 150),
    quantity: i.quantity,
    unit_price: String(i.unit_price),
  }));
  const payer = { email: order.customer.email, first_name: firstName };
  if (rest.length) payer.last_name = rest.join(' ');
  return {
    type: 'online',
    processing_mode: 'manual',
    total_amount: String(Math.round(order.total)),
    external_reference: orderId,
    description: `Pedido ${orderId} · The White Hilux`,
    expiration_time: 'P1D',
    payer,
    items,
    config: {
      statement_descriptor: 'THEWHITEHILUX',
      online: {
        success_url: `${siteUrl}/gracias.html`,
        pending_url: `${siteUrl}/pago-pendiente.html`,
        failure_url: `${siteUrl}/pago-fallido.html`,
        auto_return: 'approved',
      },
    },
  };
}
exports._mpOrderBody = mpOrderBody;

// ---------- crearPreferencia ----------
exports.crearPreferencia = onRequest(
  {
    cors: [/thewhitehilux\.cavedevz\.com$/, /tmontes30\.github\.io$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/],
    secrets: [MP_ACCESS_TOKEN],
  },
  async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido.' });
    const body = typeof req.body === 'string' ? safeJson(req.body) : req.body;

    const { data } = await loadCatalog();
    let order;
    try {
      const { code, coupon } = await findCoupon(body && body.coupon);
      order = buildOrder(body, data.products, data.config, { couponCode: code, coupon, today: core.todayCL() });
    } catch (err) {
      if (err instanceof OrderError) return res.status(400).json({ error: err.message });
      throw err;
    }

    const orderId = newOrderId();
    const token = secret(MP_ACCESS_TOKEN);
    const siteUrl = SITE_URL.value().replace(/\/$/, '');

    await ORDERS.doc(orderId).set({
      id: orderId,
      status: 'pendiente_pago',
      createdAt: FieldValue.serverTimestamp(),
      createdDate: core.todayCL(),
      customer: order.customer,
      shipping: order.shipping,
      lines: order.lines,
      subtotal: order.subtotal,
      discount: order.discount || null,
      total: order.total,
    });

    // En los emuladores sin token de Mercado Pago: simula el pago para poder probar todo el flujo
    if (!token && EMULATOR) {
      return res.json({ order_id: orderId, init_point: `gracias.html?external_reference=${orderId}&simulado=1`, total: order.total });
    }
    if (!token) return res.status(500).json({ error: 'La tienda aún no tiene configurado Mercado Pago.' });

    try {
      const client = new MercadoPagoConfig({ accessToken: token });
      const mp = await new Order(client).create({ body: mpOrderBody(orderId, order, siteUrl), requestOptions: { idempotencyKey: orderId } });
      if (!mp.checkout_url) throw new Error('Mercado Pago no devolvió checkout_url');
      await ORDERS.doc(orderId).update({ mpOrderId: String(mp.id || '') });
      logger.info('[pedido creado]', orderId, order.total, mp.id);
      return res.json({ order_id: orderId, init_point: mp.checkout_url, total: order.total });
    } catch (err) {
      logger.error('[mercadopago] error al crear la order', (err && err.message) || err, err && err.errors ? JSON.stringify(err.errors) : '');
      await ORDERS.doc(orderId).delete().catch(() => {});
      return res.status(502).json({ error: 'No pudimos conectar con Mercado Pago. Intenta de nuevo en unos minutos.' });
    }
  }
);

// ---------- validarCupon (vista previa del descuento en el carrito) ----------
exports.validarCupon = onRequest(
  { cors: [/thewhitehilux\.cavedevz\.com$/, /tmontes30\.github\.io$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/] },
  async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido.' });
    const body = (typeof req.body === 'string' ? safeJson(req.body) : req.body) || {};
    try {
      const { data } = await loadCatalog();
      const { code, coupon } = await findCoupon(body.coupon);
      if (!code) return res.status(400).json({ error: 'Escribe un código.' });
      const cart = priceCart(body.items, data.products, data.config, { couponCode: code, coupon, today: core.todayCL() });
      return res.json({ ok: true, code, label: cart.discount.label, amount: cart.discount.amount, subtotal: cart.subtotal });
    } catch (err) {
      if (err instanceof OrderError) return res.status(400).json({ error: err.message });
      throw err;
    }
  }
);

// ---------- seguimiento (página pública "Sigue tu pedido") ----------
// Responde solo si el número de pedido y el correo coinciden. Devuelve lo mínimo: estado, fechas y despacho
// (sin dirección completa ni teléfono), para que nadie pueda ver pedidos ajenos adivinando números.
exports.seguimiento = onRequest(
  { cors: [/thewhitehilux\.cavedevz\.com$/, /tmontes30\.github\.io$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/] },
  async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido.' });
    const body = (typeof req.body === 'string' ? safeJson(req.body) : req.body) || {};
    const id = String(body.id || '').trim().toUpperCase().replace(/\s+/g, '').slice(0, 40);
    const email = String(body.email || '').trim().toLowerCase().slice(0, 120);
    const notFound = () => res.status(404).json({ error: 'No encontramos un pedido con ese número y correo. Revisa que estén igual que en el correo de tu compra.' });
    if (!/^TWH-[A-Z0-9]+-[A-Z0-9]+$/.test(id) || !email) return notFound();
    const snap = await ORDERS.doc(id).get();
    if (!snap.exists) return notFound();
    const o = snap.data();
    if (((o.customer && o.customer.email) || '').toLowerCase() !== email) return notFound();
    const s = o.shipping || {};
    return res.json({
      id,
      status: o.status,
      createdDate: o.createdDate || '',
      paidDate: o.paidDate || '',
      preparingDate: o.preparingDate || '',
      shippedDate: o.shippedDate || '',
      deliveredDate: o.deliveredDate || '',
      promisedDate: o.promisedDate || '',
      promisedFrom: o.promisedFrom || '',
      method: s.method || 'despacho',
      pickupPoint: s.pickupPoint || '',
      comuna: s.comuna || '',
      region: s.region || '',
      courier: o.courier || '',
      trackingCode: o.trackingCode || '',
      trackingUrl: /^https?:\/\//.test(o.trackingUrl || '') ? o.trackingUrl : '',
      total: o.paidAmount != null ? o.paidAmount : o.total,
      lines: (o.lines || []).map((l) => ({ name: l.name, qty: l.qty, detail: [l.design_name, l.size && l.size !== 'Única' ? 'Talla ' + l.size : '', l.color_name].filter(Boolean).join(' · ') })),
    });
  }
);

// ---------- Confirmar pago (lo usa el webhook; exportado para pruebas) ----------
// Marca el pedido pagado, fija la promesa de entrega y descuenta stock en una sola transacción.
async function confirmPaid(orderId, payment) {
  const ref = ORDERS.doc(orderId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const { snap: catSnap, data } = await loadCatalog(tx);
    if (!snap.exists) return { missing: true };
    const order = snap.data();
    if (PAID.includes(order.status) || order.status === 'cancelado') return { already: true, order };

    const paidDate = core.todayCL();
    const range = core.promiseRange(new Date(), order.shipping.zone, data.settings);
    const promisedDate = range.to;
    const promisedFrom = range.from;

    // Descontar stock de los productos que lo controlan
    const raw = catSnap.exists ? catSnap.data().products || {} : {};
    const updates = [];
    const shortages = [];
    const pending = {};
    order.lines.forEach((l) => {
      const st = raw[l.id] && raw[l.id].stock;
      if (!st) return;
      const key = core.stockKey(l.color);
      const k = `${l.id}|${key}|${l.size}`;
      const cur = k in pending ? pending[k] : Math.max(0, Math.floor(Number((st[key] || {})[l.size]) || 0));
      if (cur < l.qty) shortages.push(`${l.name} ${l.size}${l.color ? ' ' + l.color : ''}`);
      pending[k] = Math.max(0, cur - l.qty);
    });
    Object.keys(pending).forEach((k) => {
      const [id, key, size] = k.split('|');
      updates.push(new FieldPath('products', id, 'stock', key, size), pending[k]);
    });
    if (updates.length) tx.update(CATALOG, updates[0], updates[1], ...updates.slice(2));

    const patch = {
      status: 'pagado',
      paidAt: FieldValue.serverTimestamp(),
      paidDate,
      promisedDate,
      promisedFrom,
      mpPaymentId: String(payment.id || ''),
      mpStatus: 'approved',
      paidAmount: Number(payment.transaction_amount) || order.total,
      stockShortage: shortages,
    };
    if (order.discount && order.discount.code) {
      tx.set(COUPONS.doc(order.discount.code), { uses: FieldValue.increment(1), lastUsed: paidDate }, { merge: true });
    }
    tx.update(ref, patch);
    return { paid: true, order: { ...order, ...patch } };
  });
}
exports._confirmPaid = confirmPaid;

// Firma del aviso (validador oficial del SDK de Mercado Pago). Sin clave secreta configurada, no se valida.
function validSignature(req, dataId, secretValue) {
  if (!secretValue) return true;
  try {
    WebhookSignatureValidator.validate({
      xSignature: req.headers['x-signature'],
      xRequestId: req.headers['x-request-id'],
      dataId,
      secret: secretValue,
    });
    return true;
  } catch (err) {
    logger.warn('[webhook] firma inválida', err.reason || err.message);
    return false;
  }
}

// ---------- Notificaciones push (panel instalado en el celular) ----------
async function sendPush(payload) {
  const priv = secret(VAPID_PRIVATE_KEY);
  const pub = VAPID_PUBLIC_KEY.value();
  if (!priv || !pub) return 0;
  webpush.setVapidDetails(SITE_URL.value(), pub, priv);
  const snap = await PUSH_SUBS.get();
  let sent = 0;
  await Promise.all(snap.docs.map(async (d) => {
    const sub = d.data();
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify(payload), { TTL: 86400, urgency: 'high' });
      sent++;
    } catch (err) {
      // 404/410: el dispositivo borró la suscripción → se elimina
      if (err.statusCode === 404 || err.statusCode === 410) await d.ref.delete().catch(() => {});
      else logger.warn('[push] error', err.statusCode, err.body || err.message);
    }
  }));
  return sent;
}
const shipText = (o) => {
  const s = o.shipping || {};
  return s.method === 'retiro' ? 'Retiro' + (s.pickupPoint ? ' ' + s.pickupPoint : '') : s.comuna || s.region || '';
};

async function notifyPaid(order) {
  const view = { ...order, orderId: order.id, paymentId: order.mpPaymentId, total: order.paidAmount };
  const m = mail();
  const units = (order.lines || []).reduce((n, l) => n + l.qty, 0);
  await Promise.all([
    sendPush({
      title: '🛒 Nuevo pedido ' + clp(order.paidAmount),
      body: `${(order.customer || {}).name || ''} · ${units} producto${units === 1 ? '' : 's'} · ${shipText(order)} · entregar ${core.dayWord(order.promisedDate)}`,
      url: './#o-' + order.id,
      tag: 'pedido-' + order.id,
    }).catch((err) => logger.error('[push] error', err.message)),
    sendEmail({ ...m, to: ORDER_EMAIL.value(), subject: `Nuevo pedido ${order.id} · entregar antes del ${fmtDate(order.promisedDate)}`, html: orderHtml(view, false) }),
    sendEmail({ ...m, to: order.customer && order.customer.email, subject: `Tu pedido ${order.id} en The White Hilux`, html: orderHtml(view, true) }),
  ]).catch((err) => logger.error('[email] error', err.message));
}

const isOrderEvent = (type, action) => /^order/i.test(type || '') || /^order\./i.test(action || '');

// ---------- webhook ----------
exports.webhook = onRequest({ secrets: [MP_ACCESS_TOKEN, MP_WEBHOOK_SECRET, RESEND_API_KEY, VAPID_PRIVATE_KEY] }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  const body = (typeof req.body === 'string' ? safeJson(req.body) : req.body) || {};
  const q = req.query || {};
  const type = body.type || q.type || q.topic || '';
  const dataId = String((body.data && body.data.id) || q['data.id'] || q.id || '');
  logger.info('[webhook] aviso', type, body.action || '', dataId);

  const orderEvent = isOrderEvent(type, body.action);
  if (!dataId || !(orderEvent || type === 'payment')) return res.json({ ok: true, ignored: true });
  if (!validSignature(req, dataId, secret(MP_WEBHOOK_SECRET))) return res.status(401).json({ error: 'Firma inválida' });

  try {
    const client = new MercadoPagoConfig({ accessToken: secret(MP_ACCESS_TOKEN) });
    let orderId, paid, payment, mpStatus;

    if (orderEvent) {
      // Checkout Pro con API de Orders: se consulta la order directo a Mercado Pago
      const mp = await new Order(client).get({ id: dataId });
      orderId = mp.external_reference;
      paid = mp.status === 'processed' && mp.status_detail === 'accredited';
      mpStatus = `${mp.status}/${mp.status_detail}`;
      const pay = ((mp.transactions && mp.transactions.payments) || [])[0] || {};
      payment = { id: pay.id || mp.id, transaction_amount: Number(mp.total_paid_amount || mp.total_amount) };
    } else {
      // Respaldo: aviso de pago clásico
      const p = await new Payment(client).get({ id: dataId });
      orderId = (p.metadata && p.metadata.order_id) || p.external_reference;
      paid = p.status === 'approved';
      mpStatus = p.status;
      payment = p;
    }

    if (!orderId) return res.json({ ok: true, ignored: true });
    if (!paid) {
      await ORDERS.doc(orderId).set({ mpStatus }, { merge: true }).catch(() => {});
      return res.json({ ok: true, status: mpStatus });
    }
    const r = await confirmPaid(orderId, payment);
    if (r.missing) logger.error('[webhook] pago aprobado de un pedido que no existe', orderId, dataId);
    if (r.paid) await notifyPaid(r.order);
    return res.json({ ok: true });
  } catch (err) {
    logger.error('[webhook] error', (err && err.message) || err);
    return res.status(500).json({ error: 'No se pudo procesar el aviso' }); // Mercado Pago reintenta
  }
});

// Solo en emuladores: simula el pago aprobado de un pedido (para probar el flujo completo)
exports.simularPago = onRequest({ cors: true, secrets: [VAPID_PRIVATE_KEY] }, async (req, res) => {
  if (!EMULATOR) return res.status(404).end();
  const r = await confirmPaid(String(req.query.id || ''), { id: 'SIM-' + Date.now() });
  if (r.paid) await notifyPaid(r.order);
  res.json(r.paid ? { ok: true, promisedDate: r.order.promisedDate } : r);
});

// ---------- alertaEntregas ----------
exports.alertaEntregas = onSchedule(
  { schedule: 'every day 09:00', timeZone: 'America/Santiago', secrets: [RESEND_API_KEY, VAPID_PRIVATE_KEY] },
  async () => {
    const { data } = await loadCatalog();
    const today = core.todayCL();
    const snap = await ORDERS.where('status', 'in', core.OPEN_STATUS).get();
    const due = snap.docs
      .map((d) => d.data())
      .filter((o) => o.promisedDate && core.daysUntil(o.promisedDate, today) <= data.settings.alertDays)
      .sort((a, b) => a.promisedDate.localeCompare(b.promisedDate));
    if (!due.length) return;
    const late = due.filter((o) => core.daysUntil(o.promisedDate, today) < 0).length;
    const first = due[0];
    await sendPush({
      title: `⚠ ${due.length} pedido${due.length > 1 ? 's' : ''} por vencer${late ? ` (${late} atrasado${late > 1 ? 's' : ''})` : ''}`,
      body: due.slice(0, 3).map((o) => `${(o.customer || {}).name || o.id} · ${shipText(o)} · ${core.daysUntil(o.promisedDate, today) < 0 ? 'atrasado' : 'vence ' + core.dayWord(o.promisedDate, today)}`).join(' | '),
      url: './#o-' + first.id,
      tag: 'alerta-entregas',
    }).catch((err) => logger.error('[push] error', err.message));
    await sendEmail({
      ...mail(),
      to: ORDER_EMAIL.value(),
      subject: `⚠ ${due.length} pedido${due.length > 1 ? 's' : ''} por entregar pronto`,
      html: alertHtml(due, today),
    });
  }
);

// ---------- probarPush (botón del panel) ----------
exports.probarPush = onRequest(
  { cors: [/thewhitehilux\.cavedevz\.com$/, /tmontes30\.github\.io$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/], secrets: [VAPID_PRIVATE_KEY] },
  async (req, res) => {
    if (req.method !== 'POST') return res.status(405).end();
    try {
      const token = String(req.headers.authorization || '').replace(/^Bearer /, '');
      const u = await admin.auth().verifyIdToken(token);
      if (!u.email_verified || !ADMINS.includes(String(u.email || '').toLowerCase())) return res.status(403).json({ error: 'Sin permiso' });
    } catch {
      return res.status(401).json({ error: 'Inicia sesión de nuevo' });
    }
    const sent = await sendPush({ title: 'TWH · Notificaciones activadas ✓', body: 'Aquí te avisaremos los pedidos nuevos y los que estén por atrasarse.', url: './', tag: 'prueba' });
    return res.json({ ok: true, sent });
  }
);

function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
function clp(n) {
  return '$' + Math.round(Number(n) || 0).toLocaleString('es-CL');
}
function fmtDate(ymd) {
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-');
  return `${d}-${m}-${y}`;
}
