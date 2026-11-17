// Funciones de Firebase de la tienda The White Hilux (región São Paulo).
//  - crearPreferencia: recibe el carrito, recalcula precios y stock, guarda el pedido y crea el pago en Mercado Pago.
//  - webhook: Mercado Pago avisa los pagos; si está aprobado marca el pedido pagado, calcula la promesa de entrega,
//    descuenta stock y manda correos. Es idempotente: un aviso repetido no descuenta ni manda correos dos veces.
//  - alertaEntregas: cada mañana manda un correo con los pedidos que vencen en 2 días o menos.
//
// El código compartido con la tienda (shared/) se copia desde web/ con `node sync.js` (corre solo antes de deploy).

const crypto = require('crypto');
const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { setGlobalOptions, logger } = require('firebase-functions/v2');
const { defineSecret, defineString } = require('firebase-functions/params');
const admin = require('firebase-admin');
const { FieldPath, FieldValue } = require('firebase-admin/firestore');
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');

const base = require('./shared/catalog.js');
const core = require('./shared/core.js');
const { buildOrder, newOrderId, toMercadoPagoItems, OrderError } = require('./shared/order.js');
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

const EMULATOR = process.env.FUNCTIONS_EMULATOR === 'true';
const CATALOG = db.doc('tienda/catalogo');
const ORDERS = db.collection('pedidos');
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
      order = buildOrder(body, data.products, data.config);
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
      total: order.total,
    });

    // En los emuladores sin token de Mercado Pago: simula el pago para poder probar todo el flujo
    if (!token && EMULATOR) {
      return res.json({ order_id: orderId, init_point: `gracias.html?external_reference=${orderId}&simulado=1`, total: order.total });
    }
    if (!token) return res.status(500).json({ error: 'La tienda aún no tiene configurado Mercado Pago.' });

    const [firstName, ...rest] = order.customer.name.split(/\s+/);
    const project = process.env.GCLOUD_PROJECT;
    const prefBody = {
      items: toMercadoPagoItems(order),
      payer: { name: firstName, surname: rest.join(' '), email: order.customer.email },
      back_urls: {
        success: `${siteUrl}/gracias.html`,
        pending: `${siteUrl}/pago-pendiente.html`,
        failure: `${siteUrl}/pago-fallido.html`,
      },
      auto_return: 'approved',
      notification_url: `https://${REGION}-${project}.cloudfunctions.net/webhook`,
      external_reference: orderId,
      statement_descriptor: 'THEWHITEHILUX',
      metadata: { order_id: orderId },
    };

    try {
      const client = new MercadoPagoConfig({ accessToken: token });
      const pref = await new Preference(client).create({ body: prefBody });
      logger.info('[pedido creado]', orderId, order.total);
      return res.json({ order_id: orderId, init_point: pref.init_point, total: order.total });
    } catch (err) {
      logger.error('[mercadopago] error al crear preferencia', err && (err.message || err));
      await ORDERS.doc(orderId).delete().catch(() => {});
      return res.status(502).json({ error: 'No pudimos conectar con Mercado Pago. Intenta de nuevo en unos minutos.' });
    }
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
    const promisedDate = core.promiseDate(paidDate, order.shipping.zone, data.settings);

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
      mpPaymentId: String(payment.id || ''),
      mpStatus: 'approved',
      paidAmount: Number(payment.transaction_amount) || order.total,
      stockShortage: shortages,
    };
    tx.update(ref, patch);
    return { paid: true, order: { ...order, ...patch } };
  });
}
exports._confirmPaid = confirmPaid;

function validSignature(req, dataId, secretValue) {
  if (!secretValue) return true;
  const sig = req.headers['x-signature'] || '';
  const requestId = req.headers['x-request-id'] || '';
  const parts = Object.fromEntries(
    String(sig).split(',').map((p) => p.split('=').map((s) => s.trim())).filter((p) => p.length === 2)
  );
  if (!parts.ts || !parts.v1) return false;
  const id = /^[a-z0-9]+$/i.test(dataId) ? String(dataId).toLowerCase() : dataId;
  const manifest = `id:${id};request-id:${requestId};ts:${parts.ts};`;
  const expected = crypto.createHmac('sha256', secretValue).update(manifest).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1));
  } catch {
    return false;
  }
}

async function notifyPaid(order) {
  const view = { ...order, orderId: order.id, paymentId: order.mpPaymentId, total: order.paidAmount };
  const m = mail();
  await Promise.all([
    sendEmail({ ...m, to: ORDER_EMAIL.value(), subject: `Nuevo pedido ${order.id} · entregar antes del ${fmtDate(order.promisedDate)}`, html: orderHtml(view, false) }),
    sendEmail({ ...m, to: order.customer && order.customer.email, subject: `Tu pedido ${order.id} en The White Hilux`, html: orderHtml(view, true) }),
  ]).catch((err) => logger.error('[email] error', err.message));
}

// ---------- webhook ----------
exports.webhook = onRequest({ secrets: [MP_ACCESS_TOKEN, MP_WEBHOOK_SECRET, RESEND_API_KEY] }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  const body = (typeof req.body === 'string' ? safeJson(req.body) : req.body) || {};
  const q = req.query || {};
  const type = body.type || q.type || q.topic;
  const dataId = String((body.data && body.data.id) || q['data.id'] || q.id || '');

  if (type !== 'payment' || !dataId) return res.json({ ok: true, ignored: true });
  if (!validSignature(req, dataId, secret(MP_WEBHOOK_SECRET))) return res.status(401).json({ error: 'Firma inválida' });

  try {
    const client = new MercadoPagoConfig({ accessToken: secret(MP_ACCESS_TOKEN) });
    const payment = await new Payment(client).get({ id: dataId });
    const orderId = (payment.metadata && payment.metadata.order_id) || payment.external_reference;
    if (!orderId) return res.json({ ok: true, ignored: true });

    if (payment.status !== 'approved') {
      await ORDERS.doc(orderId).set({ mpStatus: payment.status, mpPaymentId: String(payment.id) }, { merge: true }).catch(() => {});
      return res.json({ ok: true, status: payment.status });
    }
    const r = await confirmPaid(orderId, payment);
    if (r.missing) logger.error('[webhook] pago aprobado de un pedido que no existe', orderId, payment.id);
    if (r.paid) await notifyPaid(r.order);
    return res.json({ ok: true });
  } catch (err) {
    logger.error('[webhook] error', err && (err.message || err));
    return res.status(500).json({ error: 'No se pudo procesar el aviso' }); // Mercado Pago reintenta
  }
});

// Solo en emuladores: simula el pago aprobado de un pedido (para probar el flujo completo)
exports.simularPago = onRequest({ cors: true }, async (req, res) => {
  if (!EMULATOR) return res.status(404).end();
  const r = await confirmPaid(String(req.query.id || ''), { id: 'SIM-' + Date.now() });
  if (r.paid) await notifyPaid(r.order);
  res.json(r.paid ? { ok: true, promisedDate: r.order.promisedDate } : r);
});

// ---------- alertaEntregas ----------
exports.alertaEntregas = onSchedule(
  { schedule: 'every day 09:00', timeZone: 'America/Santiago', secrets: [RESEND_API_KEY] },
  async () => {
    const { data } = await loadCatalog();
    const today = core.todayCL();
    const snap = await ORDERS.where('status', 'in', core.OPEN_STATUS).get();
    const due = snap.docs
      .map((d) => d.data())
      .filter((o) => o.promisedDate && core.daysUntil(o.promisedDate, today) <= data.settings.alertDays)
      .sort((a, b) => a.promisedDate.localeCompare(b.promisedDate));
    if (!due.length) return;
    await sendEmail({
      ...mail(),
      to: ORDER_EMAIL.value(),
      subject: `⚠ ${due.length} pedido${due.length > 1 ? 's' : ''} por entregar pronto`,
      html: alertHtml(due, today),
    });
  }
);

function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
function fmtDate(ymd) {
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-');
  return `${d}-${m}-${y}`;
}
