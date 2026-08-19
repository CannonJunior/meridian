import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // maplibre-gl loads a separate worker bundle at runtime (for tiling
  // GeoJSON/vector sources off the main thread); Vite's esbuild-based
  // dep optimizer rewrites/pre-bundles it in a way that breaks that
  // dynamic worker path (silently — sources add with no error, but
  // never produce rendered features). Excluding it from pre-bundling
  // lets the package's own worker loading do the right thing.
  optimizeDeps: {
    exclude: ['maplibre-gl'],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8799',
      '/ws': {
        target: 'ws://localhost:8799',
        ws: true,
      },
    },
  },
})
