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
    if (p.imagesByColor) return p.imagesByColor[color || p.colors[0]] || [];
    return p.images || [];
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
        '<a class="brand" href="index.html" aria-label="The White Hilux, inicio"><img src="assets/logos/logo-shop.svg" alt="The White Hilux CL Shop"></a>' +
        '<form class="search" action="index.html" role="search"><input name="q" id="q" placeholder="Buscar poleras, polerones, jockeys…" aria-label="Buscar productos" value="' + esc(params.get('q') || '') + '"><button aria-label="Buscar">' + ICON.search + '</button></form>' +
        '<div class="head-actions">' +
        '<a class="icon-link" href="https://www.instagram.com/the.whitehilux/" target="_blank" rel="noopener" aria-label="Instagram">' + ICON.ig + '<span class="label">Instagram</span></a>' +
        '<a class="icon-link" href="carrito.html" aria-label="Carrito">' + ICON.cart + '<span class="label">Carrito</span><span class="badge" id="cart-count" hidden>0</span></a>' +
        '</div></div><nav class="wrap cats" aria-label="Categorías"><a href="index.html"' + (document.getElementById('productos') && !params.get('cat') && !params.get('q') && !params.get('estado') ? ' aria-current="page"' : '') + '>Todo</a>' +
        Object.keys(cats).map(function (k) { return '<a href="index.html?cat=' + k + '"' + (params.get('cat') === k ? ' aria-current="page"' : '') + '>' + esc(cats[k]) + '</a>'; }).join('') +
        '<a href="nosotros.html"' + (/nosotros/.test(location.pathname) ? ' aria-current="page"' : '') + '>Nosotros</a><span class="spacer"></span>' + (free ? '<span class="ship-note">Envío a todo Chile</span>' : '') +
        '</nav><div class="stripes"></div></header>';
    }
    var f = document.getElementById('site-footer');
    if (f) {
      var c2 = D ? D.config.categories : {};
      f.innerHTML = '<footer class="foot"><div class="wrap foot-in">' +
        '<div><img src="assets/logos/cl-shop.svg" alt="The White Hilux CL Shop"><p>Merch off road de @the.whitehilux.</p></div>' +
        '<div><h4>Tienda</h4>' + Object.keys(c2).map(function (k) { return '<a href="index.html?cat=' + k + '">' + esc(c2[k]) + '</a>'; }).join('') + '</div>' +
        '<div><h4>Ayuda</h4><a href="nosotros.html">Nosotros</a><a href="carrito.html">Mi carrito</a><a href="https://www.instagram.com/the.whitehilux/" target="_blank" rel="noopener">Escríbenos por Instagram</a><a href="index.html">Envíos a todo Chile</a></div>' +
        '</div><div class="wrap foot-bottom"><span>© The White Hilux</span><span>Pagos procesados por Mercado Pago</span></div></footer>';
    }
    updateBadge();
    if (h && D) {
      loadData().then(function (d) {
        if (!d.products.some(function (p) { return p.status === 'proximamente'; })) return;
        var nos = h.querySelector('.cats a[href="nosotros.html"]');
        if (!nos) return;
        var a = document.createElement('a');
        a.href = 'index.html?estado=proximamente#productos';
        a.className = 'cat-soon';
        a.innerHTML = 'Próximamente <span class="soon-dot">NUEVO</span>';
        if (params.get('estado') === 'proximamente') a.setAttribute('aria-current', 'page');
        nos.parentNode.insertBefore(a, nos);
      });
    }
  }

  document.addEventListener('DOMContentLoaded', renderChrome);

  window.TWH = { core: window.TWHCore, loadData: loadData, Cart: Cart, money: money, esc: esc, picture: picture, pictureCount: pictureCount, updateBadge: updateBadge, ICON: ICON };
})();
