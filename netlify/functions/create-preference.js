// Netlify Function: crea una "preferencia de pago" en Mercado Pago y devuelve
// la URL de Checkout Pro a la que hay que redirigir al comprador.
//
// Por qué existe esta función y no se llama a Mercado Pago directo desde el navegador:
// el Access Token de Mercado Pago es secreto. Si lo pusiéramos en el JS de la página,
// cualquiera podría verlo (F12 > código fuente) y usarlo para operar tu cuenta.
// Por eso vive acá, en el servidor, como variable de entorno.
//
// Requiere la variable de entorno MP_ACCESS_TOKEN configurada en Netlify
// (Site settings > Environment variables). Ver README-MERCADOPAGO.md.

const catalog = require("./products.json");

const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
const SITE_URL = process.env.URL || process.env.DEPLOY_PRIME_URL || "";

// Debe coincidir con los mismos valores que en index.html (MP_COMMISSION_PCT / MP_IVA_PCT).
// El precio del catálogo es el precio de TRANSFERENCIA; acá le sumamos la comisión
// de Mercado Pago para que, después de que se la queden, te llegue el mismo neto.
const MP_COMMISSION_PCT = 6.29;
const MP_IVA_PCT = 21;
const MP_EFFECTIVE_FEE = (MP_COMMISSION_PCT / 100) * (1 + MP_IVA_PCT / 100);
function cardPrice(basePrice) {
  const raw = basePrice / (1 - MP_EFFECTIVE_FEE);
  return Math.round(raw / 50) * 50;
}

// Mismo esquema que index.html: costo en USD + margen, convertido con el dólar blue del día.
const MARGEN_USD = 14;
const DOLLAR_RATE_FLOOR = 1560; // piso: nunca cobramos con un dólar menor a este

async function getDollarRate() {
  try {
    const res = await fetch("https://dolarapi.com/v1/dolares/blue");
    const data = await res.json();
    if (data && data.venta) return Math.max(DOLLAR_RATE_FLOOR, data.venta);
  } catch (err) {
    console.error("No se pudo obtener el dólar en vivo, se usa el piso:", err.message);
  }
  return DOLLAR_RATE_FLOOR;
}

function resolvePrice(value, type, usdRate, customMargin) {
  if (type === "fixed") return value;
  const margen = (customMargin !== undefined && customMargin !== null) ? customMargin : MARGEN_USD;
  const raw = (value + margen) * usdRate;
  return Math.round(raw / 500) * 500;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return json(405, { error: "Método no permitido" });
  }

  if (!MP_ACCESS_TOKEN) {
    console.error("Falta configurar MP_ACCESS_TOKEN en las variables de entorno de Netlify");
    return json(500, { error: "El pago no está configurado todavía. Escribinos por WhatsApp mientras tanto." });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return json(400, { error: "Body inválido" });
  }

  const rawItems = Array.isArray(payload.items) ? payload.items : [];
  if (rawItems.length === 0) {
    return json(400, { error: "El carrito está vacío" });
  }
  if (rawItems.length > 50) {
    return json(400, { error: "Demasiados items" });
  }

  // Validamos cada item contra el catálogo real (products.json), generado a
  // partir del index.html. Ignoramos cualquier precio que venga del cliente.
  const usdRate = await getDollarRate();
  const items = [];
  for (const raw of rawItems) {
    const brand = String(raw.brand || "").trim();
    const name = String(raw.name || "").trim();
    const qty = Math.max(1, Math.min(10, parseInt(raw.quantity, 10) || 1));
    const key = `${brand}||${name}`;
    const entry = catalog[key];

    if (entry === undefined) {
      return json(400, { error: `"${name}" no está disponible para compra en este momento.` });
    }

    const realPrice = resolvePrice(entry.value, entry.type, usdRate, entry.margin);

    items.push({
      title: `${brand} - ${name}`,
      quantity: qty,
      unit_price: cardPrice(realPrice),
      currency_id: "ARS",
    });
  }

  const preferenceBody = {
    items,
    back_urls: {
      success: `${SITE_URL}/?pago=exito`,
      failure: `${SITE_URL}/?pago=error`,
      pending: `${SITE_URL}/?pago=pendiente`,
    },
    auto_return: "approved",
    statement_descriptor: "TON ESSENCE",
  };

  try {
    const mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MP_ACCESS_TOKEN}`,
      },
      body: JSON.stringify(preferenceBody),
    });

    const mpData = await mpRes.json();

    if (!mpRes.ok) {
      console.error("Error de Mercado Pago:", mpData);
      return json(502, { error: "No pudimos iniciar el pago. Probá de nuevo en un momento." });
    }

    // Mercado Pago ya no requiere una URL separada para pruebas: si el Access
    // Token es de TEST, "init_point" redirige automáticamente al checkout en
    // modo sandbox. Usamos sandbox_init_point solo como respaldo por si en
    // algún momento la API lo vuelve a devolver.
    const checkoutUrl = mpData.init_point || mpData.sandbox_init_point;

    if (!checkoutUrl) {
      console.error("Mercado Pago no devolvió init_point:", mpData);
      return json(502, { error: "No pudimos iniciar el pago. Probá de nuevo en un momento." });
    }

    return json(200, { init_point: checkoutUrl });
  } catch (err) {
    console.error("Error llamando a Mercado Pago:", err);
    return json(500, { error: "Error de conexión con Mercado Pago." });
  }
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}
