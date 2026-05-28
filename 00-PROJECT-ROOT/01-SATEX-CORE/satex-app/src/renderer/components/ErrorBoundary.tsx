import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** Rendered in place of `children` after a render throw. A function form
   *  receives the captured error so consumers can show its message. */
  fallback?: ReactNode | ((err: Error) => ReactNode)
  /** Optional side-channel for logging / telemetry. */
  onError?: (err: Error, info: ErrorInfo) => void
}
interface State { err: Error | null }

/**
 * Localized render-error boundary. If the subtree throws during render,
 * `fallback` renders in its place so one broken child can never blank the
 * entire app. Place ONE per isolation unit (e.g. each Quad pane).
 *
 * NOT a catch-all: React's contract only catches RENDER errors. Async work
 * (effects, promises, event handlers) must still try/catch on its own.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { err: null }

  static getDerivedStateFromError(err: Error): State {
    return { err }
  }

  componentDidCatch(err: Error, info: ErrorInfo): void {
    // Surface to the renderer console (and through to the main-process log
    // sink via the existing renderer-console forwarder).
    console.error('[error-boundary]', err.message, info.componentStack)
    this.props.onError?.(err, info)
  }

  render(): ReactNode {
    const { err } = this.state
    if (err) {
      const fb = this.props.fallback
      if (typeof fb === 'function') return fb(err)
      return fb ?? null
    }
    return this.props.children
  }
}
