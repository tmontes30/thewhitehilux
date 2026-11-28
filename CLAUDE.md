# The White Hilux · CL Shop

Marca de ropa lifestyle 4x4 / off road **The White Hilux (TWH)** (Instagram @the.whitehilux, Chile) y su **tienda online** con panel de administración.

- **Tienda:** sitio estático en **GitHub Pages** (repo `tmontes30/thewhitehilux`, dominio **thewhitehilux.cavedevz.com**; DNS en GoDaddy).
- **Backend:** **Firebase** proyecto `the-white-hilux` (Firestore nam5, login Google para el panel, Cloud Functions gen2 en `southamerica-east1`; el trigger `correoEstado` en `us-central1` porque Firestore está en nam5). Plan Blaze con presupuestos de alerta.
- **Pagos:** Mercado Pago **Checkout Pro vía API de Orders** (producción, cuenta del dueño). **Correos:** Resend. **Notificaciones:** Web Push al panel (PWA en el iPhone).
- **Panel de admin:** `/admin/` (solo el correo admin de `firestore.rules` y `firebase-config.js`).
- Estado al 2026-11-27: tienda en producción (ventas reales), 22 productos (10 poleras, 3 polerones, 5 jockeys, 1 sticker con 51 diseños, 3 neumáticos a cotizar), 51 logos. Carrito abandonado + pestaña Contactos (§12).

> El dueño habla español: responder siempre en español, simple y claro. Quiere iterar rápido: entregar archivos locales (PNG/SVG/HTML con doble clic), **no** páginas publicadas en claude.ai.

---

## 1. Carpetas

| Carpeta | Qué es | ¿Se sube a GitHub? |
|---|---|---|
| `web/` | La tienda (HTML/CSS/JS estático) y el panel `web/admin/`. Lo que se publica. | Sí |
| `functions/` | Cloud Functions (pagos, webhook, correos, push, visitas). `functions/shared/` es una **copia** de `web/lib`, `core.js` y `catalog.js` hecha por `node functions/sync.js` (corre antes de cada deploy). | Sí (sin `.env`) |
| `disenos/logos/` | Generador de logos (`generar.js`), `svg/`, `png/`, `_todos.png` (hoja numerada), `tipografias.js` (pruebas de tipografía). | Sí |
| `disenos/fuentes/` | Tipografías libres OFL (Black Ops One, Bebas Neue, Anton, Racing Sans One, Kanit, Russo One, Saira Stencil, Rubik Mono, Staatliches, Yellowtail, Rye, etc.) con sus licencias. | Sí |
| `disenos/configurador/` | Configurador de productos nuevos (`configurador.html`), `aplicar.js`, `APLICAR-COLECCION.bat`, `preparar.js`, `posiciones.js`, `datos.js`, `etiqueta.js`, `copiar-al-panel.js`. `bases/` (fotos base limpias) es privada. | Sí (menos `bases/`) |
| `disenos/montajes/` | Scripts antiguos de fotos con modelo (`modelos.js`, `accesorios.js`, `montar.js`). | Sí |
| `disenos/pedido/` | Pedido al proveedor (`generar-pedido.js`), conversor a contornos (`contornos.js`), logo suelto (`logo-suelto.js`). | Sí |
| `disenos/etiquetas/` | Etiqueta de cuello (`generar.js`). | Sí |
| `disenos/neumaticos/` | `preparar.py` (fotos de neumáticos). `todos-neumas.*` es privada. | Sí (script) |
| `ideas/` | Referencias de otras marcas (Dirt Brothers, Troy Lee, Toke, Kaya Unite…). Solo **inspiración de estilo**. | **No** |
| `Modelos foto/`, `fotos-originales/` | Fotos base de modelos y fotos propias con la Hilux. | **No** |
| `Neumaticos/` | Fotos originales del proveedor de neumáticos. | **No** (`/Neumaticos/` en .gitignore) |
| `pedido-proveedor/` | Pedidos generados para el proveedor (PDF, SVG, ZIP, `compra.json` con costos). | **No** |
| `estrategia/` | Planificación de negocio y costos (`planificador.html`, `costos.js`, `exportar-excel.js`). Ver `estrategia/README.md`. | **No** |

Secretos: solo en `.env` (raíz, privado) y en `functions/.env` / secretos de Firebase. **Nunca** imprimirlos ni subirlos.

---

## 2. Tienda (`web/`)

### Datos
- `web/data/catalog.js`: catálogo **base** (productos, fotos, tallas, colores, diseños del sticker, envíos, config). Lo leen las páginas y el servidor.
- El **panel** guarda en Firestore `tienda/catalogo` el nombre, precio, descripción, estado (Disponible / Próximamente / Oculto), SKU y stock de cada producto, más ofertas y ajustes; eso **pisa** al catálogo base. `web/assets/js/core.js` hace la mezcla (`mergeCatalog`), el stock, los SKU, los días hábiles y el OTD (lo comparten tienda, panel y funciones).
- Config en `catalog.js`: `whatsapp`, `email`, `freeShippingFrom` (40.000, solo RM), envío RM 3.990 / regiones 5.990 / retiro 0, `pickupPoints`, `colors`, `categories` (polera, poleron, jockey, stickers, neumaticos), `regions`, `legal`.

### Páginas
- `index.html`: portada (banner `web/assets/img/hilux/`, accesos por categoría) + listado.
  - Con categoría o búsqueda aparecen **filtros rápidos de talla** (solo prendas con stock en esa talla; también Próximamente con stock cargado; tallas sin stock tachadas) y **color**; parámetros `talla`/`color` que la ficha usa para dejar marcada la talla y el color.
  - Sin filtro de color, las prendas con stock en otro color (ej. básicas en blanco) se muestran en ese color y se **reparten** entre las negras.
  - En el inicio los **neumáticos van al final** (la ropa es protagonista).
  - Con filtros, el banner no aparece (clase `filtered` en `<html>` antes de cargar) y hay un círculo de carga; los links de filtros no llevan `#productos` (en el celular saltaba hacia abajo).
- `producto.html`: ficha estilo Mercado Libre (galería, color, talla, cantidad, Comprar / Agregar). Promesa de entrega y retiro. Productos Próximamente: botón discreto **Me gusta**. Productos a cotizar: ver §7.
- `carrito.html` (envío/retiro, punto de retiro, cupón; guarda el carrito con correo para el recordatorio, §12), `gracias.html`, `pago-pendiente.html`, `pago-fallido.html`, `seguimiento.html` (Sigue tu pedido), `nosotros.html` (galería de las Hilux), `terminos.html`, `cambios.html`, `privacidad.html` (incluye que se miden visitas de forma anónima).
- `assets/js/store.js`: encabezado/pie (menú con categorías, "Sigue tu pedido"; pie con "© The White Hilux", sin nombre ni RUT; WhatsApp sin mostrar el número), carrito en localStorage, `priceHtml`, botón flotante de WhatsApp y el **contador de visitas** (§5).
- En computador la tienda usa `zoom` según el ancho (`site.css`: ≥1100 .72 … ≥2500 1.15; `.wrap` máx. 1560).
- Las páginas funcionan con doble clic (rutas relativas, catálogo base); el pago solo funciona publicado.
- Ícono de pestaña: `web/assets/logos/favicon-twh.svg` (TWH rojo en Black Ops One, estirado en alto para leerse a 16 px, fondo oscuro).

### Compra, entrega y pedidos
- `lib/order.js` recalcula precios, aplica ofertas/cupones y **valida stock en el servidor**; rechaza productos no disponibles, `cotizar` y diseños de sticker agotados.
- Promesa de entrega con **rango** (`core.js` `promiseRange`): primer día = días hábiles desde el pago (RM 3, regiones 5), último = +`rangeDays` (1). El cliente ve "Llega entre el martes 24 y el miércoles 25". `promisedFrom` / `promisedDate` (= último día; lo usan alertas y OTD).
- **Retiro gratis** en `config.pickupPoints`: Los Trapenses (Lo Barnechea, cerca del Líder Pie Andino) y Parque Araucano (Las Condes, Rosario Norte); el cliente elige uno en el carrito (las funciones validan el punto: si se cambian, redeploy). Mismo día hábil si paga antes de `pickupCutoff` (06:30, no se muestra), si no el día hábil siguiente; tags "Retiro gratis hoy/mañana". Los pedidos con retiro pasan directo a **En preparación** al pagarse.
- El stock se descuenta **solo al aprobarse el pago** (webhook idempotente).
- Pedidos en Firestore `pedidos/*` (id `TWH-…`). Seguimiento público (`seguimiento`) solo con N° de pedido + correo; no expone dirección ni teléfono.

### Ropa y etiquetas
- Poleras: logo chico en el pecho (lado del corazón) y diseño mediano en la parte alta de la espalda; básicas solo con logo en el pecho. Características: Material "Work Gear, tela gruesa de calidad"; Modelo "Mide 1,74 m, pesa 76 kg y usa talla XL" (sin campo "Corte").
- Etiqueta de cuello ("TWH" + franjas + "RACE SHOP" + talla; 60×40 mm): `disenos/configurador/etiqueta.js` (lo usan el configurador y `node disenos/etiquetas/generar.js`). Dos versiones: clara (prenda negra) y oscura (prenda blanca). En el configurador cada polera/polerón tiene "Etiqueta en el cuello" (sí por defecto).

### Sticker (`sticker-twh`)
- Un **diseño por cada logo numerado** de la hoja (`disenos/logos/_todos.png`), en ese orden (51). $2.990, vinilo 10 cm.
- **Stock por diseño**: `core.js` `stockColors(p)` devuelve los ids de diseño cuando el producto tiene `designs`; en todos lados la variante de stock es `l.design || l.color` (servidor `lib/order.js` y webhook, panel `moveStock`/Compras/venta manual, carrito, ficha). Panel: "Controlar stock por diseño" (una fila por logo con miniatura). Tienda: diseños sin stock en gris y AGOTADO; la ficha abre en el primero con stock. Variante SKU del diseño = 10 caracteres del id.
- Sin control de stock + Disponible = todos los diseños se pueden comprar sin límite.

---

## 3. Panel de admin (`web/admin/`)

Login con Google (correo admin). Al entrar muestra un círculo de carga (no el login) hasta confirmar la sesión. Pestañas:

- **Pedidos**: alertas de entregas por vencer, filtros, búsqueda, estado (cambia fechas `preparingDate`/`shippedDate`/`deliveredDate`), courier + N° + link de seguimiento, nota interna, registro de avisos enviados (`notifs`: correos y push).
  - **🔒 Costo real del envío** (`shipCostReal`, privado; nunca sale al cliente): monto o "Lo entregué yo ($0)"; elegir courier "Despacho propio" lo deja en $0 si estaba vacío. Utilidades lo usa; vacío = tarifa de la zona.
  - **+ Venta manual** (transferencia/efectivo): crea `pedidos/*` con `source: "manual"`, `paymentMethod`, `mpFee: 0`, precio editable, entrega en mano / retiro / despacho, descuenta stock (opcional) y `noEmails`. Casilla **Muestra** (prendas que se queda el dueño a precio costo: precio = costo promedio de Compras, `muestra: true`, utilidad ≈ $0, fuera del OTD).
- **Ventas**: KPIs, ventas por día, más vendidos, stock bajo, ventas por SKU/categoría/región, descuentos usados, OTD por RM/regiones/retiro. **Tocar** una fila/barra filtra todo el tablero (pedido, producto, SKU, categoría, región, día o mes).
- **Utilidades**: ingresos − costo de lo vendido (promedio por SKU desde Compras; si no hay, promedio de su categoría; si no, $0 con aviso) − envío real − comisión MP (real `mpFee` que guarda el webhook; si no, % estimado) − empaque − otros gastos mensuales. Supuestos en `privado/utilidades`. Comisión MP "al instante": crédito 2,69% + IVA, débito 2,19% + IVA, dinero en cuenta 3,19% + IVA = **3,81%** (supuesto por defecto, editable en el panel). Pagos se buscan con `/v1/payments/search?external_reference=`. Recuperación de la inversión, por mes, por producto y por pedido (tocar para filtrar).
- **Contactos** (§12): correos de compradores y carritos abandonados con el detalle por SKU, estado del recordatorio, filtros, búsqueda y CSV.
- **Cliente** (visitas anónimas, §5): KPIs, embudo, productos vistas vs. carro vs. ventas, ❤ Me gusta, lo más tocado, páginas, búsquedas, lo no encontrado, origen, equipo y recomendaciones automáticas. Interruptor "Contar mis visitas desde este navegador" (para probar).
- **Productos y stock**: resumen de inventario arriba (unidades, valor a costo, a precio de venta, margen); filtros por **categoría** y por **estado** (combinables); por producto: nombre, SKU, precio, estado, descripción, stock por talla/color (o por diseño en el sticker), "+ Registrar llegada"; ❤ me gusta en Próximamente; CSV de inventario por SKU. Neumáticos: "Precio desde (opcional)" y sin stock.
- **Compras** (`compras/*`): compras a proveedores con costo total IVA incl., ETA y líneas por SKU/talla; costo unitario = total repartido parejo (o costo propio por línea). "Llegó: sumar al stock" o "Cargar al stock antes de que llegue" (marca `stockAdded`, así "Llegó" no vuelve a sumar). Importa `pedido-proveedor/<fecha>/compra.json`. Los costos reales viven solo en Firestore y en carpetas privadas: **nunca** escribirlos en este archivo ni en el repo.
- **Descuentos**: ofertas automáticas (`tienda/catalogo.offers`, precio tachado) y códigos (`cupones/*`, privados; los valida la función `validarCupon`).
- **Configurador**: copia del configurador (§6).
- **Ajustes**: días de entrega RM/regiones, largo del rango, hora de corte de retiro, días de alerta, feriados, notificaciones push del iPhone.
- **Celular / app del iPhone** (≤820 px): barra inferior (Pedidos · Ventas · **+** venta manual · Productos · Más), hoja "Más" con el resto, encabezado compacto con el nombre de la sección, safe-area del notch (`viewport-fit=cover`, status bar black-translucent), campos de 16 px (sin zoom de iOS), botones de 44 px; la venta manual se abre a pantalla completa con líneas en tarjetas, cantidad −/+ y barra fija con total y Guardar. CSV ocultos en el celular. Todo en el bloque "Celular / app del iPhone" de `admin.css`.
- PWA: `admin/manifest.webmanifest`, `admin/sw.js` (sin caché; solo push), ícono TWH negro sobre blanco (`favicon.svg`, icon-192/512, apple-touch-icon).

---

## 4. Funciones y datos (Firebase)

| Función | Qué hace |
|---|---|
| `crearPreferencia` | Recibe el carrito, recalcula todo con `lib/order.js`, guarda el pedido y crea el pago en Mercado Pago (Orders API → `checkout_url`). |
| `webhook` | Aviso de Mercado Pago: si está aprobado marca pagado, calcula la promesa, descuenta stock (por talla/color o diseño), guarda `mpFee`, manda correos y push. Idempotente. |
| `validarCupon` | Vista previa del descuento en el carrito. |
| `seguimiento` | "Sigue tu pedido" (N° + correo). |
| `correoEstado` | Trigger (us-central1): correo al cliente en despachado/listo para retiro y entregado, una vez cada uno (`emails.<estado>`); no si `noEmails`. |
| `alertaEntregas` | 9:00: push con pedidos por vencer (sin correo). |
| `probarPush` | Push de prueba (requiere sesión admin). |
| `evento` | Visitas de la tienda (§5). |
| `guardarCarrito` | Guarda el carrito cuando el cliente escribe su correo (§12). |
| `recordatorioCarritos` | Cada hora: correo para retomar la compra a los carritos sin pagar de hace 12 h (§12). |
| `simularPago` | Solo para pruebas en emulador. |

Firestore: `tienda/catalogo` (lectura pública, escritura admin), `pedidos/*`, `cupones/*`, `privado/*`, `compras/*`, `pushSubs/*`, `estadisticas/<YYYY-MM-DD>` (lectura admin; las escribe `evento`), `carritos/*` (lectura admin; los escribe `guardarCarrito`). Reglas en `firestore.rules`.

Correos (Resend): dominio thewhitehilux.cavedevz.com verificado (DNS GoDaddy), remitente `pedidos@thewhitehilux.cavedevz.com` (`functions/.env` RESEND_FROM), respuestas a ORDER_EMAIL. Encabezado con el escudo TWH (PNG `web/assets/img/email/logo-escudo.png`; los correos no muestran SVG).

Push: clave VAPID pública en `firebase-config.js` y `functions/.env`; privada en `.env` raíz y secreto `VAPID_PRIVATE_KEY`. El iPhone se suscribe en Ajustes (con el panel agregado al inicio). La app del panel y Safari guardan datos por separado.

---

## 5. Visitas (pestaña Cliente)

- `store.js` cuenta (anónimo): páginas vistas `pv`, fichas `prod`, agregados al carro `cart` (en `Cart.add`), toques `click` (rótulo "Zona · texto" o `data-track`), filtros `filtro`, búsquedas `busca`, tallas tachadas o búsquedas sin resultado `vacia` (`data-vacia`), origen `fuente` (utm_source o referrer), equipo `disp`, embudo por sesión `embudo` (visitantes por día, sesiones, producto, carrito, checkout, compra), `like`/`nolike`.
- Se manda en lotes (sendBeacon, text/plain) a `evento`, que solo acepta esos grupos y suma en `estadisticas/<fecha>`. No guarda IP ni ids.
- No cuenta: navegador del admin (`localStorage twh-admin`, se marca al entrar al panel, salvo el interruptor `twh-contar`), robots/headless/webdriver, páginas con doble clic. Para que el origen "Instagram" sea exacto, usar links con `?utm_source=instagram`.

---

## 6. Logos y configurador

### Logos (`disenos/logos/generar.js`)
- Cada logo es una función en el objeto `LOGOS`; **el orden del objeto = el número** en `_todos.png` (y en el configurador y el sticker). Hoy hay **51**: 1–20 los originales que quedan, 21 `race-dept-ops` (oficial), 22–23 Stay Dirty y Winch Crew, 24–32 TWH (Monograma, Caja militar, Eco, Split, Spec, Pill, Vertical, 3D, Calado), 33–38 minimalistas (paletas nuevas), 39–51 insignias de carrera (escudos, placas, sello Speed Shop, banderas cruzadas, Pit Pass, hexágono, óvalo, Motor Club…).
- Favoritos del dueño (estilo carrera vintage): **5** `checkered-shield` (escudo con cuadros y TWH rojo), **17** `round-stamp` (placa de esquinas cortadas), **18** `speed-shop` (bandera inclinada + Speed Shop) y **21** `race-dept-ops`. Las insignias 39–51 son variaciones de estos.
- Helpers: `t()` texto, `ital()`, `cond()`, `ring()` (texto en anillo), `opsTWH()`, `pt()`/`ptGeo()` (texto de `disenos/fuentes/` convertido a trazo con opentype.js; opciones `fit`, `w`, `ls`, `skew`, `stroke`, `behind`, y `abs`/`bb` para calar o cortar), `cuadros()`, `franjas3()`, `ESCUDO`/`ESCUDO_IN`. Paletas: INK/BG/ORANGE/RED/DRED/MUST/OLIVE + TEAL, SAND, SKY, COBALT, FOREST, MINT, CLAY + NAVY, GOLD, LIME, PURPLE, RUST, BRG, YELLOW, PETROL.
- Generar: `node disenos/logos/generar.js [ids…]` → `svg/`, `png/`, `_todos.png/svg` y copias sin fondo en `web/assets/logos/` (`<id>.svg` para prenda oscura y `<id>-claro.svg` para prenda clara: INK→oscuro, BG→claro).
- **Logo oficial** (desde 2026-11-19): `race-dept-ops` = TWH en Black Ops One + 3 franjas + "4WD RACE DEPT." + "CHILE · SINCE 2001"; recorte `web/assets/logos/logo-oficial.svg` (encabezado, portada, pie, panel, configurador). El jockey "TWH Franjas" usa `logo-header.svg`.
- **Agregar un logo**: función nueva en `LOGOS` → generar → `preparar.js` (nombre en `NAMES`) `--sin-bases` → `copiar-al-panel.js` → y si va al sticker, sumarlo a `designs` de `sticker-twh` en el orden de la hoja.
- **Eliminar un logo**: antes revisar si lo usa algún producto o diseño del sticker (`grep` en `web/data/catalog.js`); sacarlo de `LOGOS`, borrar `png/svg/web` (`git rm`), regenerar la hoja, quitarlo del sticker y de `datos.js` del configurador, y redeploy de funciones (catálogo del servidor).
- **No recrear ilustraciones complejas a mano** (se probaron y se descartaron, 2026-11-18). Para ilustraciones: con licencia comercial, ilustrador o IA, y Claude las adapta a TWH. **Nunca copiar diseños de otras marcas o artistas** (ej. Loose & Lost / Nick Sawyers, TLD, Greenish), aunque sea "parecido con mi Hilux".

### Configurador (crear productos nuevos)
Desde 2026-11-24 crea productos nuevos sin tocar los existentes. Desde 2026-11-28 también **ajusta una prenda de la tienda**: cambiar sus logos, tamaño y posición (sección "Ajustar un producto de la tienda").
1. `disenos/configurador/configurador.html` (doble clic) o panel → Configurador. Parte **vacío**: "¿Qué quieres crear?" (Polera / Polerón / Jockey / Sticker). Editor por pasos con vista previa: logo frente/espalda (buscador por nombre o **número**, tiles con número), posición, tamaño, altura, colores, etiqueta, nombre automático editable. **Guardar**.
2. Lo guardado queda en **la sesión** (sessionStorage `twh-cfg-sesion`): bandeja con Editar / Duplicar / Borrar. **Exportar productos nuevos** → `twh-coleccion-nuevos-<fecha>.json` con `modo: "agregar"`.
3. Doble clic en `APLICAR-COLECCION.bat`: toma el `twh-coleccion*.json` más reciente de Descargas, corre `aplicar.js` (genera las fotos con modelo, **agrega** las prendas al final de la ropa en `catalog.js` con `status: 'proximamente'`, suma stickers como diseño nuevo; no toca lo existente) y las pruebas; si pasan, publica (git add solo de catalog.js, fotos de productos, copia del panel y datos.js) y **actualiza las funciones de pago** (`crearPreferencia`, `validarCupon`, `webhook`, `guardarCarrito`: el servidor tiene su copia del catálogo y sin esto rechaza pagar los productos nuevos).
4. Después, en el panel: stock y pasar a Disponible.
- **Medidas reales en cm**: `posiciones.js` → `CM` (Chico/Mediano/Grande: pecho 8/10/12, centro 10/14/18, espalda 22/26/30; las mismas del pedido al proveedor), `cmOf`, `altoCm`, `medidas`. Cada logo puede tener un ancho exacto `part.cm` (barra de 0,5 cm); el editor muestra ancho × alto impreso y cada foto de la vista previa su medida. `generar-pedido.js` usa `cmOf` (respeta `cm`).
- **Ajustes**: al tocar una prenda de la tienda se abre con su `cfg` (catalog.js); se pueden cambiar los logos de frente/espalda (o dejar uno sin logo), posición, tamaño, altura y nombre (si cambia un logo el nombre se rearma solo, salvo que lo hayan escrito a mano). Se guarda en la sesión con `origen: <id>` y se exporta junto con lo nuevo. `aplicar.js` reescribe en ese producto `name`, `views`, `imagesByColor`, `desc`, "Estampado" y `cfg`, y regenera sus fotos; el **id no cambia** → SKU, precio, colores, estado, stock y ventas quedan igual (si el panel tiene nombre/descripción propios en Firestore, esos mandan). Los nombres de logos se usan sin el "(oficial)". Para el proveedor: volver a generar el pedido o `logo-suelto.js <logo> <cm>`.
- Las fotos se sacan con Edge por línea de comandos: `aplicar.js` usa un HTML temporal por foto y **espera** a que la foto quede escrita (con una actualización de Edge pendiente, msedge.exe termina al tiro y la captura llega segundos después; 2026-11-28 salieron fotos cruzadas). Si quedan procesos `msedge --headless` colgados de pruebas, cerrarlos.
- Un JSON antiguo (sin `modo`) reemplazaba toda la colección: `aplicar.js` lo rechaza salvo `--reemplazar`.
- La copia del panel (`web/admin/configurador/`) la genera `copiar-al-panel.js`: editar siempre el original. Logos y números: `preparar.js --sin-bases` (orden = `LOGOS` de generar.js; los que no están en la hoja van al final sin número). Posiciones: `posiciones.js`. Fotos base: `bases/` (`preparar.js` sin `--sin-bases` las regenera).

---

## 7. Neumáticos (publicado 2026-11-24)

- 3 productos en `catalog.js` (`neumaticos-at` desde $490.000, `neumaticos-rt` y `neumaticos-mt` desde $690.000), categoría `neumaticos`, `cotizar: true`, sin tallas ni colores, fotos en `web/assets/img/neumaticos/` (orden: AT portada at-06 y al pasar el mouse at-03; MT portada mt-03 y luego mt-02).
- Marcas (AT y MT; RT según disponibilidad): Comforser, Summaxx, RoadX, Roadcruza, XBRI y BFGoodrich. "Tenemos todas las medidas; al cotizar te enviamos modelos, disponibilidad y precio." **El precio incluye instalación y balanceo en local (RM).**
- Precio: `priceHtml` muestra "Desde $X" si hay precio (ofertas aplican) o "A cotizar" si es 0. Ficha sin carrito: campo opcional de medida/vehículo + botón **Cotizar por WhatsApp** (mensaje con producto y medida; se cuenta en Cliente). El servidor rechaza pagarlos.
- Panel: nombre, SKU (NEU-…), "Precio desde (opcional, 0 = A cotizar)", estado, descripción; sin stock.
- Fotos: `python disenos/neumaticos/preparar.py` desde `Neumaticos/` (privada): reales, cuadradas 900 px, etiqueta TWH + franjas | AT/RT/MT; hoja `todos-neumas.png/.html`. La foto 9 no se usa (marca de agua de otra tienda). El dueño prefirió fotos reales (rembg quedó instalado pero el fondo blanco está desactivado: fallaba con la goma negra).

---

## 8. Proveedor de estampado

- `node disenos/pedido/generar-pedido.js [--costo=N]` → `pedido-proveedor/<fecha>/` (privado): `pedido.html/pdf`, `logos/*.pdf` + `.svg` a tamaño real, `etiquetas/*.pdf` + `.svg`, `compra.json` y ZIP para el proveedor (sin costos). Reglas (curva, colores, cm de estampado) arriba del script.
- Pedido 2026-11-18: 96 poleras; modelos con espalda solo negro (2L 2XL 2XXL); 3 básicas negro + blanco (1M 2L 3XL 3XXL).
- **Todo sale en contornos** (lo pidió la imprenta): `disenos/pedido/contornos.js` pasa cada `<text>` a figuras (posición de letras del navegador, forma con fontkit desde C:/Windows/Fonts; Bahnschrift con variación wght/wdth) y cada borde a figura rellena (paper + paperjs-offset). Texto con borde por detrás = silueta agrandada **solo hacia afuera** (huecos de letras abiertos y parejos; corrección 2026-11-24 por el "Off Road" de Coordenadas). Textos con borde usan `stroke-linejoin="round"` (las puntas salían como pinchos en Illustrator).
- Un logo suelto: `node disenos/pedido/logo-suelto.js <logo> <cm> [clara|oscura]` → `pedido-proveedor/sueltos/<fecha>/` (PDF + SVG en contornos).

---

## 9. Reglas de negocio

- Poleras **$19.990** (negro y blanco). Polerones **$34.990** (negro). Jockeys 5 paneles **$15.990** (negro; parche tejido o bordado). Sticker **$2.990** (51 diseños). Neumáticos desde $490.000 / $690.000 a cotizar.
- Envío gratis **solo en la RM** sobre $40.000; regiones paga envío. Retiro gratis en los dos puntos.
- Fotos lifestyle con estampado reemplazado (`fotos-originales/`) están **fuera de la tienda** (los logos no quedaban bien); no volver a usarlas sin fotos nuevas con la prenda real.
- No usar textos de "preventa" ni "hecho en Chile", ni eslóganes tipo "Pa' la cordillera" o "Fierro viejo".
- Marca: no usar el logo ni la palabra Toyota. "Hilux" es marca registrada: los diseños que la dicen quedan para Instagram o con advertencia; para marketplaces se prefieren los que dicen solo TWH. En el pie: "Hilux es marca de Toyota; no estamos afiliados".
- Fotos con otras personas o estampados de otras marcas: solo como base y reemplazando el estampado; confirmar derechos y permisos antes de publicar.
- Páginas legales con los datos del vendedor (en `config.legal`); el pie no muestra nombre ni RUT.

---

## 10. Cómo trabajar y publicar

- **Pruebas:** `cd web && npm test` (25). Flujo completo: `firebase emulators:start --project the-white-hilux` + `node functions/test/e2e.js` (repetir si la primera vez falla con "Function s…"); panel de prueba en `http://127.0.0.1:5500/admin/?emu-login` (servidor estático propio en el puerto 5500). Para probar visitas con puppeteer: sobrescribir `navigator.webdriver` y usar un user agent normal (el filtro de robots descarta "Headless").
- **Verificar visualmente** con capturas de Edge headless (computador y 390 px de iPhone) antes de entregar.
- **Publicar tienda:** `git push` → GitHub Actions (`.github/workflows/pages.yml`) corre pruebas, agrega versión `?v=<commit>` a los `.js/.css` (sin caché vieja) y publica `web/` con `upload-pages-artifact@v5` + `deploy-pages@v5` (reintento automático si GitHub no encuentra el artefacto). Vigilar con `gh run watch`.
- **Publicar funciones:** `firebase deploy --only functions[:nombre]` (corre `sync.js`). Hacerlo cuando cambie `lib/order.js`, `core.js` o `catalog.js` en algo que valide el servidor (precios, productos, diseños, puntos de retiro).
- **Git:** repo público → **nunca `git add -A`**; agregar archivos explícitos. Commits con `git -c user.name=tmontes30 -c user.email=tmontes30@users.noreply.github.com commit …` (no hay identidad global). No subir `ideas/`, `Modelos foto/`, `fotos-originales/`, `Neumaticos/`, `disenos/configurador/bases/`, `pedido-proveedor/`, `estrategia/`, `.env`.
- **Saltos de línea:** el repo usa LF. En Python escribir con `open(p, 'w', encoding='utf8', newline='')` (si no, Windows pone CRLF y el archivo entero aparece cambiado). No usar `sed` con corchetes `[ ]` en el patrón (los trata como clase de caracteres y rompe el archivo). Revisar con `git diff --ignore-cr-at-eol --stat`.
- Para cambiar un logo: editar su función y `node disenos/logos/generar.js <id>`; revisar `_todos.png`. Para fotos con modelo de un producto nuevo: el configurador (`aplicar.js`).
- Si alguien reporta que "no ve" un cambio: recargar con Ctrl+F5 o, en el iPhone, cerrar la app del panel y abrirla de nuevo.

---

## 11. Historial del proyecto

**2026-11-17 — Base de la tienda**
- Tienda en GitHub Pages + Firebase: panel de admin, pedidos, stock por talla y estados (Disponible / Próximamente / Oculto). Pago con Checkout Pro vía API de Orders (reemplaza Preferencias).
- Descuentos (ofertas y cupones), SKU por variante, pestaña Ventas. Configurador de colección con publicación automática (`APLICAR-COLECCION.bat`) y su copia en el panel. Panel tipo 70% en computador.

**2026-11-18 — Operación y proveedor**
- `estrategia/` (costos) sale del repo público. Seguimiento de pedidos, contacto en Ayuda, nombres según el diseño, etiqueta de cuello (TWH + franjas + RACE SHOP).
- Se probaron logos 26–33 dibujados a mano (deporte y mecánica): **descartados** por básicos.
- Generador de pedido al proveedor (curvas por modelo, ZIP). Páginas legales. Logo oficial de la web: Race Dept.
- Entrega con rango de fechas, retiro gratis hoy/mañana (Los Trapenses / Parque Araucano), OTD, notificaciones push al iPhone. Pestaña Compras (registro de la primera compra de 96 poleras). Correos al despachar/entregar. Pestaña Utilidades.

**2026-11-19 — Afinar la tienda**
- Zoom adaptable al ancho. Comisión MP real 3,81%. Retiro pasa directo a En preparación. Resend conectado. Alerta de las 9:00 solo por push. Registro de avisos por pedido. Ventas y Utilidades filtrables al tocar. Correos con el escudo TWH.
- **Venta manual** (transferencia/efectivo). Resumen de inventario a costo.
- **Logo oficial nuevo: Race Dept. con TWH en Black Ops One** (se eligió la tipografía D entre 20 opciones). Favicon: TWH rojo Black Ops (tras probar franjas y bandera a cuadros).
- Filtros de talla y color en el listado; prendas en blanco repartidas; sin salto ni banner al filtrar; círculo de carga en tienda y panel. Poleras: Work Gear + medidas del modelo. Pie sin nombre ni RUT.

**2026-11-23 — Imprenta, análisis y celular**
- Archivos del proveedor **en contornos** (textos y bordes a figuras; bordes redondeados).
- Pestaña **Cliente** (visitas anónimas, embudo, recomendaciones). Costo real del envío privado por pedido. **Me gusta** en productos Próximamente (+ interruptor para contar el navegador del admin).
- Publicación más robusta (acciones v5 + reintento; versión en .js/.css). Venta manual con **Muestra** (a precio costo).
- **Panel como app en el iPhone** (barra inferior, botón +, hoja Más, venta manual a pantalla completa).

**2026-11-24 — Logos TWH, configurador nuevo y neumáticos**
- Tandas de logos: de 10 propuestas quedaron Stay Dirty y Winch Crew (sin gancho); 15 logos TWH nuevos (Monograma, Varsity, Franjas, Caja militar, Eco, Split, Spec, Pill, Vertical, 3D, Calado, entre otros).
- **Configurador rehecho**: parte vacío, elegir tipo, guardar en la sesión y exportar **solo lo nuevo**; `aplicar.js` agrega como Próximamente y no toca lo existente; logos con número y buscador.
- Contornos: borde de texto solo hacia afuera (pedido del proveedor) + script de logo suelto.
- **Neumáticos AT, RT y MT** publicados a cotizar por WhatsApp (fotos reales con etiqueta TWH; precios desde; incluye instalación y balanceo en RM; al final del inicio).

**2026-11-25 — Más logos, limpieza y stickers**
- Logos minimalistas con paletas nuevas, variaciones de los favoritos (5, 17, 18, 22) e insignias de carrera con paletas nuevas.
- El dueño eliminó 22 logos que no le gustaron (incluidos Rear Diff Lock, Off Road Recovery, Placa Rally 01, Cruz Chopper y Plano 35", que salieron también del sticker). Quedan **54**, renumerados.
- Configurador con los 54 logos en el orden de la hoja. **Sticker con los 54 logos y stock por diseño.** Panel: filtro por categoría en Productos y stock.
- Se declinó recrear el diseño "Loose & Lost" de Nick Sawyers con la Hilux (es obra de otro artista); se propuso un prompt de IA de estilo original o un ilustrador.

**2026-11-27 — Carrito abandonado y Contactos**
- Se eliminan los logos Sunburst, TWH Varsity y TWH Franjas relleno (quedan 51; sticker y configurador renumerados).
- Carrito guarda el correo; recordatorio a las 12 h para retomar la compra; pestaña **Contactos** en el panel. Se probó con código TWHCV10 (10%) y el dueño lo **desactivó**: el correo va sin descuento.

**2026-11-28 — Medidas de estampado**
- Llegaron las 2 primeras muestras (Race Shop y White Hilux Script, pecho a 10 cm) y el logo del pecho se ve grande. Configurador: **ajustar productos de la tienda** (cambiar logos, ancho exacto en cm, medidas reales ancho × alto); `aplicar.js` espera cada foto de Edge.
- Detalle del pedido 18-11 (para repetir curvas): 7 modelos negros con frente y espalda × (2 L, 2 XL, 2 XXL) = 42; 3 básicas × negro y blanco × (1 M, 2 L, 3 XL, 3 XXL) = 54; total 96 (6 M, 26 L, 32 XL, 32 XXL).

**Pendientes / ideas**
- Backups automáticos de Firestore (diario 7 días + semanal 14 semanas): quedó pendiente de aprobación del dueño.
- Revisar que los presupuestos de Firebase no desactiven la facturación (spend cap) y la moneda (CLP vs USD).
- Sticker: activar stock por diseño y pasarlo a Disponible cuando estén impresos.
- Neumáticos: aclarar si "desde $X" es por unidad o juego de 4.

---

## 12. Carrito abandonado y Contactos (2026-11-27)

- **Tienda** (`carrito.html`): con carrito no vacío y correo válido llama a `guardarCarrito` (al salir del campo correo/nombre/teléfono, al cambiar cantidades y al ocultar la página). Id del carrito en localStorage `twh-cart-id` (se borra en `gracias.html`). Bajo el correo: "A este mail enviaremos toda la info necesaria de tu pedido." (el recordatorio lo explica `privacidad.html`). El campo de código de descuento no muestra ejemplo.
- **Firestore `carritos/{cartId}`**: email, nombre, teléfono, líneas (SKU, talla, color, diseño, precio), subtotal, `status` `abierto` (no fue a pagar) · `en_pago` (fue a Mercado Pago; lo marca `crearPreferencia`, que también guarda `cartId` en el pedido) · `comprado` (lo marca `notifyPaid` en todos los carritos de ese correo; `recuperado: true` si ya había recibido el recordatorio). Campos del recordatorio: `recordatorio`, `recordatorioOk`, `recordatorioMs`, `recordatorioNota`.
- **`recordatorioCarritos`** (cada hora): carritos sin recordatorio, `abierto`/`en_pago`, con ≥ 12 h desde lo último que hizo el cliente (no si tienen > 7 días, si el correo ya pagó otro pedido o si ya recibió un recordatorio en los últimos 30 días). Correo `cartReminderEmail` (`web/lib/email.js`) con lo que dejó y el botón **Continuar mi compra** → `carrito.html?recuperar=<líneas base64url>&correo=…` (+ `&cupon=` si hay código; deja el carrito y el correo listos y limpia la URL).
- **Código de descuento**: hoy **sin código** (`CUPON_CARRITO = ''` en `functions/index.js`; TWHCV10 quedó desactivado, `apagadoAuto`). Si se vuelve a querer: `CUPON_CARRITO = 'TWHCV10'`, activarlo en Descuentos y redeploy. Con código, solo vale para el correo que recibió el recordatorio y una vez (`checkCuponCarrito`, en `validarCupon` y `crearPreferencia`; los cupones con `soloRecordatorio`).
- **Panel → Contactos**: un contacto por correo (pedidos pagados + carritos); estado Compró / Carrito abandonado, ↺ Recuperado; detalle de cada transacción con SKU ("Pago no realizado · fue a Mercado Pago", "✓ Pagado"), estado del recordatorio y botón "No enviar"; KPIs, filtros, búsqueda, CSV. Contador rojo en la pestaña con los carritos abandonados.
- **Pruebas en emuladores**: `probarRecordatorios` (solo existe en el emulador) corre el recordatorio a pedido y devuelve los correos; ahí un correo "desactivado" cuenta como enviado. Para el panel con `?emu-login` el usuario admin del emulador debe tener `emailVerified` (lo crea `functions/test/e2e.js`).
