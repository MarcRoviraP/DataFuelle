import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://msetjsrlioiysxmgybdg.supabase.co';
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!ANON_KEY) {
  console.error('❌ CRÍTICO: VITE_SUPABASE_ANON_KEY no encontrada. El frontend no podrá conectar con Supabase. Verificá tus variables de entorno en Netlify.');
} else if (!ANON_KEY.startsWith('sb_publishable_')) {
  console.warn('⚠️ ADVERTENCIA: La clave ANON no parece ser una Publishable Key moderna (debe empezar con sb_publishable_).');
}

export const supabase = createClient(SUPABASE_URL, ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // Disable the browser lock manager to avoid "Lock was released because another request stole it"
    // which is common in Chromium browsers when multiple parallel requests occur during refresh.
    // lockType is a runtime option not yet exposed in the TS types of this version.
    ...(({ lockType: 'null' } as any))
  }
});

// Helper for existing logic that might use the manual fetch
// but now using the client's session if available
export const supabaseFetch = async (query: string) => {
  // Instead of awaiting getSession() which can trigger parallel refreshes,
  // we try to use the auth state more safely.
  const { data: { session } } = await supabase.auth.getSession();
  
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${query}`, {
    headers: {
      'apikey': ANON_KEY,
      'Authorization': session ? `Bearer ${session.access_token}` : `Bearer ${ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    }
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[Supabase Error] ${response.status}:`, errorBody);
    throw new Error(`Supabase fetch failed: ${response.status}`);
  }

  return response.json();
};
