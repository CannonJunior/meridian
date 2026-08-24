import { defineConfig, type Plugin } from 'vite'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import cesiumPluginImport from 'vite-plugin-cesium'

// vite-plugin-cesium ships a CJS build whose .d.ts isn't dual-typed for
// nodenext module resolution (see the actual `require()` shape: a plain
// default import at runtime — via esbuild's interop, which every other
// vite-plugin-cesium consumer relies on — genuinely returns the callable
// plugin factory; only `tsc`'s static analysis of the package's own types
// gets this wrong).
const cesiumPlugin = cesiumPluginImport as unknown as (opts?: { cesiumBuildRootPath?: string; cesiumBuildPath?: string }) => Plugin;

// The plugin's default `cesiumBuildRootPath`/`cesiumBuildPath` are the
// literal relative strings "node_modules/cesium/Build...", resolved
// against whatever the current working directory happens to be when Vite
// runs. That breaks in this npm-workspaces monorepo, where `cesium` is
// hoisted to the repo root's node_modules rather than living under
// web/node_modules — so it's pinned here to an absolute path instead,
// computed from this config file's own location rather than cwd.
const cesiumBuildRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../node_modules/cesium/Build')

export default defineConfig({
  plugins: [react(), cesiumPlugin({ cesiumBuildRootPath: cesiumBuildRoot, cesiumBuildPath: path.join(cesiumBuildRoot, 'Cesium') })],
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
