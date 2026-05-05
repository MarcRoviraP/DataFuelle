import { GoogleGenerativeAI } from "@google/generative-ai";

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

// Inicializamos el SDK
const genAI = API_KEY ? new GoogleGenerativeAI(API_KEY, { apiVersion: 'v1beta' }) : null;

export const getGeminiAdvice = async (
  poblacion: string, 
  precioActual: number, 
  precioPrediccion: number,
  estacionNombre: string,
  estacionDireccion: string
): Promise<string> => {
  if (!genAI) {
    console.error('❌ [Gemini] VITE_GEMINI_API_KEY no configurada en el .env');
    return "Configurá tu API Key para recibir consejos.";
  }

  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const formatPrice = (val: any) => {
    const num = parseFloat(val) || 0;
    return num.toFixed(3).replace('.', ',');
  };

  const prompt = `Actua como un experto en ahorro de combustible. 
  Contexto:
  - Población: ${poblacion}
  - Precio promedio actual en la zona: ${formatPrice(precioActual)}€/L
  - Precio predicho para la semana próxima: ${formatPrice(precioPrediccion)}€/L
  - Estación RECOMENDADA hoy: ${estacionNombre} ubicada en ${estacionDireccion}.

  Escribe un único consejo muy corto, amigable y directo. Menciona la estación recomendada si es una buena opción para ahorrar incluye precios de hoy y predichos y la estación recomendada en el consejo gracioso. Máximo 30 palabras.`;

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
        // No mostramos el alert aquí para no interrumpir el flujo si es una carga automática, 
        // pero devolvemos un mensaje que el componente pueda manejar.
        return "La API está saturada, pero te recomendamos la estación mencionada arriba.";
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  return "Error al obtener consejo.";
};
