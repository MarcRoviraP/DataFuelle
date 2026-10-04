/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly CARTO_MAPS_KEY?: string;
  readonly VITE_CARTO_MAPS_KEY?: string;
  readonly VITE_GEMINI_API_KEY?: string;
  readonly VITE_STADIA_API_KEY?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_SUPABASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.md?raw' {
  const content: string;
  export default content;
}
