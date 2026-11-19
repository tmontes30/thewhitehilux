# The White Hilux · CL Shop

Programa de diseño profesional de ropa lifestyle 4x4 / off road para la marca **The White Hilux** (Instagram @the.whitehilux, Chile), y su tienda online.

**Objetivo:** una página de ventas online 100% funcional (en proceso). Se publica en **GitHub Pages** (repo `tmontes30/thewhitehilux`, dominio **thewhitehilux.cavedevz.com**) con backend **Firebase** (proyecto `the-white-hilux`: Firestore, login Google, Cloud Functions con Mercado Pago). Tiene panel de admin en `/admin/` para pedidos, alertas de entrega, precios, descripciones, estados (Disponible / Próximamente / Oculto) y stock por talla.

## Carpetas

| Carpeta | Qué es |
|---|---|
| `ideas/` | Referencias de poleras que le gustan al dueño (Dirt Brothers, Troy Lee, Toke, Kaya Unite, etc.). Se usan como **inspiración de estilo**, nunca para copiar diseños, nombres ni marcas. |
| `Modelos foto/` | Fotos base de modelos con polera negra y blanca (frente y espalda) y mockups. Se usan para crear las fotos de producto de la tienda poniendo encima los logos TWH. |
| `fotos-originales/` | Fotos lifestyle propias (con la Hilux, bicis, terreno). Base de los montajes publicitarios. |
| `disenos/logos/` | Logos de la marca. `generar.js` los crea; salen en `svg/` (vectorial), `png/` (vista 1000 px) y `_todos.png` (hoja con todos numerados). También copia versiones sin fondo a `web/assets/logos/` (`<logo>.svg` para prenda oscura y `<logo>-claro.svg` para prenda clara). |
| `disenos/montajes/` | `montar.js`: pone logos TWH sobre las fotos lifestyle. `modelos.js`: genera las fotos de producto con modelo (negro y blanco). Ambos borran el estampado original píxel a píxel y dejan el resultado en `web/assets/img/`. |
| `web/` | La tienda (sitio estático en GitHub Pages) y el panel `web/admin/`. Ver `web/README.md`. |
| `estrategia/` | Privada (en .gitignore). Planificación de negocio: `planificador.html` (doble clic: márgenes, plan de compra con curva de tallas, escenarios, cuándo comprar, ventas reales), datos en `costos.js` (único archivo a editar), `node estrategia/exportar-excel.js` genera `planificacion-twh.xlsx` con fórmulas. Ver `estrategia/README.md`. |
| `functions/` | Cloud Functions de Firebase: `crearPreferencia`, `webhook`, `alertaEntregas`. Copian `web/lib`, `core.js` y `catalog.js` a `functions/shared/` con `sync.js`. |

## Tienda (`web/`)

- `data/catalog.js`: catálogo **base** (fotos, tallas, colores, envíos, diseños de stickers). Lo leen las páginas y el servidor.
- Precio, nombre, descripción, estado y stock se editan en el **panel** (Firestore `tienda/catalogo`) y pisan a catalog.js. `assets/js/core.js` hace la mezcla, el stock y los días hábiles (lo comparten tienda, panel y funciones).
- Descuentos: ofertas automáticas en `tienda/catalogo.offers` (precio tachado) y códigos en la colección privada `cupones/*` (función `validarCupon`). SKU por variante: base del producto + color + talla (`core.js` `variantSku`). Pestaña Ventas del panel con reportes por SKU.
- Botón flotante de WhatsApp: número en `config.whatsapp` de catalog.js. En computador la tienda usa `zoom` (.78 / .72) para verse como al 70-80%.
- Seguimiento: `web/seguimiento.html` + función `seguimiento` (responde solo si N° de pedido y correo coinciden; no expone dirección ni teléfono). En el panel, cada pedido tiene courier, N° y link de seguimiento; los estados guardan `preparingDate`/`shippedDate`/`deliveredDate`.
- `aplicar.js` conserva el id de las prendas que ya existen (el configurador guarda el id): renombrar no pierde stock ni ventas. Los nombres siguen el diseño real (ej. 'Polera Race Shop', 'Polera Básica Escudo 4x4 Team').
- Etiqueta de cuello ("TWH" + franjas + "RACE SHOP" + talla, sin CL SHOP; 60×40 mm): dibujo en `disenos/configurador/etiqueta.js` (lo usan el configurador y `node disenos/etiquetas/generar.js` → `svg/`, `png/` 600 dpi transparente, `_todas.png`). Solo 2 versiones: clara para prendas negras y oscura para blancas. En el configurador cada polera/polerón tiene "Etiqueta en el cuello" (sí/no, por defecto sí); se guarda en `cfg.etiqueta` y agrega la fila "Etiqueta" a las características.
- Logos 26-33 (deporte y mecánica dibujados a mano en SVG) se probaron el 2026-11-18 y se descartaron: el dueño los encontró básicos. No recrear ilustraciones complejas a mano. Camino acordado: ilustraciones con licencia comercial (Freepik/Adobe Stock/etc., archivos en ideas/licenciados/), ilustrador o IA, y Claude las adapta a TWH. Nunca copiar diseños de otras marcas (TLD, Greenish). Quedan disponibles las tipografías libres en disenos/fuentes/ y opentype.js (cd disenos && npm install).
- Pedido a proveedor: `node disenos/pedido/generar-pedido.js` → `pedido-proveedor/<fecha>/` (privado, en .gitignore): pedido.html/pdf, logos/*.pdf a tamaño real, etiquetas/*.pdf. Reglas (curva, colores, cm de estampado) arriba del script. Pedido 2026-11-18 (ajustado): 96 poleras; modelos 1-7 solo negro 2L 2XL 2XXL; 3 básicas negro+blanco 1M 2L 3XL 3XXL (CURVA y CURVA_MODELO en el script).
- Contacto en Ayuda: `config.email` y `config.whatsapp` de catalog.js.
- Pedidos en Firestore `pedidos/*`. Promesa de entrega con **rango** (`core.js` `promiseRange`): primer día = días hábiles desde el pago (RM 3, regiones 5) y último = +`rangeDays` (1); el cliente ve "Llega entre el martes 24 y el miércoles 25". `promisedFrom`/`promisedDate` (= último día, el que usan alertas y OTD). Retiro gratis en Las Condes o Lo Barnechea (`config.pickupPoints`): mismo día hábil si pagan antes de `pickupCutoff` (06:30, no se muestra al cliente), si no el día hábil siguiente; tags "Retiro gratis hoy/mañana" en tarjetas y ficha. Todo editable en Ajustes. El stock se descuenta solo al aprobarse el pago.
- OTD (entregas a tiempo): `core.js` `otd()`; en Ventas (tarjeta por RM/regiones/retiro) y en Pedidos (30 días). Retiro cuenta como cumplido al pasar a "despachado" (listo para retiro).
- Notificaciones push del panel (PWA instalable: `admin/manifest.webmanifest`, `admin/sw.js`): el iPhone se suscribe en Ajustes → Notificaciones (solo con el panel agregado al inicio). Suscripciones en `pushSubs/*`; avisos al pagarse un pedido (webhook) y en `alertaEntregas` (9:00); botón de prueba = función `probarPush`. Clave VAPID pública en `firebase-config.js` y `functions/.env`; privada en `.env` raíz y secreto `VAPID_PRIVATE_KEY`.
- Páginas: `index.html` (portada + listado con filtros), `producto.html` (ficha estilo Mercado Libre), `carrito.html`, `nosotros.html` (galería de las Hilux), `gracias.html`, `pago-pendiente.html`, `pago-fallido.html`.
- `functions/index.js`: pago con Mercado Pago Checkout Pro y webhook idempotente. `lib/order.js` recalcula precios y valida stock en el servidor.
- Pruebas: `cd web && npm test`. Flujo completo: `firebase emulators:start --project the-white-hilux` + `node functions/test/e2e.js`; panel de prueba en `http://127.0.0.1:5500/admin/?emu-login`.
- Publicar tienda: `git push` (GitHub Actions corre pruebas y publica `web/`). Funciones: `firebase deploy --only functions`. Nunca subir `ideas/`, `Modelos foto/`, `fotos-originales/` ni `disenos/configurador/bases/` (están en .gitignore).
- Las páginas funcionan abiertas con doble clic (rutas relativas y sin fetch de archivos locales). El pago solo funciona publicado.

## Reglas de negocio actuales

- Colores ofrecidos: poleras en **negro y blanco**; polerones y jockeys solo en **negro** (por ahora).
- Polerones a $34.990: 3 básicos con logo chico en el pecho. Jockeys 5 paneles a $15.990: 5 modelos con logo chico (parche tejido o bordado).
- Las fotos lifestyle con estampado reemplazado (fotos-originales/) están **fuera de la tienda** porque los logos no quedaban bien centrados ni con buen tamaño. No volver a usarlas sin fotos nuevas con la prenda real. El banner usa web/assets/img/hilux/.
- Fotos de polerón y jockey: `node disenos/montajes/accesorios.js`.
- Todas las poleras: **$19.990**. Stickers: $2.990 cada uno, el cliente elige el diseño.
- Envío gratis **solo en la RM** sobre $40.000. Regiones paga envío.
- Poleras: logo chico arriba en el pecho (lado del corazón) y diseño mediano en la parte alta de la espalda, sin ocupar toda la polera. Hay poleras básicas con solo logo en el pecho.
- Logo oficial de la tienda (desde 2026-11-18): **race-dept** (TWH + franjas + "4WD Race Dept."), archivo recortado `web/assets/logos/logo-oficial.svg`: encabezado, portada, pie, panel y configurador. `logo-shop.svg` / `cl-shop.svg` ("The White Hilux · CL Shop") quedan como diseños, no como logo de la web.
- No usar textos de "preventa" ni "hecho en Chile". No usar eslóganes chilenos tipo "Pa' la cordillera" o "Fierro viejo".

## Configurador de colección (flujo principal para poleras, polerones y jockeys)

1. El dueño abre `disenos/configurador/configurador.html` (doble clic), arma cada prenda (logo de frente/espalda, posición, tamaño, colores, estilo del jockey) y descarga `twh-coleccion.json`.
2. El dueño hace doble clic en `disenos/configurador/APLICAR-COLECCION.bat` : toma `twh-coleccion.json` de esa carpeta o el más reciente de Descargas y corre `aplicar.js` y las pruebas; si pasan, **publica solo** (git commit + push → GitHub Pages en 1-2 min) y abre la tienda publicada. Si las pruebas fallan no publica. Ojo: los ids salen del nombre; renombrar una prenda crea un producto nuevo en el panel (pierde su stock y estado). También se puede correr a mano: `node disenos/configurador/aplicar.js <archivo>`.
3. `aplicar.js` genera las fotos con modelo en `web/assets/img/productos/`, reemplaza poleras/polerones/jockeys en `web/data/catalog.js` (los stickers no se tocan) y borra fotos viejas. Después correr `cd web && npm test` y revisar con una captura.

- El configurador también está en el panel (pestaña **Configurador**): es una copia generada en `web/admin/configurador/` por `disenos/configurador/copiar-al-panel.js` (el .bat la corre antes de publicar). Editar siempre el original en `disenos/configurador/`. Su colección se guarda en el navegador (localStorage), separada de la versión de doble clic; "Volver a la tienda actual" la recarga.
- Posiciones y tamaños de los logos: `disenos/configurador/posiciones.js` (lo comparten la vista previa y las fotos finales).
- Fotos base limpias: `disenos/configurador/bases/`. Logos nuevos o bases nuevas: `node disenos/configurador/preparar.js` (con `--sin-bases` solo actualiza la lista de logos y la colección inicial).

## Cómo trabajar

- El dueño quiere iterar rápido: entregar archivos locales (PNG/SVG en carpetas, HTML que se abre con doble clic), no páginas publicadas en claude.ai.
- Para cambiar un logo: editar su función en `disenos/logos/generar.js` y correr `node disenos/logos/generar.js <nombre>`. Revisar `_todos.png`.
- Para rehacer fotos: `node disenos/montajes/modelos.js <producto>` o `node disenos/montajes/montar.js <foto>`.
- Verificar visualmente con capturas de Edge en modo headless antes de entregar.
- Marca: no usar el logo ni la palabra Toyota en diseños. "Hilux" es marca registrada de Toyota: los diseños que la usan quedan para Instagram o con advertencia; para marketplaces se prefieren los que dicen solo TWH.
- Fotos con otras personas o con estampados de otras marcas (Montes, Rusty, West Coast Choppers): se usan solo como base y se reemplaza el estampado por logos TWH. Antes de publicar, confirmar los derechos de las fotos y el permiso de las personas.
