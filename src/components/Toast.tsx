import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

/** Ein Knopf im Hinweis, z. B. "Rückgängig". */
export interface ToastAktion {
  text: string
  onClick: () => void
}

interface ToastData {
  id: number
  text: string
  art: 'ok' | 'fehler'
  aktion?: ToastAktion
}

/** Ohne Knopf ist der Hinweis schnell wieder weg; mit Knopf bleibt Zeit, einen
 *  Fehlgriff überhaupt zu bemerken. */
const DAUER_MS = 2800
const DAUER_MIT_AKTION_MS = 12000

type Zeigen = (text: string, art?: 'ok' | 'fehler', aktion?: ToastAktion) => void

const ToastContext = createContext<Zeigen>(() => {})

/** Hook zum Auslösen kurzer Hinweismeldungen. */
export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([])

  const schliessen = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id))
  }, [])

  const zeige = useCallback<Zeigen>(
    (text, art = 'ok', aktion) => {
      const id = Date.now() + Math.random()
      setToasts((t) => [...t, { id, text, art, aktion }])
      setTimeout(
        () => schliessen(id),
        aktion ? DAUER_MIT_AKTION_MS : DAUER_MS,
      )
    },
    [schliessen],
  )

  return (
    <ToastContext.Provider value={zeige}>
      {children}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.art}`}>
            <span>{t.text}</span>
            {t.aktion && (
              <button
                className="toast-aktion"
                onClick={() => {
                  t.aktion?.onClick()
                  schliessen(t.id)
                }}
              >
                {t.aktion.text}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
