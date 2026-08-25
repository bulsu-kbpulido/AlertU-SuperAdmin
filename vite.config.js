import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 🔒 AST-level Babel plugin to strip all console.* calls in production builds
const removeConsoleBabelPlugin = () => ({
  visitor: {
    CallExpression(path) {
      const callee = path.get('callee');
      if (
        callee.isMemberExpression() &&
        callee.get('object').isIdentifier({ name: 'console' })
      ) {
        path.remove();
      }
    },
  },
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  const backendOrigin = (
    env.VITE_API_URL || 'https://alertu-server-production.up.railway.app'
  ).replace(/\/+$/, '').replace(/\/api$/i, '');

  const isProd = mode === 'production';

  return {
    plugins: [
      react({
        babel: {
          plugins: isProd ? [removeConsoleBabelPlugin] : [],
        },
      }),
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