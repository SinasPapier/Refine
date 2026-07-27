import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { FARBEN, STANDARD_FARBE } from '../../lib/types'
import { useToast } from '../../components/Toast'
import { useAuth } from '../auth/useAuth'
import { useProfiles } from './ProfileProvider'

/**
 * Formular für den eigenen Anzeigenamen und die eigene Farbe.
 * Wird als Einstellungsseite genutzt und – solange kein Name gesetzt ist –
 * als Begrüßung direkt nach dem ersten Login.
 */
export default function Profil({
  begruessung = false,
  onFertig,
}: {
  begruessung?: boolean
  onFertig?: () => void
}) {
  const { session } = useAuth()
  const { meinProfil, neuLaden } = useProfiles()
  const toast = useToast()

  const [name, setName] = useState('')
  const [farbe, setFarbe] = useState<string>(STANDARD_FARBE)
  const [speichert, setSpeichert] = useState(false)

  useEffect(() => {
    if (!meinProfil) return
    setName((meinProfil.name ?? '').trim())
    setFarbe(meinProfil.farbe || STANDARD_FARBE)
  }, [meinProfil])

  async function speichern(e: FormEvent) {
    e.preventDefault()
    if (!session) return
    const sauber = name.trim()
    if (!sauber) {
      toast('Bitte einen Anzeigenamen eingeben.', 'fehler')
      return
    }
    setSpeichert(true)
    const { error } = await supabase
      .from('profile')
      .update({ name: sauber, farbe })
      .eq('id', session.user.id)
    setSpeichert(false)
    if (error) {
      toast('Speichern fehlgeschlagen.', 'fehler')
      return
    }
    await neuLaden()
    toast('Gespeichert.')
    onFertig?.()
  }

  const inhalt = (
    <form className="profil-form" onSubmit={speichern}>
      {begruessung ? (
        <>
          <h1>Willkommen! 👋</h1>
          <p className="muted">
            Wie sollen dich deine Mitgesellschafter in der App sehen? Name und
            Farbe kannst du später jederzeit ändern.
          </p>
        </>
      ) : (
        <h2>Mein Profil</h2>
      )}

      <label>
        Anzeigename
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="z. B. Florian"
          maxLength={40}
          autoFocus={begruessung}
          required
        />
      </label>

      <div className="farb-block">
        <span className="farb-label">Meine Farbe im Kalender</span>
        <div className="farb-auswahl">
          {FARBEN.map((f) => (
            <button
              key={f}
              type="button"
              className={farbe === f ? 'farb-punkt aktiv' : 'farb-punkt'}
              style={{ background: f }}
              onClick={() => setFarbe(f)}
              aria-label={`Farbe ${f}`}
              title={f}
            />
          ))}
        </div>
      </div>

      <div className="profil-vorschau">
        Vorschau:{' '}
        <span className="person-chip" style={{ background: farbe }}>
          {name.trim() || 'Dein Name'}
        </span>
      </div>

      <button className="btn-primary" type="submit" disabled={speichert}>
        {speichert ? 'Speichert…' : 'Speichern'}
      </button>

      {!begruessung && (
        <p className="muted small">
          Angemeldet als {session?.user.email}
        </p>
      )}
    </form>
  )

  if (begruessung) {
    return (
      <div className="login-wrap">
        <div className="card login-card">{inhalt}</div>
      </div>
    )
  }

  return (
    <div>
      <h1>Einstellungen</h1>
      <div className="card">{inhalt}</div>
    </div>
  )
}
