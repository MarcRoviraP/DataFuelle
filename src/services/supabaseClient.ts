import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://msetjsrlioiysxmgybdg.supabase.co';
const ANON_KEY = 'sb_publishable_Jm-Y3PtxgJ-PLSblcwfYNg_pH82Zy7E';

export const supabase = createClient(SUPABASE_URL, ANON_KEY);

// Helper for existing logic that might use the manual fetch
// but now using the client's session if available
export const supabaseFetch = async (query: string) => {
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
    throw new Error('Supabase fetch failed');
  }

  return response.json();
};
