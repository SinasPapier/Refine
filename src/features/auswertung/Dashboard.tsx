import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Arbeitszeit, LaufendeZeit, Termin } from '../../lib/types'
import { formatDauer } from '../../lib/format'
import { formatDatum } from '../../lib/format'
import { heuteIso, isoDatum } from '../../lib/datum'
import { useProfiles } from '../profile/ProfileProvider'
import { useStammdaten } from '../stammdaten/StammdatenProvider'

type Zeitraum = 'monat' | 'jahr' | 'alle'

export default function Dashboard() {
  const { profiles, nameVon, farbeVon } = useProfiles()
  const { kunden, kundeVonProjekt, projektLabel } = useStammdaten()
  const [zeiten, setZeiten] = useState<Arbeitszeit[]>([])
  const [laufende, setLaufende] = useState<LaufendeZeit[]>([])
  const [termine, setTermine] = useState<Termin[]>([])
  const [zeitraum, setZeitraum] = useState<Zeitraum>('monat')

  useEffect(() => {
    Promise.all([
      supabase.from('arbeitszeiten').select('*'),
      supabase.from('laufende_zeiten').select('*'),
      // Offene Deadlines ab heute, die nächsten zuerst.
      supabase
        .from('termine')
        .select('*')
        .eq('erledigt', false)
        .gte('datum', heuteIso())
        .order('datum')
        .limit(5),
    ]).then(([z, l, t]) => {
      setZeiten((z.data as Arbeitszeit[]) ?? [])
      setLaufende((l.data as LaufendeZeit[]) ?? [])
      setTermine((t.data as Termin[]) ?? [])
    })
  }, [])

  const gefiltert = useMemo(() => {
    if (zeitraum === 'alle') return zeiten
    const jetzt = new Date()
    const grenze =
      zeitraum === 'monat'
        ? new Date(jetzt.getFullYear(), jetzt.getMonth(), 1)
        : new Date(jetzt.getFullYear(), 0, 1)
    const grenzeIso = isoDatum(grenze)
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
      const key = kundeVonProjekt(z.projekt_id)?.id ?? '—'
      map.set(key, (map.get(key) ?? 0) + z.dauer_minuten)
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [gefiltert, kundeVonProjekt])

  function kundeName(id: string): string {
    if (id === '—') return 'Ohne Projekt/Kunde'
    return kunden.find((k) => k.id === id)?.name ?? 'Unbekannt'
  }

  return (
    <div>
      <h1>Übersicht</h1>

      {laufende.length > 0 && (
        <div className="laeuft-gerade">
          {laufende.map((l) => (
            <span key={l.gesellschafter_id} className="laeuft-chip">
              <span className="puls" style={{ background: farbeVon(l.gesellschafter_id) }} />
              {nameVon(l.gesellschafter_id)} arbeitet gerade
            </span>
          ))}
        </div>
      )}

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
          <div className="kpi-value">{kunden.filter((k) => !k.archiviert).length}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Gesellschafter</div>
          <div className="kpi-value">{profiles.length}</div>
        </div>
      </div>

      {termine.length > 0 && (
        <div className="card">
          <h2>Nächste Deadlines</h2>
          <ul className="deadline-liste">
            {termine.map((t) => (
              <li key={t.id}>
                <span className="deadline-datum">{formatDatum(t.datum)}</span>
                <span className="deadline-titel">{t.titel}</span>
                <span className="muted small">
                  {t.projekt_id ? projektLabel(t.projekt_id) : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="dash-grid">
        <div className="card">
          <h2>Stunden pro Person</h2>
          {proPerson.length === 0 ? (
            <p className="muted">Keine Daten.</p>
          ) : (
            <BalkenListe
              rows={proPerson.map(([id, min]) => ({
                label: nameVon(id),
                minuten: min,
                farbe: farbeVon(id),
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
  rows: { label: string; minuten: number; farbe?: string }[]
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
              style={{
                width: max > 0 ? `${(r.minuten / max) * 100}%` : '0%',
                background: r.farbe,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}
