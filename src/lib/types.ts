// Zentrale Typdefinitionen, passend zum Datenbankschema (supabase/schema.sql).

export interface Profile {
  id: string
  name: string
  email: string | null
  stundensatz: number | null
  farbe: string | null
  status_text: string | null
  status_gesetzt_am: string | null
  ist_admin: boolean
  created_at: string
}

export interface Kunde {
  id: string
  kundennummer: string | null
  name: string
  ansprechpartner: string | null
  email: string | null
  telefon: string | null
  adresse: string | null
  notiz: string | null
  intern: boolean
  archiviert: boolean
  created_at: string
}

export interface Projekt {
  id: string
  kunde_id: string | null
  name: string
  beschreibung: string | null
  status: string
  archiviert: boolean
  created_at: string
}

export interface Arbeitszeit {
  id: string
  gesellschafter_id: string
  projekt_id: string | null
  datum: string
  dauer_minuten: number
  beschreibung: string | null
  start_zeit: string | null
  end_zeit: string | null
  /** Schlüssel des Stundensatzes, z. B. "beratung". */
  taetigkeit: string | null
  /** Satz zum Zeitpunkt der Buchung – bewusst kopiert, nicht nachgeschlagen. */
  stundensatz: number | null
  created_at: string
}

/** Laufende Stoppuhr – pro Person höchstens eine. */
export interface LaufendeZeit {
  gesellschafter_id: string
  projekt_id: string | null
  beschreibung: string | null
  taetigkeit: string | null
  gestartet_am: string
}

/** Einheitlicher Stundensatz je Tätigkeit. */
export interface Stundensatz {
  schluessel: string
  bezeichnung: string
  satz: number
  sortierung: number
}

/** Deadline im Kalender. */
export interface Termin {
  id: string
  titel: string
  datum: string
  projekt_id: string | null
  beschreibung: string | null
  erledigt: boolean
  erstellt_von: string | null
  created_at: string
}

export type NummernTyp = 'kunde' | 'rechnung' | 'angebot'

/** Feste Anzeigereihenfolge – ohne sie bestimmt die Datenbank die Sortierung
 *  und geänderte Zeilen springen ans Ende. */
export const NUMMERN_REIHENFOLGE: NummernTyp[] = ['kunde', 'rechnung', 'angebot']

export interface Nummernkreis {
  typ: NummernTyp
  praefix: string
  mit_jahr: boolean
  reset_pro_jahr: boolean
  jahr: number
  zaehler: number
  stellen: number
}

export interface NummernLog {
  id: string
  typ: NummernTyp
  nummer: string
  erzeugt_von: string | null
  erzeugt_am: string
  notiz: string | null
}

/** Auswahlfarben für die Gesellschafter (Kalender, Auswertungen). */
export const FARBEN = [
  '#4f46e5', // Indigo
  '#0284c7', // Blau
  '#0891b2', // Türkis
  '#059669', // Grün
  '#4d7c0f', // Oliv
  '#ca8a04', // Gelb
  '#ea580c', // Orange
  '#dc2626', // Rot
  '#db2777', // Pink
  '#7c3aed', // Violett
] as const

export const STANDARD_FARBE = FARBEN[0]
