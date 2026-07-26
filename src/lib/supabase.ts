import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

// Ist Supabase konfiguriert? Wenn nicht, zeigt die App einen Hinweis statt
// eines leeren Bildschirms.
export const isSupabaseConfigured = Boolean(url && anonKey)

// Fällt auf Platzhalter-Werte zurück, damit createClient nicht abstürzt, wenn
// die Umgebungsvariablen fehlen. Genutzt wird der Client dann ohnehin nicht.
export const supabase = createClient(
  url ?? 'https://placeholder.supabase.co',
  anonKey ?? 'placeholder-anon-key',
)
