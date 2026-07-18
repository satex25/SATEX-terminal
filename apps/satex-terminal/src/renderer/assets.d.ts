/**
 * Ambient module declarations for non-code assets imported for their
 * side effects (Vite handles the actual bundling). Needed once TS moved to
 * "bundler" moduleResolution under TypeScript 6, which type-checks these
 * side-effect imports instead of silently ignoring them.
 */
declare module '*.css'
