/**
 * SATEX — Obsidian VaultWriter (Phase 8).
 *
 * Writes structured markdown checkpoints into the user's mc4 Obsidian vault.
 * This is the persistence layer for "what the system learned," intentionally
 * outside SQLite so the user can read, link, and Dataview-query notes as a
 * first-class knowledge graph.
 *
 *   SQLite (persistence.ts):     hot-path operational state — orders, ticks,
 *                                observations, weights. Bytes, not narrative.
 *   Vault (this file):           narrative checkpoints — sessions started,
 *                                trades closed (wins AND learnings from losses),
 *                                tactics transitions, brain milestones.
 *
 * Vault root detection: caller passes the project root (mc4) which contains
 * `.obsidian/`. We write under `<root>/Vault/{Sessions,Trades,Tactics,Brain,
 * Observer,Manual}/<filename>.md`. Folders are created lazily.
 *
 * Every note carries YAML frontmatter so the user can Dataview them:
 *   `TABLE pnl, outcome FROM "Vault/Trades" WHERE pnl < 0 SORT pnl ASC`
 *
 * MAY-TACTICS extraction principle (per user directive): on losses, we do not
 * just write "lost $X." We capture *what was learned* — the regime at entry,
 * the signal quality, the gate that should have caught it — so future sessions
 * compound knowledge rather than restart from zero.
 */
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import type {
  AiDecision,
  ClosedTrade,
  Order,
  Position,
  SessionRecord,
  TacticsStatus,
  VaultCheckpointRequest,
  VaultStats,
} from '@shared/types'
import { createLogger } from './logger'

const log = createLogger('vault')

const VAULT_SUBDIR    = 'Vault'
const SCOPE_DIRS = {
  session:  'Sessions',
  trade:    'Trades',
  tactics:  'Tactics',
  brain:    'Brain',
  observer: 'Observer',
  manual:   'Manual',
} as const

export interface VaultWriterDeps {
  /** Absolute path expected to contain `.obsidian/`. */
  projectRoot: string
}

export class VaultWriter {
  private deps: VaultWriterDeps
  private vaultRoot: string | null = null
  private enabled = false
  private notesWritten = 0
  private lastWriteAt: number | null = null
  private lastNotePath: string | null = null

  constructor(deps: VaultWriterDeps) { this.deps = deps }

  /** Resolves vault root and creates the Vault/ subtree. Idempotent. */
  initialize(): void {
    const candidate = resolve(this.deps.projectRoot)
    const obsidian = join(candidate, '.obsidian')
    if (!existsSync(obsidian) || !statSync(obsidian).isDirectory()) {
      this.enabled = false
      this.vaultRoot = null
      log.warn('vault disabled — no .obsidian/ at projectRoot', { projectRoot: candidate })
      return
    }
    this.vaultRoot = candidate
    this.enabled = true
    // Lazily create the subdirs — cheap and idempotent.
    for (const sub of Object.values(SCOPE_DIRS)) {
      const dir = join(candidate, VAULT_SUBDIR, sub)
      mkdirSync(dir, { recursive: true })
    }
    log.info('vault enabled', { vaultRoot: candidate })
  }

  stats(): VaultStats {
    return {
      enabled: this.enabled,
      vaultRoot: this.vaultRoot,
      notesWritten: this.notesWritten,
      lastWriteAt: this.lastWriteAt,
      lastNotePath: this.lastNotePath,
    }
  }

  // ── public writers ─────────────────────────────────────────────────────────

  async writeSessionStart(s: SessionRecord, mode: string, watchlist: string[]): Promise<void> {
    if (!this.enabled) return
    const fm = {
      type: 'session-start',
      sessionId: s.id,
      startedAt: isoOf(s.startedAt),
      mode,
      startingEquity: s.startingEquity,
      watchlist: watchlist.join(', '),
      tags: ['satex', 'session', `mode/${mode}`],
    }
    const body = [
      `# Session ${s.id}`,
      '',
      `Started **${isoOf(s.startedAt)}** in **${mode}** mode with starting equity **$${fmtMoney(s.startingEquity)}**.`,
      '',
      '## Watchlist',
      '',
      ...watchlist.map((sym) => `- [[Symbols/${sym}]]`),
      '',
      '## Notes',
      '',
      '_Append observations as the session unfolds._',
    ].join('\n')
    await this.writeNote('session', `${ymdHms(s.startedAt)}-session-${s.id}.md`, fm, body)
  }

  async writeSessionEnd(s: SessionRecord): Promise<void> {
    if (!this.enabled) return
    const endedAt = s.endedAt ?? Date.now()
    const pnl = (s.endingEquity ?? s.startingEquity) - s.startingEquity
    const ddPct = s.startingEquity > 0 ? (s.troughEquity - s.startingEquity) / s.startingEquity : 0
    const fm = {
      type: 'session-end',
      sessionId: s.id,
      startedAt: isoOf(s.startedAt),
      endedAt: isoOf(endedAt),
      startingEquity: s.startingEquity,
      endingEquity: s.endingEquity,
      realizedPnl: s.realizedPnl,
      pnl,
      tradeCount: s.tradeCount,
      peakEquity: s.peakEquity,
      troughEquity: s.troughEquity,
      drawdownPct: ddPct,
      outcome: pnl > 0 ? 'win' : pnl < 0 ? 'loss' : 'flat',
      tags: ['satex', 'session', pnl > 0 ? 'outcome/win' : pnl < 0 ? 'outcome/loss' : 'outcome/flat'],
    }
    const body = [
      `# Session ${s.id} — Closed`,
      '',
      `Ran from **${isoOf(s.startedAt)}** to **${isoOf(endedAt)}**.`,
      '',
      '## Result',
      '',
      `- PnL: **$${fmtMoney(pnl)}** (${(pnl >= 0 ? '+' : '')}${pctOf(pnl, s.startingEquity)})`,
      `- Realized PnL: $${fmtMoney(s.realizedPnl)}`,
      `- Trades: ${s.tradeCount}`,
      `- Peak equity: $${fmtMoney(s.peakEquity)}`,
      `- Trough equity: $${fmtMoney(s.troughEquity)}`,
      `- Drawdown: ${(ddPct * 100).toFixed(2)}%`,
    ].join('\n')
    await this.writeNote('session', `${ymdHms(endedAt)}-session-${s.id}-close.md`, fm, body)
  }

  /**
   * Trade close — captures wins AND learnings from losses per user directive.
   * The "Learnings" section is populated for losses with structural context so
   * future sessions can mine the vault rather than re-learning from scratch.
   */
  async writeTradeClose(args: {
    order: Order
    position: Position
    pnl: number
    holdMs: number
    aiDecision: AiDecision | null
    tacticsAtEntry: TacticsStatus | null
    regimeAtEntry: string | null
  }): Promise<void> {
    if (!this.enabled) return
    const { order, position, pnl, holdMs, aiDecision, tacticsAtEntry, regimeAtEntry } = args
    const closedAt = order.filledAt ?? Date.now()
    const outcome: 'win' | 'loss' | 'flat' = pnl > 0 ? 'win' : pnl < 0 ? 'loss' : 'flat'
    const fm = {
      type: 'trade-close',
      orderId: order.id,
      symbol: order.request.symbol,
      side: order.request.side,
      qty: order.request.quantity,
      entryPrice: position.avgPrice,
      exitPrice: order.fillPrice ?? null,
      pnl,
      holdMinutes: Math.round(holdMs / 60_000),
      // `triggeredBy` removed from OrderRequest (adversarial finding C1). The
      // vault frontmatter field stays null until server-side bracket-fill
      // tagging is wired through AlpacaTradeUpdate.
      triggeredBy: null,
      regimeAtEntry,
      tacticsState: tacticsAtEntry?.state ?? null,
      aiBias: aiDecision?.bias ?? null,
      aiConfidence: aiDecision?.confidence ?? null,
      outcome,
      closedAt: isoOf(closedAt),
      tags: ['satex', 'trade', `outcome/${outcome}`, `symbol/${order.request.symbol}`],
    }

    const lines: string[] = []
    lines.push(`# Trade ${order.request.symbol} ${order.request.side.toUpperCase()} — ${outcome.toUpperCase()}`)
    lines.push('')
    lines.push(`Closed **${isoOf(closedAt)}** after **${Math.round(holdMs / 60_000)}m** hold.`)
    lines.push('')
    lines.push('## Result')
    lines.push('')
    lines.push(`- PnL: **$${fmtMoney(pnl)}**`)
    lines.push(`- Entry: $${fmtMoney(position.avgPrice)} → Exit: $${fmtMoney(order.fillPrice ?? 0)}`)
    lines.push(`- Quantity: ${order.request.quantity}`)
    // "Closed by" bullet removed alongside OrderRequest.triggeredBy removal
    // (C1). Re-add when bracket-leg classification arrives via AlpacaTradeUpdate.
    lines.push('')
    lines.push('## Context at entry')
    lines.push('')
    lines.push(`- Regime: \`${regimeAtEntry ?? 'unknown'}\``)
    if (tacticsAtEntry) {
      lines.push(`- MAY-TACTICS: \`${tacticsAtEntry.state}\` (signal quality ${tacticsAtEntry.signalQuality.toFixed(2)}, win rate ${(tacticsAtEntry.winRate * 100).toFixed(0)}%)`)
    }
    if (aiDecision) {
      lines.push(`- AI bias: \`${aiDecision.bias}\` @ ${(aiDecision.confidence * 100).toFixed(0)}% confidence`)
      if (aiDecision.veto) lines.push(`- AI **vetoed** (but trade ran anyway): ${aiDecision.vetoReason ?? 'no reason'}`)
    }
    lines.push('')

    if (outcome === 'loss') {
      lines.push('## Learnings')
      lines.push('')
      lines.push('_Captured per MAY-TACTICS extraction principle — extract knowledge, not just outcome._')
      lines.push('')
      lines.push(extractLossLearnings({ pnl, holdMs, regimeAtEntry, tacticsAtEntry, aiDecision, order }))
    } else if (outcome === 'win') {
      lines.push('## What worked')
      lines.push('')
      lines.push(extractWinLearnings({ pnl, holdMs, regimeAtEntry, tacticsAtEntry, aiDecision }))
    }

    lines.push('')
    lines.push('## Symbols')
    lines.push('')
    lines.push(`- [[Symbols/${order.request.symbol}]]`)

    await this.writeNote(
      'trade',
      `${ymdHms(closedAt)}-${order.request.symbol}-${outcome}.md`,
      fm,
      lines.join('\n'),
    )
  }

  /**
   * Append a post-exit reflection (lesson + emotion tag) to a trade-close
   * note. Falls back to writing a standalone reflection note when the matching
   * trade-close file can't be located on disk — keeps the audit trail
   * complete even after long sessions that have rolled past the in-memory
   * trade ring.
   *
   * Idempotent enough — appends `## Reflection` block to the matching file
   * (or creates a sidecar Trades/<ts>-<symbol>-reflection.md when no match
   * exists). The file format keeps Dataview queries working since the
   * `reflection`/`emotion` keys live in the markdown body, not frontmatter
   * (no schema change required).
   */
  async appendTradeReflection(trade: ClosedTrade): Promise<void> {
    if (!this.enabled) return
    if (!trade.lesson && !trade.emotionTag) return
    const block: string[] = []
    block.push('')
    block.push('## Reflection')
    block.push('')
    if (trade.emotionTag) block.push(`- Emotion: \`${trade.emotionTag}\``)
    if (trade.lesson)     block.push(`- Lesson: ${trade.lesson.trim()}`)
    block.push(`- Captured: ${isoOf(Date.now())}`)
    const body = block.join('\n')

    // Locate the matching trade-close note by symbol + outcome. The vault
    // writes trade-close files as `<ymdHms>-<symbol>-<outcome>.md` under
    // <vaultRoot>/Vault/Trades/. The trade.closedAt and the original close
    // file's ymdHms typically agree to the second, but we fall back to a
    // sidecar reflection file when the original isn't on disk.
    const outcome = trade.pnl > 0 ? 'win' : trade.pnl < 0 ? 'loss' : 'flat'
    const ts = ymdHms(trade.closedAt)
    const targetName = `${ts}-${trade.symbol}-${outcome}.md`
    if (!this.vaultRoot) return
    const dir = join(this.vaultRoot, VAULT_SUBDIR, SCOPE_DIRS.trade)
    const target = join(dir, targetName)
    try {
      // Append to the close note if it exists; otherwise drop a sidecar.
      if (existsSync(target)) {
        const fs = await import('node:fs/promises')
        const existing = await fs.readFile(target, 'utf8')
        await fs.writeFile(target, existing + '\n' + body, 'utf8')
        return
      }
      const fm = {
        type: 'trade-reflection',
        orderId: trade.id,
        symbol: trade.symbol,
        outcome,
        pnl: trade.pnl,
        emotion: trade.emotionTag ?? null,
        ts: isoOf(trade.closedAt),
        tags: ['satex', 'reflection', `symbol/${trade.symbol}`],
      }
      await this.writeNote(
        'trade',
        `${ts}-${trade.symbol}-reflection.md`,
        fm,
        `# Reflection · ${trade.symbol} ${outcome.toUpperCase()}\n${body}`,
      )
    } catch (e) {
      // Surface via caller's logger — vault failures must never crash trade flow.
      throw new Error(`appendTradeReflection failed: ${String(e)}`, { cause: e })
    }
  }

  async writeTacticsTransition(prev: TacticsStatus | null, next: TacticsStatus, reason: string): Promise<void> {
    if (!this.enabled) return
    const fm = {
      type: 'tactics-transition',
      from: prev?.state ?? 'init',
      to: next.state,
      winRate: next.winRate,
      expectancy: next.expectancy,
      maxDrawdown: next.maxDrawdown,
      signalQuality: next.signalQuality,
      tradesObserved: next.tradesObserved,
      tradesRequired: next.tradesRequired,
      reason,
      vetoActive: next.vetoActive,
      vetoReason: next.vetoReason,
      ts: isoOf(next.lastUpdated),
      tags: ['satex', 'tactics', `state/${next.state}`],
    }
    const lines: string[] = []
    lines.push(`# MAY-TACTICS — \`${prev?.state ?? 'init'}\` → \`${next.state}\``)
    lines.push('')
    lines.push(`At **${isoOf(next.lastUpdated)}**.`)
    lines.push('')
    lines.push(`## Reason`)
    lines.push('')
    lines.push(reason)
    lines.push('')
    lines.push('## Metrics')
    lines.push('')
    lines.push(`- Trades observed: ${next.tradesObserved} / ${next.tradesRequired}`)
    lines.push(`- Win rate: ${(next.winRate * 100).toFixed(1)}%`)
    lines.push(`- Expectancy: $${fmtMoney(next.expectancy)}`)
    lines.push(`- Max drawdown: ${(next.maxDrawdown * 100).toFixed(2)}%`)
    lines.push(`- Signal quality: ${next.signalQuality.toFixed(2)}`)
    if (next.vetoActive) lines.push(`- **Veto active**: ${next.vetoReason ?? 'no reason'}`)
    lines.push('')
    if (next.state === 'veto' && prev?.state !== 'veto') {
      lines.push('## What we lock in from this regime')
      lines.push('')
      lines.push(extractVetoLearnings(next))
    }
    await this.writeNote(
      'tactics',
      `${ymdHms(next.lastUpdated)}-tactics-${prev?.state ?? 'init'}-to-${next.state}.md`,
      fm,
      lines.join('\n'),
    )
  }

  async writeBrainCheckpoint(snapshot: { params: number; trades: number; bestKey: string | null; bestValue: number | null; note: string }): Promise<void> {
    if (!this.enabled) return
    // Noise guard (Fix #4 — audit 2026-05-15): skip when brain has no state to
    // checkpoint. The prior 277 zero-payload files were pure index pollution.
    if (snapshot.params === 0) return
    const now = Date.now()
    const fm = {
      type: 'brain-checkpoint',
      params: snapshot.params,
      trades: snapshot.trades,
      bestKey: snapshot.bestKey,
      bestValue: snapshot.bestValue,
      ts: isoOf(now),
      tags: ['satex', 'brain', 'checkpoint'],
    }
    const body = [
      `# Brain checkpoint`,
      '',
      `At **${isoOf(now)}**.`,
      '',
      `- Parameters tracked: **${snapshot.params}**`,
      `- Trades learned from: **${snapshot.trades}**`,
      snapshot.bestKey ? `- Top weight: \`${snapshot.bestKey}\` = ${snapshot.bestValue?.toFixed(4)}` : '',
      '',
      '## Note',
      '',
      snapshot.note,
    ].filter(Boolean).join('\n')
    await this.writeNote('brain', `${ymdHms(now)}-brain-checkpoint.md`, fm, body)
  }

  async writeObserverCheckpoint(snapshot: { totalObserved: number; perMinute: number; symbols: number; learnerCycles: number; learnerError: number; weightsTracked: number }): Promise<void> {
    if (!this.enabled) return
    const now = Date.now()
    const fm = {
      type: 'observer-checkpoint',
      totalObserved: snapshot.totalObserved,
      observationsPerMinute: snapshot.perMinute,
      symbolsTracked: snapshot.symbols,
      learnerCycles: snapshot.learnerCycles,
      learnerError: snapshot.learnerError,
      weightsTracked: snapshot.weightsTracked,
      ts: isoOf(now),
      tags: ['satex', 'observer', 'checkpoint'],
    }
    const body = [
      `# Observer / Learner checkpoint`,
      '',
      `At **${isoOf(now)}**.`,
      '',
      '## Continuous observer',
      '',
      `- Total observations recorded: **${snapshot.totalObserved.toLocaleString()}**`,
      `- Rate: **${snapshot.perMinute}/min** across ${snapshot.symbols} symbols`,
      '',
      '## Pattern learner',
      '',
      `- Cycles completed: ${snapshot.learnerCycles}`,
      `- Avg forward-return error: ${snapshot.learnerError.toFixed(4)}`,
      `- (feature, regime) weights tracked: ${snapshot.weightsTracked}`,
    ].join('\n')
    await this.writeNote('observer', `${ymdHms(now)}-observer-checkpoint.md`, fm, body)
  }

  async writeManualCheckpoint(req: VaultCheckpointRequest, payload: Record<string, unknown>): Promise<string | null> {
    if (!this.enabled) return null
    const now = Date.now()
    const fm = {
      type: 'manual-checkpoint',
      reason: req.reason,
      scope: req.scope,
      ts: isoOf(now),
      tags: ['satex', 'manual', `scope/${req.scope}`],
    }
    const body = [
      `# Manual checkpoint — ${req.reason}`,
      '',
      `At **${isoOf(now)}**, scope \`${req.scope}\`.`,
      '',
      req.detail ? `> ${req.detail}` : '',
      '',
      '## Payload',
      '',
      '```json',
      JSON.stringify(payload, null, 2),
      '```',
    ].filter(Boolean).join('\n')
    const scopeDir = req.scope in SCOPE_DIRS ? req.scope as keyof typeof SCOPE_DIRS : 'manual'
    return this.writeNote(scopeDir, `${ymdHms(now)}-manual-${slug(req.reason)}.md`, fm, body)
  }

  // ── internal ───────────────────────────────────────────────────────────────

  private async writeNote(scope: keyof typeof SCOPE_DIRS, filename: string, frontmatter: Record<string, unknown>, body: string): Promise<string> {
    if (!this.enabled || !this.vaultRoot) return ''
    const dir = join(this.vaultRoot, VAULT_SUBDIR, SCOPE_DIRS[scope])
    const path = join(dir, filename)
    const content = `---\n${yaml(frontmatter)}---\n\n${body}\n`
    try {
      mkdirSync(dirname(path), { recursive: true })
      await writeFile(path, content, 'utf8')
      this.notesWritten++
      this.lastWriteAt = Date.now()
      this.lastNotePath = path
      log.debug('vault wrote', { path, scope })
      return path
    } catch (e) {
      log.warn('vault write failed', { path, err: String(e) })
      return ''
    }
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function isoOf(ms: number): string { return new Date(ms).toISOString() }

function ymdHms(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`
}

function fmtMoney(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function pctOf(n: number, base: number): string {
  if (base === 0) return '0.00%'
  return `${((n / base) * 100).toFixed(2)}%`
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'note'
}

/** Minimal YAML serializer for frontmatter — handles scalars, arrays of
 *  scalars, and null. Anything more structured belongs in the body, not here. */
function yaml(obj: Record<string, unknown>): string {
  const lines: string[] = []
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) { lines.push(`${k}: null`); continue }
    if (Array.isArray(v)) {
      lines.push(`${k}:`)
      for (const item of v) lines.push(`  - ${yamlScalar(item)}`)
      continue
    }
    lines.push(`${k}: ${yamlScalar(v)}`)
  }
  return lines.join('\n') + '\n'
}

function yamlScalar(v: unknown): string {
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'number') return Number.isFinite(v) ? v.toString() : 'null'
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  const s = String(v)
  if (s === '' || /[:#&*!|>'"%@`,[\]{}]/.test(s) || /^\s|\s$/.test(s)) {
    return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  }
  return s
}

/**
 * Loss-learning extractor. Builds a structured paragraph the user (and Claude
 * later) can read at a glance to understand what to do differently. Per the
 * user directive: do not just record what failed — record what was learned.
 */
function extractLossLearnings(ctx: {
  pnl: number
  holdMs: number
  regimeAtEntry: string | null
  tacticsAtEntry: TacticsStatus | null
  aiDecision: AiDecision | null
  order: Order
}): string {
  const bullets: string[] = []
  const { pnl, holdMs, regimeAtEntry, tacticsAtEntry, aiDecision, order } = ctx
  // OrderRequest.triggeredBy was removed (adversarial finding C1). Until we
  // re-derive the trigger from AlpacaTradeUpdate bracket-leg metadata, every
  // loss narrative just notes "closed at a loss" without speculating about
  // whether the stop fired. Better to leave the question open than to fake a
  // signal from a field that the renderer used to fully control.
  void order
  bullets.push(`- Closed at a loss of $${fmtMoney(-pnl)}. Re-examine whether the exit logic respected the stop level.`)
  if (regimeAtEntry === 'chop' || regimeAtEntry === 'unknown') {
    bullets.push(`- Entered in **${regimeAtEntry}** regime — historically the lowest-edge regimes. Future sessions: prefer trend_up/trend_down regimes for this symbol.`)
  }
  if (tacticsAtEntry && tacticsAtEntry.signalQuality < 0.55) {
    bullets.push(`- Signal quality at entry was **${tacticsAtEntry.signalQuality.toFixed(2)}** (below 0.55 floor). MAY-TACTICS gate should consider tightening before next attempt on this setup.`)
  }
  if (aiDecision && aiDecision.veto) {
    bullets.push(`- AI brain **had vetoed this trade** for: "${aiDecision.vetoReason ?? 'no reason'}". The veto was correct — escalate AI confidence in similar setups.`)
  } else if (aiDecision && aiDecision.confidence < 0.5) {
    bullets.push(`- AI confidence was only **${(aiDecision.confidence * 100).toFixed(0)}%** at entry — borderline. Consider raising the minimum confidence gate.`)
  }
  if (holdMs < 60_000) {
    bullets.push(`- Trade held under 1 minute — likely a noise-driven entry, not a setup-driven one.`)
  }
  if (bullets.length === 0) {
    bullets.push(`- No obvious structural cause identified — log for human review.`)
  }
  return bullets.join('\n')
}

function extractWinLearnings(ctx: {
  pnl: number
  holdMs: number
  regimeAtEntry: string | null
  tacticsAtEntry: TacticsStatus | null
  aiDecision: AiDecision | null
}): string {
  const bullets: string[] = []
  bullets.push(`- Closed for **+$${fmtMoney(ctx.pnl)}** after ${Math.round(ctx.holdMs / 60_000)}m hold — reinforce this entry signature.`)
  if (ctx.regimeAtEntry === 'trend_up' || ctx.regimeAtEntry === 'trend_down') {
    bullets.push(`- Entered in **${ctx.regimeAtEntry}** — a trending regime. Continue to weight regime gate heavily.`)
  }
  if (ctx.tacticsAtEntry && ctx.tacticsAtEntry.signalQuality > 0.65) {
    bullets.push(`- Signal quality was strong (**${ctx.tacticsAtEntry.signalQuality.toFixed(2)}**). The MAY-TACTICS gate held its edge here.`)
  }
  if (ctx.aiDecision && !ctx.aiDecision.veto && ctx.aiDecision.confidence > 0.65) {
    bullets.push(`- AI brain agreed at **${(ctx.aiDecision.confidence * 100).toFixed(0)}%** confidence. Pattern: high AI confidence + trending regime = compoundable edge.`)
  }
  return bullets.join('\n')
}

function extractVetoLearnings(t: TacticsStatus): string {
  const lines: string[] = []
  lines.push(`MAY-TACTICS transitioned into **veto** because ${t.vetoReason ?? 'risk metrics breached threshold'}.`)
  lines.push('')
  lines.push('What the system has learned from this regime, captured *before* we throw the data away:')
  lines.push('')
  lines.push(`- Win rate at veto: **${(t.winRate * 100).toFixed(1)}%** over ${t.tradesObserved} trades`)
  lines.push(`- Expectancy: $${fmtMoney(t.expectancy)} per trade`)
  lines.push(`- Max drawdown: **${(t.maxDrawdown * 100).toFixed(2)}%**`)
  lines.push(`- Signal quality drift: **${t.signalQuality.toFixed(2)}**`)
  lines.push('')
  lines.push('Carry-forward: these metrics are the floor the next calibration must beat. Do not graduate the next regime back to `armed` without exceeding them.')
  return lines.join('\n')
}
