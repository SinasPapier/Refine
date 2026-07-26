// Zentrale Typdefinitionen, passend zum Datenbankschema (supabase/schema.sql).

export interface Profile {
  id: string
  name: string
  email: string | null
  stundensatz: number | null
  farbe: string | null
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
  created_at: string
}

export interface Projekt {
  id: string
  kunde_id: string | null
  name: string
  beschreibung: string | null
  status: string
  created_at: string
}

export interface Arbeitszeit {
  id: string
  gesellschafter_id: string
  projekt_id: string | null
  datum: string
  dauer_minuten: number
  beschreibung: string | null
  created_at: string
}

export interface Zustaendigkeit {
  id: string
  titel: string
  beschreibung: string | null
  gesellschafter_id: string | null
  status: string
  created_at: string
}

export type NummernTyp = 'kunde' | 'rechnung' | 'angebot'

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
