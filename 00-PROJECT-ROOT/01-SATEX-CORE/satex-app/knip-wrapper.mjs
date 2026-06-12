// Shim process.version for knip on Node 22
Object.defineProperty(process, 'version', {
  value: 'v20.19.0',
  writable: false,
  configurable: true
});

// Import and run knip
import('./node_modules/knip/dist/index.js').catch(e => {
  console.error('knip failed:', e);
  process.exit(1);
});
