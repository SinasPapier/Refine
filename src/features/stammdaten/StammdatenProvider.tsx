import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { supabase } from '../../lib/supabase'
import type { Kunde, Projekt, Stundensatz } from '../../lib/types'
import { useAuth } from '../auth/useAuth'

interface StammdatenState {
  kunden: Kunde[]
  projekte: Projekt[]
  /** Nur nicht archivierte – für Auswahllisten. */
  aktiveKunden: Kunde[]
  aktiveProjekte: Projekt[]
  laden: boolean
  neuLaden: () => Promise<void>
  /** "Musterfirma · Website" */
  projektLabel: (projektId: string | null) => string
  /** Nur der Projektname – für enge Stellen wie die Monatsansicht. */
  projektName: (projektId: string | null) => string
  kundeVonProjekt: (projektId: string | null) => Kunde | null
  /** Die drei einheitlichen Stundensätze, nach Sortierung. */
  saetze: Stundensatz[]
  /** Satz zu einem Schlüssel, z. B. "beratung" -> 80. */
  satzVon: (schluessel: string | null) => number | null
  bezeichnungVon: (schluessel: string | null) => string
  /** Gehört das Projekt zu einem internen Kunden? */
  istInternesProjekt: (projektId: string | null) => boolean
}

const leer: StammdatenState = {
  kunden: [],
  projekte: [],
  aktiveKunden: [],
  aktiveProjekte: [],
  laden: true,
  neuLaden: async () => {},
  projektLabel: () => '—',
  projektName: () => '—',
  kundeVonProjekt: () => null,
  saetze: [],
  satzVon: () => null,
  bezeichnungVon: () => '—',
  istInternesProjekt: () => false,
}

const StammdatenContext = createContext<StammdatenState>(leer)

export function useStammdaten() {
  return useContext(StammdatenContext)
}

export function StammdatenProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const [kunden, setKunden] = useState<Kunde[]>([])
  const [projekte, setProjekte] = useState<Projekt[]>([])
  const [saetze, setSaetze] = useState<Stundensatz[]>([])
  const [laden, setLaden] = useState(true)

  const neuLaden = useCallback(async () => {
    const [{ data: k }, { data: p }, { data: s }] = await Promise.all([
      supabase.from('kunden').select('*').order('name'),
      supabase.from('projekte').select('*').order('name'),
      supabase.from('stundensaetze').select('*').order('sortierung'),
    ])
    setKunden((k as Kunde[]) ?? [])
    setProjekte((p as Projekt[]) ?? [])
    setSaetze((s as Stundensatz[]) ?? [])
    setLaden(false)
  }, [])

  useEffect(() => {
    if (!session) {
      setKunden([])
      setProjekte([])
      setSaetze([])
      setLaden(false)
      return
    }
    neuLaden()
  }, [session, neuLaden])

  const wert = useMemo<StammdatenState>(() => {
    const kundeVonProjekt = (projektId: string | null) => {
      if (!projektId) return null
      const proj = projekte.find((p) => p.id === projektId)
      if (!proj) return null
      return kunden.find((k) => k.id === proj.kunde_id) ?? null
    }

    const projektLabel = (projektId: string | null) => {
      if (!projektId) return '—'
      const proj = projekte.find((p) => p.id === projektId)
      if (!proj) return '—'
      const kunde = kundeVonProjekt(projektId)
      return kunde ? `${kunde.name} · ${proj.name}` : proj.name
    }

    const projektName = (projektId: string | null) => {
      if (!projektId) return 'ohne Projekt'
      return projekte.find((p) => p.id === projektId)?.name ?? 'ohne Projekt'
    }

    // Projekte archivierter Kunden gehören ebenfalls nicht mehr in die Auswahl.
    const aktiveKunden = kunden.filter((k) => !k.archiviert)
    const aktiveProjekte = projekte.filter(
      (p) => !p.archiviert && aktiveKunden.some((k) => k.id === p.kunde_id),
    )

    const satzVon = (schluessel: string | null) => {
      if (!schluessel) return null
      return saetze.find((s) => s.schluessel === schluessel)?.satz ?? null
    }

    const bezeichnungVon = (schluessel: string | null) => {
      if (!schluessel) return 'nicht zugeordnet'
      return saetze.find((s) => s.schluessel === schluessel)?.bezeichnung ?? schluessel
    }

    const istInternesProjekt = (projektId: string | null) =>
      kundeVonProjekt(projektId)?.intern ?? false

    return {
      kunden,
      projekte,
      aktiveKunden,
      aktiveProjekte,
      laden,
      neuLaden,
      projektLabel,
      projektName,
      kundeVonProjekt,
      saetze,
      satzVon,
      bezeichnungVon,
      istInternesProjekt,
    }
  }, [kunden, projekte, saetze, laden, neuLaden])

  return (
    <StammdatenContext.Provider value={wert}>{children}</StammdatenContext.Provider>
  )
}
