# Tienda thewhitehilux.cavedevz.com

Sitio estático en **GitHub Pages** + **Firebase** (Firestore, login Google y Cloud Functions) + pago con **Mercado Pago Checkout Pro**.

```
web/                       ← lo que publica GitHub Pages
  index.html, producto.html, carrito.html, nosotros.html, gracias.html, pago-*.html
  admin/                   panel del dueño: pedidos, alertas de entrega, precios, descripciones, estados y stock
  data/catalog.js          catálogo base: fotos, tallas, colores, características (lo genera aplicar.js)
  assets/js/core.js        lógica compartida: mezcla catálogo + panel, stock, días hábiles (tienda, panel y servidor)
  assets/js/firebase-config.js   proyecto Firebase y correos admin
  lib/order.js, lib/email.js     validación de pedidos y correos (los usa functions/)
  tests/                   npm test
functions/                 Cloud Functions: crearPreferencia, webhook, alertaEntregas (+ simularPago solo en emulador)
firestore.rules            quién puede leer/escribir
```

## Dónde vive cada dato
| Dato | Dónde se edita |
|---|---|
| Fotos, tallas, colores, características | `data/catalog.js` (vía el configurador + `aplicar.js`) |
| Precio, nombre, descripción, estado (Disponible / Próximamente / Oculto), stock por talla | **Panel** → Productos y stock (Firestore `tienda/catalogo`) |
| Días de entrega RM/regiones, aviso de días, feriados | **Panel** → Ajustes |
| Pedidos | Los crean las funciones (Firestore `pedidos/*`); se gestionan en **Panel** → Pedidos |

Lo editado en el panel **pisa** a `catalog.js`. Si Firestore no responde (o abres el HTML con doble clic sin internet), la tienda usa `catalog.js` tal cual.

## Panel de admin — `https://thewhitehilux.cavedevz.com/admin/`
- Entra con Google (solo los correos de `firebase-config.js` **y** `firestore.rules`).
- **Pedidos**: cliente, WhatsApp, dirección, productos, total pagado, promesa de entrega editable, estado (Pagado → Preparando → Despachado → Entregado), nota interna, exportar CSV. Arriba, alerta roja con los pedidos que vencen en ≤ 2 días o están atrasados.
- **Productos y stock**: precio, nombre, descripción, estado (se guarda al tiro). "Controlar stock por talla" activa la grilla color × talla; "+ Registrar llegada" suma lo que llegó (ej. M +2, L +4).
- El stock baja solo cuando Mercado Pago confirma el pago. Si cancelas un pedido pagado, el panel pregunta si devolver las unidades. Si marcas a mano un pedido como pagado (transferencia), fija la promesa y pregunta si descontar stock.

## Descuentos, SKU y ventas (panel)
- **Descuentos → Ofertas**: bajan el precio solas (precio tachado + % OFF). Se guardan en `tienda/catalogo.offers`; `core.js` aplica la mejor oferta vigente (porcentaje redondeado a $10). Si hay dos, gana la más barata para el cliente.
- **Descuentos → Códigos**: colección privada `cupones/{CODIGO}` (solo el admin la lee). El carrito los valida con la función `validarCupon`; `crearPreferencia` los vuelve a validar y reparte el descuento al peso entre las líneas (`lib/order.js`). El uso se cuenta cuando el pago se confirma. El envío gratis se calcula con el monto ya descontado.
- **SKU**: base por producto (editable en Productos; si no, se genera del nombre) + sufijo por variante: `POL-4X4RT-NEG-M`, `JCK-5PPT-NEG-U`, `STK-X-U-RACEDEPT`. Cada línea de pedido guarda su SKU. "Descargar inventario por SKU" baja un CSV con stock, precios, valor de inventario y vendidas en 30 días.
- **Ventas**: KPIs por período (vs. período anterior), gráfico por día, más vendidos, stock bajo de lo que se vende, ventas por SKU (CSV), por categoría, por región y descuentos usados. Cuenta pedidos pagados por fecha de pago.

## Flujo de compra
1. `carrito.html` → `crearPreferencia`: recalcula precios con catálogo + panel, valida stock y estado, guarda el pedido como *pago pendiente* y crea una **order** de Mercado Pago (`POST /v1/orders`); el cliente paga en su `checkout_url`.
2. Mercado Pago → `webhook`: si el pago está aprobado, en una transacción marca *pagado*, fija la **promesa** (días hábiles según zona) y descuenta stock. Es idempotente (un aviso repetido no descuenta ni manda correos dos veces). Manda correo al dueño y al cliente si hay Resend.
3. `alertaEntregas`: cada día 09:00 (Chile) manda un correo con los pedidos que vencen pronto.

## Configuración (una sola vez)
1. Firebase: proyecto `the-white-hilux` en **plan Blaze** (las funciones lo exigen; a este volumen cuesta $0, deja una alerta de presupuesto de USD 1).
2. Firebase Console → Authentication → habilitar **Google** y agregar `thewhitehilux.cavedevz.com` en *Dominios autorizados*.
3. Secretos (desde la carpeta raíz del proyecto):
   ```
   firebase functions:secrets:set MP_ACCESS_TOKEN      # TEST-... para probar, APP_USR-... para vender
   firebase functions:secrets:set MP_WEBHOOK_SECRET    # clave secreta de Webhooks de Mercado Pago, o "none"
   firebase functions:secrets:set RESEND_API_KEY       # API key de resend.com, o "none" para no mandar correos
   firebase deploy --only functions,firestore
   ```
4. Mercado Pago → tu aplicación → Webhooks → URL `https://southamerica-east1-the-white-hilux.cloudfunctions.net/webhook`, evento **Order (Mercado Pago)**. El pago usa Checkout Pro con la **API de Orders** (no Preferencias). La clave secreta de esa pantalla va en `MP_WEBHOOK_SECRET`.
5. DNS de cavedevz.com: registro **CNAME** `thewhitehilux` → `tmontes30.github.io`.

## Publicar cambios
- **Tienda** (HTML, fotos, catalog.js): `git add -A && git commit -m "..." && git push`. GitHub Actions corre las pruebas y publica en 1–2 minutos.
- **Funciones** (functions/ o lib/): `firebase deploy --only functions`.
- **Reglas** (firestore.rules): `firebase deploy --only firestore`.

## Probar en tu computador
```
cd web && npm test                                  # pruebas de precios, stock, estados y días hábiles
firebase emulators:start --project the-white-hilux  # en la raíz (necesita functions/.secret.local, ver abajo)
node functions/test/e2e.js                          # flujo completo + datos de ejemplo + usuario admin de prueba
```
Sirve `web/` en `http://127.0.0.1:5500` (por ejemplo con la extensión Live Server): en localhost la tienda y el panel usan los emuladores. Panel de prueba: `http://127.0.0.1:5500/admin/?emu-login`. Sin token de Mercado Pago el botón de pago va directo a gracias.html y el pedido queda *pago pendiente*; para simular el pago aprobado abre `http://127.0.0.1:5001/the-white-hilux/southamerica-east1/simularPago?id=TWH-...`.

`functions/.secret.local` para emuladores:
```
MP_ACCESS_TOKEN=none
MP_WEBHOOK_SECRET=none
RESEND_API_KEY=none
```
