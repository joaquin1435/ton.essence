// Extrae el array `DATA` (catálogo) desde index.html y lo guarda como JSON,
// para que la función serverless pueda validar nombres y precios
// SIN confiar en lo que mande el navegador (evita que alguien manipule
// el precio desde las herramientas de desarrollador antes de pagar).
//
// Se ejecuta automáticamente en cada deploy (ver "build.command" en netlify.toml),
// así que no hace falta correrlo a mano: alcanza con editar el DATA en index.html
// y hacer deploy como siempre.

const fs = require("fs");
const path = require("path");

const htmlPath = path.join(__dirname, "..", "index.html");
const outPath = path.join(__dirname, "..", "netlify", "functions", "products.json");

const html = fs.readFileSync(htmlPath, "utf8");

const marker = "const DATA = [";
const startIdx = html.indexOf(marker);
if (startIdx === -1) {
  console.error("No se encontró 'const DATA = [' en index.html");
  process.exit(1);
}
const arrStart = startIdx + marker.length - 1; // posición del '[' inicial

let depth = 0;
let end = -1;
for (let i = arrStart; i < html.length; i++) {
  const c = html[i];
  if (c === "[") depth++;
  else if (c === "]") {
    depth--;
    if (depth === 0) {
      end = i + 1;
      break;
    }
  }
}
if (end === -1) {
  console.error("No se pudo encontrar el cierre del array DATA");
  process.exit(1);
}

const arrStr = html.slice(arrStart, end);

// Usamos Function en vez de JSON.parse porque el array admite comas finales
// (trailing commas), que no son JSON válido pero sí JS válido.
let data;
try {
  data = new Function("return " + arrStr)();
} catch (err) {
  console.error("Error parseando DATA:", err.message);
  process.exit(1);
}

// Aplanamos a un mapa "MARCA||nombre" -> { value, type, margin }, para lookup rápido y directo.
// type "usd": value es el costo en dólares (el precio final se calcula con el dólar del día).
//   margin (opcional): margen propio en USD de ese perfume; si no está, se usa el margen general.
// type "fixed": value ya es el precio final en pesos (no depende del dólar).
const catalog = {};
let total = 0;
data.forEach(([brand, items]) => {
  items.forEach(([name, value, type, margin]) => {
    if (value === null) return; // sin stock: no se puede comprar
    const entry = { value, type };
    if (margin !== undefined) entry.margin = margin;
    catalog[`${brand}||${name}`] = entry;
    total++;
  });
});

fs.writeFileSync(outPath, JSON.stringify(catalog));
console.log(`✓ products.json generado con ${total} perfumes disponibles para compra.`);
