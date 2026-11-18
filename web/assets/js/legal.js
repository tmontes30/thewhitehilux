// Rellena los datos del vendedor en las páginas legales (desde config.legal de data/catalog.js).
// Si falta algún dato, lo muestra destacado en amarillo para que no se publique incompleto sin darse cuenta.
(function () {
  var c = (window.TWH_DATA && window.TWH_DATA.config) || {};
  var L = c.legal || {};
  var falta = function (txt) { return '<mark class="falta">[' + txt + ']</mark>'; };
  var datos = {
    titular: L.titular || falta('Nombre del titular o razón social'),
    rut: L.rut || falta('RUT'),
    ciudad: L.ciudad || falta('Ciudad'),
    email: c.email ? '<a href="mailto:' + c.email + '">' + c.email + '</a>' : falta('Correo'),
    whatsapp: c.whatsapp ? '<a href="https://wa.me/' + c.whatsapp + '" target="_blank" rel="noopener">+' + c.whatsapp.replace(/^56(9)(\d{4})(\d{4})$/, '56 $1 $2 $3') + '</a>' : falta('WhatsApp'),
    actualizado: (L.actualizado || '').split('-').reverse().join('-')
  };
  document.querySelectorAll('[data-legal]').forEach(function (el) { el.innerHTML = datos[el.getAttribute('data-legal')] || ''; });
  if (!L.titular || !L.rut) {
    var aviso = document.getElementById('aviso-datos');
    if (aviso) aviso.hidden = false;
  }
})();
