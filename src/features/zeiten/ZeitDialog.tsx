import { useMemo, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import type { Arbeitszeit } from '../../lib/types'
import { formatDauer, parseDauerZuMinuten } from '../../lib/format'
import { heuteIso } from '../../lib/datum'
import { pruefeBuchung } from '../../lib/pruefung'
import { useToast } from '../../components/Toast'
import { useAuth } from '../auth/useAuth'
import { useStammdaten } from '../stammdaten/StammdatenProvider'

/** Minuten -> "1:30" für die Eingabefelder. */
export function minutenAlsText(m: number): string {
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
}

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
  const {
    aktiveKunden,
    projekteVonKunde,
    projektLabel,
    kundeVonProjekt,
    saetze,
    satzVon,
    istInternesProjekt,
  } = useStammdaten()
  const toast = useToast()

  // Ausgangszustand merken, damit "Speichern" erst bei echten Änderungen greift.
  const start = useMemo(
    () => ({
      datum: eintrag?.datum ?? vorgabeDatum ?? heuteIso(),
      dauer: eintrag ? minutenAlsText(eintrag.dauer_minuten) : '',
      projektId: eintrag?.projekt_id ?? '',
      taetigkeit: eintrag?.taetigkeit ?? '',
      beschreibung: eintrag?.beschreibung ?? '',
    }),
    [eintrag, vorgabeDatum],
  )

  const [datum, setDatum] = useState(start.datum)
  const [dauer, setDauer] = useState(start.dauer)
  // Kunde wird aus dem Projekt abgeleitet; die Auswahl läuft dann kaskadiert.
  const [kundeId, setKundeId] = useState(
    () => kundeVonProjekt(start.projektId || null)?.id ?? '',
  )
  const [projektId, setProjektId] = useState(start.projektId)
  const [taetigkeit, setTaetigkeit] = useState(start.taetigkeit)
  const [beschreibung, setBeschreibung] = useState(start.beschreibung)
  const [speichert, setSpeichert] = useState(false)

  const projekteDesKunden = kundeId ? projekteVonKunde(kundeId) : []
  // Ein bereits archiviertes Projekt soll beim Bearbeiten sichtbar bleiben.
  const projektFehlt =
    projektId !== '' && !projekteDesKunden.some((p) => p.id === projektId)

  const veraendert =
    datum !== start.datum ||
    dauer.trim() !== start.dauer.trim() ||
    projektId !== start.projektId ||
    taetigkeit !== start.taetigkeit ||
    beschreibung.trim() !== start.beschreibung.trim()

  // Bei neuen Einträgen zählt eine ausgefüllte Dauer als Änderung.
  const speicherbar = eintrag ? veraendert : dauer.trim().length > 0

  // Hinweis auf unplausible Eingaben – blockiert nicht, macht aber aufmerksam.
  const geparst = parseDauerZuMinuten(dauer)
  const hinweis = geparst !== null && geparst > 0 ? pruefeBuchung(geparst, datum) : null

  function kundeWechseln(neu: string) {
    setKundeId(neu)
    setProjektId('')
    if (aktiveKunden.find((k) => k.id === neu)?.intern) setTaetigkeit('intern')
  }

  function projektWechseln(neu: string) {
    setProjektId(neu)
    if (istInternesProjekt(neu)) setTaetigkeit('intern')
  }

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
      taetigkeit: taetigkeit || null,
      stundensatz: satzVon(taetigkeit),
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

  async function loeschen() {
    if (!eintrag) return
    if (!confirm('Diesen Zeiteintrag löschen?')) return
    await supabase.from('arbeitszeiten').delete().eq('id', eintrag.id)
    toast('Eintrag gelöscht.')
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
          Kunde
          <select value={kundeId} onChange={(e) => kundeWechseln(e.target.value)}>
            <option value="">— ohne Kunde —</option>
            {aktiveKunden.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Projekt
          <select
            value={projektId}
            onChange={(e) => projektWechseln(e.target.value)}
            disabled={!kundeId}
          >
            <option value="">— ohne Projekt —</option>
            {projektFehlt && (
              <option value={projektId}>{projektLabel(projektId)} (archiviert)</option>
            )}
            {projekteDesKunden.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Tätigkeit / Stundensatz
          <select value={taetigkeit} onChange={(e) => setTaetigkeit(e.target.value)}>
            <option value="">— nicht zugeordnet —</option>
            {saetze.map((s) => (
              <option key={s.schluessel} value={s.schluessel}>
                {s.bezeichnung} · {s.satz} €/Std
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

        {hinweis && <div className="hinweis-warnung">{hinweis}</div>}

        <div className="modal-aktionen">
          {eintrag ? (
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
              {speichert ? 'Speichert…' : hinweis ? 'Trotzdem speichern' : 'Speichern'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
