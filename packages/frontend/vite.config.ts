import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  base: '/bridge-bidding-assistant/',
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      '/bridge-bidding-assistant-server': {
        target: 'http://localhost:10240',
        changeOrigin: true
      }
    }
  }
})
