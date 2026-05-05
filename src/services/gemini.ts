
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent`;

export const getGeminiAdvice = async (poblacion: string, precioActual: number, precioPrediccion: number): Promise<string> => {
  const formatPrice = (val: any) => {
    const num = parseFloat(val) || 0;
    return num.toFixed(2).replace('.', ',');
  };

  const prompt = `Actua como un experto en ahorro fr combustible. El precio promedio de hoy en ${poblacion} es ${formatPrice(precioActual)}€ y mi modelo predice que la semana que viene sera ${formatPrice(precioPrediccion)}€. Escribe un único consejo, corto y amigable para el usuario de nuestra app recomendable que hora. Máximo 30 palabras`;

  try {
    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: prompt
          }]
        }]
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini API Error: ${response.status}`);
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "¡Ahorrá combustible hoy mismo!";
  } catch (error) {
    console.error('[Gemini Service Error]', error);
    return "Error al obtener consejo del experto.";
  }
};
