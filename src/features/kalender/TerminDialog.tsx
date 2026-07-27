import { useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import type { Termin } from '../../lib/types'
import { heuteIso } from '../../lib/datum'
import { useToast } from '../../components/Toast'
import { useAuth } from '../auth/useAuth'
import { useStammdaten } from '../stammdaten/StammdatenProvider'

/** Dialog zum Anlegen und Bearbeiten einer Deadline. */
export default function TerminDialog({
  termin,
  vorgabeDatum,
  onSchliessen,
  onGespeichert,
}: {
  /** null = neuer Termin */
  termin: Termin | null
  vorgabeDatum?: string
  onSchliessen: () => void
  onGespeichert: () => void
}) {
  const { session } = useAuth()
  const { aktiveProjekte, projektLabel } = useStammdaten()
  const toast = useToast()

  const start = useMemo(
    () => ({
      titel: termin?.titel ?? '',
      datum: termin?.datum ?? vorgabeDatum ?? heuteIso(),
      projektId: termin?.projekt_id ?? '',
      beschreibung: termin?.beschreibung ?? '',
      erledigt: termin?.erledigt ?? false,
    }),
    [termin, vorgabeDatum],
  )

  const [titel, setTitel] = useState(start.titel)
  const [datum, setDatum] = useState(start.datum)
  const [projektId, setProjektId] = useState(start.projektId)
  const [beschreibung, setBeschreibung] = useState(start.beschreibung)
  const [erledigt, setErledigt] = useState(start.erledigt)
  const [speichert, setSpeichert] = useState(false)

  const veraendert =
    titel.trim() !== start.titel.trim() ||
    datum !== start.datum ||
    projektId !== start.projektId ||
    beschreibung.trim() !== start.beschreibung.trim() ||
    erledigt !== start.erledigt

  const speicherbar = titel.trim().length > 0 && (termin ? veraendert : true)

  async function speichern(e: FormEvent) {
    e.preventDefault()
    if (!session) return
    setSpeichert(true)

    const felder = {
      titel: titel.trim(),
      datum,
      projekt_id: projektId || null,
      beschreibung: beschreibung.trim() || null,
      erledigt,
    }

    const { error } = termin
      ? await supabase.from('termine').update(felder).eq('id', termin.id)
      : await supabase
          .from('termine')
          .insert({ ...felder, erstellt_von: session.user.id })

    setSpeichert(false)
    if (error) {
      toast('Speichern fehlgeschlagen.', 'fehler')
      return
    }
    toast(termin ? 'Deadline geändert.' : 'Deadline angelegt.')
    onGespeichert()
    onSchliessen()
  }

  async function loeschen() {
    if (!termin) return
    if (!confirm('Diese Deadline löschen?')) return
    await supabase.from('termine').delete().eq('id', termin.id)
    toast('Deadline gelöscht.')
    onGespeichert()
    onSchliessen()
  }

  return (
    <div className="modal-hintergrund" onClick={onSchliessen}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={speichern}>
        <h2>{termin ? 'Deadline bearbeiten' : 'Neue Deadline'}</h2>

        <label>
          Titel
          <input
            value={titel}
            onChange={(e) => setTitel(e.target.value)}
            placeholder="z. B. Entwürfe an Kunde schicken"
            autoFocus
            required
          />
        </label>

        <label>
          Datum
          <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} />
        </label>

        <label>
          Projekt (optional)
          <select value={projektId} onChange={(e) => setProjektId(e.target.value)}>
            <option value="">— ohne Projekt —</option>
            {aktiveProjekte.map((p) => (
              <option key={p.id} value={p.id}>
                {projektLabel(p.id)}
              </option>
            ))}
          </select>
        </label>

        <label>
          Notiz
          <input value={beschreibung} onChange={(e) => setBeschreibung(e.target.value)} />
        </label>

        <label className="checkbox-inline">
          <input
            type="checkbox"
            checked={erledigt}
            onChange={(e) => setErledigt(e.target.checked)}
          />
          Erledigt
        </label>

        <div className="modal-aktionen">
          {termin ? (
            <button type="button" className="btn-ghost danger" onClick={loeschen}>
              Löschen
            </button>
          ) : (
            <span />
          )}
          <div className="modal-rechts">
            <button type="button" className="btn-ghost" onClick={onSchliessen}>
              Abbrechen
            </button>
            <button
              className="btn-primary"
              type="submit"
              disabled={speichert || !speicherbar}
              title={!speicherbar ? 'Es wurde nichts geändert' : undefined}
            >
              {speichert ? 'Speichert…' : 'Speichern'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
