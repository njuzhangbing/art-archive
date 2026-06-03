import { defineConfig } from "vite"
import { localApi } from "./dev/local-api.mjs"

export default defineConfig({
  plugins: [localApi()],
  build: {
    target: "es2022",
    outDir: "dist",
    chunkSizeWarningLimit: 1400
  },
  server: {
    port: 5176,
    strictPort: true
  }
})
