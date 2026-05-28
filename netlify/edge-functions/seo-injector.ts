import type { Context, Config } from "@netlify/edge-functions";

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const path = url.pathname;

  // 1. Obtener la respuesta HTML original (el index.html compilado por Vite)
  const response = await context.next();

  // 2. Parsear provincia y municipio
  // Las rutas coinciden con: /gasolineras-baratas/:provincia y /gasolineras-baratas/:provincia/:municipio
  const match = path.match(/^\/gasolineras-baratas\/([^/]+)(?:\/([^/]+))?$/);
  if (!match) {
    return response;
  }

  const provinciaRaw = match[1];
  const municipioRaw = match[2] || "";

  // Limpiar para mostrar de forma amigable (quitar guiones, capitalizar)
  const cleanName = (str: string) => {
    if (!str) return "";
    return decodeURIComponent(str)
      .replace(/-/g, " ")
      .replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const provincia = cleanName(provinciaRaw);
  const municipio = cleanName(municipioRaw);

  // Metadatos optimizados
  let title = "";
  let description = "";
  let canonical = `https://datafuelle.es/gasolineras-baratas/${provinciaRaw}`;
  if (municipio) {
    title = `Gasolineras Baratas en ${municipio} (${provincia}) Hoy | DataFuelle`;
    description = `Precios de gasolina y diésel actualizados hoy en ${municipio} (${provincia}). Localizá las estaciones de servicio más baratas cerca de ti y ahorrá en tu ruta.`;
    canonical += `/${municipioRaw}`;
  } else {
    title = `Gasolineras Baratas en la Provincia de ${provincia} Hoy | DataFuelle`;
    description = `Precios de combustibles hoy en la provincia de ${provincia}. Compará estaciones de servicio baratas y evitá el coste de desvío.`;
  }

  // Schema JSON-LD dinámico
  const schema = municipio 
    ? {
        "@context": "https://schema.org",
        "@type": "LocalBusiness",
        "name": `DataFuelle ${municipio}`,
        "description": `Buscador de gasolineras baratas en ${municipio}, ${provincia}.`,
        "url": canonical,
        "address": {
          "@type": "PostalAddress",
          "addressLocality": municipio,
          "addressRegion": provincia,
          "addressCountry": "ES"
        }
      }
    : {
        "@context": "https://schema.org",
        "@type": "WebPage",
        "name": `Combustible Barato en ${provincia}`,
        "description": `Precios actualizados y gasolineras baratas en la provincia de ${provincia}.`,
        "url": canonical
      };

  // 3. Reescribir el HTML en caliente
  const html = await response.text();
  
  // Reemplazar title y metas usando regex simple
  let modifiedHtml = html;

  // Reemplazar o insertar title
  if (modifiedHtml.includes("<title>")) {
    modifiedHtml = modifiedHtml.replace(/<title>.*?<\/title>/i, `<title>${title}</title>`);
  } else {
    modifiedHtml = modifiedHtml.replace("</head>", `<title>${title}</title></head>`);
  }

  // Reemplazar o insertar meta description
  const metaDescRegex = /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i;
  const newMetaDesc = `<meta name="description" content="${description}" />`;
  if (metaDescRegex.test(modifiedHtml)) {
    modifiedHtml = modifiedHtml.replace(metaDescRegex, newMetaDesc);
  } else {
    modifiedHtml = modifiedHtml.replace("</head>", `${newMetaDesc}</head>`);
  }

  // Insertar canonical
  const canonicalRegex = /<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i;
  const newCanonical = `<link rel="canonical" href="${canonical}" />`;
  if (canonicalRegex.test(modifiedHtml)) {
    modifiedHtml = modifiedHtml.replace(canonicalRegex, newCanonical);
  } else {
    modifiedHtml = modifiedHtml.replace("</head>", `${newCanonical}</head>`);
  }

  // Insertar Schema Markup JSON-LD en el head
  const schemaScript = `<script type="application/ld+json">${JSON.stringify(schema)}</script>`;
  modifiedHtml = modifiedHtml.replace("</head>", `${schemaScript}</head>`);

  return new Response(modifiedHtml, {
    headers: response.headers
  });
};

export const config: Config = {
  path: "/gasolineras-baratas/*"
};
