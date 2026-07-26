import { useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [passwort, setPasswort] = useState('')
  const [fehler, setFehler] = useState<string | null>(null)
  const [laden, setLaden] = useState(false)

  async function anmelden(e: FormEvent) {
    e.preventDefault()
    setFehler(null)
    setLaden(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password: passwort })
    setLaden(false)
    if (error) {
      setFehler('Anmeldung fehlgeschlagen. Bitte E-Mail und Passwort prüfen.')
    }
  }

  return (
    <div className="login-wrap">
      <form className="card login-card" onSubmit={anmelden}>
        <h1>Agentur-App</h1>
        <p className="muted">Bitte mit deinem Gesellschafter-Konto anmelden.</p>

        <label>
          E-Mail
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </label>

        <label>
          Passwort
          <input
            type="password"
            value={passwort}
            onChange={(e) => setPasswort(e.target.value)}
            required
            autoComplete="current-password"
          />
        </label>

        {fehler && <div className="fehler">{fehler}</div>}

        <button className="btn-primary" type="submit" disabled={laden}>
          {laden ? 'Anmelden…' : 'Anmelden'}
        </button>

        <p className="muted small">
          Konten werden vom Administrator in Supabase angelegt (Authentication →
          Users).
        </p>
      </form>
    </div>
  )
}
