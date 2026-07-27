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
  const [status, setStatus] = useState('')
  const [speichert, setSpeichert] = useState(false)

  // Vergleich mit dem gespeicherten Stand: Speichern bleibt sonst inaktiv.
  const veraendert =
    name.trim() !== (meinProfil?.name ?? '').trim() ||
    farbe !== (meinProfil?.farbe || STANDARD_FARBE) ||
    (!begruessung && status.trim() !== (meinProfil?.status_text ?? '').trim())

  useEffect(() => {
    if (!meinProfil) return
    setName((meinProfil.name ?? '').trim())
    setFarbe(meinProfil.farbe || STANDARD_FARBE)
    setStatus(meinProfil.status_text ?? '')
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
    // Bei der Begrüßung gibt es noch kein Statusfeld – dann unverändert lassen.
    const statusFelder = begruessung
      ? {}
      : {
          status_text: status.trim() || null,
          status_gesetzt_am:
            status.trim() && status.trim() !== (meinProfil?.status_text ?? '')
              ? new Date().toISOString()
              : status.trim()
                ? meinProfil?.status_gesetzt_am ?? new Date().toISOString()
                : null,
        }
    const { error } = await supabase
      .from('profile')
      .update({ name: sauber, farbe, ...statusFelder })
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

      {!begruessung && (
        <label>
          Status (optional) – für alle im Team sichtbar
          <input
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            placeholder="z. B. bis 14 Uhr beim Kunden"
            maxLength={80}
          />
        </label>
      )}

      <div className="profil-vorschau">
        Vorschau:{' '}
        <span className="person-chip" style={{ background: farbe }}>
          {name.trim() || 'Dein Name'}
        </span>
      </div>

      <button
        className="btn-primary"
        type="submit"
        disabled={speichert || !veraendert}
        title={!veraendert ? 'Es wurde nichts geändert' : undefined}
      >
        {speichert ? 'Speichert…' : 'Speichern'}
      </button>

      {!begruessung && (
        <p className="muted small">
          Angemeldet als {session?.user.email}
          {meinProfil?.ist_admin && ' · Administrator'}
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
