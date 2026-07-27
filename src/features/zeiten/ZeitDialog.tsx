import { useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import type { Arbeitszeit } from '../../lib/types'
import { formatDauer, parseDauerZuMinuten } from '../../lib/format'
import { heuteIso } from '../../lib/datum'
import { useToast } from '../../components/Toast'
import { useAuth } from '../auth/useAuth'
import { useStammdaten } from '../stammdaten/StammdatenProvider'

/**
 * Dialog zum Anlegen und Bearbeiten eines Zeiteintrags.
 * Wird von der Zeitenliste und vom Kalender genutzt.
 */
export default function ZeitDialog({
  eintrag,
  vorgabeDatum,
  onSchliessen,
  onGespeichert,
}: {
  /** null = neuer Eintrag */
  eintrag: Arbeitszeit | null
  vorgabeDatum?: string
  onSchliessen: () => void
  onGespeichert: () => void
}) {
  const { session } = useAuth()
  const { aktiveProjekte, projektLabel } = useStammdaten()
  const toast = useToast()

  const [datum, setDatum] = useState(eintrag?.datum ?? vorgabeDatum ?? heuteIso())
  const [dauer, setDauer] = useState(() => {
    if (!eintrag) return ''
    const m = eintrag.dauer_minuten
    return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
  })
  const [projektId, setProjektId] = useState(eintrag?.projekt_id ?? '')
  const [beschreibung, setBeschreibung] = useState(eintrag?.beschreibung ?? '')
  const [speichert, setSpeichert] = useState(false)

  // Ein bereits archiviertes Projekt soll beim Bearbeiten sichtbar bleiben.
  const projektFehlt =
    projektId !== '' && !aktiveProjekte.some((p) => p.id === projektId)

  async function speichern(e: FormEvent) {
    e.preventDefault()
    if (!session) return
    const minuten = parseDauerZuMinuten(dauer)
    if (minuten === null || minuten <= 0) {
      toast('Dauer bitte als "1:30" oder "1,5" angeben.', 'fehler')
      return
    }

    setSpeichert(true)
    const felder = {
      datum,
      dauer_minuten: minuten,
      projekt_id: projektId || null,
      beschreibung: beschreibung.trim() || null,
    }

    const { error } = eintrag
      ? await supabase.from('arbeitszeiten').update(felder).eq('id', eintrag.id)
      : await supabase
          .from('arbeitszeiten')
          .insert({ ...felder, gesellschafter_id: session.user.id })

    setSpeichert(false)
    if (error) {
      toast('Speichern fehlgeschlagen.', 'fehler')
      return
    }
    toast(eintrag ? 'Eintrag geändert.' : `${formatDauer(minuten)} erfasst.`)
    onGespeichert()
    onSchliessen()
  }

  return (
    <div className="modal-hintergrund" onClick={onSchliessen}>
      <form
        className="modal"
        onClick={(e) => e.stopPropagation()}
        onSubmit={speichern}
      >
        <h2>{eintrag ? 'Eintrag bearbeiten' : 'Zeit erfassen'}</h2>

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
            autoFocus
            required
          />
        </label>

        <label>
          Projekt
          <select value={projektId} onChange={(e) => setProjektId(e.target.value)}>
            <option value="">— ohne Projekt —</option>
            {projektFehlt && (
              <option value={projektId}>{projektLabel(projektId)} (archiviert)</option>
            )}
            {aktiveProjekte.map((p) => (
              <option key={p.id} value={p.id}>
                {projektLabel(p.id)}
              </option>
            ))}
          </select>
        </label>

        <label>
          Beschreibung
          <input
            value={beschreibung}
            onChange={(e) => setBeschreibung(e.target.value)}
            placeholder="Woran wurde gearbeitet?"
          />
        </label>

        <div className="modal-aktionen">
          <span />
          <div className="modal-rechts">
            <button type="button" className="btn-ghost" onClick={onSchliessen}>
              Abbrechen
            </button>
            <button className="btn-primary" type="submit" disabled={speichert}>
              {speichert ? 'Speichert…' : 'Speichern'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
