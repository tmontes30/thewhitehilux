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
| `functions/` | Cloud Functions de Firebase: `crearPreferencia`, `webhook`, `alertaEntregas`. Copian `web/lib`, `core.js` y `catalog.js` a `functions/shared/` con `sync.js`. |

## Tienda (`web/`)

- `data/catalog.js`: catálogo **base** (fotos, tallas, colores, envíos, diseños de stickers). Lo leen las páginas y el servidor.
- Precio, nombre, descripción, estado y stock se editan en el **panel** (Firestore `tienda/catalogo`) y pisan a catalog.js. `assets/js/core.js` hace la mezcla, el stock y los días hábiles (lo comparten tienda, panel y funciones).
- Descuentos: ofertas automáticas en `tienda/catalogo.offers` (precio tachado) y códigos en la colección privada `cupones/*` (función `validarCupon`). SKU por variante: base del producto + color + talla (`core.js` `variantSku`). Pestaña Ventas del panel con reportes por SKU.
- Botón flotante de WhatsApp: número en `config.whatsapp` de catalog.js. En computador la tienda usa `zoom` (.78 / .72) para verse como al 70-80%.
- Pedidos en Firestore `pedidos/*`. Promesa de entrega = días hábiles desde el pago (RM 3, regiones 7, editable en Ajustes). El stock se descuenta solo al aprobarse el pago.
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
- Logo oficial: **"THE WHITE HILUX · CL SHOP"** (`logo-shop.svg` horizontal, `cl-shop.svg` cuadrado).
- No usar textos de "preventa" ni "hecho en Chile". No usar eslóganes chilenos tipo "Pa' la cordillera" o "Fierro viejo".

## Configurador de colección (flujo principal para poleras, polerones y jockeys)

1. El dueño abre `disenos/configurador/configurador.html` (doble clic), arma cada prenda (logo de frente/espalda, posición, tamaño, colores, estilo del jockey) y descarga `twh-coleccion.json`.
2. El dueño hace doble clic en `disenos/configurador/APLICAR-COLECCION.bat` (funciona sin internet): toma `twh-coleccion.json` de esa carpeta o el más reciente de Descargas y corre `aplicar.js`, las pruebas y abre la tienda. También se puede correr a mano: `node disenos/configurador/aplicar.js <archivo>`.
3. `aplicar.js` genera las fotos con modelo en `web/assets/img/productos/`, reemplaza poleras/polerones/jockeys en `web/data/catalog.js` (los stickers no se tocan) y borra fotos viejas. Después correr `cd web && npm test` y revisar con una captura.

- Posiciones y tamaños de los logos: `disenos/configurador/posiciones.js` (lo comparten la vista previa y las fotos finales).
- Fotos base limpias: `disenos/configurador/bases/`. Logos nuevos o bases nuevas: `node disenos/configurador/preparar.js` (con `--sin-bases` solo actualiza la lista de logos y la colección inicial).

## Cómo trabajar

- El dueño quiere iterar rápido: entregar archivos locales (PNG/SVG en carpetas, HTML que se abre con doble clic), no páginas publicadas en claude.ai.
- Para cambiar un logo: editar su función en `disenos/logos/generar.js` y correr `node disenos/logos/generar.js <nombre>`. Revisar `_todos.png`.
- Para rehacer fotos: `node disenos/montajes/modelos.js <producto>` o `node disenos/montajes/montar.js <foto>`.
- Verificar visualmente con capturas de Edge en modo headless antes de entregar.
- Marca: no usar el logo ni la palabra Toyota en diseños. "Hilux" es marca registrada de Toyota: los diseños que la usan quedan para Instagram o con advertencia; para marketplaces se prefieren los que dicen solo TWH.
- Fotos con otras personas o con estampados de otras marcas (Montes, Rusty, West Coast Choppers): se usan solo como base y se reemplaza el estampado por logos TWH. Antes de publicar, confirmar los derechos de las fotos y el permiso de las personas.
