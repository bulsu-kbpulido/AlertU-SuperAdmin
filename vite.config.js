import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  const backendOrigin = (
    env.VITE_API_URL || 'https://alertu-server.onrender.com'
  ).replace(/\/+$/, '').replace(/\/api$/i, '');

  return {
    plugins: [
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      host: true,
      proxy: {
        '/api': {
          target: backendOrigin,
          changeOrigin: true,
          secure: true,
          ws: true,
        },
        '/socket.io': {
          target: backendOrigin,
          changeOrigin: true,
          secure: true,
          ws: true,
        },
      },
    },
  };
});