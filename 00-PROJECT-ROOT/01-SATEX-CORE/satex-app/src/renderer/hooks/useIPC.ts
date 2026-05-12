/**
 * SATEX — IPC Bridge Hook
 * Registers all push channel listeners on mount, tears them down on unmount.
 * Feeds directly into Zustand stores. Called once from App root.
 */
import { useEffect } from 'react'
import { useMarketStore } from '../stores/marketStore'
import { useAccountStore } from '../stores/accountStore'
import type { NewsItem } from '@shared/types'

export function useIPC(): void {
  const { updateQuotes, updateCandle, appendNews } = useMarketStore()
  const { setAccount, setOrders, setStatus } = useAccountStore()

  useEffect(() => {
    if (!window.satex) { console.error('[SATEX] window.satex not found — preload failed'); return }

    // Seed initial quotes on first connect
    const unsubQuotes = window.satex.onQuotesTick((quotes) => {
      updateQuotes(quotes)
    })

    const unsubCandles = window.satex.onCandlesUpdate(({ symbol, candle, isNew }) => {
      updateCandle(symbol, candle, isNew)
    })

    const unsubNews = window.satex.onNewsAppend((item) => {
      appendNews(item as NewsItem)
    })

    const unsubAccount = window.satex.onAccountUpdate((account) => {
      setAccount(account)
    })

    const unsubOrders = window.satex.onOrdersUpdate((orders) => {
      setOrders(orders)
    })

    const unsubStatus = window.satex.onSystemStatus((status) => {
      setStatus(status)
    })

    // Request initial data
    void window.satex.subscribe([])

    return () => {
      unsubQuotes()
      unsubCandles()
      unsubNews()
      unsubAccount()
      unsubOrders()
      unsubStatus()
    }
  }, [])
}
