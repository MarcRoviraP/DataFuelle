import fs from 'fs';

const STATIONS_FILE = 'stations.json';
const CHUNK_SIZE = 1000;

function generateSql() {
  const data = JSON.parse(fs.readFileSync(STATIONS_FILE, 'utf8'));
  const stations = data.ListaEESSPrecio || data; // Handle both official API and raw array formats
  
  console.log(`Processing ${stations.length} stations...`);

  for (let i = 0; i < stations.length; i += CHUNK_SIZE) {
    const chunk = stations.slice(i, i + CHUNK_SIZE);
    const chunkNum = Math.floor(i / CHUNK_SIZE);
    
    // Stations Statement
    let stationSql = "INSERT INTO public.stations (external_id, name, brand, address, latitude, longitude, municipality, province, postal_code, schedule, updated_at) VALUES \n";
    const stationRows = chunk.map(s => {
      const extId = parseInt(s.IDEESS);
      const lat = parseFloat(s.Latitud.replace(",", "."));
      const lon = parseFloat((s.Longitud || s["Longitud (WGS84)"]).replace(",", "."));
      const updatedAt = new Date().toISOString();
      
      return `(${extId}, '${s.Rótulo.replace(/'/g, "''")}', '${s.Rótulo.replace(/'/g, "''")}', '${s.Dirección.replace(/'/g, "''")}', ${lat}, ${lon}, '${s.Municipio.replace(/'/g, "''")}', '${s.Provincia.replace(/'/g, "''")}', '${s["C.P."]}', '${s.Horario.replace(/'/g, "''")}', '${updatedAt}')`;
    });
    
    stationSql += stationRows.join(", \n") + " \nON CONFLICT (external_id) DO UPDATE SET updated_at = EXCLUDED.updated_at, latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude, schedule = EXCLUDED.schedule;\n\n";

    // Prices Statement
    let priceSql = "INSERT INTO public.price_history (station_id, price_95, price_98, price_diesel, recorded_at) VALUES \n";
    const priceRows = chunk.map(s => {
      const extId = parseInt(s.IDEESS);
      const p95 = s["Precio Gasolina 95 E5"] ? parseFloat(s["Precio Gasolina 95 E5"].replace(",", ".")) : "NULL";
      const p98 = s["Precio Gasolina 98 E5"] ? parseFloat(s["Precio Gasolina 98 E5"].replace(",", ".")) : "NULL";
      const pDiesel = s["Precio Gasoleo A"] ? parseFloat(s["Precio Gasoleo A"].replace(",", ".")) : "NULL";
      const recordedAt = new Date().toISOString();
      
      if (p95 === "NULL" && p98 === "NULL" && pDiesel === "NULL") return null;
      return `(${extId}, ${p95}, ${p98}, ${pDiesel}, '${recordedAt}')`;
    }).filter(r => r !== null);
    
    if (priceRows.length > 0) {
      priceSql += priceRows.join(", \n") + ";\n";
    } else {
      priceSql = "-- No prices for this chunk\n";
    }

    fs.writeFileSync(`sync_full_${chunkNum}.sql`, stationSql + priceSql);
    console.log(`Saved sync_full_${chunkNum}.sql`);
  }
}

generateSql();
