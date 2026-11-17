// Arma y valida un pedido en el servidor.
// Los precios SIEMPRE salen del catálogo del servidor (catalog.js + lo editado en el panel), nunca del navegador.
// Si el producto controla stock (p.stock), se valida que alcance para cada talla/color.

class OrderError extends Error {
  constructor(message) {
    super(message);
    this.name = 'OrderError';
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function str(v, max) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function buildOrder(body, products, config) {
  if (!body || typeof body !== 'object') throw new OrderError('Pedido vacío.');
  const { items, customer = {}, shipping = {} } = body;

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
      name: product.name,
      size,
      color,
      color_name: color ? config.colors[color] || color : '',
      design,
      design_name: designName,
      qty,
      unit_price: product.price,
      total: product.price * qty,
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

  const subtotal = lines.reduce((s, l) => s + l.total, 0);
  const zoneCfg = config.shipping[zone];
  const freeZones = config.freeShippingZones || ['rm', 'regiones'];
  const freeShipping = freeZones.includes(zone) && config.freeShippingFrom && subtotal >= config.freeShippingFrom;
  const shippingCost = freeShipping ? 0 : zoneCfg.price;

  return {
    lines,
    subtotal,
    shipping: {
      method,
      zone,
      zone_label: zoneCfg.label,
      cost: shippingCost,
      free: Boolean(freeShipping),
      region,
      comuna,
      address,
      notes,
    },
    customer: { name, email, phone },
    total: subtotal + shippingCost,
  };
}

function newOrderId() {
  const t = Date.now().toString(36).toUpperCase();
  const r = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `TWH-${t}-${r}`;
}

// Líneas para Mercado Pago (CLP no usa decimales)
function toMercadoPagoItems(order) {
  const items = order.lines.map((l) => ({
    id: `${l.id}:${l.size}${l.color ? ':' + l.color : ''}${l.design ? ':' + l.design : ''}`,
    title: [l.name, l.design_name, l.size !== 'Única' ? `Talla ${l.size}` : '', l.color_name].filter(Boolean).join(' · '),
    quantity: l.qty,
    unit_price: l.unit_price,
    currency_id: 'CLP',
  }));
  if (order.shipping.cost > 0) {
    items.push({
      id: 'envio',
      title: order.shipping.zone_label,
      quantity: 1,
      unit_price: order.shipping.cost,
      currency_id: 'CLP',
    });
  }
  return items;
}

module.exports = { buildOrder, newOrderId, toMercadoPagoItems, OrderError };
