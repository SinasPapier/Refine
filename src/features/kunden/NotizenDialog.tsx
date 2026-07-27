import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import type { Kunde, Projekt, ProjektNotiz } from '../../lib/types'
import { formatZeitstempel } from '../../lib/format'
import { useToast } from '../../components/Toast'
import { useAuth } from '../auth/useAuth'
import { useProfiles } from '../profile/ProfileProvider'
import { projektNummer } from './ProjekteDialog'

/**
 * Notizen zu einem Projekt – Absprachen, Zwischenstände, Hinweise fürs Team.
 *
 * Bewusst einzelne Einträge statt eines gemeinsamen Textfelds: Ein Textfeld
 * kann nur eine Farbe tragen, und zwei Leute würden sich gegenseitig den Text
 * überschreiben. So steht jede Notiz in der Farbe ihres Verfassers und trägt
 * dessen Namen.
 */
export default function NotizenDialog({
  projekt,
  kunde,
  onSchliessen,
  onGeaendert,
}: {
  projekt: Projekt
  kunde: Kunde
  onSchliessen: () => void
  onGeaendert: () => void
}) {
  const toast = useToast()
  const { session } = useAuth()
  const { nameVon, farbeVon } = useProfiles()

  const [notizen, setNotizen] = useState<ProjektNotiz[]>([])
  const [text, setText] = useState('')
  const [speichert, setSpeichert] = useState(false)
  const [bearbeitet, setBearbeitet] = useState<ProjektNotiz | null>(null)
  const [entwurf, setEntwurf] = useState('')

  const ich = session?.user.id ?? ''

  const laden = useCallback(async () => {
    const { data } = await supabase
      .from('projekt_notizen')
      .select('*')
      .eq('projekt_id', projekt.id)
      .order('created_at', { ascending: false })
    setNotizen((data as ProjektNotiz[]) ?? [])
  }, [projekt.id])

  useEffect(() => {
    laden()
  }, [laden])

  async function anlegen(e: FormEvent) {
    e.preventDefault()
    if (!text.trim() || !session) return
    setSpeichert(true)
    const { error } = await supabase.from('projekt_notizen').insert({
      projekt_id: projekt.id,
      autor_id: session.user.id,
      text: text.trim(),
    })
    setSpeichert(false)
    if (error) {
      toast('Notiz konnte nicht gespeichert werden.', 'fehler')
      return
    }
    setText('')
    await laden()
    onGeaendert()
  }

  async function aendern() {
    if (!bearbeitet || !entwurf.trim()) return
    const { error } = await supabase
      .from('projekt_notizen')
      .update({ text: entwurf.trim(), geaendert_am: new Date().toISOString() })
      .eq('id', bearbeitet.id)
    if (error) {
      toast('Änderung fehlgeschlagen.', 'fehler')
      return
    }
    setBearbeitet(null)
    await laden()
    onGeaendert()
  }

  async function loeschen(n: ProjektNotiz) {
    if (!confirm('Diese Notiz löschen?')) return
    const { error } = await supabase.from('projekt_notizen').delete().eq('id', n.id)
    if (error) {
      toast('Löschen fehlgeschlagen.', 'fehler')
      return
    }
    await laden()
    onGeaendert()
  }

  const nummer = projektNummer(kunde, projekt)

  return (
    <div className="modal-hintergrund" onClick={onSchliessen}>
      <div className="modal breit" onClick={(e) => e.stopPropagation()}>
        <h2>
          Notizen {nummer && <code>{nummer}</code>} {projekt.name}
        </h2>
        <p className="muted small">
          Absprachen, Zwischenstände, Hinweise fürs Team. Jede Notiz steht in
          der Farbe ihres Verfassers – die Farbe stellt jeder unter „Profil"
          selbst ein. Ändern und löschen kann jeder nur die eigenen.
        </p>

        <form className="notiz-form" onSubmit={anlegen}>
          <textarea
            rows={3}
            placeholder="Neue Notiz…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            style={{ color: farbeVon(ich) }}
            autoFocus
          />
          <button className="btn-primary" type="submit" disabled={!text.trim() || speichert}>
            {speichert ? 'Speichert…' : 'Notiz hinzufügen'}
          </button>
        </form>

        {notizen.length === 0 ? (
          <p className="muted">Noch keine Notizen zu diesem Projekt.</p>
        ) : (
          <ul className="notiz-liste">
            {notizen.map((n) => {
              const eigen = n.autor_id === ich
              const farbe = farbeVon(n.autor_id)
              return (
                <li key={n.id} style={{ borderLeftColor: farbe }}>
                  <div className="notiz-kopf">
                    <strong style={{ color: farbe }}>{nameVon(n.autor_id)}</strong>
                    <span className="muted small">
                      {formatZeitstempel(n.created_at)}
                      {n.geaendert_am && ' · geändert'}
                    </span>
                    {eigen && bearbeitet?.id !== n.id && (
                      <div className="aktionen">
                        <button
                          className="btn-ghost small"
                          onClick={() => {
                            setBearbeitet(n)
                            setEntwurf(n.text)
                          }}
                        >
                          Bearbeiten
                        </button>
                        <button
                          className="btn-ghost small danger"
                          onClick={() => loeschen(n)}
                          aria-label="Notiz löschen"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>

                  {bearbeitet?.id === n.id ? (
                    <div className="notiz-bearbeiten">
                      <textarea
                        rows={3}
                        value={entwurf}
                        onChange={(e) => setEntwurf(e.target.value)}
                        style={{ color: farbe }}
                        autoFocus
                      />
                      <div className="aktionen">
                        <button className="btn-ghost small" onClick={() => setBearbeitet(null)}>
                          Abbrechen
                        </button>
                        <button
                          className="btn-primary small"
                          onClick={aendern}
                          disabled={!entwurf.trim() || entwurf.trim() === n.text}
                        >
                          Speichern
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="notiz-text" style={{ color: farbe }}>
                      {n.text}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        <div className="modal-aktionen">
          <span />
          <div className="modal-rechts">
            <button className="btn-primary" onClick={onSchliessen}>
              Fertig
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
