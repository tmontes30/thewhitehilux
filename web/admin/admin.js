// Panel de admin de The White Hilux: pedidos, alertas de entrega, productos (precio, descripción, estado) y stock.
// Datos en Firestore: tienda/catalogo (lo que se edita aquí, lo lee la tienda) y pedidos/* (los crean las funciones).
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, signOut, onAuthStateChanged, connectAuthEmulator
} from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js';
import {
  getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, collection, query, orderBy,
  limit, increment, FieldPath, serverTimestamp
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

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CL');
const fmtDate = (ymd) => (ymd ? ymd.split('-').reverse().join('-') : '—');
const plural = (n, a, b) => n + ' ' + (n === 1 ? a : b);

let raw = null; // documento tienda/catalogo tal cual
let data = C.mergeCatalog(BASE, null); // catálogo mezclado
let orders = [];
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
  ['pedidos', 'productos', 'ajustes'].forEach((t) => ($('tab-' + t).hidden = true));
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
    }, fail),
    onSnapshot(query(collection(db, 'pedidos'), orderBy('createdAt', 'desc'), limit(500)), (s) => {
      orders = s.docs.map((d) => ({ ...d.data(), id: d.id }));
      renderOrders();
    }, fail)
  );
  showTab(location.hash.slice(1) || 'pedidos');
});

// ---------- Pestañas ----------
function showTab(name) {
  if (!['pedidos', 'productos', 'ajustes'].includes(name)) name = 'pedidos';
  document.querySelectorAll('#tabs button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.tab === name ? 'true' : 'false'));
  ['pedidos', 'productos', 'ajustes'].forEach((t) => ($('tab-' + t).hidden = t !== name));
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
      <ul class="order-lines">${(o.lines || []).map((l) => `<li>${l.qty} × <b>${esc(l.name)}</b> <small>${esc(lineText(l))}</small> — ${money(l.total)}</li>`).join('')}
        <li><small>Subtotal ${money(o.subtotal)} · Envío ${ship.cost ? money(ship.cost) : 'gratis'}${o.mpPaymentId ? ' · Pago MP #' + esc(o.mpPaymentId) : ''}</small></li>
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
  const imgs = p.imagesByColor ? p.imagesByColor[p.colors[0]] || [] : p.images || [];
  return imgs.length ? '../' + imgs[0] : '../assets/logos/cl-shop.svg';
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
        <label>Precio (CLP)<input data-f="price" type="number" min="100" step="10" value="${p.price}"></label>
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
      if (price !== p.price) args.push(fp(id, 'price'), price);
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
