// Funciones de Firebase de la tienda The White Hilux (región São Paulo).
//  - crearPreferencia: recibe el carrito, recalcula precios y stock, guarda el pedido y crea el pago en Mercado Pago
//    (Checkout Pro con la API de Orders: POST /v1/orders → checkout_url).
//  - webhook: Mercado Pago avisa los pagos (evento "Order"); si está aprobado (processed/accredited) marca el pedido
//    pagado, calcula la promesa de entrega, descuenta stock y manda correos. Es idempotente: un aviso repetido no
//    descuenta ni manda correos dos veces.
//  - alertaEntregas: cada mañana avisa (solo notificación push) los pedidos que vencen en 2 días o menos.
//  - probarPush: manda una notificación de prueba a los dispositivos del admin (pide sesión de admin).
//  Push: los dispositivos se suscriben desde el panel (Ajustes → Notificaciones) y quedan en pushSubs/*.
//
// El código compartido con la tienda (shared/) se copia desde web/ con `node sync.js` (corre solo antes de deploy).

const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { setGlobalOptions, logger } = require('firebase-functions/v2');
const { defineSecret, defineString } = require('firebase-functions/params');
const admin = require('firebase-admin');
const { FieldPath, FieldValue } = require('firebase-admin/firestore');
const { MercadoPagoConfig, Order, Payment, WebhookSignatureValidator } = require('mercadopago');
const webpush = require('web-push');

const base = require('./shared/catalog.js');
const core = require('./shared/core.js');
const { buildOrder, priceCart, couponCode, newOrderId, toMercadoPagoItems, OrderError } = require('./shared/order.js');
const { orderHtml, statusEmail, sendEmail } = require('./shared/email.js');

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
const mail = () => ({ key: secret(RESEND_API_KEY), from: RESEND_FROM.value(), replyTo: ORDER_EMAIL.value() });

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
      const key = core.stockKey(l.design || l.color); // sticker: stock por diseño
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

    // Retiro: pasa directo a "En preparación" (el cliente lo ve así en "Sigue tu pedido")
    const retiro = (order.shipping || {}).method === 'retiro';
    const patch = {
      status: retiro ? 'preparando' : 'pagado',
      ...(retiro ? { preparingDate: paidDate } : {}),
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

// Registro de avisos por pedido (lo muestra el panel): notifs = [{ at, kind, channel, to, ok, note }]
async function logNotif(orderId, entries) {
  if (!orderId || !entries.length) return;
  const at = new Date().toISOString();
  await ORDERS.doc(orderId).update({ notifs: FieldValue.arrayUnion(...entries.map((e) => ({ at, ...e }))) })
    .catch((err) => logger.warn('[avisos] no se pudo registrar', orderId, err.message));
}
// Envía un correo y devuelve la entrada del registro (ok / desactivado / error)
async function mailAndLog(kind, to, msg, m) {
  try {
    const r = await sendEmail({ ...m, to, ...msg });
    return { kind, channel: 'correo', to, ok: !r.skipped, note: r.skipped ? 'correos desactivados' : '' };
  } catch (err) {
    logger.error('[email] error', kind, err.message);
    return { kind, channel: 'correo', to, ok: false, note: String(err.message).slice(0, 140) };
  }
}

async function notifyPaid(order) {
  const view = { ...order, orderId: order.id, paymentId: order.mpPaymentId, total: order.paidAmount };
  const m = mail();
  const units = (order.lines || []).reduce((n, l) => n + l.qty, 0);
  const entries = await Promise.all([
    sendPush({
      title: '🛒 Nuevo pedido ' + clp(order.paidAmount),
      body: `${(order.customer || {}).name || ''} · ${units} producto${units === 1 ? '' : 's'} · ${shipText(order)} · entregar ${core.dayWord(order.promisedDate)}`,
      url: './#o-' + order.id,
      tag: 'pedido-' + order.id,
    }).then((n) => ({ kind: 'pedido nuevo', channel: 'push', to: 'tu celular', ok: n > 0, note: n ? '' : 'ningún dispositivo activado' }))
      .catch((err) => ({ kind: 'pedido nuevo', channel: 'push', to: 'tu celular', ok: false, note: String(err.message).slice(0, 140) })),
    mailAndLog('pedido nuevo (copia tienda)', ORDER_EMAIL.value(), { subject: `Nuevo pedido ${order.id} · entregar antes del ${fmtDate(order.promisedDate)}`, html: orderHtml(view, false) }, m),
    mailAndLog('pago confirmado', order.customer && order.customer.email, { subject: `Tu pedido ${order.id} en The White Hilux`, html: orderHtml(view, true) }, m),
  ]);
  await logNotif(order.id, entries);
}

// Comisión real que cobró Mercado Pago (para la pestaña Utilidades). Busca el pago aprobado por N° de pedido.
async function saveMpFee(orderId, token) {
  try {
    const url = 'https://api.mercadopago.com/v1/payments/search?sort=date_created&criteria=desc&external_reference=' + encodeURIComponent(orderId);
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    if (!r.ok) return logger.warn('[comisión] búsqueda respondió', r.status);
    const pay = ((await r.json()).results || []).find((p) => p.status === 'approved');
    if (!pay) return;
    const fee = (pay.fee_details || []).reduce((sum, f) => sum + (Number(f.amount) || 0), 0);
    const net = pay.transaction_details && pay.transaction_details.net_received_amount;
    await ORDERS.doc(orderId).update({ mpFee: Math.round(fee), mpNet: net != null ? Math.round(Number(net)) : null, mpInstallments: pay.installments || 1 });
  } catch (err) {
    logger.warn('[comisión] no se pudo leer', orderId, err.message);
  }
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
    if (r.paid) await Promise.all([notifyPaid(r.order), saveMpFee(orderId, secret(MP_ACCESS_TOKEN))]);
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
  { schedule: 'every day 09:00', timeZone: 'America/Santiago', secrets: [VAPID_PRIVATE_KEY] },
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
    const sentN = await sendPush({
      title: `⚠ ${due.length} pedido${due.length > 1 ? 's' : ''} por vencer${late ? ` (${late} atrasado${late > 1 ? 's' : ''})` : ''}`,
      body: due.slice(0, 3).map((o) => `${(o.customer || {}).name || o.id} · ${shipText(o)} · ${core.daysUntil(o.promisedDate, today) < 0 ? 'atrasado' : 'vence ' + core.dayWord(o.promisedDate, today)}`).join(' | '),
      url: './#o-' + first.id,
      tag: 'alerta-entregas',
    }).catch((err) => { logger.error('[push] error', err.message); return 0; });
    await Promise.all(due.map((o) => logNotif(o.id, [{ kind: core.daysUntil(o.promisedDate, today) < 0 ? 'alerta: atrasado' : 'alerta: por vencer', channel: 'push', to: 'tu celular', ok: sentN > 0, note: sentN ? '' : 'ningún dispositivo activado' }])));
    // Sin correo: el dueño pidió solo la notificación push (2026-11-19)
  }
);

// ---------- correoEstado: avisa al cliente los cambios de estado que hace el admin en el panel ----------
// - despachado: "va en camino" (con courier y N° de seguimiento) o "listo para retiro". En despachos espera a que
//   el pedido tenga courier elegido, para que el correo lleve los datos (si el N° se pone después, igual sale).
// - entregado: "fue entregado" + invitación a etiquetar en Instagram.
// Cada correo sale una sola vez (marca emails.<estado> en el pedido). Firestore está en nam5 → la función va en us-central1.
exports.correoEstado = onDocumentUpdated(
  { document: 'pedidos/{id}', region: 'us-central1', secrets: [RESEND_API_KEY] },
  async (event) => {
    const before = event.data.before.data() || {};
    const o = { ...(event.data.after.data() || {}), id: event.params.id };
    const sent = o.emails || {};
    const retiro = (o.shipping || {}).method === 'retiro';
    let kind = '';
    if (o.status === 'entregado' && !sent.entregado && before.status !== 'entregado') kind = 'entregado';
    else if (o.status === 'despachado' && !sent.despachado && (retiro || o.courier)) kind = 'despachado';
    if (!kind || !(o.customer && o.customer.email) || o.noEmails) return; // venta manual sin correos
    const m = mail();
    if (!m.key) return; // correos desactivados
    // marca primero (transacción) para que dos disparos seguidos no manden el correo dos veces
    const ok = await db.runTransaction(async (tx) => {
      const snap = await tx.get(event.data.after.ref);
      if (((snap.data() || {}).emails || {})[kind]) return false;
      tx.update(event.data.after.ref, { ['emails.' + kind]: core.todayCL() });
      return true;
    });
    if (!ok) return;
    const { subject, html } = statusEmail(o, kind);
    const label = kind === 'entregado' ? 'entregado' : retiro ? 'listo para retiro' : 'va en camino';
    const entry = await mailAndLog(label, o.customer.email, { subject, html }, m);
    await logNotif(o.id, [entry]);
    if (entry.ok) logger.info('[correoEstado]', o.id, kind);
    else await event.data.after.ref.update({ ['emails.' + kind]: FieldValue.delete() }).catch(() => {});
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

// ---------- evento (visitas de la tienda, anónimas y agregadas por día) ----------
// La tienda manda lotes de eventos [grupo, clave] (navigator.sendBeacon, text/plain). Se suman en
// estadisticas/<YYYY-MM-DD> como { grupo: { clave: n } }. No se guarda nada de la persona (ni IP ni id).
const GRUPOS_EVENTO = ['pv', 'prod', 'cart', 'click', 'filtro', 'busca', 'vacia', 'fuente', 'disp', 'embudo', 'like', 'nolike'];
const PASOS_EMBUDO = ['visitantes', 'sesiones', 'producto', 'carrito', 'checkout', 'compra'];
exports.evento = onRequest(
  { cors: [/thewhitehilux\.cavedevz\.com$/, /tmontes30\.github\.io$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/], memory: '256MiB' },
  async (req, res) => {
    if (req.method !== 'POST') return res.status(405).end();
    const body = (typeof req.body === 'string' ? safeJson(req.body) : Buffer.isBuffer(req.body) ? safeJson(req.body.toString()) : req.body) || {};
    const list = Array.isArray(body.e) ? body.e.slice(0, 40) : [];
    const sum = {};
    let n = 0;
    list.forEach((ev) => {
      if (!Array.isArray(ev)) return;
      const g = String(ev[0] || '');
      const k = String(ev[1] || '').replace(/[\u0000-\u001f`]/g, '').trim().slice(0, 60);
      if (!GRUPOS_EVENTO.includes(g) || !k) return;
      if (g === 'embudo' && !PASOS_EMBUDO.includes(k)) return;
      sum[g] = sum[g] || {};
      sum[g][k] = (sum[g][k] || 0) + 1;
      n++;
    });
    if (!n) return res.status(204).end();
    const data = {};
    Object.keys(sum).forEach((g) => {
      data[g] = {};
      Object.keys(sum[g]).forEach((k) => (data[g][k] = FieldValue.increment(sum[g][k])));
    });
    data.actualizado = FieldValue.serverTimestamp();
    await db.collection('estadisticas').doc(core.todayCL()).set(data, { merge: true });
    return res.status(204).end();
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
