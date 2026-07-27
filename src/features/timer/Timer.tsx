import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { LaufendeZeit } from '../../lib/types'
import { formatDatum, formatDauer, parseDauerZuMinuten } from '../../lib/format'
import { isoDatum, uhrzeit } from '../../lib/datum'
import { pruefeBuchung } from '../../lib/pruefung'
import { useToast } from '../../components/Toast'
import { useAuth } from '../auth/useAuth'
import { useStammdaten } from '../stammdaten/StammdatenProvider'

/** Ab hier weist die Leiste sichtbar darauf hin, dass die Uhr lange läuft. */
export const WARNGRENZE_MINUTEN = 6 * 60

/**
 * Ab hier gehen wir von einer vergessenen Uhr aus: Beim Öffnen der App
 * erscheint dann von selbst die Nachfrage. Gebucht wird trotzdem nie
 * automatisch – eine falsche Buchung ohne Zutun wäre schlimmer als eine
 * offene Uhr.
 */
const NACHFRAGE_GRENZE_MINUTEN = 10 * 60

function stoppuhrAnzeige(sekunden: number): string {
  const h = Math.floor(sekunden / 3600)
  const m = Math.floor((sekunden % 3600) / 60)
  const s = sekunden % 60
  const zwei = (n: number) => String(n).padStart(2, '0')
  return `${zwei(h)}:${zwei(m)}:${zwei(s)}`
}

export default function Timer({ onGebucht }: { onGebucht?: () => void }) {
  const { session } = useAuth()
  const {
    aktiveProjekte,
    projektLabel,
    saetze,
    satzVon,
    bezeichnungVon,
    istInternesProjekt,
  } = useStammdaten()
  const toast = useToast()

  const [laufend, setLaufend] = useState<LaufendeZeit | null>(null)
  const [geladen, setGeladen] = useState(false)
  const [jetzt, setJetzt] = useState(() => Date.now())

  // Eingaben für den Start
  const [projektId, setProjektId] = useState('')
  const [taetigkeit, setTaetigkeit] = useState('')
  const [beschreibung, setBeschreibung] = useState('')

  // Stopp-Dialog
  const [dialog, setDialog] = useState<null | {
    minuten: number
    start: string
    ende: string
  }>(null)
  const [dialogDauer, setDialogDauer] = useState('')
  const [dialogProjekt, setDialogProjekt] = useState('')
  const [dialogTaetigkeit, setDialogTaetigkeit] = useState('')
  const [dialogText, setDialogText] = useState('')
  const [speichert, setSpeichert] = useState(false)
  // Verhindert, dass die Nachfrage bei jedem Neuladen der Daten erneut aufgeht.
  const nachgefragt = useRef(false)

  const uid = session?.user.id

  const laden = useCallback(async () => {
    if (!uid) return
    const { data } = await supabase
      .from('laufende_zeiten')
      .select('*')
      .eq('gesellschafter_id', uid)
      .maybeSingle()
    setLaufend((data as LaufendeZeit) ?? null)
    setGeladen(true)
  }, [uid])

  useEffect(() => {
    laden()
  }, [laden])

  // Sekundentakt nur, solange die Uhr läuft.
  const tickRef = useRef<number | null>(null)
  useEffect(() => {
    if (!laufend) {
      if (tickRef.current) window.clearInterval(tickRef.current)
      return
    }
    setJetzt(Date.now())
    tickRef.current = window.setInterval(() => setJetzt(Date.now()), 1000)
    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current)
    }
  }, [laufend])

  // Kommt der Rechner aus dem Ruhezustand, kann die Uhr veraltet sein.
  useEffect(() => {
    function beiRueckkehr() {
      if (document.visibilityState === 'visible') laden()
    }
    document.addEventListener('visibilitychange', beiRueckkehr)
    return () => document.removeEventListener('visibilitychange', beiRueckkehr)
  }, [laden])

  /**
   * Projektwechsel: Bei einem internen Kunden ist "Internes" der sinnvolle
   * Vorschlag. Eine bewusst abweichende Auswahl bleibt möglich.
   */
  function projektGewaehlt(neu: string, setzeTaetigkeit: (t: string) => void) {
    if (istInternesProjekt(neu)) setzeTaetigkeit('intern')
  }

  async function starten() {
    if (!uid) return
    const { error } = await supabase.from('laufende_zeiten').insert({
      gesellschafter_id: uid,
      projekt_id: projektId || null,
      taetigkeit: taetigkeit || null,
      beschreibung: beschreibung.trim() || null,
    })
    if (error) {
      toast('Die Uhr konnte nicht gestartet werden.', 'fehler')
      return
    }
    setBeschreibung('')
    laden()
  }

  const stoppenVorbereiten = useCallback(() => {
    if (!laufend) return
    const start = new Date(laufend.gestartet_am)
    const ende = new Date()
    const minuten = Math.max(1, Math.round((ende.getTime() - start.getTime()) / 60000))
    setDialog({ minuten, start: laufend.gestartet_am, ende: ende.toISOString() })
    setDialogDauer(`${Math.floor(minuten / 60)}:${String(minuten % 60).padStart(2, '0')}`)
    setDialogProjekt(laufend.projekt_id ?? '')
    setDialogTaetigkeit(laufend.taetigkeit ?? '')
    setDialogText(laufend.beschreibung ?? '')
  }, [laufend])

  // Läuft die Uhr beim Öffnen schon ungewöhnlich lange, wurde vermutlich das
  // Stoppen vergessen. Dann einmal von selbst nachfragen.
  useEffect(() => {
    if (!laufend || nachgefragt.current) return
    const minuten = (Date.now() - new Date(laufend.gestartet_am).getTime()) / 60000
    if (minuten > NACHFRAGE_GRENZE_MINUTEN) {
      nachgefragt.current = true
      stoppenVorbereiten()
    }
  }, [laufend, stoppenVorbereiten])

  async function buchen() {
    if (!uid || !dialog) return
    const minuten = parseDauerZuMinuten(dialogDauer)
    if (minuten === null || minuten <= 0) {
      toast('Dauer bitte als "1:30" oder "1,5" angeben.', 'fehler')
      return
    }
    setSpeichert(true)
    const { error } = await supabase.from('arbeitszeiten').insert({
      gesellschafter_id: uid,
      projekt_id: dialogProjekt || null,
      datum: isoDatum(new Date(dialog.start)),
      dauer_minuten: minuten,
      beschreibung: dialogText.trim() || null,
      start_zeit: dialog.start,
      end_zeit: dialog.ende,
      taetigkeit: dialogTaetigkeit || null,
      // Satz bewusst kopieren: spätere Satzänderungen sollen alte Buchungen
      // nicht rückwirkend verändern.
      stundensatz: satzVon(dialogTaetigkeit),
    })
    if (error) {
      setSpeichert(false)
      toast('Der Eintrag konnte nicht gespeichert werden.', 'fehler')
      return
    }
    await supabase.from('laufende_zeiten').delete().eq('gesellschafter_id', uid)
    setSpeichert(false)
    setDialog(null)
    setLaufend(null)
    toast(`${formatDauer(minuten)} erfasst.`)
    onGebucht?.()
  }

  async function verwerfen() {
    if (!uid) return
    if (!confirm('Die laufende Zeit verwerfen? Sie wird nicht gespeichert.')) return
    await supabase.from('laufende_zeiten').delete().eq('gesellschafter_id', uid)
    setDialog(null)
    setLaufend(null)
    toast('Verworfen.')
  }

  if (!geladen) return null

  const sekunden = laufend
    ? Math.max(0, Math.floor((jetzt - new Date(laufend.gestartet_am).getTime()) / 1000))
    : 0
  const laeuftLange = sekunden / 60 > WARNGRENZE_MINUTEN

  // Über Mitternacht wird auf den Starttag gebucht – das ist gewollt, aber
  // sonst nicht ersichtlich.
  const ueberMitternacht =
    dialog !== null && isoDatum(new Date(dialog.start)) !== isoDatum(new Date(dialog.ende))

  const dialogMinuten = parseDauerZuMinuten(dialogDauer)
  const dialogHinweis =
    dialogMinuten !== null && dialogMinuten > 0
      ? pruefeBuchung(dialogMinuten, dialog ? isoDatum(new Date(dialog.start)) : '')
      : null

  return (
    <>
      <div
        className={
          laufend ? `timer-bar aktiv${laeuftLange ? ' warnung' : ''}` : 'timer-bar'
        }
      >
        {laufend ? (
          <>
            <span className="timer-punkt" aria-hidden="true" />
            <span className="timer-uhr">{stoppuhrAnzeige(sekunden)}</span>
            <span className="timer-info">
              {laeuftLange && (
                <strong className="timer-warntext">
                  Läuft seit {formatDauer(Math.floor(sekunden / 60))} – Stoppen vergessen?{' '}
                </strong>
              )}
              {projektLabel(laufend.projekt_id)}
              {laufend.taetigkeit ? ` · ${bezeichnungVon(laufend.taetigkeit)}` : ''}
              {laufend.beschreibung ? ` – ${laufend.beschreibung}` : ''}
            </span>
            <button className="btn-stop" onClick={stoppenVorbereiten}>
              ■ Stopp
            </button>
          </>
        ) : (
          <>
            <select
              className="timer-projekt"
              value={projektId}
              onChange={(e) => {
                setProjektId(e.target.value)
                projektGewaehlt(e.target.value, setTaetigkeit)
              }}
            >
              <option value="">— ohne Projekt —</option>
              {aktiveProjekte.map((p) => (
                <option key={p.id} value={p.id}>
                  {projektLabel(p.id)}
                </option>
              ))}
            </select>
            <select
              className="timer-satz"
              value={taetigkeit}
              onChange={(e) => setTaetigkeit(e.target.value)}
              title="Stundensatz"
            >
              <option value="">— Tätigkeit —</option>
              {saetze.map((s) => (
                <option key={s.schluessel} value={s.schluessel}>
                  {s.bezeichnung} · {s.satz} €
                </option>
              ))}
            </select>
            <input
              className="timer-text"
              value={beschreibung}
              onChange={(e) => setBeschreibung(e.target.value)}
              placeholder="Woran arbeitest du? (optional)"
            />
            <button className="btn-start" onClick={starten}>
              ▶ Starten
            </button>
          </>
        )}
      </div>

      {dialog && (
        <div className="modal-hintergrund" onClick={() => setDialog(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Zeit erfassen</h2>

            {dialog.minuten > WARNGRENZE_MINUTEN && (
              <div className="hinweis-warnung">
                Die Uhr lief {formatDauer(dialog.minuten)} – gestartet am{' '}
                {formatDatum(isoDatum(new Date(dialog.start)))} um{' '}
                {uhrzeit(dialog.start)} Uhr. Wurde das Stoppen vergessen?
                Korrigiere die Dauer unten auf die tatsächlich gearbeitete Zeit.
              </div>
            )}

            {ueberMitternacht && (
              <div className="hinweis-info">
                Die Uhr lief über Mitternacht. Der Eintrag wird auf den Starttag
                ({formatDatum(isoDatum(new Date(dialog.start)))}) gebucht.
              </div>
            )}

            <label>
              Dauer
              <input
                value={dialogDauer}
                onChange={(e) => setDialogDauer(e.target.value)}
                placeholder="1:30"
              />
            </label>

            <label>
              Projekt
              <select
                value={dialogProjekt}
                onChange={(e) => {
                  setDialogProjekt(e.target.value)
                  projektGewaehlt(e.target.value, setDialogTaetigkeit)
                }}
              >
                <option value="">— ohne Projekt —</option>
                {aktiveProjekte.map((p) => (
                  <option key={p.id} value={p.id}>
                    {projektLabel(p.id)}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Tätigkeit / Stundensatz
              <select
                value={dialogTaetigkeit}
                onChange={(e) => setDialogTaetigkeit(e.target.value)}
              >
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
                value={dialogText}
                onChange={(e) => setDialogText(e.target.value)}
                placeholder="Woran wurde gearbeitet?"
              />
            </label>

            {dialogHinweis && <div className="hinweis-warnung">{dialogHinweis}</div>}

            <div className="modal-aktionen">
              <button className="btn-ghost danger" onClick={verwerfen}>
                Verwerfen
              </button>
              <div className="modal-rechts">
                <button className="btn-ghost" onClick={() => setDialog(null)}>
                  Weiterlaufen lassen
                </button>
                <button className="btn-primary" onClick={buchen} disabled={speichert}>
                  {speichert ? 'Speichert…' : dialogHinweis ? 'Trotzdem speichern' : 'Speichern'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
