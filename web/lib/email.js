// Envío de correos con Resend (https://resend.com). Sin API key no se manda nada (el pedido igual queda en el panel).

const clp = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CL');

const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const fmt = (ymd) => (ymd ? ymd.split('-').reverse().join('-') : '');

// Marco común de los correos: banda oscura con el escudo TWH (logo 6, PNG publicado en la tienda) y las 3 franjas.
// Los correos no muestran SVG: el logo va como PNG en web/assets/img/email/logo-escudo.png.
const LOGO_URL = 'https://thewhitehilux.cavedevz.com/assets/img/email/logo-escudo.png';
function frame(inner) {
  return `<div style="background:#F2F1EC;padding:20px 8px;font-family:Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;background:#FFFFFF;border-radius:12px;overflow:hidden;color:#1C1D1A">
    <div style="background:#1C1D1A;padding:16px 0 12px;text-align:center"><img src="${LOGO_URL}" width="96" height="96" alt="The White Hilux · 4x4 Team" style="display:inline-block;width:96px;height:96px;border:0"></div>
    <div style="height:4px;background:#F2A541;line-height:4px;font-size:0">&nbsp;</div><div style="height:4px;background:#E4572E;line-height:4px;font-size:0">&nbsp;</div><div style="height:4px;background:#B3202A;line-height:4px;font-size:0">&nbsp;</div>
    <div style="padding:22px 22px 26px">${inner}</div>
  </div>
  <p style="max-width:560px;margin:12px auto 0;text-align:center;color:#888;font-size:12px">The White Hilux · thewhitehilux.cavedevz.com · Instagram @the.whitehilux</p>
</div>`;
}

function orderHtml({ orderId, paymentId, total, customer, shipping, lines, promisedDate, promisedFrom }, forCustomer) {
  const rows = (lines || [])
    .map(
      (l) =>
        `<tr><td style="padding:6px 8px;border-bottom:1px solid #ddd">${esc(l.name)}<br><small>${esc(
          [l.design_name, l.size !== 'Única' ? 'Talla ' + l.size : '', l.color_name].filter(Boolean).join(' · ')
        )}</small></td><td style="padding:6px 8px;border-bottom:1px solid #ddd;text-align:center">${esc(l.qty)}</td><td style="padding:6px 8px;border-bottom:1px solid #ddd;text-align:right">${clp(
          l.total
        )}</td></tr>`
    )
    .join('');
  const ship = shipping || {};
  const dest =
    ship.method === 'retiro'
      ? `Retiro gratis${ship.pickupPoint ? ' en ' + esc(ship.pickupPoint) : ''} (te escribimos por WhatsApp para coordinar)`
      : `${esc(ship.address)}, ${esc(ship.comuna)}, ${esc(ship.region)}`;
  return frame(`
    <h2 style="margin:0 0 4px">${forCustomer ? '¡Gracias por tu compra!' : 'Nuevo pedido pagado'}</h2>
    <p style="margin:0 0 16px;color:#555">Pedido <b>${esc(orderId)}</b> · Pago Mercado Pago #${esc(paymentId)}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <thead><tr><th style="text-align:left;padding:6px 8px">Producto</th><th style="padding:6px 8px">Cant.</th><th style="text-align:right;padding:6px 8px">Total</th></tr></thead>
      <tbody>${rows}
        <tr><td colspan="2" style="padding:6px 8px">Envío (${esc(ship.zone_label)})</td><td style="padding:6px 8px;text-align:right">${clp(ship.cost)}</td></tr>
        <tr><td colspan="2" style="padding:6px 8px"><b>Total pagado</b></td><td style="padding:6px 8px;text-align:right"><b>${clp(total)}</b></td></tr>
      </tbody>
    </table>
    <h3 style="margin:20px 0 6px">Entrega</h3>
    <p style="margin:0">${dest}</p>
    ${promisedDate ? `<p style="margin:6px 0 0"><b>${ship.method === 'retiro' ? 'Retiro' : forCustomer ? 'Llega' : 'Entregar'} ${promisedFrom && promisedFrom !== promisedDate ? 'entre el ' + fmt(promisedFrom) + ' y el ' + fmt(promisedDate) : 'el ' + fmt(promisedDate)}</b></p>` : ''}
    ${ship.notes ? `<p style="margin:6px 0 0;color:#555">Notas: ${esc(ship.notes)}</p>` : ''}
    ${
      forCustomer
        ? `<p style="margin:20px 0 0"><a href="https://thewhitehilux.cavedevz.com/seguimiento.html?pedido=${encodeURIComponent(orderId)}&correo=${encodeURIComponent((customer && customer.email) || '')}" style="background:#2968C8;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:bold">Sigue tu pedido</a></p><p style="margin:14px 0 0">Ahí verás cuándo sale tu despacho y su número de seguimiento. Cualquier duda, escríbenos por WhatsApp al +56 9 9225 9960 o por Instagram a @the.whitehilux.</p>`
        : `<h3 style="margin:20px 0 6px">Cliente</h3><p style="margin:0">${esc(customer && customer.name)}<br>${esc(
            customer && customer.email
          )}<br>${esc(customer && customer.phone)}</p>`
    }`);
}

// Correo diario con los pedidos que vencen pronto
function alertHtml(orders, today) {
  const rows = orders
    .map((o) => {
      const ship = o.shipping || {};
      const left = Math.round((Date.parse(o.promisedDate) - Date.parse(today)) / 86400000);
      const when = left < 0 ? `<b style="color:#C8382A">Atrasado ${-left} día${left === -1 ? '' : 's'}</b>` : left === 0 ? '<b style="color:#C8382A">Hoy</b>' : `Faltan ${left} día${left === 1 ? '' : 's'}`;
      return `<tr><td style="padding:6px 8px;border-bottom:1px solid #ddd"><b>${esc(o.id)}</b><br>${esc(o.customer && o.customer.name)}</td><td style="padding:6px 8px;border-bottom:1px solid #ddd">${
        ship.method === 'retiro' ? 'Retiro' : esc(ship.comuna + ', ' + ship.region)
      }</td><td style="padding:6px 8px;border-bottom:1px solid #ddd">${fmt(o.promisedDate)}<br>${when}</td></tr>`;
    })
    .join('');
  return `<div style="font-family:Arial,sans-serif;max-width:560px;color:#1c1d1a">
    <h2 style="margin:0 0 12px">Pedidos por entregar pronto</h2>
    <table style="width:100%;border-collapse:collapse;font-size:14px"><tbody>${rows}</tbody></table>
    <p style="margin:16px 0 0;color:#555">Revisa el detalle en el panel: thewhitehilux.cavedevz.com/admin/</p></div>`;
}

// Correo al cliente cuando cambia el estado del pedido: 'despachado' (o listo para retiro) y 'entregado'
const SITE = 'https://thewhitehilux.cavedevz.com';
function trackLink(o) {
  return `${SITE}/seguimiento.html?pedido=${encodeURIComponent(o.id)}&correo=${encodeURIComponent((o.customer && o.customer.email) || '')}`;
}
function statusEmail(o, kind) {
  const ship = o.shipping || {};
  const retiro = ship.method === 'retiro';
  const first = String((o.customer && o.customer.name) || '').split(/\s+/)[0];
  const btn = (txt, url) => `<p style="margin:20px 0 0"><a href="${url}" style="background:#2968C8;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:bold">${txt}</a></p>`;
  const items = `<ul style="margin:8px 0 0;padding-left:18px">${(o.lines || []).map((l) => `<li>${esc(l.qty)} × ${esc(l.name)}${l.size && l.size !== 'Única' ? ' · talla ' + esc(l.size) : ''}${l.color_name ? ' · ' + esc(l.color_name) : ''}</li>`).join('')}</ul>`;
  let subject, body;
  if (kind === 'despachado' && retiro) {
    subject = `Tu pedido ${o.id} está listo para retiro`;
    body = `<h2 style="margin:0 0 8px">¡${esc(first)}, tu pedido está listo! 🙌</h2>
      <p style="margin:0">Ya lo puedes retirar gratis en <b>${esc(ship.pickupPoint || 'el punto acordado')}</b>. Te escribimos por WhatsApp para coordinar la hora exacta; si no te ha llegado el mensaje, escríbenos al +56 9 9225 9960.</p>`;
  } else if (kind === 'despachado') {
    subject = `Tu pedido ${o.id} va en camino 🚚`;
    const code = o.trackingCode ? `<p style="margin:12px 0 0">Courier: <b>${esc(o.courier || '')}</b> · N° de seguimiento: <b>${esc(o.trackingCode)}</b></p>` : (o.courier ? `<p style="margin:12px 0 0">Lo lleva: <b>${esc(o.courier)}</b></p>` : '');
    body = `<h2 style="margin:0 0 8px">¡${esc(first)}, tu pedido va en camino!</h2>
      <p style="margin:0">Lo despachamos a ${esc(ship.comuna || '')}${ship.region ? ', ' + esc(ship.region) : ''}.${o.promisedDate ? ` Debería llegar a más tardar el <b>${fmt(o.promisedDate)}</b>.` : ''}</p>${code}
      ${/^https?:\/\//.test(o.trackingUrl || '') ? btn('Seguir en ' + esc(o.courier || 'el courier'), esc(o.trackingUrl)) : ''}`;
  } else {
    subject = `Tu pedido ${o.id} fue entregado ✔`;
    body = `<h2 style="margin:0 0 8px">¡Que lo disfrutes, ${esc(first)}!</h2>
      <p style="margin:0">Tu pedido ${retiro ? 'fue retirado' : 'fue entregado'}. Gracias por confiar en The White Hilux.</p>
      <p style="margin:12px 0 0">Sube una foto con tu merch y etiquétanos en Instagram <b>@the.whitehilux</b>. Si algo no te quedó bien, tienes 30 días para cambiar la talla: respóndenos este correo o escríbenos por WhatsApp.</p>`;
  }
  const html = frame(`
    ${body}
    <p style="margin:16px 0 0;color:#555">Pedido <b>${esc(o.id)}</b>:</p>${items}
    ${kind !== 'entregado' ? btn('Sigue tu pedido', trackLink(o)) : ''}`);
  return { subject, html };
}

async function sendEmail({ to, subject, html, key, from, replyTo }) {
  key = (key || process.env.RESEND_API_KEY || '').trim();
  if (!key || key === 'none' || !to) return { skipped: true }; // "none" = correos desactivados
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: from || process.env.RESEND_FROM || 'The White Hilux <onboarding@resend.dev>',
      to: [to],
      subject,
      html,
      ...(replyTo || process.env.REPLY_TO ? { reply_to: replyTo || process.env.REPLY_TO } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Resend respondió ${res.status}: ${await res.text()}`);
  return res.json();
}

// Recordatorio de carrito abandonado (12 h después): lo que dejó + código de descuento + botón para retomar la compra
function cartReminderEmail(cart, link, code) {
  const first = String(cart.name || '').split(/\s+/)[0];
  const rows = (cart.items || []).map((l) =>
    `<tr><td style="padding:6px 8px;border-bottom:1px solid #ddd">${esc(l.name)}<br><small>${esc(
      [l.design_name, l.size && l.size !== 'Única' ? 'Talla ' + l.size : '', l.color_name].filter(Boolean).join(' · ')
    )}</small></td><td style="padding:6px 8px;border-bottom:1px solid #ddd;text-align:center">${esc(l.qty)}</td><td style="padding:6px 8px;border-bottom:1px solid #ddd;text-align:right">${clp(l.total)}</td></tr>`).join('');
  const subject = code ? 'Continúa tu compra con 10% de descuento 🛻' : 'Tu carrito te espera: continúa tu compra 🛻';
  const offer = code
    ? `<p style="margin:0">Te lo guardamos. <b>Continúa tu compra con 10% de descuento</b> con el código:</p>
    <p style="margin:14px 0;text-align:center"><span style="display:inline-block;border:2px dashed #B3202A;border-radius:8px;padding:10px 18px;font-size:22px;font-weight:bold;letter-spacing:2px;color:#B3202A">${esc(code)}</span></p>`
    : `<p style="margin:0 0 14px">Te lo guardamos para que retomes tu compra cuando quieras. Es solo un clic: tu carrito queda listo para pagar.</p>`;
  const html = frame(`
    <h2 style="margin:0 0 8px">${first ? '¡Hola ' + esc(first) + '!' : '¡Hola!'} Dejaste algo en tu carrito</h2>
    ${offer}
    <table style="width:100%;border-collapse:collapse;font-size:14px"><tbody>${rows}</tbody></table>
    <p style="margin:20px 0 0;text-align:center"><a href="${esc(link)}" style="background:#B3202A;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">Continuar mi compra</a></p>
    <p style="margin:16px 0 0;color:#555;font-size:13px">${code ? 'El botón deja tu carrito listo y el código aplicado. Válido para una compra con este correo, sujeto a stock.' : 'Los productos están sujetos a stock.'} ¿Dudas? Responde este correo o escríbenos por Instagram @the.whitehilux.</p>`);
  return { subject, html };
}

module.exports = { orderHtml, alertHtml, statusEmail, cartReminderEmail, sendEmail, clp };
