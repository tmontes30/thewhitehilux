// Datos de la estrategia de negocio. ÚNICO archivo que editas con costos reales.
// Lo leen planificador.html (doble clic) y exportar-excel.js (node).
// Productos, precios, tallas y colores NO van aquí: salen de web/data/catalog.js.
//
// Todo en pesos chilenos (CLP). Venta como persona natural: sin IVA.
// Lo marcado "SUPUESTO" es un valor de referencia: reemplazar por la cotización real.
(function (root) {
  var costos = {
    actualizado: '2026-11-17',

    // ---------- Costo de la prenda lisa, por tipo y color ----------
    prenda: {
      polera:  { negro: 4500, blanco: 4200 },   // SUPUESTO: algodón 220 g, oversize
      poleron: { negro: 14000 },                // SUPUESTO: canguro perchado 320 g
      jockey:  { negro: 4500 },                 // SUPUESTO: 5 paneles gabardina
      stickers: { _: 0 }                        // el sticker se cuenta completo en "decoracion.sticker"
    },

    // ---------- Costo de estampar / bordar, por ubicación ----------
    // Se aplica solo según el producto: 'tee-back' solo si la polera tiene diseño en la espalda,
    // jockey 'cap-bordado' o 'cap-parche' según la característica "Logo" del catálogo.
    decoracion: {
      'tee-front':    1200,  // SUPUESTO: DTF logo chico pecho (~9 cm)
      'tee-back':     2500,  // SUPUESTO: DTF diseño mediano espalda (~25 cm)
      'hoodie-front': 1500,  // SUPUESTO: DTF logo chico pecho
      'cap-parche':   2200,  // SUPUESTO: parche tejido + costura
      'cap-bordado':  2800,  // SUPUESTO: bordado directo
      'sticker':      450    // SUPUESTO: vinilo troquelado 10 cm con laminado UV, por unidad
    },

    // ---------- Empaque y extras por unidad vendida ----------
    empaque: {
      polera:  [['Etiqueta / colgante', 150], ['Bolsa', 250], ['Sticker de regalo', 0]],  // SUPUESTO
      poleron: [['Etiqueta / colgante', 150], ['Bolsa', 350]],                            // SUPUESTO
      jockey:  [['Etiqueta / colgante', 150], ['Bolsa', 250]],                            // SUPUESTO
      stickers: [['Sobre', 60]]                                                           // SUPUESTO
    },

    // Flete del proveedor / traslados por cada compra (drop), se reparte entre las unidades
    fletePorCompra: 15000,   // SUPUESTO

    // ---------- Venta ----------
    mercadoPago: { pct: 3.8, fijo: 0 },  // SUPUESTO: Checkout Pro con dinero al instante (≈3,19% + IVA). Revisar en tu cuenta MP.
    unidadesPorPedido: 1.5,              // SUPUESTO: promedio de prendas por pedido (reparte el costo de envío)
    despacho: {
      // lo que te cuesta a ti cada envío (el catálogo dice lo que cobras)
      rm: 3990, regiones: 5990,          // SUPUESTO: igual a lo cobrado
      mixRM: 70,                         // % de pedidos que son de la RM
      pctGratisRM: 25                    // % de pedidos RM que superan $40.000 (envío lo pagas tú)
    },
    margenObjetivo: 50,                  // % mínimo de margen sobre precio (alerta en rojo si baja)

    // ---------- Curva de tallas (% de unidades por talla) ----------
    curva: {
      polera:  { S: 10, M: 25, L: 30, XL: 25, XXL: 10 },  // SUPUESTO: hombre adulto Chile
      poleron: { S: 8,  M: 25, L: 32, XL: 25, XXL: 10 }   // SUPUESTO
    },
    colorSplit: { polera: { negro: 60, blanco: 40 } },    // SUPUESTO: el negro rota más en off road
    minimoPorTalla: 1,       // al menos 1 por talla en cada color (si hay unidades suficientes)

    // ---------- Primer drop (unidades por producto; 0 = no entra) ----------
    // Noviembre = verano en camino: poleras y jockeys primero, polerones pocos hasta abril.
    presupuesto: 1000000,
    drop: {
      'polera-twh-4x4-rally-team-algodon': 16,
      'polera-mud-terrain-twh-algodon': 16,
      'polera-low-range-club-4wd': 16,
      'polera-twh-recovery': 16,
      'polera-basica-the-white-hilux-cl-shop': 16,
      'poleron-canguro-basico-twh-logo-pecho': 6,
      'jockey-5-paneles-twh-parche-tejido': 8,
      'jockey-5-paneles-twh-speed-shop-bordado': 8,
      'jockey-5-paneles-escudo-4x4-team-bordado': 8,
      'sticker-twh': 50
    },

    // ---------- Escenarios de venta (% del drop vendido) ----------
    escenarios: [
      { nombre: 'Pesimista', d30: 15, d60: 30, d90: 45 },
      { nombre: 'Base',      d30: 30, d60: 55, d90: 75 },
      { nombre: 'Optimista', d30: 50, d60: 80, d90: 95 }
    ],

    // ---------- Gastos fijos mensuales ----------
    gastosFijos: [
      ['Publicidad Instagram / Meta', 80000],   // SUPUESTO
      ['Dominio, Firebase y herramientas', 5000], // SUPUESTO
      ['Fotos / contenido', 0],
      ['Otros', 10000]
    ],

    // ---------- Reposición ----------
    diasProduccion: { polera: 10, poleron: 15, jockey: 20, stickers: 7 },  // SUPUESTO: días hábiles del proveedor
    diasSeguridad: 7,   // stock extra para cubrir atrasos

    // ---------- Fechas clave (Chile) ----------
    calendario: [
      { fecha: '2026-11-27', evento: 'Black Friday / Cyber (fines nov)', nota: 'Oferta corta en el panel; tener tallas M-L-XL completas.' },
      { fecha: '2026-12-24', evento: 'Navidad', nota: 'Comprar a más tardar ~1 dic. Último día de despacho a regiones ~18 dic.' },
      { fecha: '2027-01-15', evento: 'Vacaciones de verano / viajes 4x4', nota: 'Poleras blancas y jockeys rinden más.' },
      { fecha: '2027-03-01', evento: 'Vuelta a clases / fin de verano', nota: 'Liquidar sobrantes de poleras blancas.' },
      { fecha: '2027-04-15', evento: 'Compra de polerones', nota: 'Llegan antes del frío de mayo.' },
      { fecha: '2027-06-20', evento: 'Día del Padre (3er domingo de junio)', nota: 'Polerones + jockey como regalo.' },
      { fecha: '2027-09-18', evento: 'Fiestas Patrias', nota: 'Paseos y salidas off road: poleras y stickers.' }
    ]
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = costos;
  else root.TWH_COSTOS = costos;
})(this);
