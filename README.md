# ⛽ DataFuelle

DataFuelle es una plataforma avanzada de análisis y consulta de precios de combustible en España. Diseñada con un enfoque **Mobile-First**, ofrece una experiencia premium para optimizar el gasto en carburante mediante algoritmos de ordenación inteligente y visualización de datos históricos.

![DataFuelle Banner](https://images.unsplash.com/photo-1545147986-a9d6f210df77?auto=format&fit=crop&q=80&w=1200&h=400)

## ✨ Características Principales

### 🧠 Ordenación Inteligente (Smart Sort)
A diferencia de otras apps que solo miran el precio, DataFuelle utiliza un algoritmo avanzado que calcula el **coste real de repostaje** considerando:
- Consumo específico de tu vehículo (L/100km).
- Distancia de ida y vuelta a la estación.
- Valor estimado del tiempo del usuario.
- Descuentos personalizados por estación.

### 📈 Análisis Histórico
Visualiza la evolución de precios de cada gasolinera mediante gráficos interactivos integrados.
- **DuckDB WASM**: Procesamiento de millones de registros directamente en el navegador.
- **Parquet Storage**: Almacenamiento eficiente de datos históricos para una carga ultrarrápida.

### 🚗 Garage Virtual
Gestiona tu flota de vehículos para que los cálculos de ahorro sean precisos.
- Guarda marca, modelo y consumo.
- Selecciona el vehículo activo para actualizar instantáneamente las recomendaciones.

### 🗺️ Mapa Térmico Dinámico
Identifica rápidamente las zonas más económicas mediante marcadores codificados por colores (Verde/Naranja/Rojo) basados en la distribución de precios actual del mercado.

## 💾 Arquitectura de Datos y Persistencia

DataFuelle utiliza una arquitectura **Stateless-by-Default** para maximizar la privacidad y evitar estados locales corruptos:

- **Modo Invitado**: Funcionamiento sin persistencia local. Al recargar, la app vuelve a su estado óptimo predeterminado.
- **Modo Usuario**: Sincronización bidireccional con **Supabase**. Tus preferencias, garage y historial de búsqueda te siguen en cualquier dispositivo.
- **Sincronización MITECO**: Funciones serverless en Netlify que mantienen la base de datos actualizada con los precios oficiales del Ministerio de Industria, Comercio y Turismo.

## 🚀 Tecnologías Utilizadas

### Frontend
- **React 19 + TypeScript**: Base sólida y tipada.
- **Zustand**: Gestión de estado global atómica y eficiente.
- **Tailwind CSS 4**: Estilado moderno con alto rendimiento.
- **Leaflet**: Motor de mapas interactivos.
- **Lucide React**: Iconografía consistente.

### Data & Backend
- **Supabase**: Backend-as-a-Service para Auth y PostgreSQL.
- **DuckDB WASM**: Motor analítico SQL en el cliente.
- **Netlify Functions**: Lógica serverless y tareas programadas (Cron jobs).
- **Parquet**: Formato de almacenamiento columnar para series temporales.

## 🛠️ Instalación y Desarrollo

1. **Clonar y preparar**:
   ```bash
   git clone <repo-url>
   cd datafuelle
   npm install
   ```

2. **Variables de Entorno**:
   Crea un archivo `.env` con las credenciales de Supabase:
   ```env
   VITE_SUPABASE_URL=tu_url
   VITE_SUPABASE_ANON_KEY=tu_key
   ```

3. **Lanzar en local**:
   ```bash
   npm run dev
   ```

## 📂 Estructura del Proyecto

```bash
├── netlify/functions   # Microservicios de sincronización y backend
├── src/
│   ├── components/     # UI Components (Atomic Design)
│   ├── services/       # Clientes de API, Supabase y DuckDB
│   ├── store/          # Zustand Store (AppState)
│   ├── utils/          # Lógica de cálculo geográfico y de precios
│   └── main.tsx        # Punto de entrada
└── public/             # Assets estáticos y Parquet files
```

---
Desarrollado con ❤️ para optimizar cada gota de combustible.
