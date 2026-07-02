/**
 * SATEX — Global window type augmentation
 * Declares window.satex exposed by the preload contextBridge.
 */
import type { SatexAPI } from '../preload/index'

declare global {
  interface Window {
    satex: SatexAPI
  }
}

export {}
