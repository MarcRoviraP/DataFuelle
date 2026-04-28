import fs from 'fs';
const stations = JSON.parse(fs.readFileSync('stations.json')).ListaEESSPrecio;
console.log(`Processing ${stations.length} stations...`);

const CHUNK_SIZE = 1000;
for (let i = 0; i < stations.length; i += CHUNK_SIZE) {
  const chunk = stations.slice(i, i + CHUNK_SIZE);
  let sql = "INSERT INTO public.stations (external_id, name, brand, address, latitude, longitude, municipality, province, postal_code, schedule, updated_at) VALUES ";
  
  const values = chunk.map(s => {
    const id = parseInt(s.IDEESS);
    const name = s.Rótulo.replace(/'/g, "''");
    const brand = s.Rótulo.replace(/'/g, "''");
    const address = s.Dirección.replace(/'/g, "''");
    const lat = s.Latitud.replace(",", ".");
    const lon = (s["Longitud (WGS84)"] || s.Longitud).replace(",", ".");
    const muni = s.Municipio.replace(/'/g, "''");
    const prov = s.Provincia.replace(/'/g, "''");
    const cp = s["C.P."];
    const schedule = s.Horario.replace(/'/g, "''");
    const now = new Date().toISOString();
    
    return `(${id}, '${name}', '${brand}', '${address}', ${lat}, ${lon}, '${muni}', '${prov}', '${cp}', '${schedule}', '${now}')`;
  }).join(",\n");

  sql += values + " ON CONFLICT (external_id) DO UPDATE SET updated_at = EXCLUDED.updated_at, latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude, schedule = EXCLUDED.schedule;";
  
  fs.writeFileSync(`sync_${i / CHUNK_SIZE}.sql`, sql);
}
console.log("SQL chunks generated!");
