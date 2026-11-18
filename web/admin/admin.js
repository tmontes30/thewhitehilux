// Panel de admin de The White Hilux: pedidos, alertas de entrega, productos (precio, descripción, estado) y stock.
// Datos en Firestore: tienda/catalogo (lo que se edita aquí, lo lee la tienda) y pedidos/* (los crean las funciones).
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, signOut, onAuthStateChanged, connectAuthEmulator
} from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js';
import {
  getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, collection, query, orderBy,
  limit, increment, FieldPath, serverTimestamp, deleteField
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
const TABS = ['pedidos', 'ventas', 'productos', 'descuentos', 'ajustes'];

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CL');
const fmtDate = (ymd) => (ymd ? ymd.split('-').reverse().join('-') : '—');
const plural = (n, a, b) => n + ' ' + (n === 1 ? a : b);

let raw = null; // documento tienda/catalogo tal cual
let data = C.mergeCatalog(BASE, null); // catálogo mezclado
let orders = [];
let coupons = [];
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
function fail(err) {
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
  if (user && !isAdmin) {
    $('login-msg').textContent = `La cuenta ${user.email} no tiene acceso al panel.`;
    $('login-btn').textContent = 'Entrar con otra cuenta';
    return;
  }
  if (!user) return;
  try {
    const snap = await getDoc(CATALOG);
    if (!snap.exists()) await setDoc(CATALOG, { products: {}, settings: { ...C.DEFAULT_SETTINGS } });
  } catch (err) {
    return fail(err);
  }
  unsubs.push(
    onSnapshot(CATALOG, (s) => {
      raw = s.data() || {};
      data = C.mergeCatalog(BASE, raw);
      renderProducts();
      renderSettings();
      renderOrders();
      renderSales();
      renderDiscounts();
    }, fail),
    onSnapshot(query(collection(db, 'pedidos'), orderBy('createdAt', 'desc'), limit(2000)), (s) => {
      orders = s.docs.map((d) => ({ ...d.data(), id: d.id }));
      renderOrders();
      renderSales();
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

function orderCard(o) {
  const dd = due(o);
  const ship = o.shipping || {};
  const cust = o.customer || {};
  const wa = waLink(cust.phone);
  const paid = o.paidAmount != null ? o.paidAmount : o.total;
  const opts = Object.keys(C.ORDER_STATUS).map((k) => `<option value="${k}"${k === o.status ? ' selected' : ''}>${C.ORDER_STATUS[k]}</option>`).join('');
  const dest = ship.method === 'retiro'
    ? '<p><b>Retiro coordinado en Santiago</b></p>'
    : `<p>${esc(ship.address)}<br>${esc(ship.comuna)}, ${esc(ship.region)}</p>`;
  return `<article class="card order ${dd && dd.cls !== 'green' ? 'due-' + dd.cls : ''}" id="o-${esc(o.id)}" data-id="${esc(o.id)}">
    <div class="order-head">
      <span class="id">${esc(o.id)}</span>
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
        ${o.promisedDate || o.status !== 'pendiente_pago' ? `<input type="date" data-act="promise" value="${esc(o.promisedDate || '')}" aria-label="Fecha prometida">` : '<p class="hint">Se fija al confirmarse el pago.</p>'}
        ${o.deliveredDate ? `<span class="pill gray">Entregado ${fmtDate(o.deliveredDate)}</span>` : ''}
      </div>
    </div>
    <div>
      <h4 class="hint" style="margin-bottom:4px">PRODUCTOS</h4>
      <ul class="order-lines">${(o.lines || []).map((l) => `<li>${l.qty} × <b>${esc(l.name)}</b> <small>${esc(lineText(l))}</small> ${l.sku ? '<span class="sku">' + esc(l.sku) + '</span>' : ''} — ${money(l.net != null ? l.net : l.total)}${l.offer ? ' <small>(oferta)</small>' : ''}</li>`).join('')}
        <li><small>Subtotal ${money(o.subtotal)}${o.discount ? ' · Código ' + esc(o.discount.code) + ' -' + money(o.discount.amount) : ''} · Envío ${ship.cost ? money(ship.cost) : 'gratis'}${o.mpPaymentId ? ' · Pago MP #' + esc(o.mpPaymentId) : ''}</small></li>
      </ul>
    </div>
    <div class="order-foot">
      <textarea data-act="note" rows="1" placeholder="Nota interna (solo tú la ves): n° de seguimiento, cambios de talla…">${esc(o.adminNote || '')}</textarea>
      ${o.status === 'pendiente_pago' || o.status === 'cancelado' ? '<button type="button" class="btn ghost small" data-act="delete">Eliminar</button>' : ''}
    </div>
  </article>`;
}

function renderOrders() {
  if ($('tab-pedidos') == null) return;
  const today = C.todayCL();
  const month = today.slice(0, 7);
  const open = orders.filter((o) => C.OPEN_STATUS.includes(o.status));
  const urgent = open.map((o) => ({ o, d: due(o) })).filter((x) => x.d && x.d.cls !== 'green').sort((a, b) => a.d.d - b.d.d);
  const paidMonth = orders.filter((o) => PAID.includes(o.status) && (o.paidDate || '').startsWith(month));
  const sold = paidMonth.reduce((s, o) => s + (Number(o.paidAmount != null ? o.paidAmount : o.total) || 0), 0);

  $('stats').innerHTML = [
    [open.length, 'Por entregar'],
    [urgent.length, `Vencen en ≤ ${plural(data.settings.alertDays, 'día', 'días')} o atrasados`],
    [money(sold), 'Vendido este mes'],
    [paidMonth.length, 'Pedidos pagados este mes'],
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
  const focused = document.activeElement && document.activeElement.closest && document.activeElement.closest('#orders textarea');
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
      if (to === 'entregado') patch.deliveredDate = C.todayCL();
      // Pago manual (transferencia, efectivo): fija la promesa y descuenta stock
      if (PAID.includes(to) && !PAID.includes(o.status)) {
        patch.paidDate = o.paidDate || C.todayCL();
        if (!o.promisedDate) patch.promisedDate = C.promiseDate(patch.paidDate, (o.shipping || {}).zone, data.settings);
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
      await updateDoc(ref, { promisedDate: e.target.value });
      toast('Fecha de entrega actualizada');
    }
    if (act === 'note') {
      await updateDoc(ref, { adminNote: e.target.value.slice(0, 1000) });
      toast('Nota guardada');
    }
  } catch (err) {
    fail(err);
  }
});
$('orders').addEventListener('focusout', () => setTimeout(renderOrders, 0));
$('orders').addEventListener('click', async (e) => {
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

function renderProducts() {
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
      holidays: [...new Set(holidays)].sort(),
    });
    $('s-saved').hidden = false;
    setTimeout(() => ($('s-saved').hidden = true), 2500);
    document.activeElement.blur();
  } catch (err) {
    fail(err);
  }
});

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
  const [from, to] = periodRange(period);
  const inRange = (o) => PAID.includes(o.status) && o.paidDate && o.paidDate >= from && o.paidDate <= to;
  const list = orders.filter(inRange);

  // Período anterior del mismo largo, para comparar
  const days = Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1);
  const pFrom = addDays(from, -days), pTo = addDays(from, -1);
  const prev = orders.filter((o) => PAID.includes(o.status) && o.paidDate && o.paidDate >= pFrom && o.paidDate <= pTo);

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
    ? `<div class="bars">${buckets.map((b) => `<div class="bar${b[1] ? '' : ' zero'}" style="height:${b[1] ? Math.max(3, (b[1] / max) * 100) : 1}%" title="${b[2]}: ${money(b[1])}"></div>`).join('')}</div>
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
    const x = byProduct[r.id] || (byProduct[r.id] = { name: r.name, units: 0, revenue: 0 });
    x.units += r.units;
    x.revenue += r.revenue;
  });
  const top = Object.values(byProduct).sort((a, b) => b.revenue - a.revenue).slice(0, 6);
  const topMax = top.length ? top[0].revenue : 1;
  $('sales-top').innerHTML = top.length
    ? top.map((t, i) => `<div class="top-item"><span class="rank">${i + 1}</span><span>${esc(t.name)} <small class="hint">· ${plural(t.units, 'unidad', 'unidades')}</small></span><b>${money(t.revenue)}</b><span class="meter"><i style="width:${pct(t.revenue, topMax)}%"></i></span></div>`).join('')
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
      <tbody>${shown.map((r) => { const st = stockFor(r); return `<tr><td><span class="sku">${esc(r.sku)}</span></td><td>${esc(r.name)}</td><td>${esc(r.variant)}</td><td class="n">${r.units}</td><td class="n">${r.orders.size}</td><td class="n">${money(r.revenue)}</td><td class="n">${pct(r.revenue, lineRevenue)}%</td><td class="n">${st == null ? '—' : st}</td></tr>`; }).join('')}</tbody>
      <tfoot><tr><td colspan="3">Total</td><td class="n">${sum(shown, (r) => r.units)}</td><td></td><td class="n">${money(sum(shown, (r) => r.revenue))}</td><td></td><td></td></tr></tfoot>`
    : '<tbody><tr><td class="hint">Sin ventas en este período.</td></tr></tbody>';

  // Por categoría
  const byCat = {};
  skus.forEach((r) => { const c = byCat[r.type] || (byCat[r.type] = { units: 0, revenue: 0 }); c.units += r.units; c.revenue += r.revenue; });
  const cats = Object.keys(byCat).sort((a, b) => byCat[b].revenue - byCat[a].revenue);
  $('sales-cat').innerHTML = cats.length
    ? `<thead><tr><th>Categoría</th><th class="n">Unidades</th><th class="n">Ventas</th><th class="n">%</th></tr></thead><tbody>${cats.map((c) => `<tr><td>${esc(CFG.categories[c] || c)}</td><td class="n">${byCat[c].units}</td><td class="n">${money(byCat[c].revenue)}</td><td class="n">${pct(byCat[c].revenue, lineRevenue)}%</td></tr>`).join('')}</tbody>`
    : '<tbody><tr><td class="hint">Sin ventas.</td></tr></tbody>';

  // Por región
  const byReg = {};
  list.forEach((o) => {
    const s = o.shipping || {};
    const k = s.method === 'retiro' ? 'Retiro en Santiago' : s.region || '—';
    const r = byReg[k] || (byReg[k] = { orders: 0, revenue: 0 });
    r.orders++;
    r.revenue += orderPaid(o);
  });
  const regs = Object.keys(byReg).sort((a, b) => byReg[b].revenue - byReg[a].revenue);
  $('sales-region').innerHTML = regs.length
    ? `<thead><tr><th>Región</th><th class="n">Pedidos</th><th class="n">Ventas</th></tr></thead><tbody>${regs.map((k) => `<tr><td>${esc(k)}</td><td class="n">${byReg[k].orders}</td><td class="n">${money(byReg[k].revenue)}</td></tr>`).join('')}</tbody>`
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
