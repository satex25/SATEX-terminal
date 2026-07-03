/**
 * SATEX — Update notification state (S1-9)
 *
 * Holds whatever the main-process AutoUpdateService has pushed via
 * IPC.UPDATE_AVAILABLE. The renderer subscribes once at boot (useIPC.ts)
 * and the UpdateToast component reads `show` to render the banner.
 *
 * Lifecycle:
 *   update-available  → setAvailable({available:true, version, downloaded:false})
 *                        → toast renders, [Restart Now] button DISABLED
 *   update-downloaded → setAvailable({available:true, version, downloaded:true})
 *                        → button enables; clicking calls window.satex.installUpdate()
 *   user dismisses    → setShow(false); next check at the engine's 24h cadence
 */
import { create } from 'zustand'
import type { UpdateAvailable } from '@shared/types'

export interface UpdateState extends UpdateAvailable {
  /** Renderer-only flag — true while the toast is visible. Separate from
   *  `available` so a "Remind Me Later" dismiss can hide the toast without
   *  forgetting that an update is still pending in the engine. */
  show: boolean
  setShow: (show: boolean) => void
  setAvailable: (update: UpdateAvailable) => void
}

const INITIAL: UpdateAvailable = { available: false, downloaded: false }

export const useUpdateStore = create<UpdateState>((set) => ({
  ...INITIAL,
  show: false,
  setShow: (show) => set({ show }),
  setAvailable: (update) =>
    set((prev) => ({
      ...update,
      // Reveal the toast the moment availability flips on. Subsequent
      // re-pushes (e.g. update-downloaded after update-available) keep the
      // current `show` so a user who already dismissed isn't re-interrupted
      // when the binary finishes fetching.
      show: update.available && !prev.available ? true : prev.show,
    })),
}))
