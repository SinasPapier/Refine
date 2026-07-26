import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

interface ToastData {
  id: number
  text: string
  art: 'ok' | 'fehler'
}

const ToastContext = createContext<(text: string, art?: 'ok' | 'fehler') => void>(
  () => {},
)

/** Hook zum Auslösen kurzer Hinweismeldungen. */
export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([])

  const zeige = useCallback((text: string, art: 'ok' | 'fehler' = 'ok') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, text, art }])
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id))
    }, 2800)
  }, [])

  return (
    <ToastContext.Provider value={zeige}>
      {children}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.art}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
