import { defineConfig } from 'vite';

// manifold-3d ships a WASM binary. Vite's dep pre-bundling (esbuild) mangles the
// glue code's wasm path resolution, so we exclude it and load the .wasm via an
// explicit `?url` import + locateFile (see src/lib/manifold.ts).
export default defineConfig({
  optimizeDeps: {
    exclude: ['manifold-3d'],
  },
});
