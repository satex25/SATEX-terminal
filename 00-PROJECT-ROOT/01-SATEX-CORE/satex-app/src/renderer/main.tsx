import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './globals.css'
import App from './App'

// B9 (2026-05-19) — CSP violation reporting. Without this listener, CSP
// blocks (e.g. an injected <script> via XSS in news/AI content) show only as
// silent renderer console messages. Forward to main so the on-disk rotating
// log captures a forensic trail for any future exploit attempt.
//
// Registered before React mounts so very-early-load violations are caught.
// The SDK is fire-and-forget — we never await; a failed IPC just means the
// renderer can't report (e.g. preload bridge not yet alive on first paint).
document.addEventListener('securitypolicyviolation', (e) => {
  try {
    window.satex?.reportCspViolation?.({
      blockedURI:         e.blockedURI || undefined,
      violatedDirective:  e.violatedDirective || undefined,
      effectiveDirective: e.effectiveDirective || undefined,
      sourceFile:         e.sourceFile || undefined,
      lineNumber:         typeof e.lineNumber === 'number' ? e.lineNumber : undefined,
      columnNumber:       typeof e.columnNumber === 'number' ? e.columnNumber : undefined,
      sample:             e.sample || undefined,
      documentURI:        e.documentURI || undefined,
    })?.catch(() => { /* fire-and-forget */ })
  } catch { /* main not yet alive — swallow */ }
})

const root = document.getElementById('root')
if (!root) throw new Error('No #root element')
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
)
