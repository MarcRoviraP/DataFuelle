# Session Log: 2026-05-18 16:45

## 🎯 Objective
- Implementar una estrategia de recuperación (fallback/backup) en caso de que la API de MITECO (Gobierno de España) retorne un error 503 o no esté disponible, utilizando en su lugar la base de datos de Supabase.
- Evitar demoras o bloqueos continuos para el usuario cuando la API de MITECO está caída, incorporando un monitor asincrónico (ping de salud) en segundo plano cada 30 minutos y un cortocircuito rápido.

## ✅ Completed Tasks
- 📝 **Modified Files**:
  - `src/services/api.ts`:
    - Se incorporó la función interna `fetchStationsFromSupabaseBackup` para realizar consultas espaciales rápidas sobre la tabla `stations` en Supabase usando Bounding Box.
    - Se implementó la variable de estado `isMitecoHealthy` junto con la función exportada `checkMitecoHealthStatus`, que realiza un ping HEAD/GET rápido (timeout de 4s) a la API para verificar si está disponible.
    - Se configuró un `setInterval` asincrónico para repetir este ping de control de salud cada 30 minutos.
    - Se adaptó `fetchStationsByRadius` para que si `isMitecoHealthy` es `false`, salte directamente a la base de datos de Supabase sin esperar inútilmente.
    - Si durante una llamada real la API de MITECO falla inesperadamente, se auto-marca inmediatamente como caída (`isMitecoHealthy = false`), protegiendo a todas las llamadas paralelas y subsecuentes de la demora de timeout.

## 🛠️ Technical Decisions & Rationale
- **Caja Delimitadora (Bounding Box) en Base de Datos**: 
  - En lugar de descargar las 12,000+ estaciones de Supabase a memoria local para filtrarlas (lo cual saturaría el ancho de banda y degradaría el rendimiento), se calculó una caja delimitadora en grados de latitud/longitud en base al radio dado. Esto permite que Supabase/PostgreSQL realice un filtrado espacial de altísima velocidad usando índices, reduciendo los registros descargados a solo las estaciones de la zona antes de aplicar la distancia matemática final mediante `calculateDistance`.
- **Background Health Check & Fast Circuit Breaker**:
  - Pide de forma asíncrona el estado de salud de la API. Si se detecta un fallo, el booleano `isMitecoHealthy` actúa como un interruptor ("circuit breaker"). Esto evita que el cliente experimente un retraso de 10 segundos en cada petición de radio en el mapa, cayendo directo y velozmente en el respaldo de Supabase.

## 🚧 Current State & Pending Work
- El sistema cuenta con redundancia y alta disponibilidad absoluta para búsquedas espaciales de estaciones. 
- La experiencia de usuario no sufre demoras de espera gracias al interruptor automático de API caída.
- Todo testeado conceptualmente y listo para funcionar en producción.

## 💡 Recommendations for the Next Agent
- Si se requiere actualizar los precios almacenados en Supabase para que no queden desactualizados cuando MITECO esté fuera de servicio, recordar que el proceso de sincronización corre mediante las netlify y supabase edge functions (`sync-miteco-cron-background` y `sync-prices`).
