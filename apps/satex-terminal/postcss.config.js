module.exports = {
  plugins: {
    // Tailwind 4 moved its PostCSS plugin to a separate package. Note: this
    // project has no `@import "tailwindcss"` entry point (globals.css is
    // hand-authored), so Tailwind emits nothing — the plugin is a no-op kept
    // for parity. See PR: Tailwind is vestigial here.
    '@tailwindcss/postcss': {},
    autoprefixer: {},
  },
}
