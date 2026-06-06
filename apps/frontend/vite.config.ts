import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

import { compression } from 'vite-plugin-compression2'
import { ViteImageOptimizer } from 'vite-plugin-image-optimizer'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    // Compress all assets to .gz and .br during build
    compression({ exclude: [/\.(br)$/, /\.(gz)$/] }),
    // @ts-expect-error - ViteCompressionPluginOption missing algorithm in some versions
    compression({ algorithm: 'brotliCompress', exclude: [/\.(br)$/, /\.(gz)$/] }),
    // Automatically optimize and minify SVGs, PNGs, etc.
    ViteImageOptimizer({
      svg: {
        multipass: true,
      },
    }),
  ],
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.{test,spec}.ts'],
    globals: true,
  },
  build: {
    target: 'esnext', // Use modern JS syntax, reducing unnecessary polyfills
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      onwarn(warning, warn) {
        // Ignore harmless third-party library warnings (upstream bug in @vueuse with Rolldown)
        if (warning.code === 'INVALID_ANNOTATION' && warning.message.includes('#__PURE__')) return
        warn(warning)
      },
      output: {
        // Professional chunking strategy: Separate heavy dependencies into their own chunks.
        // This prevents a single index.js from exceeding 500kb and improves browser caching.
        manualChunks(id) {
          if (id.includes('node_modules/vue') || id.includes('node_modules/pinia') || id.includes('node_modules/vue-router')) return 'vue-vendor';
          if (id.includes('node_modules/radix-vue') || id.includes('node_modules/reka-ui') || id.includes('node_modules/lucide-vue-next') || id.includes('node_modules/vue-sonner')) return 'ui-vendor';
          if (id.includes('node_modules/@tanstack')) return 'tanstack-vendor';
          if (id.includes('node_modules/lightweight-charts') || id.includes('node_modules/chart.js') || id.includes('node_modules/vue-chartjs')) return 'chart-vendor';
          if (id.includes('node_modules/zod') || id.includes('node_modules/@vueuse') || id.includes('node_modules/clsx') || id.includes('node_modules/tailwind-merge')) return 'utils-vendor';
        }
      }
    }
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  }
})
