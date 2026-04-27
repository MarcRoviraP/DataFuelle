/**
 * Función Cron (Programada)
 * Actúa como un disparador (trigger) para la función de fondo.
 * Netlify Scheduled Functions tienen un límite de tiempo corto, 
 * por lo que delegamos el trabajo pesado a una Background Function.
 */
export const handler = async (event: any) => {
  console.log("⏰ [Cron] Triggering MITECO sync...");

  // URL del sitio (proporcionada por Netlify en producción)
  const siteUrl = process.env.URL || "http://localhost:8888";
  const backgroundFunctionUrl = `${siteUrl}/.netlify/functions/sync-miteco-background`;

  try {
    console.log(`📡 [Cron] Calling background function: ${backgroundFunctionUrl}`);
    
    // Llamada asíncrona (POST). No esperamos a que termine el procesamiento.
    // fetch es nativo en Node 18+
    const response = await fetch(backgroundFunctionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "DataFuelle-Cron-Trigger"
      },
      body: JSON.stringify({ triggered_at: new Date().toISOString() })
    });

    console.log(`✅ [Cron] Trigger successful. Status: ${response.status}`);

    return {
      statusCode: 200,
      body: JSON.stringify({ 
        message: "Sync triggered successfully",
        status: response.status 
      }),
    };
  } catch (error) {
    console.error("❌ [Cron] Error triggering background function:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to trigger sync" }),
    };
  }
};
