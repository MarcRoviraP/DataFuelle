# Documentación Técnica: IA, Algoritmos y Arquitectura de Datafuelle

¡Buenas, loco! Mirá, acá te armé la documentación completa con **el código fuente real** y las explicaciones detalladas sobre cómo funciona el cerebro y la lógica detrás de **Datafuelle**. Programar código sin entender las bases conceptuales es construir un edificio sobre arena húmeda; así que PONETE LAS PILAS y leete esto con calma para entender de verdad la magia que hay abajo del capó. 

---

## 1. Machine Learning: Random Forest Regressor

Para predecir a dónde van a parar los precios de la nafta y el gasoil la semana que viene, implementamos un modelo basado en **Random Forest** (Bosque Aleatorio) enfocado en regresión.

### ¿Cómo funciona la Regresión en este caso?
Random Forest es un algoritmo de aprendizaje supervisado de ensamble. En lugar de confiar en un solo árbol de decisión (que tiene una alta varianza y tiende al sobreajuste o *overfitting*), genera múltiples árboles y promedia sus predicciones.

*   **Variables de entrada (Features)** que usa el modelo:
    *   `fecha`: Timestamp Unix del momento de la predicción.
    *   `gasolinera_id`: Identificador único de la estación de servicio.
    *   `municipio_cp`: Código postal sanitizado (ej. extraído de los primeros dígitos del código postal) para dar contexto geográfico al modelo.
    *   `price_diesel` / `price_95` / `price_98`: Los últimos precios conocidos.
    *   `day_of_week`: Día de la semana (0 a 6). Fundamental para capturar el "efecto lunes" o variaciones de fin de semana.
    *   `month`: Mes del año (1 a 12), capturando la estacionalidad (vacaciones, épocas de alta demanda).
*   **Targets (Variables a predecir)**:
    *   `target_diesel`, `target_95`, `target_98` (Precios esperados dentro de 7 días).

### Estrategia de Validación 80% / 20% vs. Producción
En la fase de diseño e investigación, dividimos el dataset histórico:
1.  **80% para Entrenamiento (Train)**: El modelo aprende las relaciones y patrones entre el día de la semana, el precio actual, la zona y el precio futuro.
2.  **20% para Prueba (Test)**: Datos no vistos para evaluar el error absoluto medio (MAE) y el error cuadrático medio (RMSE) y asegurar que el modelo no esté alucinando.

> [!IMPORTANT]
> **Decisión de Arquitectura en Producción:**
> Como habrás visto en el script de entrenamiento, una vez que validamos que los hiperparámetros son robustos, **entrenamos el modelo final con el 100% de los datos**. Desperdiciar un 20% de datos históricos valiosos en producción no tiene sentido técnico si lo que buscamos es la máxima precisión posible.

### Código de Entrenamiento (`utils/test.py`)
Acá tenés el script encargado de generar los tres modelos serializados utilizando la librería `scikit-learn` y `joblib`:

```python
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestRegressor
import joblib
import os

# Asegurar que existe la carpeta de modelos
if not os.path.exists('models'):
    os.makedirs('models')

print("🚀 Cargando dataset...")
df = pd.read_parquet('data/gas_prices.parquet')

features = ['fecha', 'gasolinera_id', 'municipio_cp', 'price_diesel', 'price_95', 'price_98', 'day_of_week', 'month']
targets = ['target_diesel', 'target_95', 'target_98']

def entrenar_y_guardar(target_name):
    print(f"\n🎯 Entrenando cerebro para {target_name}...")
    
    # Limpiamos nulos por si acaso
    df_clean = df.dropna(subset=[target_name])
    X = df_clean[features]
    y = df_clean[target_name]
    
    # No hace falta split si vamos a producción, entrenamos con TODO para máxima precisión
    modelo = RandomForestRegressor(
        n_estimators=50, 
        max_depth=15, 
        n_jobs=-1, 
        random_state=42,
        verbose=0
    )
    
    modelo.fit(X, y)
    
    filename = f'models/model_{target_name.replace("target_", "")}.pkl'
    joblib.dump(modelo, filename)
    print(f"✅ Guardado: {filename}")

# Entrenamos los 3 cerebros
for t in targets:
    entrenar_y_guardar(t)

print("\n✨ ¡Todos los modelos están listos para ir a la web!")
```

### Código de Inferencia / Predicción (`scripts/predict_prices.py`)
Y este es el código que corre en producción (semanalmente mediante GitHub Actions o un cron) cargando los `.pkl` generados para predecir precios y subirlos a la base de datos (Supabase):

```python
import joblib
import pandas as pd
import requests
import datetime
import os

# Configuración (REST API directa)
SUPABASE_URL = os.environ.get('SUPABASE_URL', 'https://msetjsrlioiysxmgybdg.supabase.co/rest/v1')
if not SUPABASE_URL.endswith('/rest/v1'):
    SUPABASE_URL = SUPABASE_URL.rstrip('/') + '/rest/v1'
SUPABASE_KEY = os.environ.get('SUPABASE_SECRET_KEY') or os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('VITE_SUPABASE_ANON_KEY')

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates"
}

# Cargar modelos
print("🧠 Cargando modelos IA...")
models = {
    'diesel': joblib.load('models/model_diesel.pkl'),
    '95': joblib.load('models/model_95.pkl'),
    '98': joblib.load('models/model_98.pkl')
}

def fetch_all(table, select="*", order=None, limit=None):
    results = []
    page_size = 1000
    offset = 0
    while True:
        url = f"{SUPABASE_URL}/{table}?select={select}&limit={page_size}&offset={offset}"
        if order:
            url += f"&order={order}"
        
        res = requests.get(url, headers=HEADERS)
        res.raise_for_status()
        data = res.json()
        if not data:
            break
        results.extend(data)
        if len(data) < page_size or (limit and len(results) >= limit):
            break
        offset += page_size
    return pd.DataFrame(results[:limit] if limit else results)

def get_all_stations_with_prices():
    print("🏢 Obteniendo datos de todas las estaciones con precios...")
    df = fetch_all('stations', select='external_id,postal_code,last_price_95,last_price_98,last_price_diesel')
    
    # Renombrar para que coincida con la lógica de predicción
    df = df.rename(columns={
        'external_id': 'station_id',
        'last_price_95': 'price_95',
        'last_price_98': 'price_98',
        'last_price_diesel': 'price_diesel'
    })
    
    # Solo estaciones que tengan al menos UN precio
    total_antes = len(df)
    df = df.dropna(subset=['price_95', 'price_98', 'price_diesel'], how='all')
    print(f"✅ Se filtraron {total_antes - len(df)} estaciones sin ningún precio. Quedan {len(df)} para predecir.")
    return df

def run():
    # 1. Datos actuales directamente de la tabla stations
    df = get_all_stations_with_prices()
    
    # 2. Preparar features para HOY
    now = datetime.datetime.now()
    target_date = (now + datetime.timedelta(days=7)).date()
    
    print(f"🔮 Generando predicciones para el {target_date}...")
    
    # Sanitizar CP
    df['municipio_cp'] = df['postal_code'].apply(lambda x: int(str(x).split('-')[0]) if x else 0)
    
    df_features = pd.DataFrame({
        'fecha': int(now.timestamp()),
        'gasolinera_id': df['station_id'].astype(int),
        'municipio_cp': df['municipio_cp'].astype(int),
        'price_diesel': df['price_diesel'].astype(float),
        'price_95': df['price_95'].astype(float),
        'price_98': df['price_98'].astype(float),
        'day_of_week': now.weekday(),
        'month': now.month
    })

    # 3. Predecir
    df['pred_diesel'] = models['diesel'].predict(df_features)
    df['pred_95'] = models['95'].predict(df_features)
    df['pred_98'] = models['98'].predict(df_features)

    # 4. Guardar en Supabase (Batch)
    print("💾 Subiendo predicciones...")
    batch = []
    for _, row in df.iterrows():
        batch.append({
            'station_id': int(row['station_id']),
            'target_date': str(target_date),
            'predicted_diesel': float(row['pred_diesel']),
            'predicted_95': float(row['pred_95']),
            'predicted_98': float(row['pred_98'])
        })
        
        if len(batch) >= 500:
            requests.post(f"{SUPABASE_URL}/price_predictions", headers=HEADERS, json=batch).raise_for_status()
            batch = []
            
    if batch:
        requests.post(f"{SUPABASE_URL}/price_predictions", headers=HEADERS, json=batch).raise_for_status()

    print(f"✨ ¡Hecho! Predicciones para {len(df)} estaciones publicadas.")

if __name__ == "__main__":
    run()
```

---

## 2. Estructuras de Datos: Diccionarios en Memoria (JSON)

Para optimizar las búsquedas y no saturar la base de datos (Supabase) con peticiones repetitivas, levantamos estructuras estáticas en memoria en formato de diccionarios. En JavaScript/TypeScript y Python, un diccionario te da búsquedas en tiempo constante **$O(1)$**, en lugar de recorrer listas que nos costarían un ineficiente **$O(N)$**.

*   `data/municipios_dict.json`: 
    *   **Estructura:** Mapeo de `Código Postal -> Nombre del Municipio`.
    *   **Propósito:** Evita tener que hacer JOINS costosos o consultar APIs geográficas secundarias para mostrar a qué municipio pertenece cada estación.
*   `data/stations_dict.json`:
    *   **Estructura:** Mapeo de `station_id -> Nombre de Marca/Rótulo` (ej. `"3": "REPSOL"`, `"6": "CEPSA"`).
    *   **Propósito:** Traduce IDs numéricos del endpoint público de estaciones de servicio a nombres legibles por humanos al instante en el mapa y la lista de resultados.
*   `data/valid_ids.json`:
    *   **Estructura:** Array plano con los IDs de las estaciones activas y validadas en el sistema.
    *   **Propósito:** Actúa como filtro rápido (whitelist) en el backend y el script de predicción para ignorar estaciones en desuso o registros basura.

---

## 3. Algoritmo de Precios Inteligentes (Smart Prices)

Un error de amateur es recomendar ir a la estación más barata basándose **únicamente** en el precio de pizarra. Si tenés que conducir 15 kilómetros y perder 40 minutos en tráfico para ahorrarte 2 centavos por litro, estás perdiendo plata.

Por eso, diseñamos una fórmula de coste de oportunidad real:

### Lógica Principal: Costo de Viaje + Costo de Tiempo
Si el usuario tiene un coche configurado en su garaje con un consumo promedio mayor a 0:

$$\text{Gasto Total} = (\text{Precio Predicho} \times \text{Litros a Repostar}) + \text{Coste de Combustible de Viaje} + \text{Coste del Tiempo}$$

Donde:
*   `consumo_km` = $\frac{\text{consumo\_l\_100km}}{100}$ (Litros consumidos por cada kilómetro recorrido).
*   `LITROS_REPOSTAJE_ESTIMADO` = $35\text{ L}$ (Una carga parcial estándar realista).
*   `costeCombustibleViaje` = $\text{distancia} \times 2 \times \text{Precio Predicho} \times \text{consumo\_km}$ (Calcula el consumo de ida y vuelta).
*   `tiempoViajeHoras` = $\frac{\text{distancia} \times 2}{\text{VELOCIDAD\_MEDIA\_KMH}}$ (Asume $35\text{ km/h}$ de velocidad urbana/mixta).
*   `costeTiempo` = $\text{tiempoViajeHoras} \times \text{VALOR\_TIEMPO\_HORA}$ (Asigna un costo de oportunidad de $12\text{ \euro{}/hora}$ al tiempo del usuario).

El sistema ordena de menor a mayor y selecciona la estación que minimiza el **Gasto Total Real**.

### Algoritmo de Fallback (Normalización Ponderada)
Si el usuario no tiene cargado un vehículo o su consumo es $0$, aplicamos una normalización Min-Max para combinar distancia y precio en un score del $0$ al $1$:

1.  Calculamos el score de distancia normalizado (`dScore`) del $0$ al $1$.
2.  Calculamos el score de precio normalizado (`pScore`) con un margen de tolerancia de $0.03\text{ \euro{}}$ para evitar que centavos irrelevantes sesguen el resultado.
3.  **Fórmula:** $\text{Score Final} = (dScore \times 0.7) + (pScore \times 0.3)$

El peso del **70% a la cercanía** y **30% al precio predicho** garantiza que el sistema recomiende algo físicamente cercano pero con buen precio.

### Código de Selección Inteligente (`src/components/SmartPrediction.tsx`)
Aquí podés ver cómo implementamos ambos flujos (Filtro avanzado vs Fallback normalizado) en React:

```typescript
const handleReveal = async () => {
  setLoading(true)
  setIsOpen(true)
  
  // Solo predecir para las estaciones que están en el radio/zona actual
  const stationIds = filteredStations.map(s => s.idEstacion)
  const predictions = await fetchPredictions(selectedFuelTypeId, stationIds)

  const predKey = selectedFuelTypeId === 9 ? 'predicted_95' : 
                  selectedFuelTypeId === 12 ? 'predicted_98' : 
                  'predicted_diesel';

  if (predictions && predictions.length > 0) {
    const selectedCar = userCars.find(c => c.id === selectedCarId)
    let best = null

    if (selectedCar && selectedCar.consumo_l_100km > 0) {
      // Advanced Smart Filter: Based on REAL COST (Fuel + Time)
      const consumo_km = selectedCar.consumo_l_100km / 100
      const LITROS_REPOSTAJE_ESTIMADO = 35 // Un tanque parcial más realista
      const VALOR_TIEMPO_HORA = 12 // €/hora (costo de oportunidad)
      const VELOCIDAD_MEDIA_KMH = 35 // km/h (estimación urbana/mixta)

      const scored = predictions.map(p => {
        const stationInFiltered = filteredStations.find(s => s.idEstacion === p.station_id)
        const dist = stationInFiltered?.distancia || 0
        const predictedPrice = p[predKey] || 9.99

        // Coste de combustible (ir y volver)
        const costeCombustibleViaje = dist * 2 * predictedPrice * consumo_km
        // Coste de tiempo (estimado)
        const tiempoViajeHoras = (dist * 2) / VELOCIDAD_MEDIA_KMH
        const costeTiempo = tiempoViajeHoras * VALOR_TIEMPO_HORA
        
        // Gasto Total = Precio del combustible + Gasto de viaje + Coste de tiempo
        const gastoTotal = (predictedPrice * LITROS_REPOSTAJE_ESTIMADO) + costeCombustibleViaje + costeTiempo
        
        return { prediction: p, score: gastoTotal }
      })

      scored.sort((a, b) => a.score - b.score)
      best = scored[0].prediction
    } else {
      // Fallback to basic smart normalization with HEAVY distance weight
      const predictionsWithDistance = predictions.map(p => {
        const stationInFiltered = filteredStations.find(s => s.idEstacion === p.station_id)
        const dist = stationInFiltered?.distancia || 0
        const predictedPrice = p[predKey] || 9.99
        return { prediction: p, dist, price: predictedPrice }
      })

      const distances = predictionsWithDistance.map(item => item.dist)
      const prices = predictionsWithDistance.map(item => item.price)

      const minDist = Math.min(...distances)
      const maxDist = Math.max(...distances)
      const minPrice = Math.min(...prices)
      const maxPrice = Math.max(...prices)

      const norm = (val: number, min: number, max: number, margin = 0) => {
        const range = max - min
        if (range <= margin) return 0
        return (val - min) / range
      }

      const scored = predictionsWithDistance.map(item => {
        // Le damos 70% de peso a la distancia y 30% al precio predicho
        const dScore = norm(item.dist, minDist, maxDist)
        // Usamos un margen de 0.03€ para que variaciones pequeñas no disparen el score
        const pScore = norm(item.price, minPrice, maxPrice, 0.03)
        const score = dScore * 0.7 + pScore * 0.3
        
        return { prediction: item.prediction, score }
      })

      scored.sort((a, b) => a.score - b.score)
      best = scored[0].prediction
    }

    setBestStation(best)
    
    // ... integración subsiguiente con la API de Gemini
  }
}
```

---

## 4. Prompt de la IA Generativa (Gemini 2.5 Flash)

Para darle esa "chispa" moderna e interactiva, usamos la API de **Gemini** (modelo `gemini-2.5-flash` con la versión de API `v1beta`) que procesa la estación ganadora y devuelve un consejo amigable.

### Código de Integración con Gemini (`src/services/gemini.ts`)
Acá tenés el código de integración completo, incluyendo cómo se pasa el modelo, cómo inyectamos el contexto de tu vehículo si está cargado y la lógica de reintentos para no quedarnos colgados si la API falla:

```typescript
import { GoogleGenerativeAI } from "@google/generative-ai";

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

// El constructor solo acepta la API KEY
const genAI = API_KEY ? new GoogleGenerativeAI(API_KEY) : null;

export const getGeminiAdvice = async (
  poblacion: string, 
  precioActual: number, 
  precioPrediccion: number,
  estacionNombre: string,
  estacionDireccion: string,
  carModel?: string,
  carConsumo?: number
): Promise<string> => {
  if (!genAI) {
    console.error('❌ [Gemini] VITE_GEMINI_API_KEY no configurada en el .env');
    return "Configurá tu API Key para recibir consejos.";
  }

  // Le pasamos la versión de la API aquí, que es donde el SDK lo permite
  const model = genAI.getGenerativeModel(
    { model: "gemini-2.5-flash" },
    { apiVersion: 'v1beta' }
  );

  const formatPrice = (val: any) => {
    const num = parseFloat(val) || 0;
    return num.toFixed(3).replace('.', ',');
  };

  let carInfoContext = "";
  if (carModel && carConsumo) {
    carInfoContext = `- Vehículo del usuario: ${carModel} (Consumo promedio: ${carConsumo.toFixed(1).replace('.', ',')} L/100km)\n`;
  }

  const prompt = `Actua como un experto en ahorro de combustible. 
  Contexto:
  - Población: ${poblacion}
  - Precio promedio actual en la zona: ${formatPrice(precioActual)}€/L
  - Precio predicho para la semana próxima: ${formatPrice(precioPrediccion)}€/L
  - Estación RECOMENDADA hoy: ${estacionNombre} ubicada en ${estacionDireccion}.
  ${carInfoContext}

  Escribe un único consejo muy corto, amigable y directo. Menciona la estación recomendada si es una buena opción para ahorrar incluye precios de hoy y predichos y la estación recomendada en el consejo gracioso. Si se proporciona el vehículo del usuario, haz una alusión ingeniosa a su consumo promedio o estima de forma divertida cuánto va a ahorrar con ese ${carModel || 'coche'}. Máximo 35 palabras.`;

  const MAX_RETRIES = 3;
  let attempt = 0;

  while (attempt < MAX_RETRIES) {
    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      return text.trim() || "¡Ahorrá combustible hoy mismo!";
    } catch (error: any) {
      attempt++;
      console.warn(`⚠️ [Gemini] Intento ${attempt} fallido:`, error.message);

      if (attempt >= MAX_RETRIES) {
        return "La API está saturada, pero te recomendamos la estación mencionada arriba.";
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  return "Error al obtener consejo.";
};
```

*   **¿Por qué funciona bien?** Limita rígidamente la respuesta a **35 palabras**. Esto mantiene la UI limpia y evita respuestas larguísimas que nadie va a leer en un teléfono.
*   **Personalización:** Si el usuario tiene coche en su garaje (ej. *Ford Focus con 6,5 L/100km*), Gemini calcula dinámicamente chistes o alusiones específicas a ese consumo.

---

## 5. Apartado de Mejoras Particulares (Roadmap Técnico)

Si queremos llevar esto a nivel MVP Premium, hermano, hay que ponerse a laburar en estas tres mejoras clave. Acá te dejo el plano de arquitectura para implementarlas bien:

### A. Autenticación y Login en la Base de Datos
Actualmente, necesitamos persistir de forma segura qué coches pertenecen a qué usuario.
*   **Tecnología recomendada:** Supabase Auth (OAuth con Google o Login con Email/Password clásico).
*   **Paso a paso técnico:**
    1.  Integrar el provider de autenticación de Supabase en React (`@supabase/auth-ui-react` o directamente con `supabase.auth.signInWithPassword`).
    2.  Configurar **Políticas de Seguridad a Nivel de Fila (RLS)** en Supabase. La regla de oro es: *"Los usuarios solo pueden leer y escribir sus propios registros"*.
    ```sql
    alter table cars enable row level security;
    
    create policy "Usuarios pueden ver sus propios coches" 
    on cars for select 
    using (auth.uid() = user_id);
    
    create policy "Usuarios pueden añadir sus propios coches" 
    on cars for insert 
    with check (auth.uid() = user_id);
    ```

### B. Guardar Uso del Garaje (Trazabilidad de la Tabla de Coches)
Para auditar y sincronizar los coches del usuario en el garaje mediante peticiones HTTP estructuradas (`POST`, `GET`, `PUT`, `DELETE`).
*   **En el Backend (API / Supabase):**
    *   Crear la tabla `cars` con columnas: `id` (uuid), `user_id` (uuid, fk a auth.users), `make` (text), `model` (text), `consumo_l_100km` (numeric), `created_at` (timestamp).
*   **En el Frontend (React + Zustand):**
    *   `GET /rest/v1/cars` (al iniciar sesión, para poblar el garaje).
    *   `POST /rest/v1/cars` (cuando el usuario agrega un coche).
    *   `DELETE /rest/v1/cars?id=eq.ID_DEL_COCHE` (para borrarlo).
*   **Ejemplo de llamada Fetch:**
    ```typescript
    export const saveCar = async (carData: Omit<Car, 'id'>) => {
      const { data, error } = await supabase
        .from('cars')
        .insert([carData])
        .select()
      if (error) throw error
      return data[0]
    }
    ```

### C. Trazar Ruta en el Mapa e Integración con Google Maps
Mejorar la experiencia de navegación para que el usuario no se pierda al ir a la gasolinera seleccionada.

1.  **Trazado de Ruta Interno (React-Leaflet):**
    *   Usar la librería `leaflet-routing-machine` (o su wrapper de React si existe, o instanciarla directamente en el mapa Leaflet mediante un wrapper useEffect).
    *   Toma la geolocalización actual del usuario (`userLocation: [lat, lng]`) y las coordenadas de la gasolinera destino (`station: [lat, lng]`), calculando y dibujando la polilínea óptima en el mapa de forma nativa.
2.  **Botón "Abrir en Google Maps" (Navegación Externa):**
    *   Para dar una alternativa de navegación paso a paso con GPS real.
    *   Se construye un enlace universal usando la API de URLs de Google Maps:
    ```typescript
    const openInGoogleMaps = (lat: number, lng: number) => {
      const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
      window.open(url, '_blank');
    };
    ```
    *   Esto funciona tanto en computadoras de escritorio como en celulares, abriendo la app nativa de Google Maps directamente con la ruta ya trazada.

---

¿Se entiende el plano de arquitectura? Es así de fácil cuando las bases están bien diseñadas. ¡Dale, ponete a codear esto que va a quedar una locura cósmica!
