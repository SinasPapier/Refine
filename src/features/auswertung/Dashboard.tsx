import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Arbeitszeit, Kunde, Projekt } from '../../lib/types'
import { formatDauer } from '../../lib/format'
import { useProfiles, nameVon } from '../profile/useProfiles'

type Zeitraum = 'monat' | 'jahr' | 'alle'

export default function Dashboard() {
  const { profiles } = useProfiles()
  const [zeiten, setZeiten] = useState<Arbeitszeit[]>([])
  const [projekte, setProjekte] = useState<Projekt[]>([])
  const [kunden, setKunden] = useState<Kunde[]>([])
  const [zeitraum, setZeitraum] = useState<Zeitraum>('monat')

  useEffect(() => {
    Promise.all([
      supabase.from('arbeitszeiten').select('*'),
      supabase.from('projekte').select('*'),
      supabase.from('kunden').select('*'),
    ]).then(([z, p, k]) => {
      setZeiten((z.data as Arbeitszeit[]) ?? [])
      setProjekte((p.data as Projekt[]) ?? [])
      setKunden((k.data as Kunde[]) ?? [])
    })
  }, [])

  const gefiltert = useMemo(() => {
    if (zeitraum === 'alle') return zeiten
    const jetzt = new Date()
    const grenze =
      zeitraum === 'monat'
        ? new Date(jetzt.getFullYear(), jetzt.getMonth(), 1)
        : new Date(jetzt.getFullYear(), 0, 1)
    const grenzeIso = grenze.toISOString().slice(0, 10)
    return zeiten.filter((z) => z.datum >= grenzeIso)
  }, [zeiten, zeitraum])

  const gesamt = gefiltert.reduce((s, z) => s + z.dauer_minuten, 0)

  const proPerson = useMemo(() => {
    const map = new Map<string, number>()
    for (const z of gefiltert) {
      map.set(z.gesellschafter_id, (map.get(z.gesellschafter_id) ?? 0) + z.dauer_minuten)
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [gefiltert])

  const proKunde = useMemo(() => {
    const map = new Map<string, number>()
    for (const z of gefiltert) {
      const proj = projekte.find((p) => p.id === z.projekt_id)
      const kundeId = proj?.kunde_id ?? null
      const key = kundeId ?? '—'
      map.set(key, (map.get(key) ?? 0) + z.dauer_minuten)
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [gefiltert, projekte])

  function kundeName(id: string): string {
    if (id === '—') return 'Ohne Projekt/Kunde'
    return kunden.find((k) => k.id === id)?.name ?? 'Unbekannt'
  }

  return (
    <div>
      <h1>Übersicht</h1>

      <div className="segmented">
        {(['monat', 'jahr', 'alle'] as Zeitraum[]).map((z) => (
          <button
            key={z}
            className={zeitraum === z ? 'seg active' : 'seg'}
            onClick={() => setZeitraum(z)}
          >
            {z === 'monat' ? 'Dieser Monat' : z === 'jahr' ? 'Dieses Jahr' : 'Gesamt'}
          </button>
        ))}
      </div>

      <div className="kpi-row">
        <div className="kpi">
          <div className="kpi-label">Erfasste Zeit</div>
          <div className="kpi-value">{formatDauer(gesamt)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Einträge</div>
          <div className="kpi-value">{gefiltert.length}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Kunden</div>
          <div className="kpi-value">{kunden.length}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Gesellschafter</div>
          <div className="kpi-value">{profiles.length}</div>
        </div>
      </div>

      <div className="dash-grid">
        <div className="card">
          <h2>Stunden pro Person</h2>
          {proPerson.length === 0 ? (
            <p className="muted">Keine Daten.</p>
          ) : (
            <BalkenListe
              rows={proPerson.map(([id, min]) => ({
                label: nameVon(profiles, id),
                minuten: min,
              }))}
              max={gesamt}
            />
          )}
        </div>

        <div className="card">
          <h2>Stunden pro Kunde</h2>
          {proKunde.length === 0 ? (
            <p className="muted">Keine Daten.</p>
          ) : (
            <BalkenListe
              rows={proKunde.map(([id, min]) => ({ label: kundeName(id), minuten: min }))}
              max={gesamt}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function BalkenListe({
  rows,
  max,
}: {
  rows: { label: string; minuten: number }[]
  max: number
}) {
  return (
    <ul className="balken-liste">
      {rows.map((r, i) => (
        <li key={i}>
          <div className="balken-kopf">
            <span>{r.label}</span>
            <strong>{formatDauer(r.minuten)}</strong>
          </div>
          <div className="balken-track">
            <div
              className="balken-fill"
              style={{ width: max > 0 ? `${(r.minuten / max) * 100}%` : '0%' }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}
