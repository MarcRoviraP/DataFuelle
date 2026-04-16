const SUPABASE_URL = 'https://msetjsrlioiysxmgybdg.supabase.co';
const ANON_KEY = 'sb_publishable_Jm-Y3PtxgJ-PLSblcwfYNg_pH82Zy7E';

export const supabaseFetch = async (query: string) => {
  const url = `${SUPABASE_URL}/rest/v1/${query}`;
  const response = await fetch(url, {
    headers: {
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${ANON_KEY}`,
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
