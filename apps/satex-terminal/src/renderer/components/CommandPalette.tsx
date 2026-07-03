/**
 * SATEX — ⌘K command palette.
 * Quick actions, symbol jumps, and indicator toggles.
 */
import { useEffect, useRef, useState, useMemo } from 'react'
import { useMarketStore, useAllQuotes } from '../stores/marketStore'
import { WORKSPACE_TABS, type Workspace } from './TopBar'

interface Item {
  icon: string
  label: string
  kbd?: string
  run: () => void
}

interface Props {
  open: boolean
  onClose: () => void
  onSetWorkspace: (ws: Workspace) => void
}

export function CommandPalette({ open, onClose, onSetWorkspace }: Props) {
  const [q,   setQ]   = useState('')
  const [sel, setSel] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const quotes    = useAllQuotes()
  const setSymbol = useMarketStore(s => s.setSymbol)

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
    else { setQ(''); setSel(0) }
  }, [open])

  const items = useMemo<Item[]>(() => {
    const symItems: Item[] = quotes.map(qq => ({
      icon: '⤢',
      label: `Go to symbol · ${qq.symbol} (${qq.name})`,
      run: () => { setSymbol(qq.symbol); onClose() },
    }))
    const workspaceItems: Item[] = WORKSPACE_TABS.map((ws, i) => ({
      icon: '⊞',
      label: `Switch workspace · ${ws}`,
      kbd:   `⌘${i + 1}`,
      run:   () => { onSetWorkspace(ws); onClose() },
    }))
    const systemItems: Item[] = [
      { icon: '◢', label: 'Arm kill switch (cancel all open orders)', kbd: '⌘⇧K',
        run: () => { window.satex?.killSwitch(true); onClose() } },
      { icon: '⏻', label: 'Disarm kill switch',
        run: () => { window.satex?.killSwitch(false); onClose() } },
      { icon: '◎', label: 'Toggle DevTools', kbd: '⌘⇧D',
        run: () => { window.satex?.toggleDevTools(); onClose() } },
      { icon: '⤢', label: 'Toggle fullscreen', kbd: '⌘↵',
        run: () => { window.satex?.toggleFullscreen(); onClose() } },
      // C8: snapshot export. Surfaces a console hint with the file path on
      // success — the user can grab the file from userData/snapshots/.
      { icon: '⤓', label: 'Export snapshot (indicators + workspace + journal)',
        run: () => {
          void window.satex?.exportSnapshot().then((res) => {
            if (res?.ok) console.info(`[satex] snapshot written: ${res.path} (${res.bytes} bytes)`)
            else        console.warn(`[satex] snapshot export failed: ${res?.reason ?? 'unknown'}`)
          })
          onClose()
        } },
    ]
    return [...workspaceItems, ...systemItems, ...symItems]
  }, [quotes, setSymbol, onClose, onSetWorkspace])

  const filtered = useMemo(
    () => items.filter(i => i.label.toLowerCase().includes(q.toLowerCase())),
    [items, q],
  )

  useEffect(() => { setSel(0) }, [q])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(filtered.length - 1, s + 1)); return }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setSel(s => Math.max(0, s - 1)); return }
      if (e.key === 'Enter')     { e.preventDefault(); filtered[sel]?.run(); return }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, filtered, sel, onClose])

  if (!open) return null

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="cmd-palette" onClick={e => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="cmd-input mono"
          placeholder="Search commands · symbols · indicators…"
          value={q}
          onChange={e => setQ(e.target.value)}
        />
        <div className="cmd-list scrollbar-thin">
          {filtered.length === 0
            ? <div style={{ padding: 18, color: 'var(--ink-3)', fontSize: 11.5 }}>No matches</div>
            : filtered.map((it, i) => (
              <div
                key={i}
                className={`cmd-item ${i === sel ? 'sel' : ''}`}
                onMouseEnter={() => setSel(i)}
                onClick={() => it.run()}
              >
                <div className="icon mono">{it.icon}</div>
                <div className="label">{it.label}</div>
                {it.kbd && <div className="kbd"><span className="kbd-key">{it.kbd}</span></div>}
              </div>
            ))
          }
        </div>
      </div>
    </div>
  )
}
