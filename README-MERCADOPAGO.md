# Pagos con Mercado Pago — Ton Essence

## Qué se agregó

- Botón **"Comprar ahora"** en cada perfume (tarjeta y vista rápida): compra directa, un solo producto.
- **Carrito** (ícono flotante dorado, abajo a la derecha): agregar varios perfumes y pagar todo junto.
- Redirige al **Checkout de Mercado Pago** (Checkout Pro): el comprador paga con tarjeta, dinero en cuenta, etc. dentro de Mercado Pago, no hace falta que tengas cuenta.
- El botón de **WhatsApp sigue funcionando igual** que antes, no se tocó nada de eso.

## Cómo está armado (para que sepas qué es cada archivo)

```
index.html                          → tu página, con los nuevos botones y el carrito
netlify.toml                        → le dice a Netlify dónde están las funciones y qué correr antes de cada deploy
netlify/functions/create-preference.js → función que crea el pago en Mercado Pago (server-side)
netlify/functions/products.json     → catálogo con precios reales, generado automáticamente
scripts/export-products.js          → genera products.json leyendo el DATA de tu index.html
```

**Importante — por qué hay una función "en el servidor":** Mercado Pago requiere una clave secreta (Access Token) para crear cada pago. Esa clave nunca puede estar en el código del navegador (cualquiera la vería con F12). Por eso vive en una función de Netlify, no en el HTML.

**Importante — sobre los precios:** la función de pago NO confía en el precio que manda el navegador. Valida cada producto contra `products.json`, que se regenera automáticamente en cada deploy a partir de tu catálogo (`DATA`) en `index.html`. Es decir: vos seguís editando precios donde siempre lo hiciste (el array `DATA` en index.html), y el pago va a usar siempre ese precio real, no uno manipulado.

## Pasos para activarlo

### 1. Crear cuenta de Mercado Pago Developers
1. Entrá a https://www.mercadopago.com.ar/developers/panel y logueate con tu cuenta de Mercado Pago (o creá una).
2. Andá a **Tus integraciones** → **Crear aplicación**. Elegí "Pagos online" / "Checkout Pro".
3. Ahí vas a ver dos juegos de credenciales:
   - **Credenciales de prueba (TEST)**: para probar sin plata real.
   - **Credenciales de producción**: para cobrar de verdad.
4. Copiá el **Access Token** (empieza con `TEST-` en modo prueba, o `APP_USR-` en producción).

### 2. Subir el proyecto a Netlify
- Si ya tenés el sitio en Netlify: reemplazá los archivos por estos (o conectá el repo de GitHub con estos archivos).
- Si es la primera vez: arrastrá esta carpeta completa a https://app.netlify.com/drop, o conectá tu repositorio de GitHub desde el dashboard de Netlify.

### 3. Configurar la variable de entorno
En Netlify: **Site settings → Environment variables → Add a variable**
- Nombre: `MP_ACCESS_TOKEN`
- Valor: el Access Token que copiaste (arrancá con el de **TEST** para probar).

Después de guardarlo, hacé un **nuevo deploy** (Netlify no relee variables de entorno de un deploy viejo).

### 4. Probar el flujo completo (modo sandbox)
Con el Access Token de `TEST-...` configurado:
1. Entrá a tu sitio, agregá un perfume al carrito o tocá "Comprar ahora".
2. Te va a llevar a un Checkout de Mercado Pago que dice "modo de prueba".
3. Para pagar de prueba, Mercado Pago te da **tarjetas de test** acá: https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/additional-content/your-integrations/test/cards
4. Confirmá que te redirige de vuelta al sitio con el mensaje de "pago aprobado" y que el carrito se vacía.

### 5. Pasar a producción
1. En el panel de Mercado Pago, copiá el Access Token de **producción** (`APP_USR-...`).
2. Reemplazá el valor de `MP_ACCESS_TOKEN` en Netlify por ese token.
3. Nuevo deploy. Listo, ya cobra en plata real.

## Notas / cosas a tener en cuenta

- **Envío**: el checkout actual cobra el perfume, no cobra envío como línea separada. Si en algún momento el envío tiene costo (fuera de Dominico), lo más simple es sumarlo como un ítem más al carrito o coordinarlo por WhatsApp como ya hacés.
- **Confirmación de pago real**: Mercado Pago redirige al comprador según el resultado, pero para un negocio con más volumen, en algún momento conviene agregar un "webhook" (notificación server-to-server) que te avise cuando un pago se acredita de verdad, en vez de confiar solo en la redirección del navegador. Si querés, lo puedo agregar más adelante — no es necesario para arrancar.
- **Actualizar precios**: seguís editando el array `DATA` en `index.html` como siempre. En cada deploy, Netlify corre automáticamente `scripts/export-products.js` y actualiza los precios que usa el pago. No hace falta que hagas nada extra.
