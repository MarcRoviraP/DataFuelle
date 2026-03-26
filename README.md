# ⛽ DataFuelle

DataFuelle es una aplicación web reactiva y moderna diseñada para consultar precios de combustible en tiempo real, optimizada para dispositivos móviles y con una interfaz premium.

## ✨ Características principales

- **📍 Mapa interactivo**: Visualización de gasolineras cercanas con colores dinámicos basados en el precio (Verde: Barato, Naranja: Medio, Rojo: Caro).
- **📋 Lista inteligente**: Listado ordenado de gasolineras con detalles completos y navegación fluida.
- **🕒 Alertas de actualización**: Indicador visual si los datos de una gasolinera tienen más de 12 horas de antigüedad.
- **💸 Gestión de descuentos**: Permite aplicar descuentos personalizados por litro para ver el precio final real.
- **🗺️ Integración con Google Maps**: Botón directo para iniciar la ruta a cualquier gasolinera elegida.
- **📱 Mobile First**: Diseño totalmente adaptado a pantallas táctiles con transiciones suaves entre vista de mapa y lista.

## 🚀 Tecnologías utilizadas

- **React 19** + **TypeScript**
- **Vite** para un desarrollo ultrarrápido.
- **Tailwind CSS 4** para un diseño moderno y fluido.
- **Leaflet** & **React Leaflet** para la gestión de mapas.
- **Zustand** para la gestión de estado global eficiente.
- **Lucide React** para iconografía elegante.

## 🛠️ Instalación y ejecución

1. Instalación de dependencias:
   ```bash
   npm install
   ```

2. Ejecución en modo desarrollo:
   ```bash
   npm run dev
   ```

3. Construcción para producción:
   ```bash
   npm run build
   ```

## 📂 Estructura del proyecto

- `src/components`: Componentes UI reutilizables (MapView, StationCard, Sidebar, etc.).
- `src/services`: Lógica de comunicación con la API de precios.
- `src/store`: Estado global con Zustand.
- `src/utils`: Utilidades de geolocalización, formateo de fechas y cálculos.

## 📝 Notas de desarrollo

Este proyecto utiliza un sistema de **Agent Context Logging** para mantener la trazabilidad de los cambios realizados por los asistentes de IA. Puedes consultar el historial en la carpeta `logs_md_agente`.
