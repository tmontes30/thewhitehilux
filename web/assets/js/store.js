// Catálogo, carrito (guardado en el navegador), encabezado y pie compartidos por todas las páginas.
// Los datos base vienen de data/catalog.js (las páginas funcionan abiertas con doble clic) y encima se aplica
// lo editado en el panel de admin (precio, descripción, estado, stock), leído de Firestore: documento tienda/catalogo.
(function () {
  var KEY = 'twh-cart';
  var D = window.TWH_DATA;

  function money(n) { return '$' + Math.round(Number(n) || 0).toLocaleString('es-CL'); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  // ---------- Datos en vivo (Firestore por REST, sin cargar el SDK) ----------
  function fsValue(v) {
    if (!v) return null;
    if ('stringValue' in v) return v.stringValue;
    if ('integerValue' in v) return Number(v.integerValue);
    if ('doubleValue' in v) return Number(v.doubleValue);
    if ('booleanValue' in v) return v.booleanValue;
    if ('timestampValue' in v) return v.timestampValue;
    if ('mapValue' in v) return fsFields(v.mapValue.fields || {});
    if ('arrayValue' in v) return (v.arrayValue.values || []).map(fsValue);
    return null;
  }
  function fsFields(f) { var o = {}; Object.keys(f).forEach(function (k) { o[k] = fsValue(f[k]); }); return o; }
  function fetchRemote() {
    var F = window.TWH_FIREBASE;
    if (!F || !F.projectId || !window.fetch) return Promise.resolve(null);
    var base = F.useEmulators ? 'http://127.0.0.1:8080' : 'https://firestore.googleapis.com';
    var url = base + '/v1/projects/' + F.projectId + '/databases/(default)/documents/tienda/catalogo' + (F.apiKey && !F.useEmulators ? '?key=' + F.apiKey : '');
    var timeout = new Promise(function (res) { setTimeout(function () { res(null); }, 4000); });
    var req = fetch(url, { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return j && j.fields ? fsFields(j.fields) : null; })
      .catch(function () { return null; });
    return Promise.race([req, timeout]);
  }
  var dataPromise = null;
  function loadData(opts) {
    if (!D) return Promise.reject(new Error('Falta data/catalog.js'));
    if (!dataPromise) {
      dataPromise = fetchRemote().then(function (remote) {
        var m = window.TWHCore.mergeCatalog(D, remote);
        m.live = !!remote;
        m.all = m.products;
        return m;
      });
    }
    return dataPromise.then(function (m) {
      return {
        products: m.all.filter(function (p) { return p.status !== 'oculto'; }),
        config: m.config,
        settings: m.settings,
        live: m.live
      };
    });
  }

  // Imagen de un producto: foto real si existe, si no la prenda dibujada con el logo
  function imagesFor(p, color) {
    return window.TWHCore.orderedImages(p, color); // poleras y polerones: frente primero
  }
  function usesImages(p, color) { return imagesFor(p, color).length > 0; }
  function picture(p, i, color) {
    var imgs = imagesFor(p, color);
    var base = imgs.length ? imgs.length : p.views.length;
    if (p.photos && i >= base) return '<img src="' + esc(p.photos[i - base]) + '" alt="' + esc(p.name) + '" loading="lazy" class="photo">';
    if (imgs.length) {
      var src = imgs[Math.min(i || 0, imgs.length - 1)];
      return '<img src="' + esc(src) + '" alt="' + esc(p.name) + '" loading="lazy">';
    }
    var v = p.views[Math.min(i || 0, p.views.length - 1)];
    return TWHMock.mock(v, color || p.colors[0] || 'negro', p.name);
  }
  function pictureCount(p, color) { return (usesImages(p, color) ? imagesFor(p, color).length : p.views.length) + (p.photos ? p.photos.length : 0); }

  function read() {
    try { var v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
  }
  function write(items) {
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) {}
    updateBadge();
  }
  function sameLine(a, b) { return a.id === b.id && a.size === b.size && (a.color || '') === (b.color || '') && (a.design || '') === (b.design || ''); }
  var Cart = {
    items: read,
    add: function (line) {
      var items = read();
      var found = items.filter(function (x) { return sameLine(x, line); })[0];
      if (found) found.qty = Math.min(10, found.qty + line.qty);
      else items.push({ id: line.id, size: line.size, color: line.color || '', design: line.design || '', qty: line.qty });
      write(items);
    },
    setQty: function (i, q) { var items = read(); if (!items[i]) return; items[i].qty = Math.max(1, Math.min(10, q)); write(items); },
    remove: function (i) { var items = read(); items.splice(i, 1); write(items); },
    clear: function () { write([]); },
    count: function () { return read().reduce(function (s, x) { return s + (x.qty || 0); }, 0); }
  };
  function updateBadge() {
    var el = document.getElementById('cart-count');
    if (!el) return;
    var n = Cart.count();
    el.textContent = n; el.hidden = n === 0;
  }

  var ICON = {
    search: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>',
    ig: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg>',
    cart: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 4h2l2.4 11h11.2L21 8H6.2"/><circle cx="9" cy="19" r="1.5"/><circle cx="18" cy="19" r="1.5"/></svg>'
  };

  function renderChrome() {
    var h = document.getElementById('site-header');
    var params = new URLSearchParams(location.search);
    if (h) {
      var cats = D ? D.config.categories : {};
      var free = D && D.config.freeShippingFrom;
      h.innerHTML =
        (D && D.config.dropNote ? '<div class="notice">' + esc(D.config.dropNote) + '</div>' : '') +
        '<header class="head"><div class="wrap head-row">' +
        '<a class="brand" href="index.html" aria-label="The White Hilux, inicio"><img src="assets/logos/logo-oficial.svg" alt="The White Hilux · 4WD Race Dept."></a>' +
        '<form class="search" action="index.html" role="search"><input name="q" id="q" placeholder="Buscar poleras, polerones, jockeys…" aria-label="Buscar productos" value="' + esc(params.get('q') || '') + '"><button aria-label="Buscar">' + ICON.search + '</button></form>' +
        '<div class="head-actions">' +
        '<a class="icon-link" href="https://www.instagram.com/the.whitehilux/" target="_blank" rel="noopener" aria-label="Instagram">' + ICON.ig + '<span class="label">Instagram</span></a>' +
        '<a class="icon-link" href="carrito.html" aria-label="Carrito">' + ICON.cart + '<span class="label">Carrito</span><span class="badge" id="cart-count" hidden>0</span></a>' +
        '</div></div><nav class="wrap cats" aria-label="Categorías"><a href="index.html"' + (document.getElementById('productos') && !params.get('cat') && !params.get('q') && !params.get('estado') ? ' aria-current="page"' : '') + '>Todo</a>' +
        Object.keys(cats).map(function (k) { return '<a href="index.html?cat=' + k + '"' + (params.get('cat') === k ? ' aria-current="page"' : '') + '>' + esc(cats[k]) + '</a>'; }).join('') +
        '<a href="nosotros.html"' + (/nosotros/.test(location.pathname) ? ' aria-current="page"' : '') + '>Nosotros</a><a href="seguimiento.html"' + (/seguimiento/.test(location.pathname) ? ' aria-current="page"' : '') + '>Sigue tu pedido</a><span class="spacer"></span>' + (free ? '<span class="ship-note">Envío a todo Chile</span>' : '') +
        '</nav><div class="stripes"></div></header>';
    }
    var f = document.getElementById('site-footer');
    if (f) {
      var c2 = D ? D.config.categories : {};
      f.innerHTML = '<footer class="foot"><div class="wrap foot-in">' +
        '<div><img src="assets/logos/logo-oficial.svg" alt="The White Hilux · 4WD Race Dept."><p>Merch off road de @the.whitehilux.</p></div>' +
        '<div><h4>Tienda</h4>' + Object.keys(c2).map(function (k) { return '<a href="index.html?cat=' + k + '">' + esc(c2[k]) + '</a>'; }).join('') + '</div>' +
        '<div><h4>Ayuda</h4><a href="seguimiento.html"><b>Sigue tu pedido</b></a><a href="nosotros.html">Nosotros</a><a href="carrito.html">Mi carrito</a>' +
        (D && D.config.whatsapp ? '<a class="foot-wa" href="https://wa.me/' + D.config.whatsapp + '?text=' + encodeURIComponent('Hola! Vengo de la tienda The White Hilux y tengo una consulta') + '" target="_blank" rel="noopener">' + WA_ICON + 'WhatsApp</a>' : '') +
        (D && D.config.email ? '<a href="mailto:' + esc(D.config.email) + '">✉ ' + esc(D.config.email) + '</a>' : '') +
        '<a href="https://www.instagram.com/the.whitehilux/" target="_blank" rel="noopener">Instagram @the.whitehilux</a></div>' +
        '<div><h4>Legal</h4><a href="terminos.html">Términos y condiciones</a><a href="cambios.html">Cambios y devoluciones</a><a href="privacidad.html">Privacidad</a></div>' +
        '</div><div class="wrap foot-bottom"><span>© The White Hilux' + (function () {
          var L = (D && D.config.legal) || {};
          return L.titular ? ' · ' + esc(L.titular) + (L.rut ? ' · RUT ' + esc(L.rut) : '') : '';
        })() + '</span><span>Pagos procesados por Mercado Pago · Hilux es marca de Toyota; no estamos afiliados</span></div></footer>';
    }
    updateBadge();
    if (h && D) {
      loadData().then(function (d) {
        if (!d.products.some(function (p) { return p.status === 'proximamente'; })) return;
        var nos = h.querySelector('.cats a[href="nosotros.html"]');
        if (!nos) return;
        var a = document.createElement('a');
        a.href = 'index.html?estado=proximamente';
        a.className = 'cat-soon';
        a.innerHTML = 'Próximamente <span class="soon-dot">NUEVO</span>';
        if (params.get('estado') === 'proximamente') a.setAttribute('aria-current', 'page');
        nos.parentNode.insertBefore(a, nos);
      });
    }
    renderWhatsApp();
  }

  // ---------- Botón flotante de WhatsApp ----------
  var WA_ICON = '<svg viewBox="0 0 32 32" aria-hidden="true"><path fill="#fff" d="M16.04 3C9 3 3.3 8.68 3.3 15.7c0 2.24.59 4.43 1.71 6.36L3.2 28.8l6.92-1.8a12.8 12.8 0 0 0 5.92 1.48h.01c7.03 0 12.75-5.7 12.75-12.72C28.8 8.7 23.07 3 16.04 3Zm0 23.3h-.01c-1.9 0-3.77-.51-5.4-1.48l-.39-.23-4.1 1.07 1.1-3.99-.26-.41a10.5 10.5 0 0 1-1.62-5.6c0-5.84 4.77-10.6 10.67-10.6 2.85 0 5.53 1.1 7.54 3.11a10.5 10.5 0 0 1 3.12 7.5c0 5.84-4.78 10.6-10.65 10.6Zm5.84-7.94c-.32-.16-1.89-.93-2.18-1.03-.3-.11-.51-.16-.72.16-.22.32-.83 1.03-1.02 1.24-.19.21-.37.24-.69.08-.32-.16-1.35-.5-2.57-1.58a9.6 9.6 0 0 1-1.78-2.2c-.19-.32-.02-.49.14-.65.14-.14.32-.37.48-.56.16-.18.21-.31.32-.52.1-.21.05-.4-.03-.56-.08-.16-.72-1.72-.98-2.36-.26-.62-.53-.53-.72-.54h-.62c-.21 0-.56.08-.85.4-.29.31-1.12 1.09-1.12 2.66 0 1.57 1.15 3.08 1.31 3.3.16.2 2.25 3.43 5.46 4.81.76.33 1.36.52 1.82.67.77.24 1.46.2 2.01.12.61-.09 1.89-.77 2.15-1.51.27-.74.27-1.38.19-1.51-.08-.13-.29-.21-.61-.37Z"/></svg>';
  function renderWhatsApp() {
    var num = D && D.config.whatsapp;
    if (!num || document.querySelector('.wa-float')) return;
    var msg = 'Hola! Vengo de la tienda The White Hilux y tengo una consulta';
    if (/producto/.test(location.pathname)) {
      var t = document.title.split(' · ')[0];
      if (t && t !== 'Producto') msg = 'Hola! Vi la ' + t + ' en la tienda y tengo una consulta';
    } else if (/carrito/.test(location.pathname)) {
      msg = 'Hola! Tengo una consulta sobre mi compra en la tienda The White Hilux';
    }
    var a = document.createElement('a');
    a.className = 'wa-float';
    a.target = '_blank';
    a.rel = 'noopener';
    a.setAttribute('aria-label', 'Escríbenos por WhatsApp');
    a.title = 'Escríbenos por WhatsApp';
    a.innerHTML = WA_ICON;
    // el mensaje se arma al hacer clic (en la ficha el título del producto se carga después)
    a.addEventListener('click', function () {
      var m = msg;
      if (/producto/.test(location.pathname)) {
        var t2 = document.title.split(' · ')[0];
        if (t2 && t2 !== 'Producto') m = 'Hola! Vi la ' + t2 + ' en la tienda y tengo una consulta';
      }
      a.href = 'https://wa.me/' + num + '?text=' + encodeURIComponent(m);
    });
    a.href = 'https://wa.me/' + num + '?text=' + encodeURIComponent(msg);
    document.body.appendChild(a);
  }

  // Precio con oferta: tachado + porcentaje
  function priceHtml(p, cls) {
    if (!p.compareAt) return '<span class="' + (cls || 'price') + '">' + money(p.price) + '</span>';
    return '<span class="price-old">' + money(p.compareAt) + '</span><span class="' + (cls || 'price') + '">' + money(p.price) + ' <em class="off">' + p.offerPct + '% OFF</em></span>';
  }

  document.addEventListener('DOMContentLoaded', renderChrome);

  window.TWH = { core: window.TWHCore, loadData: loadData, Cart: Cart, money: money, esc: esc, picture: picture, pictureCount: pictureCount, updateBadge: updateBadge, ICON: ICON, priceHtml: priceHtml };
})();
