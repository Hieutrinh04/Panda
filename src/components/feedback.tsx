import { createContext, useCallback, useContext, type ReactNode } from 'react'
import { errorMessage } from '../services/core'
import { getSyncCount, SyncError, waitForSync } from '../data/store'

export interface ConfirmOptions { title: string; message: ReactNode; confirmLabel?: string; danger?: boolean }

export interface FeedbackApi {
  toast: (text: string, error?: boolean) => void
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

export const FeedbackContext = createContext<FeedbackApi>({ toast: () => undefined, confirm: async () => false })

export const useFeedback = () => useContext(FeedbackContext)

/**
 * Chạy một thao tác ghi dữ liệu: báo thành công bằng toast, hoặc hiển thị lỗi
 * nghiệp vụ. Trả về true nếu thành công.
 */
export function useAction() {
  const { toast } = useFeedback()
  return useCallback(
    async (fn: () => unknown, success?: string) => {
      const before = getSyncCount()
      try {
        await fn()
        // Ở chế độ Supabase, chờ máy chủ ghi xong mới báo thành công.
        if (getSyncCount() !== before) await waitForSync()
        if (success) toast(success)
        return true
      } catch (error) {
        // Lỗi đồng bộ đã được FeedbackProvider hiển thị qua onSyncError.
        if (!(error instanceof SyncError)) toast(errorMessage(error), true)
        return false
      }
    },
    [toast],
  )
}
