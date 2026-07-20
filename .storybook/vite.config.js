import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Storybook gets its own Vite config: the app's vite.config.ts loads the
// Cloudflare plugin, which boots workerd and takes over the dev server —
// neither survives being driven by Storybook's builder.
export default defineConfig({
  plugins: [react()],
});
