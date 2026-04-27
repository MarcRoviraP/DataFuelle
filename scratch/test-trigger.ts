import { handler } from "../netlify/functions/sync-miteco-cron.ts";

// Mock de fetch global para atrapar la llamada
const mockFetch = async (url: string, options: any) => {
  console.log("🔍 [MOCK FETCH]");
  console.log("Target URL:", url);
  console.log("Options:", JSON.stringify(options, null, 2));
  return {
    status: 202,
    json: async () => ({ message: "Accepted (mock)" })
  };
};

// Reemplazamos el fetch global
globalThis.fetch = mockFetch as any;

// Ejecutamos el handler
async function test() {
  console.log("🚀 Iniciando test del cron...");
  const result = await handler({} as any, {} as any);
  console.log("🏁 Resultado del cron:", JSON.stringify(result, null, 2));
}

test();
