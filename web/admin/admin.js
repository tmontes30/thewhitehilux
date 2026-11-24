// Panel de admin de The White Hilux: pedidos, alertas de entrega, productos (precio, descripción, estado) y stock.
// Datos en Firestore: tienda/catalogo (lo que se edita aquí, lo lee la tienda) y pedidos/* (los crean las funciones).
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, signOut, onAuthStateChanged, connectAuthEmulator
} from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js';
import {
  getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, collection, query, orderBy,
  limit, increment, FieldPath, serverTimestamp, deleteField, getDocs
} from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js';

const F = window.TWH_FIREBASE;
const C = window.TWHCore;
const BASE = window.TWH_DATA;
const CFG = BASE.config;

const app = initializeApp({ apiKey: F.apiKey || 'demo-key', authDomain: F.authDomain, projectId: F.projectId, appId: F.appId || undefined });
const auth = getAuth(app);
const db = getFirestore(app);
if (F.useEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}
const CATALOG = doc(db, 'tienda', 'catalogo');
const PAID = ['pagado', 'preparando', 'despachado', 'entregado'];
const COURIERS = ['Starken', 'Chilexpress', 'Blue Express', 'Correos de Chile', 'Despacho propio', 'Otro'];
const TABS = ['pedidos', 'ventas', 'utilidades', 'cliente', 'productos', 'compras', 'descuentos', 'configurador', 'ajustes'];

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => { const v = Math.round(Number(n) || 0); return (v < 0 ? '−' : '') + '$' + Math.abs(v).toLocaleString('es-CL'); };
const fmtDate = (ymd) => (ymd ? ymd.split('-').reverse().join('-') : '—');
const plural = (n, a, b) => n + ' ' + (n === 1 ? a : b);

let raw = null; // documento tienda/catalogo tal cual
let data = C.mergeCatalog(BASE, null); // catálogo mezclado
let orders = [];
let coupons = [];
let compras = [];
let orderFilter = 'abiertos';
let prodFilter = 'todos';
const dirty = new Set(); // productos con cambios sin guardar
const unsubs = [];

function toast(msg, err) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast' + (err ? ' err' : '');
  t.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (t.hidden = true), err ? 6000 : 2600);
}
// Mientras Firebase confirma la sesión y llegan los datos se muestra un círculo de carga (no la pantalla de login)
function booted() {
  $('boot').hidden = true;
  $('main').classList.remove('booting');
}
function fail(err) {
  booted();
  console.error(err);
  toast(err && err.code === 'permission-denied' ? 'Sin permiso: entra con la cuenta de admin.' : 'No se pudo guardar: ' + (err.message || err), true);
}

// ---------- Login ----------
$('login-btn').addEventListener('click', async () => {
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (err) {
    if (err.code !== 'auth/popup-closed-by-user') toast('No se pudo entrar: ' + err.message, true);
  }
});
$('logout').addEventListener('click', () => signOut(auth));

// Solo en emuladores (localhost): entrar sin Google para probar
if (F.useEmulators && new URLSearchParams(location.search).has('emu-login')) {
  signInWithEmailAndPassword(auth, F.admins[0], 'emulador-twh').catch((e) => toast(e.message, true));
}

onAuthStateChanged(auth, async (user) => {
  unsubs.splice(0).forEach((u) => u());
  const isAdmin = user && user.emailVerified && F.admins.includes((user.email || '').toLowerCase());
  $('login').hidden = !!isAdmin;
  $('tabs').hidden = !isAdmin;
  $('who').hidden = !user;
  $('who-email').textContent = user ? user.email : '';
  TABS.forEach((t) => ($('tab-' + t).hidden = true));
  if (!isAdmin) booted();
  // este navegador es del admin: la tienda no cuenta sus visitas en la pestaña Cliente
  if (isAdmin) { try { localStorage.setItem('twh-admin', '1'); } catch (e) { /* sin almacenamiento */ } }
  if (user && !isAdmin) {
    $('login-msg').textContent = `La cuenta ${user.email} no tiene acceso al panel.`;
    $('login-btn').textContent = 'Entrar con otra cuenta';
    return;
  }
  if (!user) return;
  try {
    const snap = await getDoc(CATALOG);
    if (!snap.exists()) await setDoc(CATALOG, { products: {}, settings: { ...C.DEFAULT_SETTINGS } });
    // Migración (2026-11-18): entrega con rango de fechas, regiones 5 días y retiro con hora de corte
    else if (snap.data().settings && snap.data().settings.rangeDays == null) {
      await updateDoc(CATALOG, 'settings.deliveryDaysRegiones', 5, 'settings.rangeDays', 1, 'settings.pickupCutoff', '06:30');
    }
  } catch (err) {
    return fail(err);
  }
  unsubs.push(
    onSnapshot(CATALOG, (s) => {
      raw = s.data() || {};
      data = C.mergeCatalog(BASE, raw);
      booted();
      if (!visitas && !loadVisitas.started) { loadVisitas.started = true; loadVisitas(); }
      renderProducts();
      renderSettings();
      renderOrders();
      renderSales();
      renderDiscounts();
      renderBuys();
      renderProfit();
    }, fail),
    onSnapshot(doc(db, 'privado', 'utilidades'), (s) => {
      if (s.exists()) profitCfg = { ...profitCfg, ...s.data() };
      renderProfit();
    }, fail),
    onSnapshot(collection(db, 'compras'), (s) => {
      compras = s.docs.map((d) => ({ ...d.data(), key: d.id }));
      renderBuys();
      renderInvKpis();
      renderProfit();
    }, fail),
    onSnapshot(query(collection(db, 'pedidos'), orderBy('createdAt', 'desc'), limit(2000)), (s) => {
      orders = s.docs.map((d) => ({ ...d.data(), id: d.id }));
      renderOrders();
      renderSales();
      renderProfit();
    }, fail),
    onSnapshot(collection(db, 'cupones'), (s) => {
      coupons = s.docs.map((d) => ({ ...d.data(), code: d.id }));
      renderDiscounts();
    }, fail)
  );
  showTab(location.hash.slice(1) || 'pedidos');
});

// ---------- Pestañas ----------
function showTab(name) {
  if (!TABS.includes(name)) name = 'pedidos';
  document.querySelectorAll('#tabs button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.tab === name ? 'true' : 'false'));
  TABS.forEach((t) => ($('tab-' + t).hidden = t !== name));
  if (location.hash.slice(1) !== name) history.replaceState(null, '', '#' + name);
  // el configurador (con sus fotos base) se carga solo la primera vez que se abre
  // ?v= evita que el navegador muestre una versión vieja guardada en caché
  if (name === 'configurador' && !$('cfg-frame').src) $('cfg-frame').src = 'configurador/configurador.html?v=' + Date.now();
  document.body.classList.toggle('wide', name === 'configurador');
  if (name === 'cliente' && !visitas) loadVisitas();
}
$('tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tab]');
  if (b) showTab(b.dataset.tab);
});

// ---------- Pedidos ----------
const ORDER_FILTERS = {
  abiertos: ['Por entregar', (o) => C.OPEN_STATUS.includes(o.status)],
  despachado: ['Despachados', (o) => o.status === 'despachado'],
  entregado: ['Entregados', (o) => o.status === 'entregado'],
  pendiente_pago: ['Pago pendiente', (o) => o.status === 'pendiente_pago'],
  cancelado: ['Cancelados', (o) => o.status === 'cancelado'],
  todos: ['Todos', () => true],
};

function due(o) {
  if (!C.OPEN_STATUS.includes(o.status) || !o.promisedDate) return null;
  const d = C.daysUntil(o.promisedDate);
  const alertDays = data.settings.alertDays;
  if (d < 0) return { d, cls: 'red', text: `Atrasado ${plural(-d, 'día', 'días')}` };
  if (d === 0) return { d, cls: 'red', text: 'Vence hoy' };
  if (d <= alertDays) return { d, cls: 'amber', text: `Faltan ${plural(d, 'día', 'días')}` };
  return { d, cls: 'green', text: `Faltan ${plural(d, 'día', 'días')}` };
}

function waLink(phone) {
  let n = String(phone || '').replace(/\D/g, '');
  if (n.length === 9 && n[0] === '9') n = '56' + n;
  return n ? `https://wa.me/${n}` : '';
}

function lineText(l) {
  return [l.design_name, l.size && l.size !== 'Única' ? 'Talla ' + l.size : '', l.color_name].filter(Boolean).join(' · ');
}

// Avisos enviados por este pedido (correos al cliente, copia a la tienda, notificaciones push)
const fmtWhen = (iso) => {
  try {
    return new Date(iso).toLocaleString('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch (e) { return iso; }
};
function notifsHtml(o) {
  const list = (o.notifs || []).slice().sort((a, b) => String(a.at).localeCompare(String(b.at)));
  // pedidos antiguos: solo se sabía qué correos de estado salieron
  const old = !list.length && o.emails ? Object.keys(o.emails).map((k) => ({ at: '', kind: k, channel: 'correo', to: (o.customer || {}).email, ok: true, day: o.emails[k] })) : [];
  const rows = list.length ? list : old;
  if (!rows.length) return o.status === 'pendiente_pago' ? '' : '<details class="notifs"><summary>Avisos enviados (0)</summary><p class="hint">Este pedido es anterior al registro de avisos.</p></details>';
  const fails = rows.filter((n) => !n.ok).length;
  return `<details class="notifs"><summary>Avisos enviados (${rows.length})${fails ? ` · <span class="warn">${fails} sin enviar</span>` : ''}</summary><ul>${rows.map((n) =>
    `<li class="${n.ok ? 'ok' : 'bad'}"><span class="when">${n.at ? fmtWhen(n.at) : fmtDate(n.day)}</span>${n.channel === 'push' ? '📱' : '✉'} <b>${esc(n.kind)}</b> → ${esc(n.to || '')} ${n.ok ? '✓' : `✗ <small>${esc(n.note || 'no se envió')}</small>`}</li>`).join('')}</ul></details>`;
}

function orderCard(o) {
  const dd = due(o);
  const ship = o.shipping || {};
  const cust = o.customer || {};
  const wa = waLink(cust.phone);
  const paid = o.paidAmount != null ? o.paidAmount : o.total;
  const opts = Object.keys(C.ORDER_STATUS).map((k) => `<option value="${k}"${k === o.status ? ' selected' : ''}>${C.ORDER_STATUS[k]}</option>`).join('');
  const dest = ship.pickupPoint === 'Entrega en mano'
    ? '<p><b>Entrega en mano</b> (acordada)</p>'
    : ship.method === 'retiro'
    ? `<p><b>Retiro gratis${ship.pickupPoint ? ' en ' + esc(ship.pickupPoint) : ''}</b><br><span class="hint">Coordinar por WhatsApp</span></p>`
    : `<p>${esc(ship.address)}<br>${esc(ship.comuna)}, ${esc(ship.region)}</p>`;
  return `<article class="card order ${dd && dd.cls !== 'green' ? 'due-' + dd.cls : ''}" id="o-${esc(o.id)}" data-id="${esc(o.id)}">
    <div class="order-head">
      <span class="id">${esc(o.id)}</span>
      ${o.source === 'manual' ? `<span class="pill gray">Venta manual · ${esc(PAY_METHODS[o.paymentMethod] || o.paymentMethod || '')}</span>` : ''}
      <span class="date">Creado ${fmtDate(o.createdDate)}${o.paidDate ? ' · pagado ' + fmtDate(o.paidDate) : ''}</span>
      <select data-act="status" aria-label="Estado del pedido">${opts}</select>
      ${dd ? `<span class="pill ${dd.cls}">${dd.text}</span>` : ''}
      <span class="total" title="Total pagado">${money(paid)}</span>
    </div>
    ${o.stockShortage && o.stockShortage.length ? `<p class="warn">⚠ Se vendió sin stock suficiente: ${esc(o.stockShortage.join(', '))}</p>` : ''}
    ${o.status === 'pendiente_pago' ? `<p class="hint">El cliente fue a Mercado Pago pero el pago no se ha confirmado${o.mpStatus ? ' (estado: ' + esc(o.mpStatus) + ')' : ''}. Si pagó por otro medio, cámbialo a "Pagado".</p>` : ''}
    <div class="order-body">
      <div>
        <h4>Cliente</h4>
        <p><b>${esc(cust.name)}</b><br>
        ${cust.phone ? `${wa ? `<a href="${wa}" target="_blank" rel="noopener">${esc(cust.phone)} · WhatsApp</a>` : esc(cust.phone)}<br>` : ''}
        ${cust.email ? `<a href="mailto:${esc(cust.email)}">${esc(cust.email)}</a>` : ''}</p>
      </div>
      <div>
        <h4>Entrega · ${esc(ship.zone_label || '')}</h4>
        ${dest}
        ${ship.notes ? `<p class="hint">Nota del cliente: ${esc(ship.notes)}</p>` : ''}
      </div>
      <div class="promise">
        <h4>Promesa de entrega</h4>
        ${o.promisedFrom && o.promisedFrom < o.promisedDate ? `<p class="hint">Rango: ${C.dayName(o.promisedFrom)} a ${C.dayName(o.promisedDate)} · fecha límite:</p>` : ''}
        ${o.promisedDate || o.status !== 'pendiente_pago' ? `<input type="date" data-act="promise" value="${esc(o.promisedDate || '')}" aria-label="Fecha prometida">` : '<p class="hint">Se fija al confirmarse el pago.</p>'}
        ${o.deliveredDate ? `<span class="pill gray">Entregado ${fmtDate(o.deliveredDate)}</span>` : ''}
        ${C.onTime(o) === true ? '<span class="pill green">A tiempo</span>' : C.onTime(o) === false ? '<span class="pill red">Entregado atrasado</span>' : ''}
      </div>
    </div>
    <div>
      <h4 class="hint" style="margin-bottom:4px">PRODUCTOS</h4>
      <ul class="order-lines">${(o.lines || []).map((l) => `<li>${l.qty} × <b>${esc(l.name)}</b> <small>${esc(lineText(l))}</small> ${l.sku ? '<span class="sku">' + esc(l.sku) + '</span>' : ''} — ${money(l.net != null ? l.net : l.total)}${l.offer ? ' <small>(oferta)</small>' : ''}</li>`).join('')}
        <li><small>Subtotal ${money(o.subtotal)}${o.discount ? ' · Código ' + esc(o.discount.code) + ' -' + money(o.discount.amount) : ''} · Envío ${ship.cost ? money(ship.cost) : 'gratis'}${o.mpPaymentId ? ' · Pago MP #' + esc(o.mpPaymentId) : ''}</small></li>
      </ul>
    </div>
    ${o.status !== 'pendiente_pago' && o.status !== 'cancelado' && ship.method !== 'retiro' ? `<div class="ship-track">
      <h4>Despacho (lo ve el cliente en "Sigue tu pedido")</h4>
      <p class="hint" style="margin:-2px 0 6px">Elige el courier y pon el N° <b>antes</b> de pasar a "Despachado": así el correo "va en camino" le llega al cliente con el seguimiento.</p>
      <div class="ship-fields">
        <select data-act="courier" aria-label="Courier"><option value="">Courier…</option>${COURIERS.map((c) => `<option${c === o.courier ? ' selected' : ''}>${c}</option>`).join('')}</select>
        <input data-act="trackingCode" value="${esc(o.trackingCode || '')}" placeholder="N° de seguimiento" maxlength="60">
        <input data-act="trackingUrl" value="${esc(o.trackingUrl || '')}" placeholder="Link de seguimiento (opcional)" maxlength="300">
      </div>
    </div>` : ''}
    ${PAID.includes(o.status) && ship.method !== 'retiro' ? shipCostHtml(o) : ''}
    ${notifsHtml(o)}
    <div class="order-foot">
      <textarea data-act="note" rows="1" placeholder="Nota interna (solo tú la ves): cambios de talla, acuerdos con el cliente…">${esc(o.adminNote || '')}</textarea>
      <a class="btn ghost small" href="../seguimiento.html?pedido=${encodeURIComponent(o.id)}&correo=${encodeURIComponent((o.customer || {}).email || '')}" target="_blank" rel="noopener" title="Ver lo que ve el cliente">Ver seguimiento ↗</a>
      ${o.status === 'pendiente_pago' || o.status === 'cancelado' ? '<button type="button" class="btn ghost small" data-act="delete">Eliminar</button>' : ''}
    </div>
  </article>`;
}

// Costo real del envío (privado: solo para Utilidades; no sale en "Sigue tu pedido" ni en los correos)
function shipCostHtml(o) {
  const ship = o.shipping || {};
  const charged = Number(ship.cost) || 0;
  const has = o.shipCostReal != null && o.shipCostReal !== '';
  const real = has ? Number(o.shipCostReal) : null;
  const tarifa = (CFG.shipping[ship.zone] || {}).price || 0;
  const diff = has ? charged - real : null;
  const resumen = has
    ? `Cobrado al cliente ${charged ? money(charged) : '$0 (envío gratis)'} · te costó ${real ? money(real) : '$0 (lo entregaste tú)'} → <b class="${diff >= 0 ? 'ok' : 'bad'}">${diff >= 0 ? 'ganas' : 'pierdes'} ${money(Math.abs(diff))}</b> en el envío`
    : `Sin anotar: Utilidades asume ${money(tarifa)} (tarifa de la zona). Anótalo cuando sepas cuánto te costó.`;
  return `<div class="ship-cost">
      <h4>🔒 Costo real del envío <span>privado · solo para Utilidades, el cliente no lo ve</span></h4>
      <div class="ship-cost-row">
        <label>$ <input data-act="shipCostReal" type="number" min="0" step="1" inputmode="numeric" value="${has ? esc(real) : ''}" placeholder="Ej: 2000" aria-label="Costo real del envío"></label>
        <button type="button" class="btn ghost small" data-act="shipSelf">Lo entregué yo ($0)</button>
        ${has ? '<button type="button" class="link" data-act="shipClear">Borrar</button>' : ''}
      </div>
      <p class="hint">${resumen}</p>
    </div>`;
}

function renderOrders() {
  if ($('tab-pedidos') == null) return;
  const today = C.todayCL();
  const month = today.slice(0, 7);
  const open = orders.filter((o) => C.OPEN_STATUS.includes(o.status));
  const urgent = open.map((o) => ({ o, d: due(o) })).filter((x) => x.d && x.d.cls !== 'green').sort((a, b) => a.d.d - b.d.d);
  const paidMonth = orders.filter((o) => PAID.includes(o.status) && (o.paidDate || '').startsWith(month));
  const sold = paidMonth.reduce((s, o) => s + (Number(o.paidAmount != null ? o.paidAmount : o.total) || 0), 0);

  const otd30 = C.otd(orders.filter((o) => C.fulfilledDate(o) >= addDays(today, -29)));
  $('stats').innerHTML = [
    [open.length, 'Por entregar'],
    [urgent.length, `Vencen en ≤ ${plural(data.settings.alertDays, 'día', 'días')} o atrasados`],
    [money(sold), 'Vendido este mes'],
    [paidMonth.length, 'Pedidos pagados este mes'],
    [otd30.pct == null ? '—' : otd30.pct + '%', `OTD 30 días · ${otd30.onTime} de ${otd30.total} a tiempo`],
  ].map(([b, s]) => `<div class="stat"><b>${b}</b><span>${s}</span></div>`).join('');

  const cnt = $('count-alert');
  cnt.hidden = !urgent.length;
  cnt.textContent = urgent.length;
  $('alert').hidden = !urgent.length;
  $('alert').innerHTML = urgent.length
    ? `<h3>⚠ ${plural(urgent.length, 'pedido necesita', 'pedidos necesitan')} entregarse pronto</h3><ul>${urgent
        .map(({ o, d }) => `<li><a href="#o-${esc(o.id)}" data-jump="${esc(o.id)}">${esc(o.id)}</a> · ${esc((o.customer || {}).name)} · ${esc(o.shipping && o.shipping.method === 'retiro' ? 'Retiro' : (o.shipping || {}).comuna)} — <b>${d.text}</b> (${fmtDate(o.promisedDate)})</li>`)
        .join('')}</ul>`
    : '';

  $('order-filters').innerHTML = Object.keys(ORDER_FILTERS)
    .map((k) => `<button type="button" class="chip" data-f="${k}" aria-pressed="${k === orderFilter}">${ORDER_FILTERS[k][0]}<span>${orders.filter(ORDER_FILTERS[k][1]).length}</span></button>`)
    .join('');

  const q = $('order-search').value.trim().toLowerCase();
  let list = orders.filter(ORDER_FILTERS[orderFilter][1]);
  if (q) list = list.filter((o) => [o.id, o.customer && o.customer.name, o.customer && o.customer.email, o.shipping && o.shipping.comuna, o.shipping && o.shipping.region].join(' ').toLowerCase().includes(q));
  // Por entregar: primero lo que vence antes
  if (orderFilter === 'abiertos') list.sort((a, b) => (a.promisedDate || '9999').localeCompare(b.promisedDate || '9999'));
  const focused = document.activeElement && document.activeElement.closest && document.activeElement.closest('#orders textarea, #orders input');
  if (focused) return; // no borrar lo que se está escribiendo
  $('orders').innerHTML = list.length ? list.map(orderCard).join('') : `<p class="empty">No hay pedidos ${orderFilter === 'todos' ? 'todavía' : 'en esta lista'}.</p>`;
}

$('order-filters').addEventListener('click', (e) => {
  const b = e.target.closest('[data-f]');
  if (!b) return;
  orderFilter = b.dataset.f;
  renderOrders();
});
$('order-search').addEventListener('input', renderOrders);
$('alert').addEventListener('click', (e) => {
  const a = e.target.closest('[data-jump]');
  if (!a) return;
  e.preventDefault();
  if (!ORDER_FILTERS[orderFilter][1](orders.find((o) => o.id === a.dataset.jump) || {})) { orderFilter = 'abiertos'; renderOrders(); }
  const el = $('o-' + a.dataset.jump);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
});

// Devuelve (+1) o descuenta (-1) del stock las unidades de un pedido
async function moveStock(o, sign) {
  const args = [];
  (o.lines || []).forEach((l) => {
    const p = data.products.find((x) => x.id === l.id);
    if (!p || !p.stock) return;
    args.push(new FieldPath('products', l.id, 'stock', C.stockKey(l.color), l.size), increment(sign * l.qty));
  });
  if (args.length) await updateDoc(CATALOG, ...args);
  return args.length / 2;
}

$('orders').addEventListener('change', async (e) => {
  const card = e.target.closest('[data-id]');
  if (!card) return;
  const o = orders.find((x) => x.id === card.dataset.id);
  const ref = doc(db, 'pedidos', o.id);
  const act = e.target.dataset.act;
  try {
    if (act === 'status') {
      const to = e.target.value;
      const patch = { status: to, [to + 'At']: serverTimestamp() };
      // fechas que ve el cliente en "Sigue tu pedido" (se completan las etapas saltadas)
      if (to === 'preparando') patch.preparingDate = o.preparingDate || C.todayCL();
      if (to === 'despachado' || to === 'entregado') {
        patch.preparingDate = o.preparingDate || C.todayCL();
        patch.shippedDate = o.shippedDate || C.todayCL();
      }
      if (to === 'entregado') patch.deliveredDate = C.todayCL();
      // Pago manual (transferencia, efectivo): fija la promesa y descuenta stock
      if (PAID.includes(to) && !PAID.includes(o.status)) {
        patch.paidDate = o.paidDate || C.todayCL();
        if (!o.promisedDate) {
          const r = C.promiseRange(patch.paidDate, (o.shipping || {}).zone, data.settings);
          patch.promisedFrom = r.from;
          patch.promisedDate = r.to;
        }
        if (o.paidAmount == null) patch.paidAmount = o.total;
        if (confirm('¿Descontar estas unidades del stock?')) await moveStock(o, -1);
      }
      if (to === 'cancelado' && PAID.includes(o.status) && confirm('Pedido cancelado. ¿Devolver las unidades al stock?')) {
        const n = await moveStock(o, +1);
        if (n) toast('Stock devuelto');
      }
      await updateDoc(ref, patch);
      toast('Estado: ' + C.ORDER_STATUS[to]);
    }
    if (act === 'promise' && e.target.value) {
      const patch = { promisedDate: e.target.value };
      if (o.promisedFrom && o.promisedFrom > e.target.value) patch.promisedFrom = e.target.value;
      await updateDoc(ref, patch);
      toast('Fecha de entrega actualizada');
    }
    if (act === 'note') {
      await updateDoc(ref, { adminNote: e.target.value.slice(0, 1000) });
      toast('Nota guardada');
    }
    if (act === 'shipCostReal') {
      const v = e.target.value === '' ? deleteField() : Math.max(0, Math.round(Number(e.target.value) || 0));
      await updateDoc(ref, { shipCostReal: v });
      toast('Costo de envío guardado');
    }
    if (act === 'courier' || act === 'trackingCode' || act === 'trackingUrl') {
      let v = e.target.value.trim().slice(0, 300);
      if (act === 'trackingUrl' && v && !/^https?:\/\//i.test(v)) v = 'https://' + v;
      await updateDoc(ref, { [act]: v });
      // "Despacho propio" = lo llevas tú: si no anotaste costo, queda en $0 para Utilidades
      if (act === 'courier' && v === 'Despacho propio' && (o.shipCostReal == null || o.shipCostReal === '')) await updateDoc(ref, { shipCostReal: 0 });
      toast('Despacho actualizado ✓');
    }
  } catch (err) {
    fail(err);
  }
});
$('orders').addEventListener('focusout', () => setTimeout(renderOrders, 0));
$('orders').addEventListener('click', async (e) => {
  // costo real del envío: "Lo entregué yo" ($0) o borrar
  const sc = e.target.closest('[data-act="shipSelf"], [data-act="shipClear"]');
  if (sc) {
    const self = sc.dataset.act === 'shipSelf';
    try {
      await updateDoc(doc(db, 'pedidos', sc.closest('[data-id]').dataset.id), { shipCostReal: self ? 0 : deleteField() });
      toast(self ? 'Envío propio: costo $0 ✓' : 'Costo de envío borrado');
    } catch (err) { fail(err); }
    return;
  }
  const b = e.target.closest('[data-act="delete"]');
  if (!b) return;
  const id = b.closest('[data-id]').dataset.id;
  if (!confirm(`¿Eliminar el pedido ${id}? No se puede deshacer.`)) return;
  try {
    await deleteDoc(doc(db, 'pedidos', id));
    toast('Pedido eliminado');
  } catch (err) {
    fail(err);
  }
});

$('export').addEventListener('click', () => {
  const list = orders.filter(ORDER_FILTERS[orderFilter][1]);
  const head = ['N°', 'Creado', 'Pagado', 'Estado', 'Cliente', 'Email', 'Teléfono', 'Entrega', 'Región', 'Comuna', 'Dirección', 'Notas cliente', 'Productos', 'Subtotal', 'Envío', 'Total pagado', 'Promesa', 'Nota interna'];
  const rows = list.map((o) => {
    const s = o.shipping || {}, c = o.customer || {};
    return [o.id, o.createdDate, o.paidDate, C.ORDER_STATUS[o.status], c.name, c.email, c.phone, s.zone_label, s.region, s.comuna, s.address, s.notes,
      (o.lines || []).map((l) => `${l.qty}x ${l.name} ${lineText(l)}`).join(' | '), o.subtotal, s.cost, o.paidAmount != null ? o.paidAmount : o.total, o.promisedDate, o.adminNote];
  });
  const csv = [head, ...rows].map((r) => r.map((v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `pedidos-twh-${C.todayCL()}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
});

// ---------- Productos y stock ----------
function thumbFor(p) {
  if (p.designs && p.designs.length) return `../assets/logos/${p.designs[0].id}-claro.svg`;
  const imgs = C.orderedImages(p);
  // en el panel, la espalda primero: es donde va el diseño grande y sirve para reconocerlas rápido
  const back = imgs.find((src) => /-espalda/.test(src));
  return back ? '../' + back : imgs.length ? '../' + imgs[0] : '../assets/logos/cl-shop.svg';
}
const colorName = (c) => (c === 'unico' ? 'Stock' : CFG.colors[c] || c);

function stockTable(p) {
  const colors = C.stockColors(p);
  return `<div class="stock-table-wrap"><table class="stock-table">
    <thead><tr><th></th>${p.sizes.map((s) => `<th>${esc(s)}</th>`).join('')}<th></th></tr></thead>
    <tbody>${colors.map((c) => `<tr><th>${esc(colorName(c))}</th>${p.sizes
      .map((s) => {
        const n = C.stockOf(p, c === 'unico' ? '' : c, s);
        return `<td><input type="number" min="0" max="9999" inputmode="numeric" data-c="${c}" data-s="${esc(s)}" value="${n}" class="${n === 0 ? 'zero' : ''}" aria-label="${esc(colorName(c))} ${esc(s)}"></td>`;
      })
      .join('')}<td class="total">${plural(C.totalStock(p, c === 'unico' ? undefined : c), 'unidad', 'unidades')}</td></tr>`).join('')}
    <tr><td colspan="${p.sizes.length + 2}" class="hint" style="padding-top:6px">Escribe cuántas unidades tienes de cada talla: se guarda sola al salir de la casilla.</td></tr>
    <tr class="arrivals" hidden><td colspan="${p.sizes.length + 2}" class="hint" style="padding-top:10px">Llegó mercadería: escribe cuántas unidades <b>llegaron</b> y aprieta "Sumar al stock" (se suman a lo que ya tienes).</td></tr>
    ${colors.map((c) => `<tr class="arrivals" hidden><th>+ ${esc(colorName(c))}</th>${p.sizes
      .map((s) => `<td><input type="number" min="0" max="9999" inputmode="numeric" class="add" data-add-c="${c}" data-add-s="${esc(s)}" placeholder="0" aria-label="Llegaron ${esc(colorName(c))} ${esc(s)}"></td>`)
      .join('')}<td></td></tr>`).join('')}
    </tbody></table></div>`;
}

function productCard(p) {
  const st = p.status;
  const total = C.totalStock(p);
  return `<article class="card product" data-id="${esc(p.id)}">
    <img class="thumb" src="${esc(thumbFor(p))}" alt="" loading="lazy">
    <div class="product-main">
      <div class="row">
        <label>Nombre<input data-f="name" value="${esc(p.name)}" maxlength="120"></label>
        <label>SKU<input data-f="sku" class="sku-input" value="${esc(p.sku)}" maxlength="24" title="Código base; cada talla/color agrega su sufijo, ej. ${esc(C.variantSku(p, p.colors[0] || '', p.sizes[0]))}"></label>
        <label>Precio normal (CLP)<input data-f="price" type="number" min="100" step="10" value="${p.listPrice}"></label>
      </div>
      <div class="actions">
        <div class="status-pick" role="group" aria-label="Estado en la tienda">${Object.keys(C.STATUS)
          .map((k) => `<button type="button" data-v="${k}" aria-pressed="${k === st}">${C.STATUS[k]}</button>`)
          .join('')}</div>
        ${st === 'proximamente' ? `<span class="likes-pill" title="Clientes que marcaron Me gusta en la ficha (desde que existe el botón)">❤ ${likesOf(p.id)} me gusta</span>` : ''}
        <span class="hint">${st === 'proximamente' ? 'Se ve con el tag PRÓXIMAMENTE y no se puede comprar.' : st === 'oculto' ? 'No aparece en la tienda.' : total === 0 ? 'Sin stock: se ve AGOTADO.' : 'A la venta.'}</span>
      </div>
      <label>Descripción<textarea data-f="desc" rows="3" maxlength="1200">${esc(p.desc)}</textarea></label>
      <div class="stock-box">
        <div class="head">
          <label><input type="checkbox" data-act="stock-on" ${p.stock ? 'checked' : ''}> Controlar stock por talla</label>
          ${p.stock ? `<span class="hint"><b>${plural(total, 'unidad', 'unidades')}</b> en total</span><button type="button" class="btn small" data-act="arrivals">+ Registrar llegada</button>` : '<span class="hint">Sin control: siempre se puede comprar.</span>'}
        </div>
        ${p.stock ? stockTable(p) : ''}
        <div class="actions arrivals" hidden><button type="button" class="btn small primary" data-act="add-stock">Sumar al stock</button><button type="button" class="btn small ghost" data-act="arrivals">Cancelar</button></div>
      </div>
      <div class="actions">
        <button type="button" class="btn primary" data-act="save" disabled>Guardar cambios</button>
        <button type="button" class="btn ghost" data-act="discard" hidden>Descartar</button>
        <a href="../producto.html?id=${encodeURIComponent(p.id)}" target="_blank" rel="noopener">Ver en la tienda ↗</a>
      </div>
    </div>
  </article>`;
}

const PROD_FILTERS = { todos: 'Todos', disponible: 'Disponibles', proximamente: 'Próximamente', oculto: 'Ocultos', agotados: 'Agotados' };
function prodMatch(p, k) {
  if (k === 'todos') return true;
  if (k === 'agotados') return p.status === 'disponible' && C.isSoldOut(p);
  return p.status === k;
}

// Resumen arriba del inventario: unidades que quedan y su valor a costo (costo promedio de Compras) y a precio de venta
function invSummary(ci) {
  let units = 0, cost = 0, retail = 0, noCost = 0;
  const byType = {};
  data.products.forEach((p) => {
    if (!p.stock) return;
    (p.colors.length ? p.colors : ['']).forEach((c) => p.sizes.forEach((s) => {
      const q = C.stockOf(p, c, s) || 0;
      if (!q) return;
      const u = ci.unit({ id: p.id, color: c, size: s, sku: C.variantSku(p, c, s) });
      units += q; cost += q * u.v; retail += q * p.price;
      if (u.src === 'sin') noCost += q;
      byType[p.type] = (byType[p.type] || 0) + q;
    }));
  });
  return { units, cost, retail, noCost, byType };
}
function renderInvKpis() {
  const box = $('inv-kpis');
  if (!box) return;
  const v = invSummary(costIndex());
  const cats = Object.keys(v.byType).map((t) => `${v.byType[t]} ${esc((CFG.categories || {})[t] || t).toLowerCase()}`).join(' · ');
  box.innerHTML = `<div class="stat"><b>${v.units.toLocaleString('es-CL')}</b><span>Unidades en stock${cats ? '<br>' + cats : ''}</span></div>
    <div class="stat"><b>${money(Math.round(v.cost))}</b><span>Valorizado a costo${v.noCost ? `<br>⚠ ${v.noCost} u. sin costo en Compras (cuentan $0)` : ''}</span></div>
    <div class="stat"><b>${money(Math.round(v.retail))}</b><span>A precio de venta actual</span></div>
    <div class="stat"><b>${money(Math.round(v.retail - v.cost))}</b><span>Margen bruto si se vende todo<br>(antes de comisión y envío)</span></div>`;
}

function renderProducts() {
  renderInvKpis();
  const list = data.products;
  $('prod-filters').innerHTML = Object.keys(PROD_FILTERS)
    .map((k) => `<button type="button" class="chip" data-f="${k}" aria-pressed="${k === prodFilter}">${PROD_FILTERS[k]}<span>${list.filter((p) => prodMatch(p, k)).length}</span></button>`)
    .join('');
  const box = $('products');
  const cats = CFG.categories;
  // Re-dibuja solo las tarjetas sin cambios pendientes
  const keep = {};
  dirty.forEach((id) => {
    const el = box.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (el) keep[id] = el;
  });
  const editing = document.activeElement && document.activeElement.closest && document.activeElement.closest('.product');
  if (editing && editing.querySelector('tr.arrivals') && !keep[editing.dataset.id] && document.activeElement.matches('input[data-c], input.add')) keep[editing.dataset.id] = editing;
  // ...y las que tienen abierto "Registrar llegada" (se actualiza solo el stock mostrado)
  box.querySelectorAll('.product').forEach((el) => {
    const open = el.querySelector('tr.arrivals:not([hidden])');
    if (!open || keep[el.dataset.id]) return;
    const p = list.find((x) => x.id === el.dataset.id);
    if (!p || !p.stock) return;
    el.querySelectorAll('input[data-c]').forEach((i) => {
      if (i === document.activeElement) return;
      const n = C.stockOf(p, i.dataset.c === 'unico' ? '' : i.dataset.c, i.dataset.s);
      i.value = n;
      i.classList.toggle('zero', n === 0);
    });
    keep[el.dataset.id] = el;
  });
  box.innerHTML = Object.keys(cats)
    .map((t) => {
      const ps = list.filter((p) => p.type === t && prodMatch(p, prodFilter));
      return ps.length ? `<h2 class="cat-title">${esc(cats[t])}</h2>` + ps.map(productCard).join('') : '';
    })
    .join('') || '<p class="empty">No hay productos en esta lista.</p>';
  Object.keys(keep).forEach((id) => {
    const el = box.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (el) el.replaceWith(keep[id]);
  });
}
$('prod-filters').addEventListener('click', (e) => {
  const b = e.target.closest('[data-f]');
  if (!b) return;
  prodFilter = b.dataset.f;
  renderProducts();
});

function markDirty(card, on) {
  const id = card.dataset.id;
  if (on) dirty.add(id);
  else dirty.delete(id);
  card.classList.toggle('dirty', on);
  card.querySelector('[data-act="save"]').disabled = !on;
  card.querySelector('[data-act="discard"]').hidden = !on;
}

const fp = (...parts) => new FieldPath('products', ...parts);

$('products').addEventListener('input', (e) => {
  const card = e.target.closest('.product');
  if (!card || e.target.classList.contains('add')) return;
  if (e.target.matches('[data-f]')) markDirty(card, true);
});

// Stock: cada casilla se guarda sola al cambiarla (al salir de la casilla o con Enter)
$('products').addEventListener('change', async (e) => {
  const i = e.target;
  if (!i.matches('input[data-c]')) return;
  const card = i.closest('.product');
  const id = card.dataset.id;
  const p = data.products.find((x) => x.id === id);
  const n = Math.max(0, Math.floor(Number(i.value) || 0));
  i.value = n;
  if (n === C.stockOf(p, i.dataset.c === 'unico' ? '' : i.dataset.c, i.dataset.s)) return;
  try {
    await updateDoc(CATALOG, fp(id, 'stock', i.dataset.c, i.dataset.s), n);
    toast(`Stock ${i.dataset.s !== 'Única' ? 'talla ' + i.dataset.s : ''} ${i.dataset.c === 'unico' ? '' : colorName(i.dataset.c).toLowerCase()}: ${plural(n, 'unidad', 'unidades')} ✓`.replace(/\s+/g, ' '));
  } catch (err) {
    fail(err);
  }
});
$('products').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('input[data-c], input.add')) {
    e.preventDefault();
    if (e.target.matches('input[data-c]')) e.target.blur();
    else e.target.closest('.product').querySelector('[data-act="add-stock"]').click();
  }
});

$('products').addEventListener('click', async (e) => {
  const card = e.target.closest('.product');
  if (!card) return;
  const id = card.dataset.id;
  const p = data.products.find((x) => x.id === id);
  const b = e.target.closest('button, input[type="checkbox"]');
  if (!b) return;
  try {
    // Estado: se guarda al tiro
    if (b.dataset.v) {
      if (b.dataset.v === p.status) return;
      await updateDoc(CATALOG, fp(id, 'status'), b.dataset.v);
      toast(`${p.name}: ${C.STATUS[b.dataset.v]}`);
      return;
    }
    const act = b.dataset.act;
    if (act === 'stock-on') {
      if (b.checked) {
        const zeros = {};
        C.stockColors(p).forEach((c) => { zeros[c] = {}; p.sizes.forEach((s) => (zeros[c][s] = 0)); });
        await updateDoc(CATALOG, fp(id, 'stock'), zeros);
        toast('Stock activado: registra la llegada de unidades');
      } else {
        if (!confirm('¿Dejar de controlar el stock de este producto? Se podrá comprar sin límite.')) { b.checked = true; return; }
        await updateDoc(CATALOG, fp(id, 'stock'), null);
        toast('Control de stock desactivado');
      }
      return;
    }
    if (act === 'arrivals') {
      const show = card.querySelector('tr.arrivals').hidden;
      card.querySelectorAll('.arrivals').forEach((r) => (r.hidden = !show));
      if (show) { const first = card.querySelector('input.add'); if (first) first.focus(); }
      else card.querySelectorAll('input.add').forEach((i) => (i.value = ''));
      return;
    }
    if (act === 'add-stock') {
      const args = [];
      let units = 0;
      card.querySelectorAll('input.add').forEach((i) => {
        const n = Math.floor(Number(i.value));
        if (n > 0) { args.push(fp(id, 'stock', i.dataset.addC, i.dataset.addS), increment(n)); units += n; }
      });
      if (!args.length) return toast('Escribe cuántas unidades llegaron', true);
      await updateDoc(CATALOG, ...args);
      card.querySelectorAll('.arrivals').forEach((r) => (r.hidden = true));
      renderProducts();
      toast(`+${plural(units, 'unidad sumada', 'unidades sumadas')} al stock`);
      return;
    }
    if (act === 'discard') {
      markDirty(card, false);
      card.replaceWith(Object.assign(document.createElement('div'), { innerHTML: productCard(p) }).firstElementChild);
      return;
    }
    if (act === 'save') {
      const args = [];
      const name = card.querySelector('[data-f="name"]').value.trim();
      const price = Math.round(Number(card.querySelector('[data-f="price"]').value));
      const desc = card.querySelector('[data-f="desc"]').value.trim();
      if (name.length < 3) return toast('El nombre es muy corto', true);
      if (!Number.isInteger(price) || price < 100) return toast('Revisa el precio', true);
      if (name !== p.name) args.push(fp(id, 'name'), name);
      if (price !== p.listPrice) args.push(fp(id, 'price'), price);
      const sku = C.cleanSku(card.querySelector('[data-f="sku"]').value);
      if (!sku) return toast('Escribe un SKU (letras, números y guiones)', true);
      const taken = data.products.find((x) => x.id !== id && x.sku === sku);
      if (taken) return toast('Ese SKU ya lo usa ' + taken.name, true);
      if (sku !== p.sku) args.push(fp(id, 'sku'), sku);
      if (desc !== p.desc) args.push(fp(id, 'desc'), desc);
      markDirty(card, false);
      if (!args.length) return renderProducts();
      await updateDoc(CATALOG, ...args);
      toast('Guardado ✓');
    }
  } catch (err) {
    fail(err);
  }
});

// ---------- Ajustes ----------
function renderSettings() {
  if ($('settings').contains(document.activeElement)) return;
  const s = data.settings;
  $('s-rm').value = s.deliveryDaysRM;
  $('s-reg').value = s.deliveryDaysRegiones;
  $('s-range').value = s.rangeDays;
  $('s-cutoff').value = s.pickupCutoff;
  $('s-alert').value = s.alertDays;
  $('s-holidays').value = s.holidays.join('\n');
}
$('settings').addEventListener('submit', async (e) => {
  e.preventDefault();
  const holidays = $('s-holidays').value.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
  const bad = holidays.filter((h) => !/^\d{4}-\d{2}-\d{2}$/.test(h));
  if (bad.length) return toast('Fechas con formato incorrecto: ' + bad.join(', '), true);
  try {
    await updateDoc(CATALOG, 'settings', {
      deliveryDaysRM: Math.max(0, Math.floor(Number($('s-rm').value) || 0)),
      deliveryDaysRegiones: Math.max(0, Math.floor(Number($('s-reg').value) || 0)),
      alertDays: Math.max(0, Math.floor(Number($('s-alert').value) || 0)),
      rangeDays: Math.max(0, Math.floor(Number($('s-range').value) || 0)),
      pickupCutoff: /^\d{2}:\d{2}$/.test($('s-cutoff').value) ? $('s-cutoff').value : C.DEFAULT_SETTINGS.pickupCutoff,
      holidays: [...new Set(holidays)].sort(),
    });
    $('s-saved').hidden = false;
    setTimeout(() => ($('s-saved').hidden = true), 2500);
    document.activeElement.blur();
  } catch (err) {
    fail(err);
  }
});

// ---------- Notificaciones push (panel instalado en el inicio del celular) ----------
// El dispositivo se suscribe con la clave pública VAPID y queda guardado en pushSubs/{id};
// las funciones (pedido pagado, alerta diaria) mandan la notificación a todos los dispositivos guardados.
const pushSupported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const swReady = pushSupported ? navigator.serviceWorker.register('sw.js').catch((e) => { console.warn(e); return null; }) : Promise.resolve(null);
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

function b64ToBytes(b64) {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}
async function subId(endpoint) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return Array.from(new Uint8Array(h)).slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function currentSub() {
  const reg = await swReady;
  return reg ? reg.pushManager.getSubscription() : null;
}
async function renderPush() {
  const st = $('push-status');
  const on = $('push-on'), off = $('push-off'), test = $('push-test');
  if (!pushSupported) {
    st.innerHTML = isIOS && !standalone
      ? '📱 En iPhone las notificaciones funcionan solo con el panel <b>agregado al inicio</b> y abierto desde ese ícono. Sigue los pasos de abajo.'
      : 'Este navegador no permite notificaciones push.';
    on.hidden = off.hidden = test.hidden = true;
    $('push-card').querySelector('details').open = isIOS;
    return;
  }
  const sub = await currentSub().catch(() => null);
  const denied = Notification.permission === 'denied';
  st.innerHTML = sub ? '✅ <b>Activadas en este dispositivo.</b>' : denied
    ? '⛔ Bloqueaste las notificaciones. En iPhone: Ajustes → Notificaciones → Panel TWH → Permitir.'
    : 'Desactivadas en este dispositivo.';
  on.hidden = !!sub || denied;
  off.hidden = test.hidden = !sub;
}
$('push-on').addEventListener('click', async () => {
  try {
    if (!F.vapidPublicKey) throw new Error('Falta la clave pública');
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { renderPush(); return toast('No diste permiso para notificaciones', true); }
    const reg = await swReady;
    if (!reg) throw new Error('No se pudo registrar el service worker');
    await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(F.vapidPublicKey) });
    const j = sub.toJSON();
    await setDoc(doc(db, 'pushSubs', await subId(j.endpoint)), {
      endpoint: j.endpoint, keys: j.keys, device: navigator.userAgent.slice(0, 200), createdAt: serverTimestamp(), email: auth.currentUser.email,
    });
    toast('Notificaciones activadas ✓');
    renderPush();
    $('push-test').click();
  } catch (err) {
    fail(err);
  }
});
$('push-off').addEventListener('click', async () => {
  try {
    const sub = await currentSub();
    if (sub) {
      await deleteDoc(doc(db, 'pushSubs', await subId(sub.endpoint))).catch(() => {});
      await sub.unsubscribe();
    }
    toast('Notificaciones desactivadas en este dispositivo');
    renderPush();
  } catch (err) {
    fail(err);
  }
});
$('push-test').addEventListener('click', async () => {
  try {
    const r = await fetch(F.apiBase + '/probarPush', { method: 'POST', headers: { Authorization: 'Bearer ' + (await auth.currentUser.getIdToken()) } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || 'No se pudo mandar la prueba');
    toast(j.sent ? 'Prueba enviada: debería llegarte en unos segundos' : 'No hay dispositivos activados', !j.sent);
  } catch (err) {
    fail(err);
  }
});
renderPush();

window.addEventListener('beforeunload', (e) => {
  if (dirty.size) { e.preventDefault(); e.returnValue = ''; }
});

// ---------- Utilidades compartidas por Inventario, Ventas y Descuentos ----------
function downloadCsv(name, head, rows) {
  const csv = [head, ...rows].map((r) => r.map((v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const productById = (id) => data.products.find((p) => p.id === id);
function skuOfLine(l) {
  if (l.sku) return l.sku;
  const p = productById(l.id);
  return p ? C.variantSku(p, l.color, l.size, l.design) : l.id;
}
const lineNet = (l) => (l.net != null ? l.net : l.total) || 0;
const orderPaid = (o) => Number(o.paidAmount != null ? o.paidAmount : o.total) || 0;
function addDays(ymd, n) {
  const d = new Date(ymd + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

// ---------- Inventario por SKU (CSV) ----------
$('export-stock').addEventListener('click', () => {
  const since = addDays(C.todayCL(), -30);
  const sold30 = {};
  orders.filter((o) => PAID.includes(o.status) && (o.paidDate || '') >= since).forEach((o) => (o.lines || []).forEach((l) => {
    const k = skuOfLine(l);
    sold30[k] = (sold30[k] || 0) + l.qty;
  }));
  const rows = [];
  data.products.forEach((p) => {
    const colors = p.colors.length ? p.colors : [''];
    colors.forEach((c) => p.sizes.forEach((s) => {
      const sku = C.variantSku(p, c, s);
      const st = C.stockOf(p, c, s);
      rows.push([sku, p.name, CFG.categories[p.type] || p.type, c ? CFG.colors[c] : '', s, st == null ? 'sin control' : st,
        p.listPrice, p.price, st == null ? '' : st * p.price, C.STATUS[p.status], sold30[sku] || 0]);
    }));
  });
  downloadCsv(`inventario-twh-${C.todayCL()}.csv`,
    ['SKU', 'Producto', 'Categoría', 'Color', 'Talla', 'Stock', 'Precio normal', 'Precio actual', 'Valor inventario', 'Estado', 'Vendidas últimos 30 días'], rows);
  toast('Inventario descargado');
});

// ---------- OTD (On Time Delivery): % de pedidos entregados a más tardar el último día prometido ----------
function renderOtd(list) {
  const r = C.otd(list);
  const groups = [['rm', 'RM'], ['regiones', 'Regiones'], ['retiro', 'Retiro']].map(([z, label]) => {
    const g = C.otd(list.filter((o) => ((o.shipping || {}).zone || 'rm') === z));
    return `<tr><td>${label}</td><td class="n">${g.total}</td><td class="n">${g.onTime}</td><td class="n">${g.late}</td><td class="n"><b>${g.pct == null ? '—' : g.pct + '%'}</b></td></tr>`;
  }).join('');
  const lateList = list.filter((o) => C.onTime(o) === false).map((o) => {
    const days = C.daysUntil(o.promisedDate, C.fulfilledDate(o)) * -1;
    return `<li>${esc(o.id)} · ${esc((o.customer || {}).name)} · prometido ${fmtDate(o.promisedDate)}, entregado ${fmtDate(C.fulfilledDate(o))} (<b>${plural(days, 'día', 'días')} tarde</b>)</li>`;
  });
  const color = r.pct == null ? '' : r.pct >= 95 ? 'var(--green)' : r.pct >= 85 ? '#B7791F' : 'var(--red)';
  $('otd').innerHTML = `<div class="otd-row">
      <div class="otd-big" style="color:${color || 'inherit'}">${r.pct == null ? '—' : r.pct + '%'}<span>${r.total ? `${r.onTime} de ${r.total} a tiempo` : 'Aún no hay entregas en este período'}</span></div>
      <div class="table-wrap"><table class="data"><thead><tr><th>Entrega</th><th class="n">Entregados</th><th class="n">A tiempo</th><th class="n">Atrasados</th><th class="n">OTD</th></tr></thead><tbody>${groups}</tbody></table></div>
    </div>
    ${r.openLate ? `<p class="warn">⚠ ${plural(r.openLate, 'pedido', 'pedidos')} de este período ya pasó la fecha límite y aún no se entrega: contará como atrasado.</p>` : ''}
    ${lateList.length ? `<details><summary>Ver entregas atrasadas (${lateList.length})</summary><ul class="otd-late">${lateList.join('')}</ul></details>` : ''}
    <p class="hint">A tiempo = entregado (despacho) o listo para retiro a más tardar el último día del rango prometido. Meta sugerida: 95% o más.</p>`;
}

// ---------- Ventas ----------
const PERIODS = { hoy: 'Hoy', '7d': '7 días', mes: 'Este mes', mesant: 'Mes pasado', '30d': '30 días', ano: 'Este año', todo: 'Todo', rango: 'Elegir fechas' };
let period = 'mes';

function periodRange(k) {
  const t = C.todayCL();
  const first = t.slice(0, 8) + '01';
  if (k === 'hoy') return [t, t];
  if (k === '7d') return [addDays(t, -6), t];
  if (k === '30d') return [addDays(t, -29), t];
  if (k === 'mes') return [first, t];
  if (k === 'mesant') { const end = addDays(first, -1); return [end.slice(0, 8) + '01', end]; }
  if (k === 'ano') return [t.slice(0, 4) + '-01-01', t];
  if (k === 'rango') return [$('sales-from').value || first, $('sales-to').value || t];
  const firstPaid = orders.filter((o) => o.paidDate).map((o) => o.paidDate).sort()[0];
  return [firstPaid || t, t];
}

function renderSales() {
  if (!$('tab-ventas')) return;
  $('sales-period').innerHTML = Object.keys(PERIODS).map((k) => `<button type="button" class="chip" data-p="${k}" aria-pressed="${k === period}">${PERIODS[k]}</button>`).join('');
  $('sales-range').hidden = period !== 'rango';
  $('sales-df').innerHTML = dfBarHtml();
  const [from, to] = DF.range || periodRange(period);
  const inRange = (o) => PAID.includes(o.status) && o.paidDate && o.paidDate >= from && o.paidDate <= to;
  const list = applyDF(orders.filter(inRange));

  // Período anterior del mismo largo, para comparar
  const days = Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1);
  const pFrom = addDays(from, -days), pTo = addDays(from, -1);
  const prev = applyDF(orders.filter((o) => PAID.includes(o.status) && o.paidDate && o.paidDate >= pFrom && o.paidDate <= pTo));

  const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);
  const revenue = sum(list, orderPaid);
  const prevRevenue = sum(prev, orderPaid);
  const units = sum(list, (o) => sum(o.lines || [], (l) => l.qty));
  const shipping = sum(list, (o) => (o.shipping && o.shipping.cost) || 0);
  const coupons = sum(list, (o) => (o.discount && o.discount.amount) || 0);
  const offersSaved = sum(list, (o) => sum(o.lines || [], (l) => Math.max(0, ((l.list_price || l.unit_price) - l.unit_price) * l.qty)));
  const open = orders.filter((o) => C.OPEN_STATUS.includes(o.status)).length;
  const trend = (a, b) => {
    if (!b) return '';
    const d = Math.round(((a - b) / b) * 100);
    return ` <small style="color:${d >= 0 ? 'var(--green)' : 'var(--red)'}">${d >= 0 ? '▲' : '▼'} ${Math.abs(d)}%</small>`;
  };
  $('sales-kpis').innerHTML = [
    [money(revenue) + trend(revenue, prevRevenue), 'Ventas (total pagado)'],
    [list.length + trend(list.length, prev.length), 'Pedidos pagados'],
    [units, 'Unidades vendidas'],
    [money(list.length ? revenue / list.length : 0), 'Ticket promedio'],
    [money(coupons + offersSaved), `Descuentos dados (${money(coupons)} códigos · ${money(offersSaved)} ofertas)`],
    [money(shipping), 'Envíos cobrados'],
    [open, 'Pedidos por entregar (hoy)'],
  ].map(([b, s]) => `<div class="stat"><b>${b}</b><span>${s}</span></div>`).join('');

  renderOtd(list);

  // Gráfico por día (máx. 120 días; si es más largo, por mes)
  const byDay = {};
  list.forEach((o) => (byDay[o.paidDate] = (byDay[o.paidDate] || 0) + orderPaid(o)));
  let buckets = [];
  if (days <= 120) {
    for (let d = from; d <= to; d = addDays(d, 1)) buckets.push([d, byDay[d] || 0, fmtDate(d)]);
  } else {
    const byMonth = {};
    Object.keys(byDay).forEach((d) => (byMonth[d.slice(0, 7)] = (byMonth[d.slice(0, 7)] || 0) + byDay[d]));
    for (let m = from.slice(0, 7); m <= to.slice(0, 7); m = addDays(m + '-28', 5).slice(0, 7)) buckets.push([m, byMonth[m] || 0, m.split('-').reverse().join('-')]);
  }
  const max = Math.max(1, ...buckets.map((b) => b[1]));
  $('sales-chart').innerHTML = list.length
    ? `<div class="bars">${buckets.map((b) => `<div class="bar${b[1] ? '' : ' zero'}" ${b[1] ? dfAttr('range', b[0].length === 7 ? b[0] + '-01|' + b[0] + '-31' : b[0] + '|' + b[0], (b[0].length === 7 ? 'Mes ' : 'Día ') + b[2]) : ''}style="height:${b[1] ? Math.max(3, (b[1] / max) * 100) : 1}%" title="${b[2]}: ${money(b[1])}"></div>`).join('')}</div>
       <div class="bars-axis"><span>${buckets[0][2]}</span><span>Máximo: ${money(max)}</span><span>${buckets[buckets.length - 1][2]}</span></div>`
    : '<p class="empty" style="padding:20px 0">No hay ventas pagadas en este período.</p>';

  // Por SKU
  const bySku = {};
  list.forEach((o) => (o.lines || []).forEach((l) => {
    const k = skuOfLine(l);
    const r = bySku[k] || (bySku[k] = { sku: k, id: l.id, name: l.name, variant: lineText(l), type: l.type || (productById(l.id) || {}).type, color: l.color, size: l.size, units: 0, revenue: 0, orders: new Set() });
    r.units += l.qty;
    r.revenue += lineNet(l);
    r.orders.add(o.id);
  }));
  const skus = Object.values(bySku).sort((a, b) => b.revenue - a.revenue);
  const lineRevenue = sum(skus, (r) => r.revenue);
  const stockFor = (r) => { const p = productById(r.id); return p ? C.stockOf(p, r.color, r.size) : null; };

  // Más vendidos (por producto)
  const byProduct = {};
  skus.forEach((r) => {
    const x = byProduct[r.id] || (byProduct[r.id] = { id: r.id, name: r.name, units: 0, revenue: 0 });
    x.units += r.units;
    x.revenue += r.revenue;
  });
  const top = Object.values(byProduct).sort((a, b) => b.revenue - a.revenue).slice(0, 6);
  const topMax = top.length ? top[0].revenue : 1;
  $('sales-top').innerHTML = top.length
    ? top.map((t, i) => `<div class="top-item" ${dfAttr('product', t.id, t.name)}><span class="rank">${i + 1}</span><span>${esc(t.name)} <small class="hint">· ${plural(t.units, 'unidad', 'unidades')}</small></span><b>${money(t.revenue)}</b><span class="meter"><i style="width:${pct(t.revenue, topMax)}%"></i></span></div>`).join('')
    : '<p class="hint">Sin ventas en este período.</p>';

  // Stock bajo de lo que se vende
  const low = skus.map((r) => ({ ...r, stock: stockFor(r) })).filter((r) => r.stock != null && r.stock <= 2).sort((a, b) => a.stock - b.stock);
  $('sales-low').innerHTML = low.length
    ? `<table class="data"><thead><tr><th>SKU</th><th>Producto</th><th class="n">Vendidas</th><th class="n">Quedan</th></tr></thead><tbody>${low.map((r) => `<tr><td><span class="sku">${esc(r.sku)}</span></td><td>${esc(r.name)} <small class="hint">${esc(r.variant)}</small></td><td class="n">${r.units}</td><td class="n"><b style="color:${r.stock ? 'var(--amber)' : 'var(--red)'}">${r.stock}</b></td></tr>`).join('')}</tbody></table>`
    : '<p class="hint">Todo bien: nada de lo que se vende está por agotarse (o no tiene control de stock).</p>';

  // Tabla por SKU
  const q = $('sku-search').value.trim().toLowerCase();
  const shown = q ? skus.filter((r) => (r.sku + ' ' + r.name + ' ' + r.variant).toLowerCase().includes(q)) : skus;
  $('sales-sku').innerHTML = shown.length
    ? `<thead><tr><th>SKU</th><th>Producto</th><th>Variante</th><th class="n">Unidades</th><th class="n">Pedidos</th><th class="n">Ventas</th><th class="n">% del total</th><th class="n">Stock</th></tr></thead>
      <tbody>${shown.map((r) => { const st = stockFor(r); return `<tr ${dfAttr('sku', r.sku, r.sku)}><td><span class="sku">${esc(r.sku)}</span></td><td>${esc(r.name)}</td><td>${esc(r.variant)}</td><td class="n">${r.units}</td><td class="n">${r.orders.size}</td><td class="n">${money(r.revenue)}</td><td class="n">${pct(r.revenue, lineRevenue)}%</td><td class="n">${st == null ? '—' : st}</td></tr>`; }).join('')}</tbody>
      <tfoot><tr><td colspan="3">Total</td><td class="n">${sum(shown, (r) => r.units)}</td><td></td><td class="n">${money(sum(shown, (r) => r.revenue))}</td><td></td><td></td></tr></tfoot>`
    : '<tbody><tr><td class="hint">Sin ventas en este período.</td></tr></tbody>';

  // Por categoría
  const byCat = {};
  skus.forEach((r) => { const c = byCat[r.type] || (byCat[r.type] = { units: 0, revenue: 0 }); c.units += r.units; c.revenue += r.revenue; });
  const cats = Object.keys(byCat).sort((a, b) => byCat[b].revenue - byCat[a].revenue);
  $('sales-cat').innerHTML = cats.length
    ? `<thead><tr><th>Categoría</th><th class="n">Unidades</th><th class="n">Ventas</th><th class="n">%</th></tr></thead><tbody>${cats.map((c) => `<tr ${dfAttr('category', c, CFG.categories[c] || c)}><td>${esc(CFG.categories[c] || c)}</td><td class="n">${byCat[c].units}</td><td class="n">${money(byCat[c].revenue)}</td><td class="n">${pct(byCat[c].revenue, lineRevenue)}%</td></tr>`).join('')}</tbody>`
    : '<tbody><tr><td class="hint">Sin ventas.</td></tr></tbody>';

  // Por región
  const byReg = {};
  list.forEach((o) => {
    const s = o.shipping || {};
    const k = regionKey(o);
    const r = byReg[k] || (byReg[k] = { orders: 0, revenue: 0 });
    r.orders++;
    r.revenue += orderPaid(o);
  });
  const regs = Object.keys(byReg).sort((a, b) => byReg[b].revenue - byReg[a].revenue);
  $('sales-region').innerHTML = regs.length
    ? `<thead><tr><th>Región</th><th class="n">Pedidos</th><th class="n">Ventas</th></tr></thead><tbody>${regs.map((k) => `<tr ${dfAttr('region', k, k)}><td>${esc(k)}</td><td class="n">${byReg[k].orders}</td><td class="n">${money(byReg[k].revenue)}</td></tr>`).join('')}</tbody>`
    : '<tbody><tr><td class="hint">Sin ventas.</td></tr></tbody>';

  // Descuentos usados
  const disc = {};
  list.forEach((o) => {
    if (o.discount && o.discount.code) {
      const d = disc['Código ' + o.discount.code] || (disc['Código ' + o.discount.code] = { orders: 0, amount: 0, revenue: 0 });
      d.orders++; d.amount += o.discount.amount; d.revenue += orderPaid(o);
    }
    const seen = new Set();
    (o.lines || []).forEach((l) => {
      const saved = Math.max(0, ((l.list_price || l.unit_price) - l.unit_price) * l.qty);
      if (!saved) return;
      const k = 'Oferta ' + (l.offer || '');
      const d = disc[k] || (disc[k] = { orders: 0, amount: 0, revenue: 0 });
      if (!seen.has(k)) { d.orders++; seen.add(k); }
      d.amount += saved; d.revenue += lineNet(l);
    });
  });
  const dk = Object.keys(disc).sort((a, b) => disc[b].amount - disc[a].amount);
  $('sales-disc').innerHTML = dk.length
    ? `<thead><tr><th>Descuento</th><th class="n">Pedidos</th><th class="n">Descontado</th><th class="n">Ventas con descuento</th></tr></thead><tbody>${dk.map((k) => `<tr><td>${esc(k)}</td><td class="n">${disc[k].orders}</td><td class="n">${money(disc[k].amount)}</td><td class="n">${money(disc[k].revenue)}</td></tr>`).join('')}</tbody>`
    : '<tbody><tr><td class="hint">No se usaron descuentos en este período.</td></tr></tbody>';

  renderSales.last = { from, to, skus, stockFor };
}

$('sales-period').addEventListener('click', (e) => {
  const b = e.target.closest('[data-p]');
  if (!b) return;
  period = b.dataset.p;
  delete DF.range; delete DF._range;
  if (period === 'rango' && !$('sales-from').value) {
    const [f, t] = periodRange('30d');
    $('sales-from').value = f;
    $('sales-to').value = t;
  }
  renderSales();
});
$('sales-from').addEventListener('change', renderSales);
$('sales-to').addEventListener('change', renderSales);
$('sku-search').addEventListener('input', renderSales);
$('export-sales').addEventListener('click', () => {
  const L = renderSales.last;
  if (!L || !L.skus.length) return toast('No hay ventas en este período', true);
  downloadCsv(`ventas-por-sku-twh-${L.from}-a-${L.to}.csv`, ['SKU', 'Producto', 'Variante', 'Categoría', 'Unidades', 'Pedidos', 'Ventas', 'Stock actual'],
    L.skus.map((r) => { const st = L.stockFor(r); return [r.sku, r.name, r.variant, CFG.categories[r.type] || r.type, r.units, r.orders.size, r.revenue, st == null ? 'sin control' : st]; }));
});

// ---------- Descuentos ----------
let form = null; // lo que se está creando o editando

function discStatus(d) {
  const t = C.todayCL();
  if (d.active === false) return ['Pausado', 'gray'];
  if (d.to && d.to < t) return ['Vencido', 'gray'];
  if (d.from && d.from > t) return [`Parte el ${fmtDate(d.from)}`, 'amber'];
  if (d.maxUses && (d.uses || 0) >= d.maxUses) return ['Agotado', 'gray'];
  return ['Activo ahora', 'green'];
}
const discBig = (d) => (d.kind === 'amount' ? '-' + money(d.value) : d.value + '% OFF');
function discScope(d) {
  if (d.scope === 'category') return 'en ' + (d.targets || []).map((t) => CFG.categories[t] || t).join(', ');
  if (d.scope === 'products') {
    const names = (d.targets || []).map((id) => (productById(id) || {}).name).filter(Boolean);
    return names.length <= 2 ? 'en ' + names.join(' y ') : `en ${names.length} productos`;
  }
  return 'en toda la tienda';
}
function discDates(d) {
  if (d.from && d.to) return `del ${fmtDate(d.from)} al ${fmtDate(d.to)}`;
  if (d.from) return `desde el ${fmtDate(d.from)}`;
  if (d.to) return `hasta el ${fmtDate(d.to)}`;
  return 'sin fecha de término';
}

function renderDiscounts() {
  if (!$('tab-descuentos')) return;
  const offers = (raw && raw.offers) || {};
  const ids = Object.keys(offers).sort((a, b) => (offers[b].createdAt || '').localeCompare(offers[a].createdAt || ''));
  $('offers-list').innerHTML = ids.length
    ? ids.map((id) => {
        const o = offers[id];
        const [st, cls] = discStatus(o);
        const affected = data.products.filter((p) => C.offerApplies({ ...o, active: true, from: '', to: '' }, p, C.todayCL())).length;
        return `<article class="card disc-row${cls === 'gray' ? ' off' : ''}" data-offer="${esc(id)}">
          <div class="big">${discBig(o)}</div>
          <div><b>${esc(o.name || 'Oferta')}</b> <span class="pill ${cls}">${st}</span>
            <div class="meta">${discBig(o)} ${discScope(o)} · ${discDates(o)} · ${plural(affected, 'producto', 'productos')}</div></div>
          <div class="acts">
            <label class="switch"><input type="checkbox" data-act="toggle" ${o.active === false ? '' : 'checked'}> Activa</label>
            <button type="button" class="btn small" data-act="edit">Editar</button>
            <button type="button" class="btn small ghost" data-act="del">Eliminar</button>
          </div></article>`;
      }).join('')
    : '<p class="hint">Todavía no hay ofertas. Crea una con "+ Nueva oferta".</p>';

  const cs = coupons.slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  $('coupons-list').innerHTML = cs.length
    ? cs.map((c) => {
        const [st, cls] = discStatus(c);
        return `<article class="card disc-row${cls === 'gray' ? ' off' : ''}" data-coupon="${esc(c.code)}">
          <div class="big">${discBig(c)}</div>
          <div><span class="code">${esc(c.code)}</span> <span class="pill ${cls}">${st}</span>
            <div class="meta">${discBig(c)} ${discScope(c)}${c.minSubtotal ? ' · compra mínima ' + money(c.minSubtotal) : ''} · ${discDates(c)}</div>
            <div class="meta">Usado <b>${plural(c.uses || 0, 'vez', 'veces')}</b>${c.maxUses ? ' de ' + c.maxUses : ''}${c.name ? ' · ' + esc(c.name) : ''}</div></div>
          <div class="acts">
            <label class="switch"><input type="checkbox" data-act="toggle" ${c.active === false ? '' : 'checked'}> Activo</label>
            <button type="button" class="btn small" data-act="copy">Copiar código</button>
            <button type="button" class="btn small" data-act="edit">Editar</button>
            <button type="button" class="btn small ghost" data-act="del">Eliminar</button>
          </div></article>`;
      }).join('')
    : '<p class="hint">Todavía no hay códigos. Crea uno con "+ Nuevo código".</p>';
}

function openForm(type, existing, key) {
  form = existing
    ? { type, key, ...JSON.parse(JSON.stringify(existing)) }
    : { type, key: null, name: '', code: '', kind: 'percent', value: type === 'coupon' ? 10 : 20, scope: 'all', targets: [], from: '', to: '', minSubtotal: '', maxUses: '', active: true };
  renderForm();
  $('disc-form').hidden = false;
  $('disc-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function formPreview() {
  const f = form;
  const v = Number(f.value) || 0;
  if (!v) return 'Escribe cuánto descuento quieres dar.';
  const what = f.kind === 'amount' ? `<b>${money(v)} de descuento</b>` : `<b>${v}% de descuento</b>`;
  const scope = discScope(f);
  const dates = discDates(f);
  let text = f.type === 'coupon'
    ? `Quien escriba <b>${esc(f.code || 'EL CÓDIGO')}</b> en el carrito tiene ${what} ${scope}${f.minSubtotal ? `, comprando desde ${money(f.minSubtotal)}` : ''}, ${dates}${f.maxUses ? `, hasta ${plural(Number(f.maxUses), 'uso', 'usos')}` : ''}.`
    : `Los clientes ven ${what} ${scope}, ${dates}, con el precio normal tachado.`;
  const ex = data.products.find((p) => C.offerApplies({ ...f, active: true, from: '', to: '' }, p, C.todayCL()));
  if (ex && f.type === 'offer') text += `<span class="ex">Ejemplo: ${esc(ex.name)} <s>${money(ex.listPrice)}</s> → <b>${money(C.offerPrice(f, ex.listPrice))}</b></span>`;
  if (ex && f.type === 'coupon') {
    const off = f.kind === 'amount' ? Math.min(v, ex.price) : Math.round((ex.price * v) / 100);
    text += `<span class="ex">Ejemplo: una ${esc(ex.name)} a ${money(ex.price)} queda en <b>${money(ex.price - off)}</b></span>`;
  }
  return text;
}

function renderForm() {
  const f = form;
  const isC = f.type === 'coupon';
  const cats = CFG.categories;
  const seg = (name, opts, cur) => `<div class="seg" data-seg="${name}">${Object.keys(opts).map((k) => `<button type="button" data-v="${k}" aria-pressed="${k === cur}">${opts[k]}</button>`).join('')}</div>`;
  const quick = f.kind === 'amount' ? [2000, 3000, 5000, 10000] : [10, 15, 20, 30, 50];
  $('disc-form').innerHTML = `
    <h2>${f.key ? 'Editar' : 'Nuevo'} ${isC ? 'código de descuento' : 'oferta'}</h2>
    <div class="step"><b>1. ${isC ? 'El código que escribirá el cliente' : 'Nombre de la oferta (lo ve el cliente en la ficha)'}</b>
      ${isC ? `<input id="f-code" class="sku-input" value="${esc(f.code)}" placeholder="Ej: TWH10, VERANO, SORTEO" maxlength="20" ${f.key ? 'disabled' : ''} style="max-width:280px">
        <input id="f-name" value="${esc(f.name)}" placeholder="Nota para ti (opcional): ej. sorteo Instagram noviembre" maxlength="80">`
      : `<input id="f-name" value="${esc(f.name)}" placeholder="Ej: Black Friday, Liquidación de invierno" maxlength="60">`}
    </div>
    <div class="step"><b>2. ¿Cuánto descuento?</b>
      ${seg('kind', { percent: '% Porcentaje', amount: '$ Monto fijo' }, f.kind)}
      <div class="inline">
        <input id="f-value" type="number" min="1" ${f.kind === 'percent' ? 'max="90"' : 'step="500"'} value="${esc(f.value)}" aria-label="Valor del descuento"> ${f.kind === 'percent' ? '%' : 'pesos'}
        ${quick.map((q) => `<button type="button" class="chip" data-quick="${q}">${f.kind === 'percent' ? q + '%' : money(q)}</button>`).join('')}
      </div>
    </div>
    <div class="step"><b>3. ¿En qué productos?</b>
      ${seg('scope', { all: 'Toda la tienda', category: 'Una o más categorías', products: 'Productos específicos' }, f.scope)}
      ${f.scope === 'category' ? `<div class="picks">${Object.keys(cats).map((k) => `<label class="pick"><input type="checkbox" data-target="${k}" ${f.targets.includes(k) ? 'checked' : ''}> ${esc(cats[k])}</label>`).join('')}</div>` : ''}
      ${f.scope === 'products' ? `<div class="picks">${data.products.filter((p) => p.status !== 'oculto').map((p) => `<label class="pick"><input type="checkbox" data-target="${esc(p.id)}" ${f.targets.includes(p.id) ? 'checked' : ''}> ${esc(p.name)}</label>`).join('')}</div>` : ''}
    </div>
    <div class="step"><b>4. ¿Cuándo? <span class="hint">(déjalo vacío para que empiece ya y no termine)</span></b>
      <div class="inline"><label>Desde <input type="date" id="f-from" value="${esc(f.from)}"></label><label>Hasta <input type="date" id="f-to" value="${esc(f.to)}"></label></div>
    </div>
    ${isC ? `<div class="step"><b>5. Condiciones <span class="hint">(opcionales)</span></b>
      <div class="inline"><label>Compra mínima $ <input type="number" id="f-min" min="0" step="1000" value="${esc(f.minSubtotal)}" placeholder="0"></label>
      <label>Máximo de usos <input type="number" id="f-max" min="0" step="1" value="${esc(f.maxUses)}" placeholder="sin límite"></label></div>
    </div>` : ''}
    <div class="preview" id="f-preview">${formPreview()}</div>
    <div class="actions"><button type="submit" class="btn primary">${f.key ? 'Guardar cambios' : isC ? 'Crear código' : 'Crear oferta'}</button><button type="button" class="btn ghost" data-act="cancel">Cancelar</button></div>`;
}

function readForm() {
  const f = form;
  const val = (id) => ($(id) ? $(id).value : '');
  if (f.type === 'coupon' && !f.key) f.code = val('f-code').toUpperCase().replace(/[^A-Z0-9]/g, '');
  f.name = val('f-name').trim();
  f.value = val('f-value');
  f.from = val('f-from');
  f.to = val('f-to');
  if (f.type === 'coupon') { f.minSubtotal = val('f-min'); f.maxUses = val('f-max'); }
  f.targets = [...document.querySelectorAll('#disc-form [data-target]:checked')].map((i) => i.dataset.target);
}

$('tab-descuentos').addEventListener('click', (e) => {
  const n = e.target.closest('[data-new]');
  if (n) return openForm(n.dataset.new);
  if (!form || !e.target.closest('#disc-form')) return;
  const segBtn = e.target.closest('[data-seg] button');
  if (segBtn) {
    readForm();
    const name = segBtn.parentElement.dataset.seg;
    form[name] = segBtn.dataset.v;
    if (name === 'scope') form.targets = [];
    if (name === 'kind') form.value = segBtn.dataset.v === 'amount' ? 5000 : 10;
    return renderForm();
  }
  const q = e.target.closest('[data-quick]');
  if (q) { readForm(); form.value = q.dataset.quick; return renderForm(); }
  if (e.target.closest('[data-act="cancel"]')) { form = null; $('disc-form').hidden = true; }
});
$('disc-form').addEventListener('input', () => { readForm(); $('f-preview').innerHTML = formPreview(); });
$('disc-form').addEventListener('change', () => { readForm(); $('f-preview').innerHTML = formPreview(); });

$('disc-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  readForm();
  const f = form;
  const v = Number(f.value);
  if (f.type === 'coupon' && !/^[A-Z0-9]{3,20}$/.test(f.code)) return toast('El código debe tener entre 3 y 20 letras o números (sin espacios)', true);
  if (f.type === 'coupon' && !f.key && coupons.some((c) => c.code === f.code)) return toast('Ese código ya existe', true);
  if (!(v > 0)) return toast('Escribe cuánto descuento quieres dar', true);
  if (f.kind === 'percent' && v > 90) return toast('El máximo es 90%', true);
  if (f.scope !== 'all' && !f.targets.length) return toast('Elige al menos una categoría o producto', true);
  if (f.from && f.to && f.from > f.to) return toast('La fecha "hasta" es antes que "desde"', true);
  const out = {
    name: f.name, kind: f.kind, value: Math.round(v), scope: f.scope, targets: f.scope === 'all' ? [] : f.targets,
    from: f.from || '', to: f.to || '', active: f.active !== false, createdAt: f.createdAt || new Date().toISOString(),
  };
  try {
    if (f.type === 'offer') {
      const key = f.key || 'of' + Date.now().toString(36);
      await updateDoc(CATALOG, new FieldPath('offers', key), out);
    } else {
      out.minSubtotal = Math.max(0, Math.round(Number(f.minSubtotal) || 0));
      out.maxUses = Math.max(0, Math.round(Number(f.maxUses) || 0));
      await setDoc(doc(db, 'cupones', f.code), { ...out, code: f.code }, { merge: true });
    }
    toast(f.key ? 'Cambios guardados ✓' : f.type === 'offer' ? 'Oferta creada ✓' : `Código ${f.code} creado ✓`);
    form = null;
    $('disc-form').hidden = true;
  } catch (err) {
    fail(err);
  }
});

async function discAction(e) {
  const row = e.target.closest('[data-offer], [data-coupon]');
  const act = e.target.closest('[data-act]');
  if (!row || !act) return;
  const isOffer = row.dataset.offer != null;
  const key = isOffer ? row.dataset.offer : row.dataset.coupon;
  const item = isOffer ? ((raw && raw.offers) || {})[key] : coupons.find((c) => c.code === key);
  if (!item) return;
  try {
    switch (act.dataset.act) {
      case 'toggle':
        if (e.type !== 'change') return;
        if (isOffer) await updateDoc(CATALOG, new FieldPath('offers', key, 'active'), act.checked);
        else await updateDoc(doc(db, 'cupones', key), { active: act.checked });
        toast(act.checked ? 'Activado ✓' : 'Pausado');
        break;
      case 'edit':
        if (e.type !== 'click') return;
        openForm(isOffer ? 'offer' : 'coupon', item, key);
        break;
      case 'copy':
        if (e.type !== 'click') return;
        await navigator.clipboard.writeText(key);
        toast(`Código ${key} copiado`);
        break;
      case 'del':
        if (e.type !== 'click') return;
        if (!confirm(`¿Eliminar ${isOffer ? 'la oferta "' + (item.name || 'Oferta') + '"' : 'el código ' + key}? No se puede deshacer.`)) return;
        if (isOffer) await updateDoc(CATALOG, new FieldPath('offers', key), deleteField());
        else await deleteDoc(doc(db, 'cupones', key));
        toast('Eliminado');
        break;
    }
  } catch (err) {
    fail(err);
  }
}
['offers-list', 'coupons-list'].forEach((id) => {
  $(id).addEventListener('click', discAction);
  $(id).addEventListener('change', discAction);
});

// ---------- Compras (registro de compras a proveedores, costo unitario por SKU y ETA) ----------
// compras/{id} = { date, supplier, eta, costTotal (IVA incl.), note, status: 'en_camino'|'recibida', receivedDate,
//                  stockAdded, lines: [{ id, name, color, size, qty, sku, unitCost? }] }
let buyEdit = null; // { key, data } compra que se está editando en el formulario

const buyUnits = (b) => (b.lines || []).reduce((s, l) => s + (Number(l.qty) || 0), 0);
// Costo unitario de una línea: el propio, o el total de la compra repartido parejo entre las unidades sin costo propio
function lineCost(b, l) {
  if (Number(l.unitCost) > 0) return Number(l.unitCost);
  const own = (b.lines || []).filter((x) => Number(x.unitCost) > 0);
  const ownTotal = own.reduce((s, x) => s + x.unitCost * x.qty, 0);
  const rest = buyUnits(b) - own.reduce((s, x) => s + x.qty, 0);
  return rest > 0 ? Math.max(0, (Number(b.costTotal) || 0) - ownTotal) / rest : 0;
}
const money1 = (n) => '$' + (Math.round((Number(n) || 0) * 10) / 10).toLocaleString('es-CL', { maximumFractionDigits: 1 });

function buyEta(b) {
  if (b.status === 'recibida') return { cls: 'gray', text: 'Recibida ' + fmtDate(b.receivedDate) };
  if (!b.eta) return { cls: 'amber', text: 'En camino · sin ETA' };
  const d = C.daysUntil(b.eta);
  if (d < 0) return { cls: 'red', text: `Atrasada ${plural(-d, 'día', 'días')} (ETA ${fmtDate(b.eta)})` };
  if (d === 0) return { cls: 'amber', text: 'Llega hoy' };
  return { cls: 'green', text: `Llega en ${plural(d, 'día', 'días')} · ${C.dayName(b.eta)}` };
}

function renderBuys() {
  if (!$('tab-compras')) return;
  const all = compras.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const units = all.reduce((s, b) => s + buyUnits(b), 0);
  const cost = all.reduce((s, b) => s + (Number(b.costTotal) || 0), 0);
  const coming = all.filter((b) => b.status !== 'recibida');
  const nextEta = coming.map((b) => b.eta).filter(Boolean).sort()[0];
  $('buy-kpis').innerHTML = [
    [money(cost), 'Total invertido (IVA incl.)'],
    [units, 'Unidades compradas'],
    [money(units ? cost / units : 0), 'Costo unitario promedio'],
    [coming.reduce((s, b) => s + buyUnits(b), 0), `Unidades en camino${nextEta ? ' · próxima ETA ' + fmtDate(nextEta) : ''}`],
  ].map(([b, s]) => `<div class="stat"><b>${b}</b><span>${s}</span></div>`).join('');

  $('buy-list').innerHTML = all.length ? all.map((b) => {
    const e = buyEta(b);
    const u = buyUnits(b);
    const byColor = {};
    (b.lines || []).forEach((l) => { const k = l.color ? CFG.colors[l.color] || l.color : 'Único'; byColor[k] = (byColor[k] || 0) + l.qty; });
    return `<article class="card buy" data-buy="${esc(b.key)}">
      <div class="buy-head">
        <b>${fmtDate(b.date)}</b>${b.supplier ? ` · ${esc(b.supplier)}` : ''}
        <span class="pill ${e.cls}">${e.text}</span>
        <span class="buy-total">${money(b.costTotal)}</span>
      </div>
      ${b.note ? `<p class="hint">${esc(b.note)}</p>` : ''}
      <p>${plural(u, 'unidad', 'unidades')} (${Object.keys(byColor).map((k) => `${byColor[k]} ${k.toLowerCase()}`).join(' · ')}) · costo unitario promedio <b>${money1(u ? b.costTotal / u : 0)}</b></p>
      <div class="buy-actions">
        ${b.status !== 'recibida'
          ? (b.stockAdded
            ? '<span class="hint">✓ Ya cargada al stock</span><button type="button" class="btn primary small" data-buy-act="receive">Llegó</button>'
            : '<button type="button" class="btn primary small" data-buy-act="receive">Llegó: sumar al stock</button><button type="button" class="btn ghost small" data-buy-act="preload">Cargar al stock antes de que llegue</button>')
          : (b.stockAdded ? '<span class="hint">✓ Sumada al stock</span>' : '')}
        <button type="button" class="btn ghost small" data-buy-act="edit">Ver / editar</button>
        <button type="button" class="btn ghost small" data-buy-act="delete">Eliminar</button>
      </div>
    </article>`;
  }).join('') : '<p class="empty">Todavía no hay compras. Usa "Importar pedido a proveedor" o "+ Nueva compra".</p>';

  // Resumen por SKU y talla (todas las compras)
  const rows = {};
  all.forEach((b) => (b.lines || []).forEach((l) => {
    const p = productById(l.id);
    const sku = p ? C.variantSku(p, l.color, l.size) : l.sku || l.id;
    const r = rows[sku] || (rows[sku] = { sku, name: p ? p.name : l.name, color: l.color, size: l.size, qty: 0, cost: 0, price: p ? p.listPrice : 0 });
    r.qty += l.qty;
    r.cost += lineCost(b, l) * l.qty;
  }));
  const q = ($('buy-search').value || '').trim().toLowerCase();
  const list = Object.values(rows).filter((r) => !q || (r.sku + ' ' + r.name).toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name) || (a.color || '').localeCompare(b.color || '') || C_SIZE(a.size) - C_SIZE(b.size));
  buyRows = list;
  $('buy-sku').innerHTML = list.length
    ? `<thead><tr><th>SKU</th><th>Producto</th><th>Color</th><th>Talla</th><th class="n">Unidades</th><th class="n">Costo unit.</th><th class="n">Costo total</th><th class="n">Precio venta</th><th class="n">Margen bruto</th></tr></thead><tbody>${list.map((r) => {
      const unit = r.qty ? r.cost / r.qty : 0;
      const mg = r.price ? Math.round(((r.price - unit) / r.price) * 100) : null;
      return `<tr><td><span class="sku">${esc(r.sku)}</span></td><td>${esc(r.name)}</td><td>${r.color ? esc(CFG.colors[r.color] || r.color) : '—'}</td><td>${esc(r.size)}</td><td class="n">${r.qty}</td><td class="n">${money1(unit)}</td><td class="n">${money(r.cost)}</td><td class="n">${r.price ? money(r.price) : '—'}</td><td class="n">${mg == null ? '—' : mg + '%'}</td></tr>`;
    }).join('')}</tbody>`
    : '<tbody><tr><td class="empty">Sin compras registradas.</td></tr></tbody>';
}
let buyRows = [];
const SIZE_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'Única'];
function C_SIZE(s) { const i = SIZE_ORDER.indexOf(s); return i < 0 ? 99 : i; }

// ----- Formulario -----
function buyLineHtml(l, i) {
  const p = productById(l.id);
  const prodOpts = data.products.filter((x) => x.type !== 'stickers' || x.id === l.id)
    .map((x) => `<option value="${esc(x.id)}"${x.id === l.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('');
  const colors = p && p.colors.length ? p.colors : [];
  const sizes = p ? p.sizes : [];
  return `<tr data-i="${i}">
    <td><select data-f="id" aria-label="Producto"><option value="">Producto…</option>${prodOpts}${!p && l.id ? `<option value="${esc(l.id)}" selected>${esc(l.name || l.id)} (ya no existe)</option>` : ''}</select></td>
    <td>${colors.length ? `<select data-f="color" aria-label="Color">${colors.map((c) => `<option value="${c}"${c === l.color ? ' selected' : ''}>${esc(CFG.colors[c])}</option>`).join('')}</select>` : '—'}</td>
    <td><select data-f="size" aria-label="Talla">${sizes.map((s) => `<option${s === l.size ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select></td>
    <td><input type="number" data-f="qty" min="1" value="${esc(l.qty)}" aria-label="Cantidad" class="qty-in"></td>
    <td><input type="number" data-f="unitCost" min="0" value="${l.unitCost ? esc(l.unitCost) : ''}" placeholder="auto" aria-label="Costo unitario propio" class="qty-in"></td>
    <td><button type="button" class="link" data-f="del" aria-label="Quitar línea">✕</button></td>
  </tr>`;
}
function buyFormSummary() {
  const b = buyEdit.data;
  const u = buyUnits(b);
  $('bf-sum').innerHTML = `${plural(u, 'unidad', 'unidades')} · costo unitario promedio <b>${money1(u ? (Number(b.costTotal) || 0) / u : 0)}</b>`;
}
function openBuyForm(key, d) {
  buyEdit = { key, data: JSON.parse(JSON.stringify(d)) };
  const b = buyEdit.data;
  const f = $('buy-form');
  f.hidden = false;
  f.innerHTML = `<h2>${key ? 'Editar compra' : 'Nueva compra'}</h2>
    <div class="grid3">
      <label>Fecha de compra<input type="date" id="bf-date" value="${esc(b.date || C.todayCL())}" required></label>
      <label>Proveedor<input id="bf-supplier" value="${esc(b.supplier || '')}" maxlength="80" placeholder="Ej: Taller X"></label>
      <label>ETA (cuándo llega)<input type="date" id="bf-eta" value="${esc(b.eta || '')}"></label>
    </div>
    <div class="grid3">
      <label>Costo total (IVA incluido)<input type="number" id="bf-cost" min="0" value="${esc(b.costTotal || '')}" required></label>
      <label style="grid-column:span 2">Nota<input id="bf-note" value="${esc(b.note || '')}" maxlength="200" placeholder="Ej: incluye estampado y etiquetas"></label>
    </div>
    <div class="table-wrap"><table class="data buy-lines"><thead><tr><th>Producto</th><th>Color</th><th>Talla</th><th>Cant.</th><th>Costo unit. propio</th><th></th></tr></thead>
      <tbody id="bf-lines">${(b.lines || []).map(buyLineHtml).join('')}</tbody></table></div>
    <p><button type="button" class="btn ghost small" id="bf-add">+ Agregar línea</button></p>
    <p id="bf-sum"></p>
    <p class="hint">Deja "costo unit. propio" vacío para repartir el costo total parejo entre todas las unidades.</p>
    <div class="actions"><button class="btn primary" type="submit">Guardar compra</button><button type="button" class="btn ghost" id="bf-cancel">Cancelar</button></div>`;
  buyFormSummary();
  f.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function readBuyForm() {
  const b = buyEdit.data;
  b.date = $('bf-date').value || C.todayCL();
  b.supplier = $('bf-supplier').value.trim().slice(0, 80);
  b.eta = $('bf-eta').value || '';
  b.costTotal = Math.max(0, Math.round(Number($('bf-cost').value) || 0));
  b.note = $('bf-note').value.trim().slice(0, 200);
}
$('buy-new').addEventListener('click', () => openBuyForm(null, { status: 'en_camino', lines: [{ id: '', color: '', size: '', qty: 1 }] }));
$('buy-form').addEventListener('input', (e) => {
  if (!buyEdit) return;
  const tr = e.target.closest('tr[data-i]');
  if (tr && (e.target.dataset.f === 'qty' || e.target.dataset.f === 'unitCost')) {
    const l = buyEdit.data.lines[Number(tr.dataset.i)];
    l[e.target.dataset.f] = Math.max(0, Math.round(Number(e.target.value) || 0));
  }
  readBuyForm();
  buyFormSummary();
});
$('buy-form').addEventListener('change', (e) => {
  const tr = e.target.closest('tr[data-i]');
  if (!tr || !buyEdit) return;
  const i = Number(tr.dataset.i);
  const l = buyEdit.data.lines[i];
  const f = e.target.dataset.f;
  if (f === 'id') {
    const p = productById(e.target.value);
    l.id = e.target.value;
    l.name = p ? p.name : '';
    l.color = p && p.colors.length ? p.colors[0] : '';
    l.size = p ? p.sizes[0] : '';
    tr.outerHTML = buyLineHtml(l, i);
  }
  if (f === 'color' || f === 'size') l[f] = e.target.value;
});
$('buy-form').addEventListener('click', (e) => {
  if (!buyEdit) return;
  if (e.target.id === 'bf-add') {
    const last = buyEdit.data.lines[buyEdit.data.lines.length - 1];
    buyEdit.data.lines.push(last ? { ...last, qty: 1, unitCost: 0 } : { id: '', color: '', size: '', qty: 1 });
    $('bf-lines').innerHTML = buyEdit.data.lines.map(buyLineHtml).join('');
    buyFormSummary();
  }
  if (e.target.dataset.f === 'del') {
    buyEdit.data.lines.splice(Number(e.target.closest('tr').dataset.i), 1);
    $('bf-lines').innerHTML = buyEdit.data.lines.map(buyLineHtml).join('');
    buyFormSummary();
  }
  if (e.target.id === 'bf-cancel') { buyEdit = null; $('buy-form').hidden = true; }
});
$('buy-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  readBuyForm();
  const b = buyEdit.data;
  b.lines = (b.lines || []).filter((l) => l.id && l.qty > 0).map((l) => {
    const p = productById(l.id);
    const out = { id: l.id, name: p ? p.name : l.name || l.id, color: l.color || '', size: l.size || 'Única', qty: Math.round(l.qty) };
    out.sku = p ? C.variantSku(p, out.color, out.size) : l.sku || '';
    if (Number(l.unitCost) > 0) out.unitCost = Math.round(l.unitCost);
    return out;
  });
  if (!b.lines.length) return toast('Agrega al menos un producto', true);
  if (!b.costTotal) return toast('Escribe el costo total de la compra', true);
  try {
    const ref = buyEdit.key ? doc(db, 'compras', buyEdit.key) : doc(collection(db, 'compras'));
    const { key, ...clean } = b;
    await setDoc(ref, { ...clean, status: b.status || 'en_camino', updatedAt: serverTimestamp() });
    toast('Compra guardada ✓');
    buyEdit = null;
    $('buy-form').hidden = true;
  } catch (err) {
    fail(err);
  }
});

// Importar compra.json (lo genera node disenos/pedido/generar-pedido.js --costo=...)
$('buy-import').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const j = JSON.parse(await file.text());
    if (j.tipo !== 'twh-compra' || !Array.isArray(j.lineas)) throw new Error('Este archivo no es un compra.json del pedido a proveedor');
    const missing = j.lineas.filter((l) => !productById(l.id));
    openBuyForm(null, {
      date: j.fecha || C.todayCL(), supplier: j.proveedor || '', eta: j.eta || '', costTotal: Number(j.costoTotal) || 0, note: j.nota || '', status: 'en_camino',
      lines: j.lineas.map((l) => ({ id: l.id, name: l.nombre, color: l.color || '', size: l.talla, qty: Number(l.cantidad) || 0 })),
    });
    toast(missing.length ? `Revisa: ${missing.length} línea(s) de productos que ya no existen` : 'Pedido cargado: revisa, pon la ETA y guarda', !!missing.length);
  } catch (err) {
    toast('No se pudo leer el archivo: ' + err.message, true);
  }
});

$('buy-list').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-buy-act]');
  if (!btn) return;
  const key = btn.closest('[data-buy]').dataset.buy;
  const b = compras.find((x) => x.key === key);
  const act = btn.dataset.buyAct;
  if (act === 'edit') return openBuyForm(key, b);
  try {
    if (act === 'delete') {
      if (!confirm('¿Eliminar esta compra del registro? (no cambia el stock)')) return;
      await deleteDoc(doc(db, 'compras', key));
      return toast('Compra eliminada');
    }
    if (act === 'preload') {
      // Para mostrar en la tienda las tallas que vienen (dejando el producto en Próximamente mientras): suma ahora y "Llegó" ya no vuelve a sumar
      if (!confirm(`¿Sumar ya las ${buyUnits(b)} unidades al stock aunque no hayan llegado?

Ojo: si el producto está "Disponible" se podrán comprar al tiro. Déjalo en "Próximamente" hasta que lleguen.`)) return;
      await addBuyToStock(b);
      await updateDoc(doc(db, 'compras', key), { stockAdded: true, stockAddedDate: C.todayCL() });
      return toast('Cargada al stock ✓ (cuando llegue, aprieta "Llegó")');
    }
    if (act === 'receive' && b.stockAdded) {
      await updateDoc(doc(db, 'compras', key), { status: 'recibida', receivedDate: C.todayCL() });
      return toast('Marcada como recibida ✓');
    }
    if (act === 'receive') {
      const add = confirm(`¿Sumar las ${buyUnits(b)} unidades al stock de la tienda?\n\nAceptar = sumar al stock · Cancelar = solo marcarla como recibida`);
      if (add) await addBuyToStock(b);
      await updateDoc(doc(db, 'compras', key), { status: 'recibida', receivedDate: C.todayCL(), stockAdded: add || !!b.stockAdded });
      toast(add ? 'Recibida y sumada al stock ✓' : 'Marcada como recibida');
    }
  } catch (err) {
    fail(err);
  }
});

// Suma las unidades al stock por talla (si el producto no controlaba stock, empieza a controlarlo con lo recibido)
async function addBuyToStock(b) {
  const rawProducts = (raw && raw.products) || {};
  const args = [];
  const fresh = {};
  (b.lines || []).forEach((l) => {
    if (!productById(l.id)) return;
    const key = C.stockKey(l.color);
    const st = rawProducts[l.id] && rawProducts[l.id].stock;
    if (st && typeof st === 'object') args.push(new FieldPath('products', l.id, 'stock', key, l.size), increment(l.qty));
    else {
      fresh[l.id] = fresh[l.id] || {};
      fresh[l.id][key] = fresh[l.id][key] || {};
      fresh[l.id][key][l.size] = (fresh[l.id][key][l.size] || 0) + l.qty;
    }
  });
  Object.keys(fresh).forEach((id) => args.push(new FieldPath('products', id, 'stock'), fresh[id]));
  if (args.length) await updateDoc(CATALOG, ...args);
}

$('buy-search').addEventListener('input', renderBuys);
$('buy-export').addEventListener('click', () => {
  renderBuys();
  downloadCsv(`costos-por-sku-twh-${C.todayCL()}.csv`,
    ['SKU', 'Producto', 'Color', 'Talla', 'Unidades compradas', 'Costo unitario', 'Costo total', 'Precio venta', 'Margen bruto %'],
    buyRows.map((r) => {
      const unit = r.qty ? r.cost / r.qty : 0;
      return [r.sku, r.name, r.color ? CFG.colors[r.color] || r.color : '', r.size, r.qty, Math.round(unit), Math.round(r.cost), r.price,
        r.price ? Math.round(((r.price - unit) / r.price) * 100) : ''];
    }));
  toast('Costos descargados');
});

// ---------- Utilidades (ventas − costo de lo vendido − envíos − comisión Mercado Pago − empaque − otros gastos) ----------
// Costo de cada unidad vendida = costo promedio ponderado de ese SKU en Compras (o del producto, o el promedio general).
// Supuestos editables en privado/utilidades: { feePct, packCost, otherMonthly }.
const PRIV = doc(db, 'privado', 'utilidades');
let profitCfg = { feePct: 3.81, packCost: 0, otherMonthly: 0 }; // real 2026-11-19: dinero en cuenta MP 3,81% (3,19% + IVA); crédito 2,69% + IVA, débito 2,19% + IVA
let pfPeriod = 'mes';
let pfRows = [];

function costIndex() {
  const bySku = {}, byProd = {}, byType = {};
  compras.forEach((b) => (b.lines || []).forEach((l) => {
    const p = productById(l.id);
    const sku = p ? C.variantSku(p, l.color, l.size) : l.sku || l.id;
    const c = lineCost(b, l) * l.qty;
    (bySku[sku] = bySku[sku] || { q: 0, c: 0 }).q += l.qty; bySku[sku].c += c;
    (byProd[l.id] = byProd[l.id] || { q: 0, c: 0 }).q += l.qty; byProd[l.id].c += c;
    const t = p ? p.type : '';
    (byType[t] = byType[t] || { q: 0, c: 0 }).q += l.qty; byType[t].c += c;
  }));
  return {
    invested: compras.reduce((s, b) => s + (Number(b.costTotal) || 0), 0),
    unit(l) {
      const sku = skuOfLine(l);
      if (bySku[sku] && bySku[sku].q) return { v: bySku[sku].c / bySku[sku].q, src: 'sku' };
      if (byProd[l.id] && byProd[l.id].q) return { v: byProd[l.id].c / byProd[l.id].q, src: 'producto' };
      // sin compras de ese producto: promedio de su categoría (ej. otra polera); si no hay, costo 0 y se avisa
      const p = productById(l.id);
      const t = byType[p ? p.type : ''];
      return t && t.q ? { v: t.c / t.q, src: 'promedio' } : { v: 0, src: 'sin', name: p ? p.name : l.name };
    },
  };
}

// Resultado de un pedido pagado
function orderProfit(o, ci) {
  const ship = o.shipping || {};
  const revenue = orderPaid(o);
  const shipCharged = Number(ship.cost) || 0;
  const products = revenue - shipCharged;
  let cogs = 0, noCost = 0, avgCost = 0;
  const missing = [];
  const lines = (o.lines || []).map((l) => {
    const u = ci.unit(l);
    if (u.src === 'sin') { noCost += l.qty; missing.push(l.name); }
    if (u.src === 'promedio') avgCost += l.qty;
    cogs += u.v * l.qty;
    return { l, unit: u.v };
  });
  const share = o._share != null ? o._share : 1; // pedido recortado por el filtro de producto/categoría
  const shipPaid = ship.method === 'retiro' ? 0 : (o.shipCostReal != null && o.shipCostReal !== '' ? Number(o.shipCostReal) : ((CFG.shipping[ship.zone] || {}).price || 0) * share);
  const fee = o.mpFee != null ? Number(o.mpFee) : revenue * (profitCfg.feePct / 100);
  const pack = (Number(profitCfg.packCost) || 0) * share;
  return { revenue, products, shipCharged, cogs, shipPaid, fee, feeReal: o.mpFee != null, pack, noCost, avgCost, missing, lines,
    profit: revenue - cogs - shipPaid - fee - pack };
}

function renderProfit() {
  if (!$('tab-utilidades')) return;
  const keys = Object.keys(PERIODS).filter((k) => k !== 'rango');
  $('pf-period').innerHTML = keys.map((k) => `<button type="button" class="chip" data-pp="${k}" aria-pressed="${k === pfPeriod}">${PERIODS[k]}</button>`).join('');
  $('pf-df').innerHTML = dfBarHtml();
  const [from, to] = DF.range || periodRange(pfPeriod);
  const list = applyDF(orders.filter((o) => PAID.includes(o.status) && o.paidDate && o.paidDate >= from && o.paidDate <= to));
  const ci = costIndex();
  const R = list.map((o) => ({ o, r: orderProfit(o, ci) }));
  const sum = (f) => R.reduce((s, x) => s + f(x.r), 0);
  const months = new Set();
  for (let d = from; d <= to; d = addDays(d, 1)) months.add(d.slice(0, 7));
  const partial = DF.order || DF.sku || DF.product || DF.category || DF.region; // gastos fijos no se cargan a una parte
  const other = partial || DF.range ? 0 : (Number(profitCfg.otherMonthly) || 0) * (pfPeriod === 'hoy' || pfPeriod === '7d' ? 0 : months.size);
  const T = {
    products: sum((r) => r.products), shipCharged: sum((r) => r.shipCharged), revenue: sum((r) => r.revenue),
    cogs: sum((r) => r.cogs), shipPaid: sum((r) => r.shipPaid), fee: sum((r) => r.fee), pack: sum((r) => r.pack),
    noCost: sum((r) => r.noCost), avgCost: sum((r) => r.avgCost), feeReal: R.filter((x) => x.r.feeReal).length,
  };
  T.gross = T.revenue - T.cogs;
  T.profit = T.revenue - T.cogs - T.shipPaid - T.fee - T.pack - other;
  const pctOf = (a) => (T.revenue ? Math.round((a / T.revenue) * 1000) / 10 + '%' : '—');

  $('pf-kpis').innerHTML = [
    [money(T.revenue), 'Ingresos (total pagado)'],
    [money(T.profit), 'Utilidad'],
    [pctOf(T.profit), 'Margen neto'],
    [money(list.length ? T.profit / list.length : 0), 'Utilidad por pedido'],
  ].map(([b, s]) => `<div class="stat"><b>${b}</b><span>${s}</span></div>`).join('');

  const row = (label, v, cls) => `<tr class="${cls || ''}"><td>${label}</td><td class="n">${v < 0 ? '−' + money(-v) : money(v)}</td><td class="n">${pctOf(Math.abs(v))}</td></tr>`;
  $('pf-pnl').innerHTML = `<thead><tr><th></th><th class="n">Monto</th><th class="n">% ingresos</th></tr></thead><tbody>
    ${row('Ventas de productos (con descuentos)', T.products)}
    ${row('Envíos cobrados', T.shipCharged)}
    ${row('<b>Ingresos</b>', T.revenue, 'sub')}
    ${row('− Costo de lo vendido', -T.cogs)}
    ${row('<b>Utilidad bruta</b>', T.gross, 'sub')}
    ${row('− Envíos pagados al courier', -T.shipPaid)}
    ${row(`− Comisión Mercado Pago${T.feeReal ? ` (${T.feeReal} de ${R.length} reales)` : ' (estimada)'}`, -T.fee)}
    ${row('− Empaque', -T.pack)}
    ${other ? row('− Otros gastos', -other) : ''}
    ${row('<b>Utilidad</b>', T.profit, 'total')}
    ${row('Utilidad sin IVA (÷ 1,19)', T.profit / 1.19, 'muted')}
  </tbody>`;
  $('pf-notes').innerHTML = [
    `${plural(list.length, 'pedido pagado', 'pedidos pagados')} entre ${fmtDate(from)} y ${fmtDate(to)}. Montos con IVA incluido.`,
    T.noCost ? `⚠ Sin costo registrado (se contó como $0): ${esc([...new Set(R.flatMap((x) => x.r.missing))].join(', '))}. Regístralos en Compras para que la utilidad sea real.` : '',
    T.avgCost ? `${plural(T.avgCost, 'unidad usó', 'unidades usaron')} el costo promedio de su categoría (ese modelo no está en Compras).` : '',
  ].filter(Boolean).join(' ');

  // Recuperación de la inversión (todo el historial) y valor del inventario a costo
  const allPaid = orders.filter((o) => PAID.includes(o.status));
  const allProfit = allPaid.reduce((s, o) => s + orderProfit(o, ci).profit, 0);
  const allCogs = allPaid.reduce((s, o) => s + orderProfit(o, ci).cogs, 0);
  const inv = invSummary(ci), invUnits = inv.units, invValue = inv.cost;
  const recovered = ci.invested ? Math.min(100, Math.round(((allCogs + Math.max(0, allProfit)) / ci.invested) * 100)) : 0;
  $('pf-roi').innerHTML = ci.invested
    ? `<div class="roi-bar"><span style="width:${recovered}%"></span></div>
       <p><b>${recovered}%</b> de lo invertido en mercadería ya volvió en ventas (costo recuperado + utilidad).</p>
       <table class="data"><tbody>
         <tr><td>Invertido en compras</td><td class="n">${money(ci.invested)}</td></tr>
         <tr><td>Costo de lo ya vendido</td><td class="n">${money(allCogs)}</td></tr>
         <tr><td>Utilidad acumulada</td><td class="n">${money(allProfit)}</td></tr>
         <tr><td>Inventario en bodega a costo (${invUnits} u.)</td><td class="n">${money(invValue)}</td></tr>
       </tbody></table>
       <p class="hint" style="margin-top:6px">El inventario solo cuenta productos con stock cargado en el panel.</p>`
    : '<p class="empty">Registra tus compras en la pestaña Compras para ver cuánto has recuperado.</p>';

  // Por mes (todo el historial, con el filtro de producto/región/pedido si hay)
  const byMonth = {};
  applyDF(allPaid).forEach((o) => {
    const m = (o.paidDate || '').slice(0, 7);
    const r = orderProfit(o, ci);
    const x = byMonth[m] || (byMonth[m] = { n: 0, rev: 0, cogs: 0, other: 0, profit: 0 });
    x.n++; x.rev += r.revenue; x.cogs += r.cogs; x.other += r.shipPaid + r.fee + r.pack; x.profit += r.profit;
  });
  const mk = Object.keys(byMonth).sort().reverse();
  $('pf-month').innerHTML = mk.length
    ? `<thead><tr><th>Mes</th><th class="n">Pedidos</th><th class="n">Ingresos</th><th class="n">Costo productos</th><th class="n">Envíos, comisión y empaque</th><th class="n">Utilidad</th><th class="n">Margen</th></tr></thead><tbody>${mk.map((m) => {
      const x = byMonth[m];
      const pr = x.profit - (partial ? 0 : Number(profitCfg.otherMonthly) || 0);
      const lbl = 'Mes ' + m.split('-').reverse().join('-');
      return `<tr ${dfAttr('range', m + '-01|' + m + '-31', lbl)}><td>${m.split('-').reverse().join('-')}</td><td class="n">${x.n}</td><td class="n">${money(x.rev)}</td><td class="n">${money(x.cogs)}</td><td class="n">${money(x.other)}</td><td class="n"><b>${money(pr)}</b></td><td class="n">${x.rev ? Math.round((pr / x.rev) * 100) + '%' : '—'}</td></tr>`;
    }).join('')}</tbody>`
    : '<tbody><tr><td class="empty">Todavía no hay ventas pagadas.</td></tr></tbody>';

  // Por producto (período elegido): el envío, la comisión y el empaque se reparten según lo que aporta cada línea
  const byProd = {};
  R.forEach(({ r }) => {
    const extra = r.shipPaid + r.fee + r.pack - r.shipCharged; // costo variable neto del pedido
    r.lines.forEach(({ l, unit }) => {
      const share = r.products ? lineNet(l) / r.products : 0;
      const x = byProd[l.id] || (byProd[l.id] = { id: l.id, name: l.name, q: 0, sales: 0, cogs: 0, extra: 0 });
      x.q += l.qty; x.sales += lineNet(l); x.cogs += unit * l.qty; x.extra += extra * share;
    });
  });
  pfRows = Object.values(byProd).map((x) => ({ ...x, profit: x.sales - x.cogs - x.extra })).sort((a, b) => b.profit - a.profit);
  $('pf-prod').innerHTML = pfRows.length
    ? `<thead><tr><th>Producto</th><th class="n">Unidades</th><th class="n">Ventas</th><th class="n">Costo</th><th class="n">Envío/comisión</th><th class="n">Utilidad</th><th class="n">Margen</th><th class="n">Utilidad por unidad</th></tr></thead><tbody>${pfRows.map((x) =>
      `<tr ${dfAttr('product', x.id, x.name)}><td>${esc(x.name)}</td><td class="n">${x.q}</td><td class="n">${money(x.sales)}</td><td class="n">${money(x.cogs)}</td><td class="n">${money(x.extra)}</td><td class="n"><b>${money(x.profit)}</b></td><td class="n">${x.sales ? Math.round((x.profit / x.sales) * 100) + '%' : '—'}</td><td class="n">${money(x.q ? x.profit / x.q : 0)}</td></tr>`).join('')}</tbody>`
    : '<tbody><tr><td class="empty">No hay ventas en este período.</td></tr></tbody>';

  // Pedidos (tocar uno = ver solo su utilidad)
  const ordRows = R.slice().sort((a, b) => (b.o.paidDate || '').localeCompare(a.o.paidDate || '') || String(b.o.id).localeCompare(String(a.o.id)));
  $('pf-orders').innerHTML = ordRows.length
    ? `<thead><tr><th>Pedido</th><th>Pagado</th><th>Cliente</th><th>Productos</th><th class="n">Ingreso</th><th class="n">Costo</th><th class="n">Envío/comisión/empaque</th><th class="n">Utilidad</th><th class="n">Margen</th></tr></thead><tbody>${ordRows.map(({ o, r }) => {
      const extra = r.shipPaid + r.fee + r.pack;
      return `<tr ${dfAttr('order', o.id, 'Pedido ' + o.id)}${DF.order === o.id ? ' class="sel"' : ''}><td><span class="sku">${esc(o.id)}</span></td><td>${fmtDate(o.paidDate)}</td><td>${esc((o.customer || {}).name || '')}</td>
        <td>${(o.lines || []).map((l) => `${l.qty}× ${esc(l.name)}`).join(', ')}</td><td class="n">${money(r.revenue)}</td><td class="n">${money(r.cogs)}</td>
        <td class="n" title="Envío ${money(r.shipPaid)} · comisión ${money(r.fee)}${r.feeReal ? ' (real)' : ' (estimada)'} · empaque ${money(r.pack)}">${money(extra)}${r.feeReal ? '' : ' <small class="hint">*</small>'}</td>
        <td class="n"><b>${money(r.profit)}</b></td><td class="n">${r.revenue ? Math.round((r.profit / r.revenue) * 100) + '%' : '—'}</td></tr>`;
    }).join('')}</tbody>`
    : '<tbody><tr><td class="empty">No hay pedidos en este período.</td></tr></tbody>';

  if (!$('pf-settings').contains(document.activeElement)) {
    $('pf-fee').value = profitCfg.feePct;
    $('pf-pack').value = profitCfg.packCost;
    $('pf-other').value = profitCfg.otherMonthly;
  }
}

$('pf-period').addEventListener('click', (e) => {
  const b = e.target.closest('[data-pp]');
  if (!b) return;
  pfPeriod = b.dataset.pp;
  delete DF.range; delete DF._range;
  renderSales();
  renderProfit();
});
$('pf-settings').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await setDoc(PRIV, {
      feePct: Math.max(0, Number($('pf-fee').value) || 0),
      packCost: Math.max(0, Math.round(Number($('pf-pack').value) || 0)),
      otherMonthly: Math.max(0, Math.round(Number($('pf-other').value) || 0)),
    }, { merge: true });
    toast('Supuestos guardados ✓');
    document.activeElement.blur();
  } catch (err) {
    fail(err);
  }
});
$('pf-export').addEventListener('click', () => {
  downloadCsv(`utilidades-por-producto-twh-${C.todayCL()}.csv`,
    ['Producto', 'Unidades', 'Ventas', 'Costo productos', 'Envío/comisión/empaque', 'Utilidad', 'Margen %', 'Utilidad por unidad'],
    pfRows.map((x) => [x.name, x.q, Math.round(x.sales), Math.round(x.cogs), Math.round(x.extra), Math.round(x.profit),
      x.sales ? Math.round((x.profit / x.sales) * 100) : '', x.q ? Math.round(x.profit / x.q) : '']));
  toast('Utilidades descargadas');
});

// ---------- Filtro al tocar (compartido por Ventas y Utilidades) ----------
// Tocar una fila o barra filtra todo el tablero: DF = { range:[desde,hasta], order, sku, product, category, region } y
// DF._<clave> = texto que se muestra en la barra de filtros. Con filtro de producto/SKU/categoría, cada pedido se
// "recorta" a esas líneas y su envío, comisión y descuentos se reparten según lo que esas líneas aportan.
let DF = {};
const DF_KEYS = ['range', 'order', 'sku', 'product', 'category', 'region'];
const regionKey = (o) => { const s = o.shipping || {}; return s.method === 'retiro' ? 'Retiro' : s.region || '—'; };

function lineMatch(l) {
  if (DF.sku && skuOfLine(l) !== DF.sku) return false;
  if (DF.product && l.id !== DF.product) return false;
  if (DF.category && ((productById(l.id) || {}).type || l.type) !== DF.category) return false;
  return true;
}
function applyDF(list) {
  const lineF = DF.sku || DF.product || DF.category;
  return list.map((o) => {
    if (DF.order && o.id !== DF.order) return null;
    if (DF.region && regionKey(o) !== DF.region) return null;
    if (!lineF) return o;
    const all = o.lines || [];
    const lines = all.filter(lineMatch);
    if (!lines.length) return null;
    const tot = all.reduce((s, l) => s + lineNet(l), 0);
    const part = lines.reduce((s, l) => s + lineNet(l), 0);
    const share = tot ? part / tot : 0;
    const ship = o.shipping || {};
    const shipCost = (Number(ship.cost) || 0) * share;
    return {
      ...o, lines, _share: share,
      shipping: { ...ship, cost: shipCost },
      paidAmount: part + shipCost,
      discount: o.discount ? { ...o.discount, amount: (Number(o.discount.amount) || 0) * share } : o.discount,
      mpFee: o.mpFee != null ? Number(o.mpFee) * share : o.mpFee,
      shipCostReal: o.shipCostReal != null && o.shipCostReal !== '' ? Number(o.shipCostReal) * share : o.shipCostReal,
    };
  }).filter(Boolean);
}
const dfAttr = (key, v, label) => `data-df="${key}" data-v="${esc(v)}" data-l="${esc(label)}"`;
function dfBarHtml() {
  const on = DF_KEYS.filter((k) => DF[k] != null);
  if (!on.length) return '<p class="hint">💡 Toca una fila, producto o barra del gráfico para filtrar todo el tablero.</p>';
  return `<span class="hint">Filtrado por:</span> ${on.map((k) => `<button type="button" class="chip on" data-dfx="${k}">${esc(DF['_' + k])} ✕</button>`).join('')}
    <button type="button" class="link" data-dfx="all">Quitar filtros</button>`;
}
function setDF(key, value, label) {
  DF = { ...DF };
  if (value == null || (DF[key] != null && String(DF[key]) === String(value))) { delete DF[key]; delete DF['_' + key]; } // tocar de nuevo = quitar
  else { DF[key] = value; DF['_' + key] = label; }
  // producto, SKU y categoría se excluyen entre sí (el último que se toca manda)
  if (value != null && ['sku', 'product', 'category'].includes(key)) ['sku', 'product', 'category'].filter((k) => k !== key).forEach((k) => { delete DF[k]; delete DF['_' + k]; });
  renderSales();
  renderProfit();
}
['tab-ventas', 'tab-utilidades'].forEach((id) => $(id).addEventListener('click', (e) => {
  const x = e.target.closest('[data-dfx]');
  if (x) {
    if (x.dataset.dfx === 'all') { DF = {}; renderSales(); renderProfit(); }
    else setDF(x.dataset.dfx, null);
    return;
  }
  const t = e.target.closest('[data-df]');
  if (!t || e.target.closest('a, input, select')) return;
  const key = t.dataset.df;
  setDF(key, key === 'range' ? t.dataset.v.split('|') : t.dataset.v, t.dataset.l);
}));

// ---------- Venta manual (transferencia, efectivo): sin comisión de Mercado Pago, descuenta stock y cuenta en tableros ----------
// Crea un pedido igual a los de la tienda (pedidos/*) con source: 'manual', paymentMethod y mpFee: 0.
const PAY_METHODS = { transferencia: 'Transferencia', efectivo: 'Efectivo', otro: 'Otro' };
let manual = null; // { lines: [...] }

function newManualId() {
  const r = Array.from(crypto.getRandomValues(new Uint8Array(3))).map((b) => b.toString(36).toUpperCase().padStart(2, '0')).join('').slice(0, 4);
  return 'TWH-' + Date.now().toString(36).toUpperCase() + '-' + r;
}
function mLineHtml(l, i) {
  const p = productById(l.id);
  const prodOpts = data.products.filter((x) => x.status !== 'oculto' || x.id === l.id)
    .map((x) => `<option value="${esc(x.id)}"${x.id === l.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('');
  const colors = p && p.colors.length ? p.colors : [];
  const designs = p && p.designs ? p.designs : [];
  const st = p && p.stock ? C.stockOf(p, l.color, l.size) : null;
  return `<tr data-i="${i}">
    <td><select data-f="id" aria-label="Producto"><option value="">Producto…</option>${prodOpts}</select></td>
    <td>${designs.length ? `<select data-f="design" aria-label="Diseño">${designs.map((d) => `<option value="${esc(d.id)}"${d.id === l.design ? ' selected' : ''}>${esc(d.name)}</option>`).join('')}</select>` : '—'}</td>
    <td>${colors.length ? `<select data-f="color" aria-label="Color">${colors.map((c) => `<option value="${c}"${c === l.color ? ' selected' : ''}>${esc(CFG.colors[c])}</option>`).join('')}</select>` : '—'}</td>
    <td><select data-f="size" aria-label="Talla">${(p ? p.sizes : []).map((s) => `<option${s === l.size ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select>${st != null ? `<small class="hint"> quedan ${st}</small>` : ''}</td>
    <td><input type="number" data-f="qty" min="1" value="${esc(l.qty)}" class="qty-in" aria-label="Cantidad"></td>
    <td><input type="number" data-f="price" min="0" value="${esc(l.price)}" class="qty-in" aria-label="Precio unitario"></td>
    <td><button type="button" class="link" data-f="del" aria-label="Quitar">✕</button></td>
  </tr>`;
}
function mDefaults(l) {
  const p = productById(l.id);
  if (!p) return l;
  l.color = p.colors.length ? (p.colors.includes(l.color) ? l.color : p.colors[0]) : '';
  l.size = p.sizes.includes(l.size) ? l.size : p.sizes[0];
  l.design = p.designs && p.designs.length ? (p.designs.some((d) => d.id === l.design) ? l.design : p.designs[0].id) : '';
  l.price = p.price;
  return l;
}
function mTotals() {
  const sub = manual.lines.reduce((s, l) => s + (Number(l.price) || 0) * (Number(l.qty) || 0), 0);
  const ship = $('mv-ship').value === 'despacho' ? Math.max(0, Math.round(Number($('mv-shipcost').value) || 0)) : 0;
  $('mv-total').innerHTML = `Productos ${money(sub)}${ship ? ' + envío ' + money(ship) : ''} = <b>${money(sub + ship)}</b> · sin comisión`;
  return { sub, ship };
}
function openManual() {
  manual = { lines: [mDefaults({ id: (data.products.find((p) => p.type === 'polera' && p.status !== 'oculto') || data.products[0]).id, qty: 1 })] };
  const f = $('manual-form');
  f.hidden = false;
  const points = CFG.pickupPoints || [];
  f.innerHTML = `<h2>Venta manual <small class="hint">(transferencia o efectivo, sin Mercado Pago)</small></h2>
    <div class="grid3">
      <label>Nombre del cliente<input id="mv-name" maxlength="80" required></label>
      <label>Teléfono (opcional)<input id="mv-phone" maxlength="20" type="tel"></label>
      <label>Correo (opcional)<input id="mv-email" maxlength="120" type="email"></label>
    </div>
    <div class="grid3">
      <label>Medio de pago<select id="mv-pay">${Object.keys(PAY_METHODS).map((k) => `<option value="${k}">${PAY_METHODS[k]}</option>`).join('')}</select></label>
      <label>Fecha de pago<input type="date" id="mv-date" value="${C.todayCL()}"></label>
      <label>Entrega<select id="mv-ship">
        <option value="mano">Entrega en mano (acordada)</option>
        ${points.map((pt, i) => `<option value="p${i}">Retiro: ${esc(pt)}</option>`).join('')}
        <option value="despacho">Despacho</option></select></label>
    </div>
    <div class="grid3" id="mv-addr" hidden>
      <label>Región<select id="mv-region">${CFG.regions.map((r) => `<option${r === 'Región Metropolitana' ? ' selected' : ''}>${esc(r)}</option>`).join('')}</select></label>
      <label>Comuna<input id="mv-comuna" maxlength="60"></label>
      <label>Dirección<input id="mv-address" maxlength="160"></label>
      <label>Envío cobrado al cliente ($)<input type="number" id="mv-shipcost" min="0" value="0"></label>
    </div>
    <div class="table-wrap" style="margin-top:12px"><table class="data buy-lines"><thead><tr><th>Producto</th><th>Diseño</th><th>Color</th><th>Talla</th><th>Cant.</th><th>Precio unit.</th><th></th></tr></thead>
      <tbody id="mv-lines">${manual.lines.map(mLineHtml).join('')}</tbody></table></div>
    <p><button type="button" class="btn ghost small" id="mv-add">+ Agregar producto</button></p>
    <div class="grid3">
      <label>Estado<select id="mv-status"><option value="entregado">Entregado (ya lo tiene)</option><option value="preparando">En preparación</option><option value="pagado">Pagado · por preparar</option></select></label>
      <label class="check"><input type="checkbox" id="mv-stock" checked> Descontar del stock</label>
      <label class="check"><input type="checkbox" id="mv-mails"> Mandarle correos de despacho/entrega</label>
    </div>
    <label style="margin-top:10px">Nota interna (opcional)<input id="mv-note" maxlength="300" placeholder="Ej: amigo de la U, pagó al Banco Estado"></label>
    <p id="mv-total" class="mv-total"></p>
    <div class="actions"><button class="btn primary" type="submit">Guardar venta</button><button type="button" class="btn ghost" id="mv-cancel">Cancelar</button></div>`;
  mTotals();
  f.scrollIntoView({ behavior: 'smooth', block: 'start' });
  $('mv-name').focus();
}
$('manual-new').addEventListener('click', openManual);
$('manual-form').addEventListener('change', (e) => {
  if (!manual) return;
  if (e.target.id === 'mv-ship') {
    $('mv-addr').hidden = e.target.value !== 'despacho';
    $('mv-status').value = e.target.value === 'mano' ? 'entregado' : 'preparando';
  }
  const tr = e.target.closest('tr[data-i]');
  if (tr) {
    const i = Number(tr.dataset.i);
    const l = manual.lines[i];
    const f = e.target.dataset.f;
    if (f === 'id') { l.id = e.target.value; mDefaults(l); }
    if (f === 'color' || f === 'size' || f === 'design') l[f] = e.target.value;
    tr.outerHTML = mLineHtml(l, i);
  }
  mTotals();
});
$('manual-form').addEventListener('input', (e) => {
  if (!manual) return;
  const tr = e.target.closest('tr[data-i]');
  if (tr && (e.target.dataset.f === 'qty' || e.target.dataset.f === 'price')) {
    manual.lines[Number(tr.dataset.i)][e.target.dataset.f === 'qty' ? 'qty' : 'price'] = Math.max(0, Math.round(Number(e.target.value) || 0));
  }
  mTotals();
});
$('manual-form').addEventListener('click', (e) => {
  if (!manual) return;
  if (e.target.id === 'mv-add') {
    const last = manual.lines[manual.lines.length - 1];
    manual.lines.push(last ? { ...last, qty: 1 } : mDefaults({ id: data.products[0].id, qty: 1 }));
    $('mv-lines').innerHTML = manual.lines.map(mLineHtml).join('');
    mTotals();
  }
  if (e.target.dataset.f === 'del') {
    manual.lines.splice(Number(e.target.closest('tr').dataset.i), 1);
    $('mv-lines').innerHTML = manual.lines.map(mLineHtml).join('');
    mTotals();
  }
  if (e.target.id === 'mv-cancel') { manual = null; $('manual-form').hidden = true; }
});
$('manual-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('mv-name').value.trim();
  if (name.length < 2) return toast('Escribe el nombre del cliente', true);
  const lines = manual.lines.filter((l) => productById(l.id) && l.qty > 0).map((l) => {
    const p = productById(l.id);
    const d = p.designs ? p.designs.find((x) => x.id === l.design) : null;
    const price = Math.max(0, Math.round(Number(l.price) || 0));
    return {
      id: p.id, sku: C.variantSku(p, l.color, l.size, l.design), name: p.name, type: p.type, size: l.size,
      color: l.color || '', color_name: l.color ? CFG.colors[l.color] || l.color : '', design: l.design || '', design_name: d ? d.name : '',
      qty: l.qty, list_price: p.listPrice || p.price, unit_price: price, offer: price < (p.listPrice || p.price) ? 'Precio manual' : '',
      total: price * l.qty, discount: 0, net: price * l.qty,
    };
  });
  if (!lines.length) return toast('Agrega al menos un producto', true);
  const { sub, ship } = mTotals();
  const shipSel = $('mv-ship').value;
  const points = CFG.pickupPoints || [];
  const paidDate = $('mv-date').value || C.todayCL();
  const status = $('mv-status').value;
  let shipping;
  if (shipSel === 'despacho') {
    const region = $('mv-region').value;
    const zone = region === 'Región Metropolitana' ? 'rm' : 'regiones';
    shipping = { method: 'despacho', zone, zone_label: CFG.shipping[zone].label, cost: ship, free: !ship, region, comuna: $('mv-comuna').value.trim(), address: $('mv-address').value.trim(), notes: '', pickupPoint: '' };
  } else {
    const pt = shipSel === 'mano' ? 'Entrega en mano' : points[Number(shipSel.slice(1))] || '';
    shipping = { method: 'retiro', zone: 'retiro', zone_label: shipSel === 'mano' ? 'Entrega en mano' : 'Retiro gratis' + (pt ? ' en ' + pt : ''), cost: 0, free: true, region: '', comuna: '', address: '', notes: '', pickupPoint: pt };
  }
  const range = C.promiseRange(paidDate, shipping.zone, data.settings);
  const id = newManualId();
  const order = {
    id, source: 'manual', paymentMethod: $('mv-pay').value,
    status, createdAt: serverTimestamp(), createdDate: paidDate,
    customer: { name, email: $('mv-email').value.trim().toLowerCase(), phone: $('mv-phone').value.trim() },
    shipping, lines, subtotal: sub, discount: null, total: sub + ship, paidAmount: sub + ship,
    paidAt: serverTimestamp(), paidDate,
    promisedFrom: shipSel === 'mano' ? paidDate : range.from, promisedDate: shipSel === 'mano' ? paidDate : range.to,
    mpFee: 0, noEmails: !$('mv-mails').checked,
    adminNote: $('mv-note').value.trim().slice(0, 300),
    notifs: [{ at: new Date().toISOString(), kind: `venta manual (${PAY_METHODS[$('mv-pay').value]})`, channel: 'panel', to: auth.currentUser.email, ok: true, note: '' }],
  };
  if (status !== 'pagado') order.preparingDate = paidDate;
  if (status === 'entregado') { order.shippedDate = paidDate; order.deliveredDate = paidDate; }
  try {
    await setDoc(doc(db, 'pedidos', id), order);
    if ($('mv-stock').checked) await moveStock(order, -1);
    toast(`Venta ${id} guardada ✓`);
    manual = null;
    $('manual-form').hidden = true;
    orderFilter = status === 'entregado' ? 'entregado' : 'abiertos';
    renderOrders();
  } catch (err) {
    fail(err);
  }
});

// ---------- Cliente: visitas de la tienda (anónimas, sumadas por día en estadisticas/<fecha>) ----------
// Las cuenta la tienda (store.js → función "evento"). No incluye las visitas de este navegador (admin).
let visitas = null; // { 'YYYY-MM-DD': { pv, prod, cart, click, filtro, busca, vacia, fuente, disp, embudo } }
let clPeriod = '30d';
const CL_PERIODS = ['hoy', '7d', '30d', 'mes', 'mesant', 'todo'];
const PAGINAS = { inicio: 'Inicio', busqueda: 'Resultados de búsqueda', producto: 'Ficha de producto', carrito: 'Carrito', gracias: 'Gracias por tu compra', 'pago-pendiente': 'Pago pendiente', 'pago-fallido': 'Pago fallido', seguimiento: 'Sigue tu pedido', nosotros: 'Nosotros', terminos: 'Términos', cambios: 'Cambios y devoluciones', privacidad: 'Privacidad', 'estado:proximamente': 'Próximamente' };

// "Me gusta" netos de un producto (todo el historial): like − nolike
function likesOf(id) {
  if (!visitas) return '…';
  let n = 0;
  Object.values(visitas).forEach((v) => { n += Number((v.like || {})[id]) || 0; n -= Number((v.nolike || {})[id]) || 0; });
  return Math.max(0, n);
}
async function loadVisitas() {
  try {
    const s = await getDocs(collection(db, 'estadisticas'));
    visitas = {};
    s.docs.forEach((d) => (visitas[d.id] = d.data()));
  } catch (err) {
    visitas = {};
    fail(err);
  }
  renderCliente();
  renderProducts();
}
$('cl-refresh').addEventListener('click', () => { $('cl-refresh').disabled = true; loadVisitas().finally(() => ($('cl-refresh').disabled = false)); });
$('cl-period').addEventListener('click', (e) => {
  const b = e.target.closest('[data-cp]');
  if (!b) return;
  clPeriod = b.dataset.cp;
  renderCliente();
});

function clSum(from, to) {
  const S = {};
  Object.keys(visitas || {}).filter((d) => (!from || d >= from) && (!to || d <= to)).forEach((d) => {
    const v = visitas[d];
    Object.keys(v).forEach((g) => {
      if (!v[g] || typeof v[g] !== 'object' || v[g].toDate) return;
      S[g] = S[g] || {};
      Object.keys(v[g]).forEach((k) => (S[g][k] = (S[g][k] || 0) + (Number(v[g][k]) || 0)));
    });
  });
  return S;
}
const topN = (m, n) => Object.entries(m || {}).sort((a, b) => b[1] - a[1]).slice(0, n || 15);
const sumOf = (m) => Object.values(m || {}).reduce((s, n) => s + n, 0);
function clTable(id, head, rows, empty) {
  $(id).innerHTML = rows.length
    ? `<thead><tr>${head.map((h, i) => `<th${i ? ' class="n"' : ''}>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td${i ? ' class="n"' : ''}>${c}</td>`).join('')}</tr>`).join('')}</tbody>`
    : `<tbody><tr><td class="hint">${empty || 'Todavía sin datos en este período.'}</td></tr></tbody>`;
}
function pageName(k) {
  if (k.startsWith('categoria:')) return 'Categoría ' + ((CFG.categories || {})[k.slice(10)] || k.slice(10));
  return PAGINAS[k] || k;
}

function renderCliente() {
  if (!$('tab-cliente')) return;
  $('cl-period').innerHTML = CL_PERIODS.map((k) => `<button type="button" class="chip" data-cp="${k}" aria-pressed="${k === clPeriod}">${PERIODS[k]}</button>`).join('');
  if (!visitas) { $('cl-kpis').innerHTML = '<p class="hint">Cargando visitas…</p>'; return; }
  const [from, to] = clPeriod === 'todo' ? ['', ''] : periodRange(clPeriod);
  const S = clSum(from, to);
  const E = S.embudo || {};
  const dias = Object.keys(visitas).sort();
  $('cl-note').textContent = dias.length
    ? `Datos desde el ${fmtDate(dias[0])}. No cuenta tus propias visitas (este navegador está marcado como admin) ni robots.`
    : 'Todavía no hay visitas registradas: se empiezan a contar desde que se publicó esta pestaña. No cuenta tus propias visitas.';
  // ventas web reales del período (pedidos pagados, sin ventas manuales), para comparar con las visitas
  const paid = orders.filter((o) => PAID.includes(o.status) && o.paidDate && (!from || o.paidDate >= from) && (!to || o.paidDate <= to) && o.source !== 'manual');
  const conv = E.sesiones ? Math.round((paid.length / E.sesiones) * 1000) / 10 : 0;
  $('cl-kpis').innerHTML = [
    [E.visitantes || 0, 'Visitantes (personas distintas por día)'],
    [E.sesiones || 0, 'Visitas'],
    [sumOf(S.pv), 'Páginas vistas'],
    [sumOf(S.prod), 'Fichas de producto vistas'],
    [sumOf(S.cart), 'Agregados al carro'],
    [paid.length, `Ventas web · conversión ${conv.toLocaleString('es-CL')}%`],
  ].map(([v, l]) => `<div class="stat"><b>${Number(v).toLocaleString('es-CL')}</b><span>${l}</span></div>`).join('');

  // Embudo
  const pasos = [['sesiones', 'Entraron a la tienda'], ['producto', 'Vieron un producto'], ['carrito', 'Agregaron al carro'], ['checkout', 'Fueron a pagar'], ['compra', 'Compraron']];
  const base = E.sesiones || 0;
  $('cl-funnel').innerHTML = pasos.map(([k, l], i) => {
    const n = E[k] || 0;
    const prev = i ? E[pasos[i - 1][0]] || 0 : n;
    return `<div class="fun-row"><span class="fun-l">${l}</span><div class="fun-bar"><span style="width:${base ? Math.max(2, pct(n, base)) : 0}%"></span></div><b>${n.toLocaleString('es-CL')}</b><small>${i ? (prev ? pct(n, prev) + '% del paso anterior' : '—') : '100%'}</small></div>`;
  }).join('');

  // Productos: vistas vs. carro vs. ventas
  const ids = [...new Set([...Object.keys(S.prod || {}), ...Object.keys(S.cart || {})])];
  const sold = {};
  paid.forEach((o) => (o.lines || []).forEach((l) => (sold[l.id] = (sold[l.id] || 0) + (l.qty || 0))));
  const prows = ids.map((id) => ({ id, name: (productById(id) || {}).name || id, v: (S.prod || {})[id] || 0, c: (S.cart || {})[id] || 0, s: sold[id] || 0 }))
    .sort((a, b) => b.v - a.v || b.c - a.c);
  clTable('cl-prod', ['Producto', 'Vistas', 'Al carro', '% al carro', 'Vendidas'],
    prows.map((r) => [esc(r.name), r.v, r.c, r.v ? pct(r.c, r.v) + '%' : '—', r.s]));

  const likeIds = [...new Set([...Object.keys(S.like || {}), ...Object.keys(S.nolike || {})])];
  const lrows = likeIds.map((id) => ({ id, name: (productById(id) || {}).name || id, n: Math.max(0, ((S.like || {})[id] || 0) - ((S.nolike || {})[id] || 0)), v: (S.prod || {})[id] || 0 }))
    .filter((r) => r.n > 0).sort((a, b) => b.n - a.n);
  clTable('cl-likes', ['Producto', 'Me gusta', 'Vistas', '% le gustó'], lrows.map((r) => [esc(r.name), r.n, r.v, r.v ? pct(r.n, r.v) + '%' : '—']), 'Todavía nadie marcó Me gusta en este período.');
  clTable('cl-click', ['Botón o link', 'Toques'], topN(S.click, 20).map(([k, n]) => [esc(k), n]));
  clTable('cl-pages', ['Página', 'Vistas'], topN(S.pv, 15).map(([k, n]) => [esc(pageName(k)), n]));
  clTable('cl-search', ['Filtro o búsqueda', 'Veces'], [...topN(S.filtro, 12).map(([k, n]) => [esc(k), n]), ...topN(S.busca, 12).map(([k, n]) => ['Búsqueda “' + esc(k) + '”', n])].sort((a, b) => b[1] - a[1]));
  clTable('cl-empty', ['Qué', 'Veces'], topN(S.vacia, 15).map(([k, n]) => [esc(k), n]), 'Nada por ahora: todo lo que buscaron lo encontraron.');
  const fTot = sumOf(S.fuente);
  clTable('cl-source', ['Origen', 'Visitas', '%'], topN(S.fuente, 10).map(([k, n]) => [esc(k), n, pct(n, fTot) + '%']));
  const dTot = sumOf(S.disp);
  clTable('cl-device', ['Equipo', 'Visitas', '%'], topN(S.disp, 5).map(([k, n]) => [esc(k), n, pct(n, dTot) + '%']));

  // Recomendaciones automáticas (reglas simples sobre el embudo, productos y búsquedas)
  const tips = [];
  if ((E.sesiones || 0) < 30) tips.push(['info', `Hay pocas visitas en este período (${E.sesiones || 0}). Las recomendaciones se vuelven confiables desde unas 100 visitas.`]);
  const mirados = prows.filter((r) => r.v >= 15);
  const flojo = mirados.filter((r) => pct(r.c, r.v) < 5).sort((a, b) => b.v - a.v)[0];
  if (flojo) tips.push(['mejorar', `<b>${esc(flojo.name)}</b> se mira mucho (${flojo.v} vistas) pero casi nadie lo agrega al carro (${pct(flojo.c, flojo.v)}%). Revisa fotos, precio o si faltan tallas.`]);
  const estrella = mirados.filter((r) => pct(r.c, r.v) >= 15).sort((a, b) => pct(b.c, b.v) - pct(a.c, a.v))[0];
  if (estrella) tips.push(['potenciar', `<b>${esc(estrella.name)}</b> convence: ${pct(estrella.c, estrella.v)}% de quienes lo ven lo agregan al carro. Ponlo primero en Instagram o en la portada.`]);
  const masVisto = prows[0];
  if (masVisto && masVisto.v >= 10 && masVisto !== estrella && masVisto !== flojo) tips.push(['potenciar', `El producto más visto es <b>${esc(masVisto.name)}</b> (${masVisto.v} vistas). Asegúrate de tener stock de sus tallas más vendidas.`]);
  if ((E.sesiones || 0) >= 20 && pct(E.producto || 0, E.sesiones) < 40) tips.push(['mejorar', `Solo ${pct(E.producto || 0, E.sesiones)}% de las visitas abre un producto. Haz la portada más directa: fotos más grandes o un destacado arriba.`]);
  if ((E.carrito || 0) >= 5 && pct(E.checkout || 0, E.carrito) < 40) tips.push(['mejorar', `Solo ${pct(E.checkout || 0, E.carrito)}% de quienes agregan al carro van a pagar. Revisa el costo de envío, que el carrito sea claro, o agrega un incentivo (ej. código de descuento en la primera compra).`]);
  if ((E.checkout || 0) >= 5 && pct(E.compra || 0, E.checkout) < 50) tips.push(['mejorar', `De quienes van a pagar, solo ${pct(E.compra || 0, E.checkout)}% termina la compra. Puede ser algo en Mercado Pago (medios de pago, cuotas): ofrece también transferencia por WhatsApp.`]);
  const tallas = topN(Object.fromEntries(Object.entries(S.vacia || {}).filter(([k]) => /^Talla/.test(k))), 3);
  if (tallas.length && tallas[0][1] >= 3) tips.push(['potenciar', `Buscan tallas que no tienes: ${tallas.map(([k, n]) => `<b>${esc(k)}</b> (${n})`).join(', ')}. Considéralas en la próxima compra.`]);
  const vacias = topN(Object.fromEntries(Object.entries(S.vacia || {}).filter(([k]) => /^Búsqueda/.test(k))), 3);
  if (vacias.length) tips.push(['mejorar', `Búsquedas sin resultado: ${vacias.map(([k, n]) => `<b>${esc(k.replace('Búsqueda: ', ''))}</b> (${n})`).join(', ')}. Puede ser un producto a sumar o una palabra a poner en las descripciones.`]);
  const fuenteTop = topN(S.fuente, 1)[0];
  if (fuenteTop && fTot >= 20) tips.push(['info', `La mayoría llega desde <b>${esc(fuenteTop[0])}</b> (${pct(fuenteTop[1], fTot)}%). Ahí conviene poner el esfuerzo de publicaciones.`]);
  const cel = (S.disp || {}).Celular || 0;
  if (dTot >= 20 && pct(cel, dTot) >= 60) tips.push(['info', `${pct(cel, dTot)}% entra desde el celular: revisa siempre cómo se ve la tienda en el teléfono antes de publicar algo.`]);
  const wa = Object.entries(S.click || {}).filter(([k]) => /WhatsApp/i.test(k)).reduce((s, [, n]) => s + n, 0);
  if (wa >= 5) tips.push(['info', `Tocaron WhatsApp ${wa} veces: hay gente con dudas antes de comprar. Mira qué preguntan y súmalo a las descripciones.`]);
  if (lrows.length && lrows[0].n >= 3) tips.push(['potenciar', `Lo que más esperan de Próximamente: ${lrows.slice(0, 3).map((r) => `<b>${esc(r.name)}</b> (${r.n} ❤)`).join(', ')}. Priorízalos en la próxima compra.`]);
  const ICO = { mejorar: '🔧', potenciar: '🚀', info: 'ℹ️' };
  $('cl-insights').innerHTML = (tips.length ? tips : [['info', 'Todo se ve sano en este período. Mira el embudo semana a semana.']])
    .map(([t, h]) => `<li class="${t}"><span>${ICO[t]}</span><p>${h}</p></li>`).join('');
}
