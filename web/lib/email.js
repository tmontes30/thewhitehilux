// Envío de correos con Resend (https://resend.com). Sin API key no se manda nada (el pedido igual queda en el panel).

const clp = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('es-CL');

const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const fmt = (ymd) => (ymd ? ymd.split('-').reverse().join('-') : '');

function orderHtml({ orderId, paymentId, total, customer, shipping, lines, promisedDate }, forCustomer) {
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
      ? 'Retiro coordinado en Santiago'
      : `${esc(ship.address)}, ${esc(ship.comuna)}, ${esc(ship.region)}`;
  return `
  <div style="font-family:Arial,sans-serif;max-width:560px;color:#1c1d1a">
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
    ${promisedDate ? `<p style="margin:6px 0 0"><b>${forCustomer ? 'Fecha estimada de entrega' : 'Entregar a más tardar'}: ${fmt(promisedDate)}</b></p>` : ''}
    ${ship.notes ? `<p style="margin:6px 0 0;color:#555">Notas: ${esc(ship.notes)}</p>` : ''}
    ${
      forCustomer
        ? `<p style="margin:20px 0 0"><a href="https://thewhitehilux.cavedevz.com/seguimiento.html?pedido=${encodeURIComponent(orderId)}&correo=${encodeURIComponent((customer && customer.email) || '')}" style="background:#2968C8;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:bold">Sigue tu pedido</a></p><p style="margin:14px 0 0">Ahí verás cuándo sale tu despacho y su número de seguimiento. Cualquier duda, escríbenos por WhatsApp al +56 9 9225 9960 o por Instagram a @the.whitehilux.</p>`
        : `<h3 style="margin:20px 0 6px">Cliente</h3><p style="margin:0">${esc(customer && customer.name)}<br>${esc(
            customer && customer.email
          )}<br>${esc(customer && customer.phone)}</p>`
    }
  </div>`;
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

async function sendEmail({ to, subject, html, key, from }) {
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
    }),
  });
  if (!res.ok) throw new Error(`Resend respondió ${res.status}: ${await res.text()}`);
  return res.json();
}

module.exports = { orderHtml, alertHtml, sendEmail, clp };
