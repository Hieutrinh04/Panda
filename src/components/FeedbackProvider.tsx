import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { onSyncError } from '../data/store'
import { CircleAlert, CircleCheck } from 'lucide-react'
import { Modal } from './ui'
import { FeedbackContext, type ConfirmOptions } from './feedback'

interface Toast { id: number; text: string; error?: boolean }
type ConfirmRequest = ConfirmOptions & { resolve: (ok: boolean) => void }

/** Cung cấp toast thông báo và hộp thoại xác nhận cho toàn ứng dụng. */
export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [request, setRequest] = useState<ConfirmRequest>()

  const toast = useCallback((text: string, error?: boolean) => {
    const id = Date.now() + Math.random()
    setToasts((list) => [...list, { id, text, error }])
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), error ? 5000 : 3000)
  }, [])

  // Lỗi khi ghi lên Supabase (kể cả từ thao tác không qua useAction như thêm vào giỏ).
  useEffect(() => {
    const off = onSyncError((message) => toast(message, true))
    return () => {
      off()
    }
  }, [toast])

  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => setRequest({ ...options, resolve })), [])

  const close = (ok: boolean) => {
    request?.resolve(ok)
    setRequest(undefined)
  }

  return (
    <FeedbackContext.Provider value={{ toast, confirm }}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast${t.error ? ' error' : ''}`}>
            {t.error ? <CircleAlert /> : <CircleCheck />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
      {request && (
        <Modal
          title={request.title}
          onClose={() => close(false)}
          footer={
            <>
              <button className="btn" onClick={() => close(false)}>Hủy</button>
              <button className={`btn ${request.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => close(true)} autoFocus>
                {request.confirmLabel ?? 'Xác nhận'}
              </button>
            </>
          }
        >
          <div className="stack">{request.message}</div>
        </Modal>
      )}
    </FeedbackContext.Provider>
  )
}
