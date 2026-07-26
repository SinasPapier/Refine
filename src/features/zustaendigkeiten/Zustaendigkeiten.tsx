import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import type { Zustaendigkeit } from '../../lib/types'
import { useToast } from '../../components/Toast'
import { useProfiles, nameVon } from '../profile/useProfiles'

export default function Zustaendigkeiten() {
  const toast = useToast()
  const { profiles } = useProfiles()
  const [liste, setListe] = useState<Zustaendigkeit[]>([])

  const [titel, setTitel] = useState('')
  const [beschreibung, setBeschreibung] = useState('')
  const [personId, setPersonId] = useState('')

  async function lade() {
    const { data } = await supabase
      .from('zustaendigkeiten')
      .select('*')
      .order('created_at', { ascending: false })
    setListe((data as Zustaendigkeit[]) ?? [])
  }

  useEffect(() => {
    lade()
  }, [])

  async function neu(e: FormEvent) {
    e.preventDefault()
    if (!titel.trim()) return
    const { error } = await supabase.from('zustaendigkeiten').insert({
      titel: titel.trim(),
      beschreibung: beschreibung.trim() || null,
      gesellschafter_id: personId || null,
    })
    if (error) {
      toast('Konnte nicht gespeichert werden.', 'fehler')
      return
    }
    toast('Zuständigkeit angelegt.')
    setTitel('')
    setBeschreibung('')
    setPersonId('')
    lade()
  }

  async function setzeStatus(z: Zustaendigkeit) {
    const neuStatus = z.status === 'offen' ? 'erledigt' : 'offen'
    await supabase.from('zustaendigkeiten').update({ status: neuStatus }).eq('id', z.id)
    lade()
  }

  async function setzePerson(id: string, personId: string) {
    await supabase
      .from('zustaendigkeiten')
      .update({ gesellschafter_id: personId || null })
      .eq('id', id)
    lade()
  }

  async function loesche(id: string) {
    if (!confirm('Diese Zuständigkeit löschen?')) return
    await supabase.from('zustaendigkeiten').delete().eq('id', id)
    lade()
  }

  return (
    <div>
      <h1>Zuständigkeiten</h1>
      <p className="muted">Wer ist wofür verantwortlich?</p>

      <div className="card">
        <h2>Neue Zuständigkeit</h2>
        <form className="form-grid" onSubmit={neu}>
          <label>
            Bereich / Aufgabe*
            <input value={titel} onChange={(e) => setTitel(e.target.value)} required />
          </label>
          <label>
            Verantwortlich
            <select value={personId} onChange={(e) => setPersonId(e.target.value)}>
              <option value="">— niemand —</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name || p.email}
                </option>
              ))}
            </select>
          </label>
          <label className="wide">
            Beschreibung
            <input value={beschreibung} onChange={(e) => setBeschreibung(e.target.value)} />
          </label>
          <div className="form-actions">
            <button className="btn-primary" type="submit">
              Anlegen
            </button>
          </div>
        </form>
      </div>

      {liste.length === 0 ? (
        <p className="muted">Noch keine Zuständigkeiten.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Bereich / Aufgabe</th>
                <th>Beschreibung</th>
                <th>Verantwortlich</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {liste.map((z) => (
                <tr key={z.id}>
                  <td>{z.titel}</td>
                  <td>{z.beschreibung ?? '—'}</td>
                  <td>
                    <select
                      className="mini"
                      value={z.gesellschafter_id ?? ''}
                      onChange={(e) => setzePerson(z.id, e.target.value)}
                      title={nameVon(profiles, z.gesellschafter_id)}
                    >
                      <option value="">— niemand —</option>
                      {profiles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name || p.email}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <button
                      className={z.status === 'erledigt' ? 'badge badge-ok' : 'badge badge-offen'}
                      onClick={() => setzeStatus(z)}
                    >
                      {z.status === 'erledigt' ? 'erledigt' : 'offen'}
                    </button>
                  </td>
                  <td>
                    <button className="btn-ghost small danger" onClick={() => loesche(z.id)}>
                      Löschen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
