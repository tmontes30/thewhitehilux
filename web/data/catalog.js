// Catálogo de la tienda. ÚNICO archivo que editas para productos, precios, envíos y aviso del drop.
// Lo usan las páginas (window.TWH_DATA) y el servidor de pagos (require).
//
// Cada producto:
//   images:   fotos reales, ej. ["assets/img/polera-rally-1.jpg", "assets/img/polera-rally-2.jpg"]
//             (si está vacío se muestra la prenda dibujada con el logo de "views")
//   views:    logo de disenos/logos (nombre del archivo sin .svg) y dónde va en la prenda
//   features: tabla "Características principales"
(function (root) {
  var data = {
    config: {
      storeName: 'The White Hilux',
      dropNote: '', // franja amarilla arriba de la tienda (vacío = no se muestra)
      whatsapp: '56992259960', // botón flotante de WhatsApp (sin + ni espacios)
      email: 'tmontes30@gmail.com', // correo de contacto en Ayuda (pie de página)
      // Datos de quien vende (Ley del Consumidor: identificación del proveedor). Completar antes de vender.
      legal: { titular: 'Tomás Montes', rut: '20.164.646-4', ciudad: 'Santiago, Chile', actualizado: '2026-11-18' },
      freeShippingZones: ['rm'],
      freeShippingFrom: 40000,
      maxQtyPerLine: 10,
      shipping: {
        rm: { label: 'Despacho Región Metropolitana', price: 3990 },
        regiones: { label: 'Despacho a regiones', price: 5990 },
        retiro: { label: 'Retiro gratis', price: 0 }
      },
      // Puntos de retiro gratis (el cliente elige uno; se coordina el lugar exacto por WhatsApp)
      pickupPoints: ['Los Trapenses, Lo Barnechea (cerca del Líder Pie Andino)', 'Parque Araucano, Las Condes (Rosario Norte)'],
      colors: { negro: 'Negro', blanco: 'Blanco' },
      categories: { polera: 'Poleras', poleron: 'Polerones', jockey: 'Jockeys', stickers: 'Stickers', neumaticos: 'Neumáticos' },
      regions: ['Arica y Parinacota', 'Tarapacá', 'Antofagasta', 'Atacama', 'Coquimbo', 'Valparaíso', 'Región Metropolitana',
        "O'Higgins", 'Maule', 'Ñuble', 'Biobío', 'La Araucanía', 'Los Ríos', 'Los Lagos', 'Aysén', 'Magallanes']
    },
    products: [
      {
        id: 'polera-twh-4x4-rally-team-algodon', name: 'Polera White Hilux Script', type: 'polera', price: 19990,
        sizes: ['S', 'M', 'L', 'XL', 'XXL'], colors: ['negro', 'blanco'],
        views: [{ shape: 'tee-back', logo: 'script-checker' }, { shape: 'tee-front', logo: 'checkered-shield' }],
        images: [], imagesByColor: { negro: ['assets/img/productos/polera-twh-4x4-rally-team-algodon-negro-espalda.png', 'assets/img/productos/polera-twh-4x4-rally-team-algodon-negro-frente.png', 'assets/img/productos/polera-twh-4x4-rally-team-algodon-negro-frente-2.png'], blanco: ['assets/img/productos/polera-twh-4x4-rally-team-algodon-blanco-espalda.png', 'assets/img/productos/polera-twh-4x4-rally-team-algodon-blanco-frente.png', 'assets/img/productos/polera-twh-4x4-rally-team-algodon-blanco-frente-2.png'] }, sizeGuide: 'polera', active: true,
        desc: 'Polera con White Hilux Script en la espalda y Escudo 4x4 Team chico en el pecho.',
        features: [['Material', 'Work Gear, tela gruesa de calidad'], ['Modelo', 'Mide 1,74 m, pesa 76 kg y usa talla XL'], ['Estampado', 'DTF espalda y pecho']],
        cfg: {"tipo":"polera","nombre":"Polera White Hilux Script","colores":["negro","blanco"],"frente":{"logo":"checkered-shield","pos":"pecho","tam":"m"},"espalda":{"logo":"script-checker","tam":"m","alto":0}}
      },
      {
        id: 'polera-mud-terrain-twh-algodon', name: 'Polera Race Shop', type: 'polera', price: 19990,
        sizes: ['S', 'M', 'L', 'XL', 'XXL'], colors: ['negro', 'blanco'],
        views: [{ shape: 'tee-back', logo: 'mountain-patch' }, { shape: 'tee-front', logo: 'round-stamp' }],
        images: [], imagesByColor: { negro: ['assets/img/productos/polera-mud-terrain-twh-algodon-negro-espalda.png', 'assets/img/productos/polera-mud-terrain-twh-algodon-negro-frente.png', 'assets/img/productos/polera-mud-terrain-twh-algodon-negro-frente-2.png'], blanco: ['assets/img/productos/polera-mud-terrain-twh-algodon-blanco-espalda.png', 'assets/img/productos/polera-mud-terrain-twh-algodon-blanco-frente.png', 'assets/img/productos/polera-mud-terrain-twh-algodon-blanco-frente-2.png'] }, sizeGuide: 'polera', active: true,
        desc: 'Polera con Race Shop en la espalda y Sello Off Road Supply chico en el pecho.',
        features: [['Material', 'Work Gear, tela gruesa de calidad'], ['Modelo', 'Mide 1,74 m, pesa 76 kg y usa talla XL'], ['Estampado', 'DTF espalda y pecho']],
        cfg: {"tipo":"polera","nombre":"Polera Race Shop","colores":["negro","blanco"],"frente":{"logo":"round-stamp","pos":"pecho","tam":"m"},"espalda":{"logo":"mountain-patch","tam":"m","alto":0}}
      },
      {
        id: 'polera-low-range-club-4wd', name: 'Polera Low Range Club', type: 'polera', price: 19990,
        sizes: ['S', 'M', 'L', 'XL', 'XXL'], colors: ['negro', 'blanco'],
        views: [{ shape: 'tee-back', logo: 'low-range' }, { shape: 'tee-front', logo: 'speed-shop' }],
        images: [], imagesByColor: { negro: ['assets/img/productos/polera-low-range-club-4wd-negro-espalda.png', 'assets/img/productos/polera-low-range-club-4wd-negro-frente.png', 'assets/img/productos/polera-low-range-club-4wd-negro-frente-2.png'], blanco: ['assets/img/productos/polera-low-range-club-4wd-blanco-espalda.png', 'assets/img/productos/polera-low-range-club-4wd-blanco-frente.png', 'assets/img/productos/polera-low-range-club-4wd-blanco-frente-2.png'] }, sizeGuide: 'polera', active: true,
        desc: 'Polera con Low Range Club en la espalda y Speed Shop chico en el pecho.',
        features: [['Material', 'Work Gear, tela gruesa de calidad'], ['Modelo', 'Mide 1,74 m, pesa 76 kg y usa talla XL'], ['Estampado', 'DTF espalda y pecho']],
        cfg: {"tipo":"polera","nombre":"Polera Low Range Club","colores":["negro","blanco"],"frente":{"logo":"speed-shop","pos":"pecho","tam":"m"},"espalda":{"logo":"low-range","tam":"m","alto":0}}
      },
      {
        id: 'polera-twh-cruz-white-hilux-algodon', name: 'Polera Sunset', type: 'polera', price: 19990,
        sizes: ['S', 'M', 'L', 'XL', 'XXL'], colors: ['negro', 'blanco'],
        views: [{ shape: 'tee-back', logo: 'sunset' }, { shape: 'tee-front', logo: 'supply-co' }],
        images: [], imagesByColor: { negro: ['assets/img/productos/polera-twh-cruz-white-hilux-algodon-negro-espalda.png', 'assets/img/productos/polera-twh-cruz-white-hilux-algodon-negro-frente.png', 'assets/img/productos/polera-twh-cruz-white-hilux-algodon-negro-frente-2.png'], blanco: ['assets/img/productos/polera-twh-cruz-white-hilux-algodon-blanco-espalda.png', 'assets/img/productos/polera-twh-cruz-white-hilux-algodon-blanco-frente.png', 'assets/img/productos/polera-twh-cruz-white-hilux-algodon-blanco-frente-2.png'] }, sizeGuide: 'polera', active: true,
        desc: 'Polera con Sunset en la espalda y TWH Supply Co. chico en el pecho.',
        features: [['Material', 'Work Gear, tela gruesa de calidad'], ['Modelo', 'Mide 1,74 m, pesa 76 kg y usa talla XL'], ['Estampado', 'DTF espalda y pecho']],
        cfg: {"tipo":"polera","nombre":"Polera Sunset","colores":["negro","blanco"],"frente":{"logo":"supply-co","pos":"pecho","tam":"m"},"espalda":{"logo":"sunset","tam":"m","alto":0}}
      },
      {
        id: 'polera-twh-recovery', name: 'Polera Recovery Crew', type: 'polera', price: 19990,
        sizes: ['S', 'M', 'L', 'XL', 'XXL'], colors: ['negro', 'blanco'],
        views: [{ shape: 'tee-back', logo: 'recovery-crew' }, { shape: 'tee-front', logo: 'race-dept' }],
        images: [], imagesByColor: { negro: ['assets/img/productos/polera-twh-recovery-negro-espalda.png', 'assets/img/productos/polera-twh-recovery-negro-frente.png', 'assets/img/productos/polera-twh-recovery-negro-frente-2.png'], blanco: ['assets/img/productos/polera-twh-recovery-blanco-espalda.png', 'assets/img/productos/polera-twh-recovery-blanco-frente.png', 'assets/img/productos/polera-twh-recovery-blanco-frente-2.png'] }, sizeGuide: 'polera', active: true,
        desc: 'Polera con Recovery Crew en la espalda y 4WD Race Dept. chico en el pecho.',
        features: [['Material', 'Work Gear, tela gruesa de calidad'], ['Modelo', 'Mide 1,74 m, pesa 76 kg y usa talla XL'], ['Estampado', 'DTF espalda y pecho']],
        cfg: {"tipo":"polera","nombre":"Polera Recovery Crew","colores":["negro","blanco"],"frente":{"logo":"race-dept","pos":"pecho","tam":"s"},"espalda":{"logo":"recovery-crew","tam":"m","alto":0}}
      },
      {
        id: 'polera-twh', name: 'Polera Warp', type: 'polera', price: 19990,
        sizes: ['S', 'M', 'L', 'XL', 'XXL'], colors: ['negro', 'blanco'],
        views: [{ shape: 'tee-back', logo: 'warp-text' }, { shape: 'tee-front', logo: 'coordenadas' }],
        images: [], imagesByColor: { negro: ['assets/img/productos/polera-twh-negro-espalda.png', 'assets/img/productos/polera-twh-negro-frente.png', 'assets/img/productos/polera-twh-negro-frente-2.png'], blanco: ['assets/img/productos/polera-twh-blanco-espalda.png', 'assets/img/productos/polera-twh-blanco-frente.png', 'assets/img/productos/polera-twh-blanco-frente-2.png'] }, sizeGuide: 'polera', active: true,
        desc: 'Polera con Warp en la espalda y Off Road Team chico en el pecho.',
        features: [['Material', 'Work Gear, tela gruesa de calidad'], ['Modelo', 'Mide 1,74 m, pesa 76 kg y usa talla XL'], ['Estampado', 'DTF espalda y pecho']],
        cfg: {"tipo":"polera","nombre":"Polera Warp","colores":["negro","blanco"],"frente":{"logo":"coordenadas","pos":"pecho","tam":"m"},"espalda":{"logo":"warp-text","tam":"m","alto":0}}
      },
      {
        id: 'polera-twh-aired-down', name: 'Polera Aired Down', type: 'polera', price: 19990,
        sizes: ['S', 'M', 'L', 'XL', 'XXL'], colors: ['negro', 'blanco'],
        views: [{ shape: 'tee-back', logo: 'aired-down' }, { shape: 'tee-front', logo: 'script-checker' }],
        images: [], imagesByColor: { negro: ['assets/img/productos/polera-twh-aired-down-negro-espalda.png', 'assets/img/productos/polera-twh-aired-down-negro-frente.png', 'assets/img/productos/polera-twh-aired-down-negro-frente-2.png'], blanco: ['assets/img/productos/polera-twh-aired-down-blanco-espalda.png', 'assets/img/productos/polera-twh-aired-down-blanco-frente.png', 'assets/img/productos/polera-twh-aired-down-blanco-frente-2.png'] }, sizeGuide: 'polera', active: true,
        desc: 'Polera con Aired Down en la espalda y White Hilux Script chico en el pecho.',
        features: [['Material', 'Work Gear, tela gruesa de calidad'], ['Modelo', 'Mide 1,74 m, pesa 76 kg y usa talla XL'], ['Estampado', 'DTF espalda y pecho']],
        cfg: {"tipo":"polera","nombre":"Polera Aired Down","colores":["negro","blanco"],"frente":{"logo":"script-checker","pos":"pecho","tam":"m"},"espalda":{"logo":"aired-down","tam":"m","alto":0}}
      },
      {
        id: 'polera-basica-twh-logo-pecho', name: 'Polera Básica White Hilux Script', type: 'polera', price: 19990,
        sizes: ['S', 'M', 'L', 'XL', 'XXL'], colors: ['negro', 'blanco'],
        views: [{ shape: 'tee-front', logo: 'script-checker' }],
        images: [], imagesByColor: { negro: ['assets/img/productos/polera-basica-twh-logo-pecho-negro-frente.png', 'assets/img/productos/polera-basica-twh-logo-pecho-negro-frente-2.png'], blanco: ['assets/img/productos/polera-basica-twh-logo-pecho-blanco-frente.png', 'assets/img/productos/polera-basica-twh-logo-pecho-blanco-frente-2.png'] }, sizeGuide: 'polera', active: true,
        desc: 'Polera con White Hilux Script chico en el pecho.',
        features: [['Material', 'Work Gear, tela gruesa de calidad'], ['Modelo', 'Mide 1,74 m, pesa 76 kg y usa talla XL'], ['Estampado', 'DTF pecho']],
        cfg: {"tipo":"polera","nombre":"Polera Básica White Hilux Script","colores":["negro","blanco"],"frente":{"logo":"script-checker","pos":"pecho","tam":"m"},"espalda":null}
      },
      {
        id: 'polera-basica-sello-off-road-supply', name: 'Polera Básica Escudo 4x4 Team', type: 'polera', price: 19990,
        sizes: ['S', 'M', 'L', 'XL', 'XXL'], colors: ['negro', 'blanco'],
        views: [{ shape: 'tee-front', logo: 'checkered-shield' }],
        images: [], imagesByColor: { negro: ['assets/img/productos/polera-basica-sello-off-road-supply-negro-frente.png', 'assets/img/productos/polera-basica-sello-off-road-supply-negro-frente-2.png'], blanco: ['assets/img/productos/polera-basica-sello-off-road-supply-blanco-frente.png', 'assets/img/productos/polera-basica-sello-off-road-supply-blanco-frente-2.png'] }, sizeGuide: 'polera', active: true,
        desc: 'Polera con Escudo 4x4 Team chico en el pecho.',
        features: [['Material', 'Work Gear, tela gruesa de calidad'], ['Modelo', 'Mide 1,74 m, pesa 76 kg y usa talla XL'], ['Estampado', 'DTF pecho']],
        cfg: {"tipo":"polera","nombre":"Polera Básica Escudo 4x4 Team","colores":["negro","blanco"],"frente":{"logo":"checkered-shield","pos":"pecho","tam":"s"},"espalda":null}
      },
      {
        id: 'polera-basica-the-white-hilux-cl-shop', name: 'Polera Básica 4WD Race Dept.', type: 'polera', price: 19990,
        sizes: ['S', 'M', 'L', 'XL', 'XXL'], colors: ['negro', 'blanco'],
        views: [{ shape: 'tee-front', logo: 'race-dept' }],
        images: [], imagesByColor: { negro: ['assets/img/productos/polera-basica-the-white-hilux-cl-shop-negro-frente.png', 'assets/img/productos/polera-basica-the-white-hilux-cl-shop-negro-frente-2.png'], blanco: ['assets/img/productos/polera-basica-the-white-hilux-cl-shop-blanco-frente.png', 'assets/img/productos/polera-basica-the-white-hilux-cl-shop-blanco-frente-2.png'] }, sizeGuide: 'polera', active: true,
        desc: 'Polera con 4WD Race Dept. chico en el pecho.',
        features: [['Material', 'Work Gear, tela gruesa de calidad'], ['Modelo', 'Mide 1,74 m, pesa 76 kg y usa talla XL'], ['Estampado', 'DTF pecho']],
        cfg: {"tipo":"polera","nombre":"Polera Básica 4WD Race Dept.","colores":["negro","blanco"],"frente":{"logo":"race-dept","pos":"pecho","tam":"s"},"espalda":null}
      },
      {
        id: 'poleron-canguro-basico-twh-logo-pecho', name: 'Polerón Canguro Sello Off Road Supply', type: 'poleron', price: 34990,
        sizes: ['S', 'M', 'L', 'XL', 'XXL'], colors: ['negro'],
        views: [{ shape: 'hoodie-front', logo: 'round-stamp' }],
        images: [], imagesByColor: { negro: ['assets/img/productos/poleron-canguro-basico-twh-logo-pecho-negro-frente.png', 'assets/img/productos/poleron-canguro-basico-twh-logo-pecho-negro-espalda.png'] }, sizeGuide: 'poleron', active: true,
        desc: 'Polerón con capucha con Sello Off Road Supply chico en el pecho.',
        features: [['Material', 'Algodón/poliéster 320 g, perchado'], ['Bolsillo', 'Canguro'], ['Estampado', 'DTF pecho']],
        cfg: {"tipo":"poleron","nombre":"Polerón Canguro Sello Off Road Supply","colores":["negro"],"frente":{"logo":"round-stamp","pos":"pecho","tam":"s"},"espalda":null}
      },
      {
        id: 'poleron-canguro-basico-escudo-4x4-team', name: 'Polerón Canguro Escudo 4x4 Team', type: 'poleron', price: 34990,
        sizes: ['S', 'M', 'L', 'XL', 'XXL'], colors: ['negro'],
        views: [{ shape: 'hoodie-front', logo: 'checkered-shield' }],
        images: [], imagesByColor: { negro: ['assets/img/productos/poleron-canguro-basico-escudo-4x4-team-negro-frente.png', 'assets/img/productos/poleron-canguro-basico-escudo-4x4-team-negro-espalda.png'] }, sizeGuide: 'poleron', active: true,
        desc: 'Polerón con capucha con Escudo 4x4 Team chico en el pecho.',
        features: [['Material', 'Algodón/poliéster 320 g, perchado'], ['Bolsillo', 'Canguro'], ['Estampado', 'DTF pecho']],
        cfg: {"tipo":"poleron","nombre":"Polerón Canguro Escudo 4x4 Team","colores":["negro"],"frente":{"logo":"checkered-shield","pos":"pecho","tam":"s"},"espalda":null}
      },
      {
        id: 'poleron-canguro-basico-white-hilux-script', name: 'Polerón Canguro White Hilux Script', type: 'poleron', price: 34990,
        sizes: ['S', 'M', 'L', 'XL', 'XXL'], colors: ['negro'],
        views: [{ shape: 'hoodie-front', logo: 'script-checker' }],
        images: [], imagesByColor: { negro: ['assets/img/productos/poleron-canguro-basico-white-hilux-script-negro-frente.png', 'assets/img/productos/poleron-canguro-basico-white-hilux-script-negro-espalda.png'] }, sizeGuide: 'poleron', active: true,
        desc: 'Polerón con capucha con White Hilux Script chico en el pecho.',
        features: [['Material', 'Algodón/poliéster 320 g, perchado'], ['Bolsillo', 'Canguro'], ['Estampado', 'DTF pecho']],
        cfg: {"tipo":"poleron","nombre":"Polerón Canguro White Hilux Script","colores":["negro"],"frente":{"logo":"script-checker","pos":"pecho","tam":"s"},"espalda":null}
      },
      {
        id: 'jockey-5-paneles-twh-parche-tejido', name: 'Jockey 5 Paneles TWH Franjas Parche Tejido', type: 'jockey', price: 15990,
        sizes: ['Única'], colors: ['negro'],
        views: [{ shape: 'cap', logo: 'logo-header' }],
        images: [], imagesByColor: { negro: ['assets/img/productos/jockey-5-paneles-twh-parche-tejido-negro-jockey.png'] }, sizeGuide: null, active: true,
        desc: 'Jockey negro de 5 paneles con TWH franjas en parche tejido al frente. Cierre ajustable.',
        features: [['Material', 'Gabardina de algodón'], ['Paneles', '5'], ['Logo', 'Parche tejido'], ['Cierre', 'Ajustable'], ['Talla', 'Única']],
        cfg: {"tipo":"jockey","nombre":"Jockey 5 Paneles TWH Franjas Parche Tejido","colores":["negro"],"jockey":{"logo":"logo-header","estilo":"parche","tam":"m"}}
      },
      {
        id: 'jockey-5-paneles-the-white-hilux-parche-tejido', name: 'Jockey 5 Paneles Off Road Team Parche Tejido', type: 'jockey', price: 15990,
        sizes: ['Única'], colors: ['negro'],
        views: [{ shape: 'cap', logo: 'coordenadas' }],
        images: [], imagesByColor: { negro: ['assets/img/productos/jockey-5-paneles-the-white-hilux-parche-tejido-negro-jockey.png'] }, sizeGuide: null, active: true,
        desc: 'Jockey negro de 5 paneles con Off Road Team en parche tejido al frente. Cierre ajustable.',
        features: [['Material', 'Gabardina de algodón'], ['Paneles', '5'], ['Logo', 'Parche tejido'], ['Cierre', 'Ajustable'], ['Talla', 'Única']],
        cfg: {"tipo":"jockey","nombre":"Jockey 5 Paneles Off Road Team Parche Tejido","colores":["negro"],"jockey":{"logo":"coordenadas","estilo":"parche","tam":"m"}}
      },
      {
        id: 'jockey-5-paneles-sunset-bordado', name: 'Jockey 5 Paneles Sunset Bordado', type: 'jockey', price: 15990,
        sizes: ['Única'], colors: ['negro'],
        views: [{ shape: 'cap', logo: 'sunset' }],
        images: [], imagesByColor: { negro: ['assets/img/productos/jockey-5-paneles-sunset-bordado-negro-jockey.png'] }, sizeGuide: null, active: true,
        desc: 'Jockey negro de 5 paneles con Sunset bordado al frente. Cierre ajustable.',
        features: [['Material', 'Gabardina de algodón'], ['Paneles', '5'], ['Logo', 'Bordado'], ['Cierre', 'Ajustable'], ['Talla', 'Única']],
        cfg: {"tipo":"jockey","nombre":"Jockey 5 Paneles Sunset Bordado","colores":["negro"],"jockey":{"logo":"sunset","estilo":"bordado","tam":"m"}}
      },
      {
        id: 'jockey-5-paneles-twh-speed-shop-bordado', name: 'Jockey 5 Paneles Sello Off Road Supply Bordado', type: 'jockey', price: 15990,
        sizes: ['Única'], colors: ['negro'],
        views: [{ shape: 'cap', logo: 'round-stamp' }],
        images: [], imagesByColor: { negro: ['assets/img/productos/jockey-5-paneles-twh-speed-shop-bordado-negro-jockey.png'] }, sizeGuide: null, active: true,
        desc: 'Jockey negro de 5 paneles con Sello Off Road Supply bordado al frente. Cierre ajustable.',
        features: [['Material', 'Gabardina de algodón'], ['Paneles', '5'], ['Logo', 'Bordado'], ['Cierre', 'Ajustable'], ['Talla', 'Única']],
        cfg: {"tipo":"jockey","nombre":"Jockey 5 Paneles Sello Off Road Supply Bordado","colores":["negro"],"jockey":{"logo":"round-stamp","estilo":"bordado","tam":"m"}}
      },
      {
        id: 'jockey-5-paneles-escudo-4x4-team-bordado', name: 'Jockey 5 Paneles Escudo 4x4 Team Bordado', type: 'jockey', price: 15990,
        sizes: ['Única'], colors: ['negro'],
        views: [{ shape: 'cap', logo: 'checkered-shield' }],
        images: [], imagesByColor: { negro: ['assets/img/productos/jockey-5-paneles-escudo-4x4-team-bordado-negro-jockey.png'] }, sizeGuide: null, active: true,
        desc: 'Jockey negro de 5 paneles con Escudo 4x4 Team bordado al frente. Cierre ajustable.',
        features: [['Material', 'Gabardina de algodón'], ['Paneles', '5'], ['Logo', 'Bordado'], ['Cierre', 'Ajustable'], ['Talla', 'Única']],
        cfg: {"tipo":"jockey","nombre":"Jockey 5 Paneles Escudo 4x4 Team Bordado","colores":["negro"],"jockey":{"logo":"checkered-shield","estilo":"bordado","tam":"m"}}
      },
      {
        id: 'sticker-twh', name: 'Sticker TWH Vinilo Troquelado 10 cm', type: 'stickers', price: 2990,
        sizes: ['Única'], colors: [],
        designs: [
          { id: 'cl-shop', name: 'The White Hilux CL Shop' }, { id: 'race-dept', name: '4WD Race Dept.' }, { id: 'rally-stripes', name: 'Rally Team' },
          { id: 'twh-4x4', name: 'TWH 4X4' }, { id: 'diff-lock', name: 'Rear Diff Lock' }, { id: 'mud-terrain', name: 'Mud Terrain' },
          { id: 'aired-down', name: 'Aired Down' }, { id: 'checkered-shield', name: 'Escudo 4x4 Team' }, { id: 'low-range', name: 'Low Range Club' },
          { id: 'recovery-crew', name: 'Recovery Crew' }, { id: 'road-sign', name: 'Off Road Recovery' }, { id: 'sunset', name: 'Sunset' },
          { id: 'patente', name: 'Patente TWH·4X4' }, { id: 'rally-plate', name: 'Placa Rally 01' }, { id: 'off-road-script', name: 'Off Road' },
          { id: 'coordenadas', name: 'Off Road Team' }, { id: 'supply-co', name: 'TWH Supply Co.' },
          { id: 'iron-cross', name: 'Cruz Chopper' }, { id: 'warp-text', name: 'Warp' }, { id: 'mountain-patch', name: 'Race Shop' },
          { id: 'script-checker', name: 'White Hilux Script' }, { id: 'tire-blueprint', name: 'Plano 35"' }, { id: 'round-stamp', name: 'Sello Off Road Supply' },
          { id: 'speed-shop', name: 'Speed Shop' }, { id: 'tall-stack', name: 'Off Road Dept.' }, { id: 'sunburst', name: 'Sunburst' }
        ],
        views: [{ shape: 'sticker', logo: 'cl-shop' }],
        images: [], sizeGuide: null, active: true,
        desc: 'Elige tu diseño entre todos los logos TWH. Vinilo troquelado de 10 cm, resistente al agua y al sol. Ideal para la camioneta, el notebook o la nevera.',
        features: [['Material', 'Vinilo con laminado UV'], ['Tamaño', '10 cm'], ['Diseños', '26 a elección'], ['Uso', 'Exterior e interior']]
      },
      {
        id: 'neumaticos-at', name: 'Neumáticos AT All Terrain', type: 'neumaticos', price: 490000, cotizar: true,
        sizes: [], colors: [], views: [],
        images: ['assets/img/neumaticos/at-06.jpg', 'assets/img/neumaticos/at-03.jpg', 'assets/img/neumaticos/at-01.jpg', 'assets/img/neumaticos/at-02.jpg', 'assets/img/neumaticos/at-04.jpg', 'assets/img/neumaticos/at-05.jpg'], sizeGuide: null, active: true,
        desc: 'Neumáticos AT (All Terrain): el equilibrio entre ciudad, carretera, ripio y tierra, con buena tracción y andar silencioso. Marcas: Comforser, Summaxx, RoadX, Roadcruza, XBRI y BFGoodrich. Los precios incluyen instalación y balanceo en local (RM). Tenemos todas las medidas para camionetas y 4x4: cotiza por WhatsApp y te enviamos modelos, disponibilidad y precio.',
        features: [['Tipo', 'All Terrain (AT)'], ['Uso', 'Ciudad, carretera, ripio y tierra'], ['Marcas', 'Comforser, Summaxx, RoadX, Roadcruza, XBRI y BFGoodrich'], ['Medidas', 'Todas: consúltanos la tuya'], ['Incluye', 'Instalación y balanceo en local (RM)'], ['Precio', 'Desde $490.000 (el precio final depende de la medida: cotiza por WhatsApp)']]
      },
      {
        id: 'neumaticos-rt', name: 'Neumáticos RT Rugged Terrain', type: 'neumaticos', price: 690000, cotizar: true,
        sizes: [], colors: [], views: [],
        images: ['assets/img/neumaticos/rt-01.jpg'], sizeGuide: null, active: true,
        desc: 'Neumáticos RT (Rugged Terrain): a medio camino entre AT y MT. Más agarre en piedra, barro y ripio suelto que un AT, pero más cómodos y silenciosos en ruta que un MT. Marcas: Comforser, Summaxx, RoadX, Roadcruza, XBRI y BFGoodrich (según medida y disponibilidad). Los precios incluyen instalación y balanceo en local (RM). Tenemos todas las medidas: cotiza por WhatsApp y te enviamos modelos, disponibilidad y precio.',
        features: [['Tipo', 'Rugged Terrain (RT)'], ['Uso', 'Mixto: ruta, ripio, piedra y barro'], ['Marcas', 'Comforser, Summaxx, RoadX, Roadcruza, XBRI y BFGoodrich'], ['Medidas', 'Todas: consúltanos la tuya'], ['Incluye', 'Instalación y balanceo en local (RM)'], ['Precio', 'Desde $690.000 (el precio final depende de la medida: cotiza por WhatsApp)']]
      },
      {
        id: 'neumaticos-mt', name: 'Neumáticos MT Mud Terrain', type: 'neumaticos', price: 690000, cotizar: true,
        sizes: [], colors: [], views: [],
        images: ['assets/img/neumaticos/mt-03.jpg', 'assets/img/neumaticos/mt-02.jpg', 'assets/img/neumaticos/mt-01.jpg', 'assets/img/neumaticos/mt-04.jpg'], sizeGuide: null, active: true,
        desc: 'Neumáticos MT (Mud Terrain): tacos grandes y hombros agresivos para barro, piedra, arena y huella dura. Hechos para el off road de verdad. Marcas: Comforser, Summaxx, RoadX, Roadcruza, XBRI y BFGoodrich. Los precios incluyen instalación y balanceo en local (RM). Tenemos todas las medidas: cotiza por WhatsApp y te enviamos modelos, disponibilidad y precio.',
        features: [['Tipo', 'Mud Terrain (MT)'], ['Uso', 'Barro, piedra, arena y huella dura'], ['Marcas', 'Comforser, Summaxx, RoadX, Roadcruza, XBRI y BFGoodrich'], ['Medidas', 'Todas: consúltanos la tuya'], ['Incluye', 'Instalación y balanceo en local (RM)'], ['Precio', 'Desde $690.000 (el precio final depende de la medida: cotiza por WhatsApp)']]
      }
    ]
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = data;
  else root.TWH_DATA = data;
})(this);
