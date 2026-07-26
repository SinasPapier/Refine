import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import type { Arbeitszeit, Kunde, Projekt } from '../../lib/types'
import { useToast } from '../../components/Toast'
import { formatDatum, formatDauer, parseDauerZuMinuten } from '../../lib/format'
import { useProfiles, nameVon } from '../profile/useProfiles'

export default function Zeiten({ session }: { session: Session }) {
  const toast = useToast()
  const { profiles } = useProfiles()
  const [zeiten, setZeiten] = useState<Arbeitszeit[]>([])
  const [projekte, setProjekte] = useState<Projekt[]>([])
  const [kunden, setKunden] = useState<Kunde[]>([])

  // Formular
  const [datum, setDatum] = useState(() => new Date().toISOString().slice(0, 10))
  const [dauer, setDauer] = useState('')
  const [projektId, setProjektId] = useState('')
  const [beschreibung, setBeschreibung] = useState('')

  // Filter
  const [filterPerson, setFilterPerson] = useState('')
  const [filterProjekt, setFilterProjekt] = useState('')
  const [filterVon, setFilterVon] = useState('')
  const [filterBis, setFilterBis] = useState('')

  async function lade() {
    const [{ data: z }, { data: p }, { data: k }] = await Promise.all([
      supabase.from('arbeitszeiten').select('*').order('datum', { ascending: false }),
      supabase.from('projekte').select('*').order('name'),
      supabase.from('kunden').select('*').order('name'),
    ])
    setZeiten((z as Arbeitszeit[]) ?? [])
    setProjekte((p as Projekt[]) ?? [])
    setKunden((k as Kunde[]) ?? [])
  }

  useEffect(() => {
    lade()
  }, [])

  function projektLabel(id: string | null): string {
    if (!id) return '—'
    const proj = projekte.find((p) => p.id === id)
    if (!proj) return '—'
    const kunde = kunden.find((c) => c.id === proj.kunde_id)
    return kunde ? `${kunde.name} · ${proj.name}` : proj.name
  }

  async function speichere(e: FormEvent) {
    e.preventDefault()
    const minuten = parseDauerZuMinuten(dauer)
    if (minuten === null) {
      toast('Dauer bitte als "1:30" oder "1,5" eingeben.', 'fehler')
      return
    }
    const { error } = await supabase.from('arbeitszeiten').insert({
      gesellschafter_id: session.user.id,
      datum,
      dauer_minuten: minuten,
      projekt_id: projektId || null,
      beschreibung: beschreibung.trim() || null,
    })
    if (error) {
      toast('Eintrag konnte nicht gespeichert werden.', 'fehler')
      return
    }
    toast('Zeit erfasst.')
    setDauer('')
    setBeschreibung('')
    lade()
  }

  async function loesche(id: string) {
    if (!confirm('Diesen Zeiteintrag löschen?')) return
    await supabase.from('arbeitszeiten').delete().eq('id', id)
    lade()
  }

  const gefiltert = useMemo(() => {
    return zeiten.filter((z) => {
      if (filterPerson && z.gesellschafter_id !== filterPerson) return false
      if (filterProjekt && z.projekt_id !== filterProjekt) return false
      if (filterVon && z.datum < filterVon) return false
      if (filterBis && z.datum > filterBis) return false
      return true
    })
  }, [zeiten, filterPerson, filterProjekt, filterVon, filterBis])

  const summe = gefiltert.reduce((s, z) => s + z.dauer_minuten, 0)

  return (
    <div>
      <h1>Arbeitszeiten</h1>

      <div className="card">
        <h2>Zeit erfassen</h2>
        <form className="form-grid" onSubmit={speichere}>
          <label>
            Datum
            <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
          </label>
          <label>
            Dauer (z.&nbsp;B. 1:30 oder 1,5)
            <input
              value={dauer}
              onChange={(e) => setDauer(e.target.value)}
              placeholder="1:30"
              required
            />
          </label>
          <label>
            Projekt
            <select value={projektId} onChange={(e) => setProjektId(e.target.value)}>
              <option value="">— ohne Projekt —</option>
              {projekte.map((p) => (
                <option key={p.id} value={p.id}>
                  {projektLabel(p.id)}
                </option>
              ))}
            </select>
          </label>
          <label className="wide">
            Beschreibung
            <input
              value={beschreibung}
              onChange={(e) => setBeschreibung(e.target.value)}
              placeholder="Woran wurde gearbeitet?"
            />
          </label>
          <div className="form-actions">
            <button className="btn-primary" type="submit">
              Erfassen
            </button>
          </div>
        </form>
      </div>

      <div className="card">
        <h2>Einträge</h2>
        <div className="filter-row">
          <label>
            Person
            <select value={filterPerson} onChange={(e) => setFilterPerson(e.target.value)}>
              <option value="">Alle</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name || p.email}
                </option>
              ))}
            </select>
          </label>
          <label>
            Projekt
            <select value={filterProjekt} onChange={(e) => setFilterProjekt(e.target.value)}>
              <option value="">Alle</option>
              {projekte.map((p) => (
                <option key={p.id} value={p.id}>
                  {projektLabel(p.id)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Von
            <input type="date" value={filterVon} onChange={(e) => setFilterVon(e.target.value)} />
          </label>
          <label>
            Bis
            <input type="date" value={filterBis} onChange={(e) => setFilterBis(e.target.value)} />
          </label>
        </div>

        <div className="summe-zeile">
          Summe: <strong>{formatDauer(summe)}</strong> ({gefiltert.length} Einträge)
        </div>

        {gefiltert.length === 0 ? (
          <p className="muted">Keine Einträge im gewählten Filter.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Person</th>
                  <th>Projekt</th>
                  <th>Beschreibung</th>
                  <th>Dauer</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {gefiltert.map((z) => (
                  <tr key={z.id}>
                    <td>{formatDatum(z.datum)}</td>
                    <td>{nameVon(profiles, z.gesellschafter_id)}</td>
                    <td>{projektLabel(z.projekt_id)}</td>
                    <td>{z.beschreibung ?? '—'}</td>
                    <td>{formatDauer(z.dauer_minuten)}</td>
                    <td>
                      {z.gesellschafter_id === session.user.id && (
                        <button
                          className="btn-ghost small danger"
                          onClick={() => loesche(z.id)}
                        >
                          Löschen
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
