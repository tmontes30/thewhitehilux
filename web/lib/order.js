// Arma y valida un pedido en el servidor.
// Los precios SIEMPRE salen del catálogo del servidor (catalog.js + lo editado en el panel, con ofertas aplicadas),
// nunca del navegador. Si el producto controla stock (p.stock), se valida que alcance para cada talla/color.
// Los códigos de descuento (cupones) se validan aquí y se reparten entre las líneas a las que aplican.

class OrderError extends Error {
  constructor(message) {
    super(message);
    this.name = 'OrderError';
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const COLOR_CODE = { negro: 'NEG', blanco: 'BLA' };

function str(v, max) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function lineSku(p, color, size, design) {
  if (!p.sku) return '';
  return [p.sku, color ? COLOR_CODE[color] || color.slice(0, 3).toUpperCase() : '', size === 'Única' || !size ? 'U' : size,
    design ? design.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) : ''].filter(Boolean).join('-');
}

// Normaliza un código escrito por el cliente: TWH10, twh-10 → TWH10
function couponCode(s) {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20);
}

// Descuento de un cupón sobre las líneas. coupon = { code, kind: 'percent'|'amount', value, scope, targets, minSubtotal,
// from, to, active, maxUses, uses }. Devuelve { amount, label } o lanza OrderError con un mensaje para el cliente.
function couponDiscount(coupon, lines, products, today) {
  const bad = (m) => { throw new OrderError(m); };
  if (!coupon || coupon.active === false) bad('Ese código no existe o ya no está vigente.');
  if ((coupon.from && today < coupon.from) || (coupon.to && today > coupon.to)) bad('Ese código no está vigente.');
  if (coupon.maxUses && (coupon.uses || 0) >= coupon.maxUses) bad('Ese código ya se usó el máximo de veces.');
  const subtotal = lines.reduce((s, l) => s + l.total, 0);
  if (coupon.minSubtotal && subtotal < coupon.minSubtotal) {
    bad(`Ese código es para compras desde $${Number(coupon.minSubtotal).toLocaleString('es-CL')}.`);
  }
  const applies = (l) => {
    const p = products.find((x) => x.id === l.id) || {};
    if (coupon.scope === 'category') return (coupon.targets || []).includes(p.type);
    if (coupon.scope === 'products') return (coupon.targets || []).includes(p.id);
    return true;
  };
  const eligible = lines.filter(applies).reduce((s, l) => s + l.total, 0);
  if (!eligible) bad('Ese código no aplica a los productos de tu carrito.');
  const v = Number(coupon.value) || 0;
  const amount = Math.min(eligible, coupon.kind === 'amount' ? Math.round(v) : Math.round((eligible * Math.min(v, 100)) / 100));
  if (amount <= 0) bad('Ese código no aplica a los productos de tu carrito.');
  return { amount, applies, label: coupon.kind === 'amount' ? `-$${Math.round(v).toLocaleString('es-CL')}` : `-${v}%` };
}

// Reparte un monto entre las líneas elegibles en pesos enteros (proporcional, sin perder ni sobrar un peso)
function allocate(lines, amount, applies) {
  const elig = lines.filter(applies);
  const base = elig.reduce((s, l) => s + l.total, 0);
  let given = 0;
  const parts = elig.map((l) => {
    const exact = (amount * l.total) / base;
    const n = Math.floor(exact);
    given += n;
    return { l, n, rest: exact - n };
  });
  parts.sort((a, b) => b.rest - a.rest);
  for (let i = 0; given < amount; i = (i + 1) % parts.length, given++) parts[i].n++;
  lines.forEach((l) => { l.discount = 0; });
  parts.forEach((x) => { x.l.discount = Math.min(x.n, x.l.total); });
}

// Productos del carrito con precios, stock y cupón (sin datos del cliente). Lo usan buildOrder y la vista previa del cupón.
function priceCart(items, products, config, opts = {}) {
  if (!Array.isArray(items) || items.length === 0) throw new OrderError('El carrito está vacío.');
  if (items.length > 30) throw new OrderError('Demasiadas líneas en el carrito.');

  const maxQty = config.maxQtyPerLine || 10;
  const lines = items.map((it) => {
    const product = products.find((p) => p.id === it.id && p.active !== false && (!p.status || p.status === 'disponible'));
    if (!product) throw new OrderError('Un producto del carrito ya no está disponible. Revisa el carrito.');
    const size = str(it.size, 10);
    if (!product.sizes.includes(size)) throw new OrderError(`Elige una talla válida para ${product.name}.`);
    let color = '';
    if (product.colors.length) {
      color = str(it.color, 20);
      if (!product.colors.includes(color)) throw new OrderError(`Elige un color válido para ${product.name}.`);
    }
    let design = '', designName = '';
    if (product.designs && product.designs.length) {
      design = str(it.design, 40);
      const d = product.designs.find((x) => x.id === design);
      if (!d) throw new OrderError(`Elige un diseño para ${product.name}.`);
      designName = d.name;
    }
    const qty = Number(it.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > maxQty) {
      throw new OrderError(`La cantidad de ${product.name} debe estar entre 1 y ${maxQty}.`);
    }
    return {
      id: product.id,
      sku: lineSku(product, color, size, design),
      name: product.name,
      type: product.type,
      size,
      color,
      color_name: color ? config.colors[color] || color : '',
      design,
      design_name: designName,
      qty,
      list_price: product.compareAt || product.price,
      unit_price: product.price,
      offer: product.offer ? product.offer.name || 'Oferta' : '',
      total: product.price * qty,
      discount: 0,
      net: product.price * qty,
    };
  });

  // Stock: suma las líneas iguales (mismo producto, color y talla) antes de comparar
  const wanted = {};
  lines.forEach((l) => {
    const k = l.id + '|' + (l.color || 'unico') + '|' + l.size;
    wanted[k] = (wanted[k] || 0) + l.qty;
  });
  Object.keys(wanted).forEach((k) => {
    const [id, color, size] = k.split('|');
    const p = products.find((x) => x.id === id);
    if (!p.stock) return;
    const have = Math.max(0, Math.floor(Number((p.stock[color] || {})[size]) || 0));
    if (wanted[k] > have) {
      const what = [p.name, size !== 'Única' ? 'talla ' + size : '', color !== 'unico' ? (config.colors[color] || color).toLowerCase() : ''].filter(Boolean).join(' ');
      throw new OrderError(have === 0 ? `Se agotó ${what}. Quítalo del carrito para seguir.` : `Solo quedan ${have} de ${what}. Ajusta la cantidad en el carrito.`);
    }
  });

  const subtotal = lines.reduce((s, l) => s + l.total, 0);
  let discount = null;
  if (opts.couponCode) {
    const c = couponDiscount(opts.coupon, lines, products, opts.today || '');
    allocate(lines, c.amount, c.applies);
    lines.forEach((l) => { l.net = l.total - l.discount; });
    discount = { code: couponCode(opts.couponCode), amount: c.amount, label: c.label };
  }
  return { lines, subtotal, discount, discounted: subtotal - (discount ? discount.amount : 0) };
}

// opts = { couponCode, coupon, today } (el servidor busca el cupón y lo pasa aquí)
function buildOrder(body, products, config, opts = {}) {
  if (!body || typeof body !== 'object') throw new OrderError('Pedido vacío.');
  const { customer = {}, shipping = {} } = body;
  const cart = priceCart(body.items, products, config, opts);

  // Cliente
  const name = str(customer.name, 80);
  const email = str(customer.email, 120).toLowerCase();
  const phone = str(customer.phone, 20).replace(/[^\d+]/g, '');
  if (name.length < 3) throw new OrderError('Escribe tu nombre completo.');
  if (!EMAIL_RE.test(email)) throw new OrderError('Revisa tu correo: no parece válido.');
  if (phone.replace(/\D/g, '').length < 8) throw new OrderError('Escribe un teléfono de al menos 8 dígitos.');

  // Envío
  const method = shipping.method === 'retiro' ? 'retiro' : 'despacho';
  let zone = 'retiro';
  let region = '';
  let comuna = '';
  let address = '';
  let pickupPoint = '';
  if (method === 'retiro') {
    const points = config.pickupPoints || [];
    pickupPoint = str(shipping.pickupPoint, 60);
    if (points.length && !points.includes(pickupPoint)) throw new OrderError('Elige dónde quieres retirar.');
  }
  if (method === 'despacho') {
    region = str(shipping.region, 40);
    if (!config.regions.includes(region)) throw new OrderError('Elige tu región.');
    comuna = str(shipping.comuna, 60);
    address = str(shipping.address, 160);
    if (comuna.length < 2) throw new OrderError('Escribe tu comuna.');
    if (address.length < 5) throw new OrderError('Escribe tu dirección con número.');
    zone = region === 'Región Metropolitana' ? 'rm' : 'regiones';
  }
  const notes = str(shipping.notes, 300);

  // Envío gratis según lo que se paga por productos (ya con descuento)
  const zoneCfg = config.shipping[zone];
  const freeZones = config.freeShippingZones || ['rm', 'regiones'];
  const freeShipping = freeZones.includes(zone) && config.freeShippingFrom && cart.discounted >= config.freeShippingFrom;
  const shippingCost = freeShipping ? 0 : zoneCfg.price;

  return {
    lines: cart.lines,
    subtotal: cart.subtotal,
    discount: cart.discount,
    shipping: {
      method,
      zone,
      zone_label: pickupPoint ? `${zoneCfg.label} en ${pickupPoint}` : zoneCfg.label,
      pickupPoint,
      cost: shippingCost,
      free: Boolean(freeShipping),
      region,
      comuna,
      address,
      notes,
    },
    customer: { name, email, phone },
    total: cart.discounted + shippingCost,
  };
}

function newOrderId() {
  const t = Date.now().toString(36).toUpperCase();
  const r = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `TWH-${t}-${r}`;
}

// Ítems para Mercado Pago (montos enteros en CLP). Con descuento, el total de una línea puede no dividirse exacto
// por la cantidad: se separa en dos ítems (ej. 2 a $9.995 y 1 a $9.996) para que la suma cuadre al peso.
function toMercadoPagoItems(order) {
  const items = [];
  order.lines.forEach((l) => {
    const total = l.net != null ? l.net : l.total;
    const unit = Math.floor(total / l.qty);
    const extra = total - unit * l.qty;
    const title = [l.name, l.design_name, l.size !== 'Única' ? `Talla ${l.size}` : '', l.color_name].filter(Boolean).join(' · ');
    const code = (l.sku || l.id).slice(0, 30);
    if (l.qty - extra > 0) items.push({ code, title, quantity: l.qty - extra, unit_price: unit });
    if (extra > 0) items.push({ code, title, quantity: extra, unit_price: unit + 1 });
  });
  if (order.shipping.cost > 0) {
    items.push({ code: 'envio', title: order.shipping.zone_label, quantity: 1, unit_price: order.shipping.cost });
  }
  return items;
}

module.exports = { buildOrder, priceCart, couponCode, newOrderId, toMercadoPagoItems, OrderError };
