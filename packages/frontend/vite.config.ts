import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { visualizer } from 'rollup-plugin-visualizer'
import path from 'path'

// Must match the helmet policy in packages/backend/src/server.ts. nginx
// serves index.html for "/" without going through Express, so the policy
// has to travel inside the page. frame-ancestors cannot be set by a meta
// tag; main.tsx refuses to render inside a frame instead.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  [
    "connect-src 'self'",
    'https://base.drpc.org',
    'https://1rpc.io',
    'https://*.base.org',
    'https://*.basescan.org',
    'https://*.basescan.com',
    'https://*.publicnode.com',
    'https://*.alchemy.com',
    'https://*.alchemyapi.io',
    'https://*.g.alchemy.com',
    'https://*.infura.io',
    'https://*.quiknode.pro',
    'https://*.ankr.com',
    'https://*.blockpi.network',
  ].join(' '),
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "script-src-attr 'none'",
  'upgrade-insecure-requests',
].join('; ')

function contentSecurityPolicy(): Plugin {
  return {
    name: 'vpp-content-security-policy',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY },
        injectTo: 'head-prepend',
      },
    ],
  }
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    contentSecurityPolicy(),
    process.env.ANALYZE === 'true' &&
      visualizer({
        open: true,
        filename: 'dist/bundle-stats.html',
        gzipSize: true,
        brotliSize: true,
      }),
  ].filter(Boolean),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router'],
          ethers: ['ethers'],
          i18n: ['i18next', 'react-i18next'],
        },
      },
    },
  },
})
