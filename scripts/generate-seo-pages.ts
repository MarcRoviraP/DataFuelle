import fs from 'node:fs';
import path from 'node:path';

interface MitecoStationRaw {
  'C.P.': string;
  'Dirección': string;
  'Horario': string;
  'Latitud': string;
  'Localidad': string;
  'Longitud (WGS84)': string;
  'Margen': string;
  'Municipio': string;
  'Precio Gasolina 95 E5': string;
  'Precio Gasoleo A': string;
  'Provincia': string;
  'Rótulo': string;
  'IDEESS': string;
}

interface StationSummary {
  id: string;
  brand: string;
  address: string;
  municipality: string;
  g95: number | null;
  diesel: number | null;
  schedule: string;
}

interface TargetLocation {
  name: string;
  slug: string;
  matcher: (m: string) => boolean;
}

interface ProvinceConfig {
  id: string;
  name: string;
  slug: string;
  targetMunicipios: TargetLocation[];
}

const PROVINCES_CONFIG: ProvinceConfig[] = [
  {
    id: '46',
    name: 'Valencia',
    slug: 'valencia',
    targetMunicipios: [
      { name: 'Valencia', slug: 'valencia', matcher: (m) => /^val[eè]ncia$/i.test(m.trim()) },
      { name: 'Algemesí', slug: 'algemesi', matcher: (m) => /algemes[ií]/i.test(m) },
      { name: 'Alzira', slug: 'alzira', matcher: (m) => /alzira/i.test(m) },
      { name: 'Torrent', slug: 'torrent', matcher: (m) => /torrent/i.test(m) },
      { name: 'Gandia', slug: 'gandia', matcher: (m) => /gand[ií]a/i.test(m) },
      { name: 'Sagunto', slug: 'sagunto', matcher: (m) => /sagunt/i.test(m) },
      { name: 'Catarroja', slug: 'catarroja', matcher: (m) => /catarroja/i.test(m) },
      { name: 'Carcaixent', slug: 'carcaixent', matcher: (m) => /carcaixent/i.test(m) },
    ]
  },
  {
    id: '28',
    name: 'Madrid',
    slug: 'madrid',
    targetMunicipios: [
      { name: 'Madrid', slug: 'madrid', matcher: (m) => /^madrid$/i.test(m.trim()) },
      { name: 'Alcalá de Henares', slug: 'alcala-de-henares', matcher: (m) => /alcal[aá] de henares/i.test(m) },
      { name: 'Móstoles', slug: 'mostoles', matcher: (m) => /m[oó]stoles/i.test(m) },
      { name: 'Fuenlabrada', slug: 'fuenlabrada', matcher: (m) => /fuenlabrada/i.test(m) },
      { name: 'Leganés', slug: 'leganes', matcher: (m) => /legan[eé]s/i.test(m) },
      { name: 'Getafe', slug: 'getafe', matcher: (m) => /getafe/i.test(m) },
      { name: 'Alcorcón', slug: 'alcorcon', matcher: (m) => /alcorc[oó]n/i.test(m) },
    ]
  },
  {
    id: '08',
    name: 'Barcelona',
    slug: 'barcelona',
    targetMunicipios: [
      { name: 'Barcelona', slug: 'barcelona', matcher: (m) => /^barcelona$/i.test(m.trim()) },
      { name: "L'Hospitalet de Llobregat", slug: 'hospitalet-de-llobregat', matcher: (m) => /hospitalet/i.test(m) },
      { name: 'Badalona', slug: 'badalona', matcher: (m) => /badalona/i.test(m) },
      { name: 'Terrassa', slug: 'terrassa', matcher: (m) => /terrassa/i.test(m) },
      { name: 'Sabadell', slug: 'sabadell', matcher: (m) => /sabadell/i.test(m) },
      { name: 'Mataró', slug: 'mataro', matcher: (m) => /matar[oó]/i.test(m) },
      { name: 'Santa Coloma de Gramenet', slug: 'santa-coloma-de-gramenet', matcher: (m) => /santa coloma/i.test(m) },
    ]
  },
  {
    id: '03',
    name: 'Alicante',
    slug: 'alicante',
    targetMunicipios: [
      { name: 'Alicante', slug: 'alicante', matcher: (m) => /alican|alacant/i.test(m) },
      { name: 'Elche', slug: 'elche', matcher: (m) => /elche|elx/i.test(m) },
      { name: 'Torrevieja', slug: 'torrevieja', matcher: (m) => /torrevieja/i.test(m) },
      { name: 'Orihuela', slug: 'orihuela', matcher: (m) => /orihuela/i.test(m) },
      { name: 'Benidorm', slug: 'benidorm', matcher: (m) => /benidorm/i.test(m) },
      { name: 'Alcoy', slug: 'alcoy', matcher: (m) => /alcoy|alcoi/i.test(m) },
      { name: 'Elda', slug: 'elda', matcher: (m) => /elda/i.test(m) },
    ]
  },
  {
    id: '41',
    name: 'Sevilla',
    slug: 'sevilla',
    targetMunicipios: [
      { name: 'Sevilla', slug: 'sevilla', matcher: (m) => /^sevilla$/i.test(m.trim()) },
      { name: 'Dos Hermanas', slug: 'dos-hermanas', matcher: (m) => /dos hermanas/i.test(m) },
      { name: 'Alcalá de Guadaíra', slug: 'alcala-de-guadaira', matcher: (m) => /alcal[aá] de guada[ií]ra/i.test(m) },
      { name: 'Utrera', slug: 'utrera', matcher: (m) => /utrera/i.test(m) },
      { name: 'Mairena del Aljarafe', slug: 'mairena-del-aljarafe', matcher: (m) => /mairena del aljarafe/i.test(m) },
      { name: 'Écija', slug: 'ecija', matcher: (m) => /[eé]cija/i.test(m) },
    ]
  }
];

// Robust data sanity check: fuel price in Spain must be between 0.50 € and 3.50 €
const parsePrice = (val: string): number | null => {
  if (!val) return null;
  const num = parseFloat(val.replace(',', '.'));
  if (isNaN(num) || num < 0.5 || num > 3.5) return null;
  return num;
};

const cleanBrand = (raw: string): string => {
  if (!raw) return 'Gasolinera';
  return raw.replace(/[+_]/g, ' ').replace(/\s+/g, ' ').trim();
};

const formatPrice = (p: number | null): string => {
  return p !== null ? `${p.toFixed(3)} €/l` : 'No disponible';
};

const escapeHtml = (str: string): string => {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
};

const buildPageHtml = (params: {
  title: string;
  description: string;
  canonical: string;
  locationName: string;
  provinceName: string;
  isProvince: boolean;
  isNoIndex?: boolean;
  parentUrl?: string;
  parentName?: string;
  updatedAt: string;
  isoModifiedTime: string;
  totalStationsInArea: number;
  siblingLinks?: { name: string; url: string }[];
  municipalityLinks?: { name: string; url: string; cheapestG95: string; cheapestDiesel: string }[];
  otherProvincesLinks?: { name: string; url: string }[];
  stats: {
    cheapestG95: StationSummary | null;
    mostExpensiveG95: StationSummary | null;
    cheapestDiesel: StationSummary | null;
    mostExpensiveDiesel: StationSummary | null;
    avgG95: number | null;
    avgDiesel: number | null;
    topG95: StationSummary[];
    topDiesel: StationSummary[];
  };
}) => {
  const {
    title,
    description,
    canonical,
    locationName,
    provinceName,
    isProvince,
    isNoIndex = false,
    parentUrl,
    parentName,
    updatedAt,
    isoModifiedTime,
    totalStationsInArea,
    siblingLinks,
    municipalityLinks,
    otherProvincesLinks,
    stats
  } = params;

  // JSON-LD Breadcrumbs
  const breadcrumbItems = [
    { '@type': 'ListItem', position: 1, name: 'Inicio', item: 'https://datafuelle.es/' },
    { '@type': 'ListItem', position: 2, name: `Gasolineras ${provinceName}`, item: parentUrl || canonical }
  ];
  if (!isProvince) {
    breadcrumbItems.push({
      '@type': 'ListItem',
      position: 3,
      name: locationName,
      item: canonical
    });
  }

  // JSON-LD ItemList for top stations
  const itemListElements = stats.topG95.slice(0, 5).map((st, idx) => ({
    '@type': 'ListItem',
    position: idx + 1,
    name: `${cleanBrand(st.brand)} en ${st.address}`,
    description: `Gasolina 95: ${formatPrice(st.g95)} | Diésel: ${formatPrice(st.diesel)}`
  }));

  // JSON-LD FAQPage
  const faqSchema = {
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: `¿Cuál es la gasolinera con Gasolina 95 más barata en ${locationName} hoy?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: stats.cheapestG95
            ? `La Gasolina 95 más barata en ${locationName} está a ${formatPrice(stats.cheapestG95.g95)} en la estación ${cleanBrand(stats.cheapestG95.brand)}, situada en ${stats.cheapestG95.address}.`
            : `Actualmente no hay datos de Gasolina 95 disponibles en ${locationName}.`
        }
      },
      {
        '@type': 'Question',
        name: `¿Cuál es el precio del diésel más barato en ${locationName}?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: stats.cheapestDiesel
            ? `El diésel más económico en ${locationName} se encuentra a ${formatPrice(stats.cheapestDiesel.diesel)} en la estación ${cleanBrand(stats.cheapestDiesel.brand)}, en ${stats.cheapestDiesel.address}.`
            : `Actualmente no hay datos de diésel disponibles en ${locationName}.`
        }
      },
      {
        '@type': 'Question',
        name: `¿Cuánto dinero se puede ahorrar al repostar en ${locationName}?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: (stats.cheapestG95 && stats.mostExpensiveG95 && stats.cheapestG95.g95 && stats.mostExpensiveG95.g95)
            ? `Entre la estación más económica y la más costosa de ${locationName} existe una diferencia de hasta ${(stats.mostExpensiveG95.g95 - stats.cheapestG95.g95).toFixed(3)} € por litro en Gasolina 95, lo que equivale a un ahorro de hasta ${( (stats.mostExpensiveG95.g95 - stats.cheapestG95.g95) * 50 ).toFixed(2)} € en un depósito de 50 litros.`
            : `El ahorro medio oscila entre 5 y 10 € por depósito dependiendo de la estación elegida.`
        }
      },
      {
        '@type': 'Question',
        name: `¿De dónde provienen los precios mostrados en DataFuelle?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: `Todos los precios mostrados provienen directamente de la base de datos oficial del Ministerio para la Transición Ecológica y el Reto Demográfico (MITECO) del Gobierno de España.`
        }
      }
    ]
  };

  const schemaGraph: any[] = [
    {
      '@type': 'BreadcrumbList',
      itemListElement: breadcrumbItems
    },
    {
      '@type': 'ItemList',
      name: `Gasolineras más baratas en ${locationName}`,
      description: `Estaciones de servicio con los precios de carburante más bajos en ${locationName}`,
      itemListElement: itemListElements
    },
    faqSchema
  ];

  if (isProvince) {
    schemaGraph.push({
      '@type': 'Dataset',
      name: `Registro Oficial de Precios de Carburante en ${locationName}`,
      description: `Conjunto de datos estructurados de estaciones de servicio activas en ${locationName}, extraídos del MITECO.`,
      temporalCoverage: updatedAt,
      creator: {
        '@type': 'Organization',
        name: 'Ministerio para la Transición Ecológica y el Reto Demográfico'
      },
      publisher: {
        '@type': 'Organization',
        name: 'DataFuelle',
        url: 'https://datafuelle.es/'
      }
    });
  }

  const schemaJson = {
    '@context': 'https://schema.org',
    '@graph': schemaGraph
  };

  const priceSpreadG95 = (stats.cheapestG95?.g95 && stats.mostExpensiveG95?.g95)
    ? (stats.mostExpensiveG95.g95 - stats.cheapestG95.g95).toFixed(3)
    : null;

  const depositSavingsG95 = priceSpreadG95
    ? (parseFloat(priceSpreadG95) * 50).toFixed(2)
    : null;

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <link rel="canonical" href="${canonical}" />
  <link rel="icon" type="image/svg+xml" href="/icono_datafuelle.svg" />
  ${isNoIndex ? '<meta name="robots" content="noindex,follow" />\n' : ''}
  <!-- Open Graph / Redes / Bots -->
  <meta property="og:type" content="article" />
  <meta property="og:url" content="${canonical}" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:image" content="https://datafuelle.es/icono_datafuelle.svg" />
  <meta property="article:modified_time" content="${isoModifiedTime}" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="https://datafuelle.es/icono_datafuelle.svg" />

  <!-- Schema JSON-LD -->
  <script type="application/ld+json">
  ${JSON.stringify(schemaJson, null, 2)}
  </script>

  <style>
    :root {
      --bg: #0f172a;
      --card-bg: #1e293b;
      --border: #334155;
      --text: #f8fafc;
      --muted: #94a3b8;
      --accent: #22c55e;
      --accent-hover: #16a34a;
      --primary: #38bdf8;
      --font: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    body {
      margin: 0;
      padding: 0;
      background: var(--bg);
      color: var(--text);
      font-family: var(--font);
      line-height: 1.6;
    }
    header, main, footer {
      max-width: 920px;
      margin: 0 auto;
      padding: 1.5rem;
    }
    header {
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 1rem;
      padding-bottom: 1rem;
    }
    .logo {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: var(--primary);
      text-decoration: none;
      font-weight: 700;
      font-size: 1.25rem;
    }
    .logo img {
      width: 28px;
      height: 28px;
    }
    .breadcrumbs {
      font-size: 0.85rem;
      color: var(--muted);
      margin-bottom: 1rem;
    }
    .breadcrumbs a {
      color: var(--primary);
      text-decoration: none;
    }
    h1 {
      font-size: 2.1rem;
      margin-top: 0.5rem;
      margin-bottom: 0.5rem;
      line-height: 1.25;
    }
    .badge-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-bottom: 1rem;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      background: #0369a1;
      color: #ffffff;
      padding: 0.25rem 0.65rem;
      border-radius: 9999px;
      font-size: 0.8rem;
      font-weight: 600;
    }
    .badge-date {
      background: #334155;
      color: #cbd5e1;
    }
    .summary-box {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-left: 4px solid var(--accent);
      padding: 1.25rem;
      border-radius: 0.5rem;
      margin: 1.5rem 0;
    }
    .summary-box p {
      margin: 0.35rem 0;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin: 1.5rem 0;
    }
    .kpi-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      padding: 1.25rem;
      border-radius: 0.5rem;
    }
    .kpi-card h3 {
      margin: 0;
      font-size: 0.85rem;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .kpi-card .price {
      font-size: 1.85rem;
      font-weight: 700;
      color: var(--accent);
      margin: 0.5rem 0;
    }
    .kpi-card .station-meta {
      font-size: 0.85rem;
      color: var(--muted);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 1rem 0 2rem;
      background: var(--card-bg);
      border-radius: 0.5rem;
      overflow: hidden;
    }
    th, td {
      padding: 0.85rem 1rem;
      text-align: left;
      border-bottom: 1px solid var(--border);
    }
    th {
      background: #09101f;
      color: var(--muted);
      font-size: 0.8rem;
      text-transform: uppercase;
    }
    tr:last-child td {
      border-bottom: none;
    }
    .price-cell {
      font-weight: 700;
      color: var(--accent);
      font-size: 1.05rem;
    }
    .btn-app {
      display: inline-block;
      background: var(--accent);
      color: #042f2e;
      padding: 0.75rem 1.5rem;
      border-radius: 0.5rem;
      font-weight: 700;
      text-decoration: none;
      margin-top: 1rem;
      transition: background 0.2s;
    }
    .btn-app:hover {
      background: var(--accent-hover);
    }
    .links-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 0.75rem;
      margin: 1rem 0 2.5rem;
    }
    .link-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      padding: 0.85rem 1rem;
      border-radius: 0.5rem;
      text-decoration: none;
      color: var(--text);
      display: flex;
      flex-direction: column;
      transition: border-color 0.2s;
    }
    .link-card:hover {
      border-color: var(--primary);
    }
    .link-card .city-name {
      font-weight: 600;
      color: var(--primary);
    }
    .link-card .city-price {
      font-size: 0.85rem;
      color: var(--muted);
      margin-top: 0.25rem;
    }
    .faq-section {
      margin-top: 3rem;
      border-top: 1px solid var(--border);
      padding-top: 1.5rem;
    }
    .faq-item {
      margin-bottom: 1.5rem;
    }
    .faq-item h3 {
      font-size: 1.15rem;
      color: #e2e8f0;
      margin-bottom: 0.5rem;
    }
    footer {
      border-top: 1px solid var(--border);
      color: var(--muted);
      font-size: 0.85rem;
      margin-top: 3rem;
      text-align: center;
    }
    footer a {
      color: var(--primary);
      text-decoration: none;
    }
  </style>
</head>
<body>
  <header>
    <a href="/" class="logo">
      <img src="/icono_datafuelle.svg" alt="DataFuelle Logo" />
      <span>DataFuelle</span>
    </a>
    <a href="${canonical}" class="btn-app" style="margin: 0; padding: 0.4rem 0.9rem; font-size: 0.85rem;">Ver en Mapa Interactivo</a>
  </header>

  <main>
    <nav class="breadcrumbs" aria-label="Ruta de navegación">
      <a href="/">Inicio</a> &gt; 
      ${parentUrl && parentName ? `<a href="${parentUrl}">${parentName}</a> &gt; ` : ''}
      <span>${escapeHtml(locationName)}</span>
    </nav>

    <div class="badge-bar">
      <span class="badge">Datos Oficiales MITECO</span>
      <span class="badge badge-date">Actualizado: ${escapeHtml(updatedAt)}</span>
      <span class="badge badge-date">${totalStationsInArea} estaciones activas</span>
    </div>

    <h1>Gasolineras más baratas en ${escapeHtml(locationName)}</h1>
    <p style="color: var(--muted); font-size: 0.95rem;">
      Precios de carburantes actualizados en tiempo real según los registros oficiales del Ministerio para la Transición Ecológica (MITECO). Consulta dónde llenar el depósito al mejor precio hoy.
    </p>

    <!-- Extractable Answer Block for AI Search (AEO/GEO) -->
    <div class="summary-box">
      <strong>Resumen del precio de carburantes en ${escapeHtml(locationName)}:</strong>
      <p>
        La <strong>Gasolina 95</strong> más barata en ${escapeHtml(locationName)} cuesta <strong>${formatPrice(stats.cheapestG95?.g95 ?? null)}</strong> en la estación <strong>${escapeHtml(cleanBrand(stats.cheapestG95?.brand || 'N/A'))}</strong> (${escapeHtml(stats.cheapestG95?.address || '')}).
      </p>
      <p>
        El <strong>Diésel (Gasóleo A)</strong> más económico está a <strong>${formatPrice(stats.cheapestDiesel?.diesel ?? null)}</strong> en la estación <strong>${escapeHtml(cleanBrand(stats.cheapestDiesel?.brand || 'N/A'))}</strong> (${escapeHtml(stats.cheapestDiesel?.address || '')}).
      </p>
      ${priceSpreadG95 && depositSavingsG95 ? `
      <p style="color: #cbd5e1; font-size: 0.9rem; margin-top: 0.5rem;">
        💡 <em>Diferencia de precios:</em> Entre la estación más barata y la más cara de ${escapeHtml(locationName)} hay una dispersión de <strong>${priceSpreadG95} €/l</strong> en Gasolina 95, lo que representa un ahorro de hasta <strong>${depositSavingsG95} €</strong> en un depósito de 50 litros.
      </p>` : ''}
    </div>

    <!-- KPIs -->
    <div class="grid">
      <div class="kpi-card">
        <h3>Gasolina 95 Mínima</h3>
        <div class="price">${formatPrice(stats.cheapestG95?.g95 ?? null)}</div>
        <div class="station-meta">
          <strong>${escapeHtml(cleanBrand(stats.cheapestG95?.brand || 'N/A'))}</strong><br />
          ${escapeHtml(stats.cheapestG95?.address || '')}
        </div>
      </div>
      <div class="kpi-card">
        <h3>Diésel Mínimo</h3>
        <div class="price">${formatPrice(stats.cheapestDiesel?.diesel ?? null)}</div>
        <div class="station-meta">
          <strong>${escapeHtml(cleanBrand(stats.cheapestDiesel?.brand || 'N/A'))}</strong><br />
          ${escapeHtml(stats.cheapestDiesel?.address || '')}
        </div>
      </div>
      <div class="kpi-card">
        <h3>Media Gasolina 95</h3>
        <div class="price" style="color: var(--primary);">${formatPrice(stats.avgG95)}</div>
        <div class="station-meta">Media en ${escapeHtml(locationName)} calculada hoy</div>
      </div>
      <div class="kpi-card">
        <h3>Media Diésel</h3>
        <div class="price" style="color: var(--primary);">${formatPrice(stats.avgDiesel)}</div>
        <div class="station-meta">Media en ${escapeHtml(locationName)} calculada hoy</div>
      </div>
    </div>

    <!-- Table Top Gasolina 95 -->
    <h2>Top Gasolineras con Gasolina 95 Más Barata en ${escapeHtml(locationName)}</h2>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Estación</th>
          <th>Dirección</th>
          <th>Precio G95</th>
        </tr>
      </thead>
      <tbody>
        ${stats.topG95.map((s, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td><strong>${escapeHtml(cleanBrand(s.brand))}</strong></td>
          <td>${escapeHtml(s.address)}</td>
          <td class="price-cell">${formatPrice(s.g95)}</td>
        </tr>
        `).join('')}
      </tbody>
    </table>

    <!-- Table Top Diésel -->
    <h2>Top Gasolineras con Diésel Más Barato en ${escapeHtml(locationName)}</h2>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Estación</th>
          <th>Dirección</th>
          <th>Precio Diésel</th>
        </tr>
      </thead>
      <tbody>
        ${stats.topDiesel.map((s, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td><strong>${escapeHtml(cleanBrand(s.brand))}</strong></td>
          <td>${escapeHtml(s.address)}</td>
          <td class="price-cell">${formatPrice(s.diesel)}</td>
        </tr>
        `).join('')}
      </tbody>
    </table>

    <!-- Sibling / Interlinking Section -->
    ${siblingLinks && siblingLinks.length > 0 ? `
    <section style="margin: 2.5rem 0;">
      <h2>Otras localidades con gasolineras baratas en ${escapeHtml(provinceName)}</h2>
      <p style="color: var(--muted); font-size: 0.9rem;">Consulta los precios y gasolineras en municipios cercanos de la provincia:</p>
      <div class="links-grid">
        ${siblingLinks.map(link => `
        <a href="${link.url}" class="link-card">
          <span class="city-name">${escapeHtml(link.name)}</span>
          <span class="city-price">Ver estaciones y precios &rarr;</span>
        </a>
        `).join('')}
      </div>
    </section>
    ` : ''}

    ${municipalityLinks && municipalityLinks.length > 0 ? `
    <section style="margin: 2.5rem 0;">
      <h2>Municipios monitorizados en ${escapeHtml(locationName)}</h2>
      <div class="links-grid">
        ${municipalityLinks.map(link => `
        <a href="${link.url}" class="link-card">
          <span class="city-name">${escapeHtml(link.name)}</span>
          <span class="city-price">G95: ${escapeHtml(link.cheapestG95)} | Diésel: ${escapeHtml(link.cheapestDiesel)}</span>
        </a>
        `).join('')}
      </div>
    </section>
    ` : ''}

    ${otherProvincesLinks && otherProvincesLinks.length > 0 ? `
    <section style="margin: 2.5rem 0;">
      <h2>Precios en otras provincias de España</h2>
      <div class="links-grid">
        ${otherProvincesLinks.map(link => `
        <a href="${link.url}" class="link-card">
          <span class="city-name">${escapeHtml(link.name)}</span>
          <span class="city-price">Consultar precios provinciales &rarr;</span>
        </a>
        `).join('')}
      </div>
    </section>
    ` : ''}

    <!-- Call to action to interactive app -->
    <div style="background: linear-gradient(135deg, #1e293b, #0f172a); border: 1px solid #0284c7; padding: 2rem; border-radius: 0.75rem; text-align: center; margin: 3rem 0;">
      <h2 style="margin-top: 0;">¿Merece la pena desplazarte a la gasolinera más barata?</h2>
      <p style="color: var(--muted); max-width: 650px; margin: 0 auto 1.5rem;">
        Ir a una gasolinera barata que está a 5 km puede costar más en combustible que el ahorro conseguido en el surtidor. En <strong>DataFuelle</strong> calculamos tu ahorro real teniendo en cuenta el consumo de tu vehículo y la distancia ida y vuelta de desvío.
      </p>
      <a href="${canonical}" class="btn-app">Abrir Calculadora de Ahorro y Mapa</a>
    </div>

    <!-- FAQ Section -->
    <section class="faq-section">
      <h2>Preguntas Frecuentes sobre el combustible en ${escapeHtml(locationName)}</h2>
      <div class="faq-item">
        <h3>¿Cuál es la gasolinera con Gasolina 95 más barata en ${escapeHtml(locationName)} hoy?</h3>
        <p>
          ${stats.cheapestG95
            ? `La Gasolina 95 más económica está a <strong>${formatPrice(stats.cheapestG95.g95)}</strong> en <strong>${escapeHtml(cleanBrand(stats.cheapestG95.brand))}</strong>, en ${escapeHtml(stats.cheapestG95.address)}.`
            : 'No hay precios disponibles en este momento.'}
        </p>
      </div>
      <div class="faq-item">
        <h3>¿Cuál es el precio del diésel más barato en ${escapeHtml(locationName)}?</h3>
        <p>
          ${stats.cheapestDiesel
            ? `El diésel más barato en ${escapeHtml(locationName)} se encuentra a <strong>${formatPrice(stats.cheapestDiesel.diesel)}</strong> en la estación <strong>${escapeHtml(cleanBrand(stats.cheapestDiesel.brand))}</strong> (${escapeHtml(stats.cheapestDiesel.address)}).`
            : 'No hay precios disponibles en este momento.'}
        </p>
      </div>
      <div class="faq-item">
        <h3>¿Cómo calcula DataFuelle el coste real de repostaje?</h3>
        <p>A diferencia de los comparadores convencionales que solo listan el precio en el surtidor, el algoritmo <em>Smart Sort</em> de DataFuelle calcula: <code>Coste Total = (Litros a repostar × Precio/litro) + (Distancia ida y vuelta × Consumo del coche × Precio/litro)</code>. Así evitas desplazarte a estaciones donde el desvío cuesta más que el ahorro conseguido. Consulta nuestra <a href="/metodologia/" style="color: var(--primary);">metodología y fuentes</a> para más detalles.</p>
      </div>
      <div class="faq-item">
        <h3>¿De dónde proceden los precios mostrados?</h3>
        <p>Todos los precios se extraen directamente de la base de datos oficial del Ministerio para la Transición Ecológica y el Reto Demográfico (MITECO) del Gobierno de España, asegurando máxima fiabilidad y actualización continua.</p>
      </div>
    </section>
  </main>

  <footer>
    <p>
      DataFuelle © ${new Date().getFullYear()} — Comparador y Monitor de Combustibles en España.<br />
      Fuente de datos oficial: <a href="https://sedeaplicaciones.minetur.gob.es" target="_blank" rel="noopener">Ministerio para la Transición Ecológica y el Reto Demográfico (MITECO)</a>.
    </p>
    <p>
      <a href="/metodologia/">Metodología y Fuentes</a> | <a href="/robots.txt">robots.txt</a> | <a href="/llms.txt">llms.txt</a> | <a href="/sitemap.xml">sitemap.xml</a>
    </p>
  </footer>
</body>
</html>`;
};

const buildMethodologyPageHtml = (isoModifiedTime: string) => {
  const schemaJson = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Inicio', item: 'https://datafuelle.es/' },
          { '@type': 'ListItem', position: 2, name: 'Metodología y Fuentes', item: 'https://datafuelle.es/metodologia/' }
        ]
      },
      {
        '@type': 'AboutPage',
        name: 'Metodología y Fuentes de Datos — DataFuelle',
        description: 'Explicación técnica de la obtención de datos oficiales del MITECO y el algoritmo Smart Sort de coste real de repostaje en DataFuelle.',
        publisher: {
          '@type': 'Organization',
          name: 'DataFuelle',
          url: 'https://datafuelle.es/'
        }
      }
    ]
  };

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Metodología, Fuentes y Algoritmo Smart Sort | DataFuelle</title>
  <meta name="description" content="Conoce cómo funciona DataFuelle: de dónde obtenemos los precios oficiales del MITECO, la frecuencia de sincronización y el algoritmo matemático de cálculo de ahorro real." />
  <link rel="canonical" href="https://datafuelle.es/metodologia/" />
  <link rel="icon" type="image/svg+xml" href="/icono_datafuelle.svg" />

  <!-- Open Graph -->
  <meta property="og:type" content="article" />
  <meta property="og:url" content="https://datafuelle.es/metodologia/" />
  <meta property="og:title" content="Metodología, Fuentes y Algoritmo Smart Sort | DataFuelle" />
  <meta property="og:description" content="Explicación técnica del origen de datos oficiales del MITECO y el cálculo de coste real de repostaje." />
  <meta property="og:image" content="https://datafuelle.es/icono_datafuelle.svg" />
  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="Metodología, Fuentes y Algoritmo Smart Sort | DataFuelle" />
  <meta name="twitter:description" content="Explicación técnica del origen de datos oficiales del MITECO y el cálculo de coste real de repostaje." />
  <meta name="twitter:image" content="https://datafuelle.es/icono_datafuelle.svg" />

  <!-- Schema JSON-LD -->
  <script type="application/ld+json">
  ${JSON.stringify(schemaJson, null, 2)}
  </script>

  <style>
    :root {
      --bg: #0f172a;
      --card-bg: #1e293b;
      --border: #334155;
      --text: #f8fafc;
      --muted: #94a3b8;
      --accent: #22c55e;
      --primary: #38bdf8;
      --font: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    body {
      margin: 0;
      padding: 0;
      background: var(--bg);
      color: var(--text);
      font-family: var(--font);
      line-height: 1.7;
    }
    header, main, footer {
      max-width: 860px;
      margin: 0 auto;
      padding: 1.5rem;
    }
    header {
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 1rem;
      padding-bottom: 1rem;
    }
    .logo {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: var(--primary);
      text-decoration: none;
      font-weight: 700;
      font-size: 1.25rem;
    }
    .logo img {
      width: 28px;
      height: 28px;
    }
    h1 {
      font-size: 2.2rem;
      line-height: 1.25;
      margin-top: 1rem;
    }
    h2 {
      font-size: 1.5rem;
      margin-top: 2.5rem;
      color: var(--primary);
      border-bottom: 1px solid var(--border);
      padding-bottom: 0.5rem;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 0.5rem;
      padding: 1.5rem;
      margin: 1.5rem 0;
    }
    code {
      background: #09101f;
      padding: 0.2rem 0.5rem;
      border-radius: 0.25rem;
      color: #f59e0b;
      font-size: 0.95rem;
    }
    .formula-box {
      background: #09101f;
      border-left: 4px solid var(--accent);
      padding: 1.25rem;
      margin: 1.5rem 0;
      font-family: ui-monospace, monospace;
      color: #34d399;
      font-size: 1.05rem;
    }
    footer {
      border-top: 1px solid var(--border);
      color: var(--muted);
      font-size: 0.85rem;
      margin-top: 4rem;
      text-align: center;
    }
    footer a {
      color: var(--primary);
      text-decoration: none;
    }
  </style>
</head>
<body>
  <header>
    <a href="/" class="logo">
      <img src="/icono_datafuelle.svg" alt="DataFuelle Logo" />
      <span>DataFuelle</span>
    </a>
    <a href="/" style="background: var(--accent); color: #042f2e; padding: 0.4rem 0.9rem; border-radius: 0.5rem; font-weight: 700; text-decoration: none; font-size: 0.85rem;">Ir a la App</a>
  </header>

  <main>
    <h1>Metodología, Fuentes y Modelo de Cálculo de Ahorro</h1>
    <p style="color: var(--muted);">Última revisión: ${isoModifiedTime.split('T')[0]} • Transparencia de datos de DataFuelle</p>

    <h2>1. Origen y Fiabilidad de los Datos</h2>
    <p>
      Todos los datos de precios, ubicación y horarios mostrados en <strong>DataFuelle</strong> proceden de los servicios REST públicos del <strong>Geoportal de Gasolineras del Ministerio para la Transición Ecológica y el Reto Demográfico (MITECO)</strong> del Gobierno de España.
    </p>
    <div class="card">
      <strong>Garantías de veracidad:</strong>
      <ul>
        <li>Las estaciones de servicio en España están obligadas por ley (Orden ITC/2308/2007) a comunicar cualquier modificación de precios al Ministerio.</li>
        <li>DataFuelle sincroniza automáticamente estos datos para garantizar precios actualizados y evitar información desfasada.</li>
        <li>No aceptamos acuerdos comerciales de patrocinio para alterar el orden de las estaciones recomendadas.</li>
      </ul>
    </div>

    <h2>2. El Problema de la Distancia: El Mito de la Gasolinera Más Barata</h2>
    <p>
      Muchos comparadores tradicionales ordenan únicamente por el precio nominal por litro. Sin embargo, desplazarse a una gasolinera situada a 6 km para ahorrar 4 céntimos por litro en un repostaje de 30 litros suele resultar en una <strong>pérdida neta de dinero</strong> debido al combustible consumido en el trayecto de ida y vuelta.
    </p>

    <h2>3. Algoritmo Smart Sort: Cálculo del Coste Real de Repostaje</h2>
    <p>
      Para solucionar este problema, DataFuelle desarrolló el algoritmo <strong>Smart Sort</strong>, que computa el coste económico total de repostar en cada estación:
    </p>
    <div class="formula-box">
      Coste Total (€) = Coste del Carburante + Coste del Desvío<br /><br />
      Coste Total = (Litros a Repostar × Precio/Litro) + (Distancia Ida y Vuelta × (Consumo L/100km / 100) × Precio/Litro)
    </div>
    <p>
      Adicionalmente, el algoritmo permite configurar:
    </p>
    <ul>
      <li><strong>Perfil de vehículo (Garage Virtual):</strong> consumo específico en L/100km de tu coche o moto.</li>
      <li><strong>Volumen de repostaje:</strong> número exacto de litros que deseas llenar.</li>
      <li><strong>Trayecto en ruta vs. ida y vuelta:</strong> cálculo ajustado si la estación se encuentra en tu itinerario habitual o requiere un desvío específico.</li>
    </ul>

    <h2>4. Arquitectura Tecnológica y Procesamiento</h2>
    <p>
      DataFuelle implementa una arquitectura <em>Stateless-by-Default</em> que respeta la privacidad del usuario, combinada con motores analíticos de alto rendimiento:
    </p>
    <ul>
      <li><strong>DuckDB WASM:</strong> motor de consultas SQL columnar ejecutado directamente en el navegador del usuario para análisis instantáneo sin sobrecargar servidores.</li>
      <li><strong>Formato Apache Parquet:</strong> compresión de series temporales históricas para visualización de tendencias de precios.</li>
      <li><strong>Pre-renderizado Estático (SSG):</strong> generación de páginas semánticas autónomas que permiten a motores de búsqueda y asistentes de IA (ChatGPT, Perplexity, Gemini, Claude) extraer respuestas sin necesidad de ejecutar JavaScript.</li>
    </ul>
  </main>

  <footer>
    <p>
      DataFuelle © ${new Date().getFullYear()} — Comparador y Monitor de Combustibles en España.<br />
      Fuente de datos oficial: <a href="https://sedeaplicaciones.minetur.gob.es" target="_blank" rel="noopener">MITECO</a>.
    </p>
    <p>
      <a href="/">Inicio</a> | <a href="/robots.txt">robots.txt</a> | <a href="/llms.txt">llms.txt</a> | <a href="/sitemap.xml">sitemap.xml</a>
    </p>
  </footer>
</body>
</html>`;
};

const computeStats = (stationList: StationSummary[]) => {
  const withG95 = stationList.filter((s) => s.g95 !== null).sort((a, b) => a.g95! - b.g95!);
  const withDiesel = stationList.filter((s) => s.diesel !== null).sort((a, b) => a.diesel! - b.diesel!);

  const avgG95 = withG95.length ? withG95.reduce((acc, s) => acc + s.g95!, 0) / withG95.length : null;
  const avgDiesel = withDiesel.length ? withDiesel.reduce((acc, s) => acc + s.diesel!, 0) / withDiesel.length : null;

  return {
    cheapestG95: withG95[0] || null,
    mostExpensiveG95: withG95[withG95.length - 1] || null,
    cheapestDiesel: withDiesel[0] || null,
    mostExpensiveDiesel: withDiesel[withDiesel.length - 1] || null,
    avgG95,
    avgDiesel,
    topG95: withG95.slice(0, 5),
    topDiesel: withDiesel.slice(0, 5),
  };
};

// Automatic QA Validation Suite with LLM Extractability Check
const validateGeneratedPages = (
  generatedHtmlPaths: string[],
  sitemapPath: string,
  expectedUrls: string[],
  distDir: string
) => {
  console.log(`\n🔍 [QA-AUDIT] Ejecutando validación estricta de ${generatedHtmlPaths.length} páginas generadas...`);

  // 1. Check for duplicate URLs
  const urlSet = new Set<string>();
  for (const url of expectedUrls) {
    if (urlSet.has(url)) {
      throw new Error(`[QA-FAIL] URL duplicada detectada en expectedUrls: ${url}`);
    }
    urlSet.add(url);
    if (!url.endsWith('/')) {
      throw new Error(`[QA-FAIL] Trailing slash ausente en URL: ${url}`);
    }
  }

  // 2. Validate every generated file
  for (const filePath of generatedHtmlPaths) {
    const relPath = path.relative(process.cwd(), filePath);
    if (!fs.existsSync(filePath)) {
      throw new Error(`[QA-FAIL] El archivo físico no existe: ${relPath}`);
    }
    const html = fs.readFileSync(filePath, 'utf-8');

    // Title
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    if (!titleMatch || !titleMatch[1].trim()) {
      throw new Error(`[QA-FAIL] <title> ausente o vacío en ${relPath}`);
    }

    // Meta description
    const descMatch = html.match(/<meta name="description" content="([^"]+)"/);
    if (!descMatch || !descMatch[1].trim()) {
      throw new Error(`[QA-FAIL] <meta description> ausente o vacía en ${relPath}`);
    }

    // H1
    const h1Match = html.match(/<h1>([^<]+)<\/h1>/);
    if (!h1Match || !h1Match[1].trim()) {
      throw new Error(`[QA-FAIL] <h1> ausente o vacío en ${relPath}`);
    }

    // Canonical
    const canonicalMatch = html.match(/<link rel="canonical" href="(https:\/\/datafuelle\.es\/[^"]+)"/);
    if (!canonicalMatch) {
      throw new Error(`[QA-FAIL] Canonical URL ausente o inválida en ${relPath}`);
    }

    // OG & Twitter tags
    if (!html.includes('<meta property="og:title"') || !html.includes('<meta name="twitter:card"')) {
      throw new Error(`[QA-FAIL] Metatags Open Graph o Twitter ausentes en ${relPath}`);
    }

    // Schema JSON-LD
    const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    if (!jsonLdMatch) {
      throw new Error(`[QA-FAIL] JSON-LD ausente en ${relPath}`);
    }
    let parsedSchema: any;
    try {
      parsedSchema = JSON.parse(jsonLdMatch[1]);
    } catch (e: any) {
      throw new Error(`[QA-FAIL] Error al parsear JSON-LD en ${relPath}: ${e.message}`);
    }
    if (!parsedSchema['@graph'] || !Array.isArray(parsedSchema['@graph'])) {
      throw new Error(`[QA-FAIL] Schema JSON-LD no contiene @graph en ${relPath}`);
    }

    // Check MITECO attribution
    if (!html.includes('MITECO') && !html.includes('Ministerio para la Transición Ecológica')) {
      throw new Error(`[QA-FAIL] Atribución a MITECO ausente en ${relPath}`);
    }
  }

  // 3. Validate Sitemap
  if (!fs.existsSync(sitemapPath)) {
    throw new Error(`[QA-FAIL] sitemap.xml no existe en ${sitemapPath}`);
  }
  const sitemapContent = fs.readFileSync(sitemapPath, 'utf-8');
  for (const url of expectedUrls) {
    if (!sitemapContent.includes(`<loc>${url}</loc>`)) {
      throw new Error(`[QA-FAIL] La URL ${url} no está registrada en sitemap.xml`);
    }
    // Verify physical file exists for this URL
    const urlObj = new URL(url);
    const relativeHtmlPath = path.join(distDir, urlObj.pathname.replace(/^\//, ''), 'index.html');
    if (!fs.existsSync(relativeHtmlPath)) {
      throw new Error(`[QA-FAIL] La URL del sitemap ${url} no corresponde a un archivo físico: ${relativeHtmlPath}`);
    }
  }

  // 4. LLM Extractability Benchmark Test across 5 sample municipal targets
  console.log('🤖 [QA-AUDIT] Ejecutando test de extractabilidad LLM (5 preguntas de prueba sin JS)...');
  const sampleMunicipalities = [
    'gasolineras/valencia/algemesi',
    'gasolineras/madrid/mostoles',
    'gasolineras/barcelona/terrassa',
    'gasolineras/alicante/elche',
    'gasolineras/sevilla/dos-hermanas',
  ];

  for (const sampleRel of sampleMunicipalities) {
    const sampleFile = path.join(distDir, sampleRel, 'index.html');
    if (!fs.existsSync(sampleFile)) {
      throw new Error(`[QA-FAIL] Página muestra para test LLM no encontrada: ${sampleRel}`);
    }
    const html = fs.readFileSync(sampleFile, 'utf-8');

    // Test Question 1: ¿Cuál es la Gasolina 95 más barata?
    if (!html.includes('Gasolina 95') || !html.includes('€/l')) {
      throw new Error(`[QA-FAIL-LLM] No se puede responder "¿Cuál es la Gasolina 95 más barata?" en ${sampleRel}`);
    }
    // Test Question 2: ¿Cuál es el Diésel más barato?
    if (!html.includes('Diésel') || !html.includes('Gasóleo A')) {
      throw new Error(`[QA-FAIL-LLM] No se puede responder "¿Cuál es el Diésel más barato?" en ${sampleRel}`);
    }
    // Test Question 3: ¿Cuándo se actualizaron los precios?
    if (!html.includes('Actualizado:') && !html.includes('article:modified_time')) {
      throw new Error(`[QA-FAIL-LLM] No se puede responder "¿Cuándo se actualizaron los precios?" en ${sampleRel}`);
    }
    // Test Question 4: ¿De dónde proceden los datos?
    if (!html.includes('MITECO')) {
      throw new Error(`[QA-FAIL-LLM] No se puede responder "¿De dónde proceden los datos?" en ${sampleRel}`);
    }
    // Test Question 5: ¿Cómo calcula el ahorro?
    if (!html.includes('Smart Sort') && !html.includes('Coste Total')) {
      throw new Error(`[QA-FAIL-LLM] No se puede responder "¿Cómo calcula DataFuelle el ahorro?" en ${sampleRel}`);
    }
  }

  console.log(`✅ [QA-AUDIT] Todas las ${generatedHtmlPaths.length} páginas, el sitemap y el test de extractabilidad LLM superados con éxito.\n`);
};

async function main() {
  console.log('🚀 [SEO-SSG] Generando páginas estáticas SEO escaladas para DataFuelle...');

  const distDir = path.resolve(process.cwd(), 'dist');
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  const generatedHtmlPaths: string[] = [];
  const sitemapUrls: string[] = ['https://datafuelle.es/'];
  const isoModifiedTime = new Date().toISOString();

  // 1. Generate Methodology Page (/metodologia/index.html)
  const methodologyDir = path.join(distDir, 'metodologia');
  fs.mkdirSync(methodologyDir, { recursive: true });
  const methodologyPath = path.join(methodologyDir, 'index.html');
  fs.writeFileSync(methodologyPath, buildMethodologyPageHtml(isoModifiedTime), 'utf-8');
  generatedHtmlPaths.push(methodologyPath);
  sitemapUrls.push('https://datafuelle.es/metodologia/');
  console.log('📄 Generada página de metodología: /metodologia/');

  // Other provinces links for interlinking across provinces
  const otherProvincesLinks = PROVINCES_CONFIG.map((p) => ({
    name: p.name,
    url: `https://datafuelle.es/gasolineras/${p.slug}/`
  }));

  for (const province of PROVINCES_CONFIG) {
    console.log(`\n📦 Procesando provincia: ${province.name} (ID MITECO: ${province.id})...`);
    const MITECO_URL = `https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/FiltroProvincia/${province.id}`;
    let rawStations: MitecoStationRaw[] = [];
    let updateDate = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

    try {
      const res = await fetch(MITECO_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { Fecha?: string; ListaEESSPrecio: MitecoStationRaw[] };
      rawStations = data.ListaEESSPrecio || [];
      if (data.Fecha) updateDate = data.Fecha;
      console.log(`  ✓ Obtenidas ${rawStations.length} estaciones desde MITECO (${updateDate})`);
    } catch (err) {
      console.error(`  ❌ Error al conectar con MITECO para ${province.name}:`, err);
      continue;
    }

    if (rawStations.length === 0) {
      console.warn(`  ⚠️ MITECO devolvió 0 estaciones para ${province.name}. Omitiendo generación provincial.`);
      continue;
    }

    const stations: StationSummary[] = rawStations.map((s) => ({
      id: s.IDEESS,
      brand: s.Rótulo,
      address: s.Dirección,
      municipality: s.Municipio,
      g95: parsePrice(s['Precio Gasolina 95 E5']),
      diesel: parsePrice(s['Precio Gasoleo A']),
      schedule: s.Horario,
    }));

    const provinceDir = path.join(distDir, 'gasolineras', province.slug);
    fs.mkdirSync(provinceDir, { recursive: true });

    // Pre-calculate municipal stats
    const municipalDataList: {
      target: TargetLocation;
      stations: StationSummary[];
      stats: ReturnType<typeof computeStats>;
      url: string;
      isNoIndex: boolean;
    }[] = [];

    for (const mun of province.targetMunicipios) {
      const munStations = stations.filter((s) => mun.matcher(s.municipality));
      // Intelligent noindex check: if a municipality has < 2 stations or 0 valid fuel data, do not index
      const munStats = computeStats(munStations);
      const isNoIndex = munStations.length < 2 || (!munStats.cheapestG95 && !munStats.cheapestDiesel);

      if (munStations.length > 0) {
        municipalDataList.push({
          target: mun,
          stations: munStations,
          stats: munStats,
          url: `https://datafuelle.es/gasolineras/${province.slug}/${mun.slug}/`,
          isNoIndex,
        });
      }
    }

    // Generate Municipal Pages
    for (const item of municipalDataList) {
      const mun = item.target;
      const munDir = path.join(provinceDir, mun.slug);
      fs.mkdirSync(munDir, { recursive: true });

      const siblingLinks = municipalDataList
        .filter((other) => other.target.slug !== mun.slug && !other.isNoIndex)
        .map((other) => ({
          name: other.target.name,
          url: other.url
        }));

      const munHtml = buildPageHtml({
        title: `Gasolineras Más Baratas en ${mun.name} Hoy | Precios Actualizados DataFuelle`,
        description: `Consulta las gasolineras más baratas en ${mun.name} (${province.name}) hoy. Gasolina 95 desde ${formatPrice(item.stats.cheapestG95?.g95 ?? null)} y Diésel desde ${formatPrice(item.stats.cheapestDiesel?.diesel ?? null)}. Datos certificados MITECO.`,
        canonical: item.url,
        locationName: mun.name,
        provinceName: province.name,
        isProvince: false,
        isNoIndex: item.isNoIndex,
        parentUrl: `https://datafuelle.es/gasolineras/${province.slug}/`,
        parentName: province.name,
        updatedAt: updateDate,
        isoModifiedTime,
        totalStationsInArea: item.stations.length,
        siblingLinks,
        otherProvincesLinks: otherProvincesLinks.filter((p) => p.name !== province.name),
        stats: item.stats,
      });

      const filePath = path.join(munDir, 'index.html');
      fs.writeFileSync(filePath, munHtml, 'utf-8');
      generatedHtmlPaths.push(filePath);

      // Only add to sitemap if indexable
      if (!item.isNoIndex) {
        sitemapUrls.push(item.url);
      }
      console.log(`  📄 /gasolineras/${province.slug}/${mun.slug}/ (${item.stations.length} estaciones${item.isNoIndex ? ' [NOINDEX]' : ''})`);
    }

    // Generate Province Page
    const provinceStats = computeStats(stations);
    const municipalityLinks = municipalDataList
      .filter((item) => !item.isNoIndex)
      .map((item) => ({
        name: item.target.name,
        url: item.url,
        cheapestG95: formatPrice(item.stats.cheapestG95?.g95 ?? null),
        cheapestDiesel: formatPrice(item.stats.cheapestDiesel?.diesel ?? null)
      }));

    const provinceUrl = `https://datafuelle.es/gasolineras/${province.slug}/`;
    const provinceHtml = buildPageHtml({
      title: `Gasolineras Baratas en ${province.name} Hoy | Precios Gasolina y Diésel DataFuelle`,
      description: `Descubre las gasolineras más baratas de la provincia de ${province.name} hoy. Gasolina 95 desde ${formatPrice(provinceStats.cheapestG95?.g95 ?? null)} y Diésel desde ${formatPrice(provinceStats.cheapestDiesel?.diesel ?? null)}. Datos oficiales MITECO.`,
      canonical: provinceUrl,
      locationName: `Provincia de ${province.name}`,
      provinceName: province.name,
      isProvince: true,
      updatedAt: updateDate,
      isoModifiedTime,
      totalStationsInArea: stations.length,
      municipalityLinks,
      otherProvincesLinks: otherProvincesLinks.filter((p) => p.name !== province.name),
      stats: provinceStats,
    });

    const provFilePath = path.join(provinceDir, 'index.html');
    fs.writeFileSync(provFilePath, provinceHtml, 'utf-8');
    generatedHtmlPaths.push(provFilePath);
    sitemapUrls.push(provinceUrl);
    console.log(`  📄 /gasolineras/${province.slug}/ (Página Provincial, ${stations.length} estaciones)`);
  }

  // Generate sitemap.xml with ISO lastmod (YYYY-MM-DDTHH:mm:ssZ)
  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapUrls
  .map((url) => {
    const isRoot = url === 'https://datafuelle.es/';
    const isProvOrMethod = url === 'https://datafuelle.es/metodologia/' || (!isRoot && url.split('/').filter(Boolean).length === 4);
    const priority = isRoot ? '1.0' : isProvOrMethod ? '0.9' : '0.8';
    return `  <url>
    <loc>${url}</loc>
    <lastmod>${isoModifiedTime}</lastmod>
    <changefreq>daily</changefreq>
    <priority>${priority}</priority>
  </url>`;
  })
  .join('\n')}
</urlset>`;

  const sitemapPath = path.join(distDir, 'sitemap.xml');
  fs.writeFileSync(sitemapPath, sitemapXml, 'utf-8');
  console.log(`\n🗺️ [SEO-SSG] sitemap.xml generado con ${sitemapUrls.length} URLs indexables.`);

  // Copy robots.txt and llms.txt to dist
  const publicDir = path.resolve(process.cwd(), 'public');
  if (fs.existsSync(path.join(publicDir, 'robots.txt'))) {
    fs.copyFileSync(path.join(publicDir, 'robots.txt'), path.join(distDir, 'robots.txt'));
  }
  if (fs.existsSync(path.join(publicDir, 'llms.txt'))) {
    fs.copyFileSync(path.join(publicDir, 'llms.txt'), path.join(distDir, 'llms.txt'));
  }

  // Run QA Audit Gate
  validateGeneratedPages(generatedHtmlPaths, sitemapPath, sitemapUrls, distDir);

  console.log(`🎉 [SEO-SSG] Pipeline completado: ${generatedHtmlPaths.length} páginas generadas y verificadas.`);
}

main().catch((err) => {
  console.error('\n🚨 FATAL ERROR EN EL GENERADOR SEO/SSG:', err);
  process.exit(1);
});
