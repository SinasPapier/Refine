import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { Arbeitszeit } from '../../lib/types'
import { formatDauer, parseDauerZuMinuten } from '../../lib/format'
import { useToast } from '../../components/Toast'
import { useStammdaten } from '../stammdaten/StammdatenProvider'
import { minutenAlsText } from './ZeitDialog'

interface Teil {
  dauer: string
  taetigkeit: string
  beschreibung: string
}

/**
 * Zerlegt eine Buchung in mehrere Zeilen mit je eigener Tätigkeit.
 * Umsetzung: Der bestehende Eintrag wird auf den ersten Teil gekürzt, die
 * weiteren Teile werden als neue Einträge angelegt. Dadurch bleiben Kalender,
 * Abrechnung und Summen unverändert einfach.
 */
export default function AufteilenDialog({
  eintrag,
  onSchliessen,
  onGespeichert,
}: {
  eintrag: Arbeitszeit
  onSchliessen: () => void
  onGespeichert: () => void
}) {
  const { saetze, satzVon } = useStammdaten()
  const toast = useToast()

  const [teile, setTeile] = useState<Teil[]>(() => [
    {
      dauer: minutenAlsText(eintrag.dauer_minuten),
      taetigkeit: eintrag.taetigkeit ?? '',
      beschreibung: eintrag.beschreibung ?? '',
    },
    { dauer: '', taetigkeit: '', beschreibung: eintrag.beschreibung ?? '' },
  ])
  const [speichert, setSpeichert] = useState(false)

  function aendern(i: number, felder: Partial<Teil>) {
    setTeile((t) => t.map((teil, idx) => (idx === i ? { ...teil, ...felder } : teil)))
  }

  const minutenJeTeil = teile.map((t) => parseDauerZuMinuten(t.dauer) ?? 0)
  const summe = minutenJeTeil.reduce((s, m) => s + m, 0)
  const rest = eintrag.dauer_minuten - summe
  const passt = rest === 0 && minutenJeTeil.every((m) => m > 0)

  async function speichern() {
    if (!passt) return
    setSpeichert(true)

    // Erster Teil überschreibt den bestehenden Eintrag ...
    const [erster, ...weitere] = teile
    const { error: fehler1 } = await supabase
      .from('arbeitszeiten')
      .update({
        dauer_minuten: minutenJeTeil[0],
        taetigkeit: erster.taetigkeit || null,
        stundensatz: satzVon(erster.taetigkeit),
        beschreibung: erster.beschreibung.trim() || null,
      })
      .eq('id', eintrag.id)

    if (fehler1) {
      setSpeichert(false)
      toast('Aufteilen fehlgeschlagen.', 'fehler')
      return
    }

    // ... die übrigen werden als neue Einträge angelegt.
    const neue = weitere.map((t, i) => ({
      gesellschafter_id: eintrag.gesellschafter_id,
      projekt_id: eintrag.projekt_id,
      datum: eintrag.datum,
      dauer_minuten: minutenJeTeil[i + 1],
      taetigkeit: t.taetigkeit || null,
      stundensatz: satzVon(t.taetigkeit),
      beschreibung: t.beschreibung.trim() || null,
    }))

    const { error: fehler2 } = await supabase.from('arbeitszeiten').insert(neue)
    setSpeichert(false)
    if (fehler2) {
      toast('Die weiteren Teile konnten nicht angelegt werden.', 'fehler')
      return
    }

    toast(`In ${teile.length} Buchungen aufgeteilt.`)
    onGespeichert()
    onSchliessen()
  }

  return (
    <div className="modal-hintergrund" onClick={onSchliessen}>
      <div className="modal breit" onClick={(e) => e.stopPropagation()}>
        <h2>Buchung aufteilen</h2>
        <p className="muted small">
          Gesamtdauer {formatDauer(eintrag.dauer_minuten)} – verteile sie auf mehrere
          Tätigkeiten. Die Summe muss der ursprünglichen Dauer entsprechen.
        </p>

        {teile.map((t, i) => (
          <div className="teil-zeile" key={i}>
            <input
              className="teil-dauer"
              value={t.dauer}
              onChange={(e) => aendern(i, { dauer: e.target.value })}
              placeholder="1:30"
              aria-label={`Dauer Teil ${i + 1}`}
            />
            <select
              value={t.taetigkeit}
              onChange={(e) => aendern(i, { taetigkeit: e.target.value })}
              aria-label={`Tätigkeit Teil ${i + 1}`}
            >
              <option value="">— nicht zugeordnet —</option>
              {saetze.map((s) => (
                <option key={s.schluessel} value={s.schluessel}>
                  {s.bezeichnung} · {s.satz} €
                </option>
              ))}
            </select>
            <input
              value={t.beschreibung}
              onChange={(e) => aendern(i, { beschreibung: e.target.value })}
              placeholder="Beschreibung"
              aria-label={`Beschreibung Teil ${i + 1}`}
            />
            {teile.length > 2 && (
              <button
                className="btn-ghost small danger"
                onClick={() => setTeile((alt) => alt.filter((_, idx) => idx !== i))}
                aria-label="Teil entfernen"
              >
                ✕
              </button>
            )}
          </div>
        ))}

        <div className="teil-fuss">
          <button
            className="btn-ghost small"
            onClick={() =>
              setTeile((t) => [...t, { dauer: '', taetigkeit: '', beschreibung: '' }])
            }
          >
            + Weitere Zeile
          </button>
          <span className={rest === 0 ? 'rest ok' : 'rest offen'}>
            {rest === 0
              ? '✓ Summe stimmt'
              : rest > 0
                ? `noch ${formatDauer(rest)} zu verteilen`
                : `${formatDauer(-rest)} zu viel`}
          </span>
        </div>

        <div className="modal-aktionen">
          <span />
          <div className="modal-rechts">
            <button className="btn-ghost" onClick={onSchliessen}>
              Abbrechen
            </button>
            <button
              className="btn-primary"
              onClick={speichern}
              disabled={!passt || speichert}
              title={!passt ? 'Die Summe muss der ursprünglichen Dauer entsprechen' : undefined}
            >
              {speichert ? 'Teilt auf…' : 'Aufteilen'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
