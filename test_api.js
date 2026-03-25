
async function test() {
  const lat = 39.4699;
  const lon = -0.3763;
  const radius = 5;
  const fuelTypeId = 9;

  const url = `https://api.precioil.es/estaciones/radio?latitud=${lat}&longitud=${lon}&radio=${radius}&idFuelType=${fuelTypeId}&limite=1`;
  const response = await fetch(url);
  const data = await response.json();
  console.log('--- Station Sample ---');
  console.log(JSON.stringify(data[0], null, 2));
}

test();
