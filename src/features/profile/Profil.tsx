import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import type { Firma } from '../../lib/types'
import { FARBEN, STANDARD_FARBE } from '../../lib/types'
import { ibanNormalisieren, ibanPruefsummeStimmt } from '../../lib/girocode'
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
      <FirmaKarte istAdmin={meinProfil?.ist_admin ?? false} />
    </div>
  )
}

/**
 * Firmen- und Bankdaten für den Zahlcode. Ändern darf sie nur ein
 * Administrator – eine falsche IBAN hier beträfe jede Rechnung. Die Datenbank
 * setzt das ebenfalls durch; das Ausblenden der Felder ist nur die Anzeige.
 */
function FirmaKarte({ istAdmin }: { istAdmin: boolean }) {
  const toast = useToast()
  const [firma, setFirma] = useState<Firma | null>(null)
  const [name, setName] = useState('')
  const [iban, setIban] = useState('')
  const [bic, setBic] = useState('')
  const [speichert, setSpeichert] = useState(false)

  const laden = useCallback(async () => {
    const { data } = await supabase.from('firma').select('*').eq('id', 1).maybeSingle()
    const f = (data as Firma) ?? null
    setFirma(f)
    setName(f?.empfaenger_name ?? '')
    setIban(f?.iban ?? '')
    setBic(f?.bic ?? '')
  }, [])

  useEffect(() => {
    laden()
  }, [laden])

  const veraendert =
    name.trim() !== (firma?.empfaenger_name ?? '').trim() ||
    ibanNormalisieren(iban) !== ibanNormalisieren(firma?.iban ?? '') ||
    bic.trim().toUpperCase() !== (firma?.bic ?? '').trim().toUpperCase()

  // Nur melden, was der Benutzer gerade eingetippt hat – leere Felder beim
  // ersten Einrichten sollen nicht sofort rot sein.
  const ibanFehler =
    iban.trim() && !ibanPruefsummeStimmt(iban)
      ? 'IBAN ist ungültig – bitte auf Tippfehler prüfen.'
      : null

  async function speichern(e: FormEvent) {
    e.preventDefault()
    setSpeichert(true)
    const { error } = await supabase
      .from('firma')
      .update({
        empfaenger_name: name.trim(),
        iban: ibanNormalisieren(iban),
        bic: bic.trim().toUpperCase(),
        aktualisiert_am: new Date().toISOString(),
      })
      .eq('id', 1)
    setSpeichert(false)
    if (error) {
      toast('Speichern fehlgeschlagen.', 'fehler')
      return
    }
    toast('Bankverbindung gespeichert.')
    laden()
  }

  return (
    <div className="card">
      <h2>Firma &amp; Bankverbindung</h2>
      <p className="muted small">
        Grundlage für den Zahlcode auf Rechnungen. Der Empfängername muss zum
        Konto passen, sonst weist die Bank die Überweisung zurück.
      </p>

      {!istAdmin ? (
        <>
          <p className="muted small">
            Ändern kann das nur ein Administrator – so bleibt die
            Bankverbindung auf allen Rechnungen verlässlich.
          </p>
          <div className="zahlcode-empfaenger">
            <div>
              <span className="muted small">Empfänger</span>
              <div>{firma?.empfaenger_name || '—'}</div>
            </div>
            <div>
              <span className="muted small">IBAN</span>
              <div>
                <code>{firma?.iban || '—'}</code>
              </div>
            </div>
          </div>
        </>
      ) : (
        <form onSubmit={speichern}>
          <div className="form-grid">
            <label className="wide">
              Empfängername (wie beim Konto)
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="z. B. Musteragentur GbR"
                maxLength={70}
              />
            </label>
            <label>
              IBAN
              <input
                value={iban}
                onChange={(e) => setIban(e.target.value)}
                placeholder="DE89 3704 0044 0532 0130 00"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <label>
              BIC (optional)
              <input
                value={bic}
                onChange={(e) => setBic(e.target.value)}
                placeholder="COBADEFFXXX"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
          </div>

          {ibanFehler && <div className="fehler">{ibanFehler}</div>}

          <div className="form-actions">
            <button
              className="btn-primary"
              type="submit"
              disabled={speichert || !veraendert || !!ibanFehler}
              title={!veraendert ? 'Es wurde nichts geändert' : undefined}
            >
              {speichert ? 'Speichert…' : 'Speichern'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
