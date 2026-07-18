import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

import { cloudflare } from "@cloudflare/vite-plugin";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), cloudflare()],
  build: {
    rollupOptions: {
      output: {
        // Split the vendor libs out of the main app chunk (#346) so the
        // first paint on mobile (a locked first-class target) doesn't pull
        // the whole 500KB+ bundle. React + router + i18n rarely change and
        // cache well on their own.
        manualChunks: (id: string) => {
          if (/node_modules\/(react|react-dom|react-router|scheduler)\//.test(id))
            return "react";
          if (/node_modules\/(i18next|react-i18next)/.test(id)) return "i18n";
        },
      },
    },
  },
})