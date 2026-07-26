import { createClient } from '@supabase/supabase-js'

// Werte trimmen: Nicht gesetzte GitHub-Variablen liefern beim Build einen
// LEEREN String ("") – nicht undefined. Daher hier über die Länge prüfen und
// nicht mit `??` (das greift nur bei null/undefined).
const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim()
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim()

// Ist Supabase konfiguriert? Wenn nicht, zeigt die App einen Hinweis statt
// eines leeren Bildschirms.
export const isSupabaseConfigured = url.length > 0 && anonKey.length > 0

// Nur mit echten Werten verbinden. Sonst Platzhalter, damit createClient nicht
// mit leerem String abstürzt ("supabaseUrl is required"). Der Client wird bei
// fehlender Konfiguration ohnehin nicht genutzt.
export const supabase = createClient(
  isSupabaseConfigured ? url : 'https://placeholder.supabase.co',
  isSupabaseConfigured ? anonKey : 'placeholder-anon-key',
)
