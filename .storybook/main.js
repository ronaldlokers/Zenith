/** @type {import('@storybook/react-vite').StorybookConfig} */
const config = {
  // The catalog is the owned components in src/components/ — each extracted
  // from the app's own patterns and self-contained. The design-system bundle
  // stories (.claude/skills/zenith-design) were the phase-1 scaffold and have
  // been retired now that the owned components fully supersede them.
  stories: ["../src/components/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-a11y", "@storybook/addon-docs"],
  // No telemetry is a locked product decision — Storybook opts in by default.
  core: { disableTelemetry: true },
  framework: {
    name: "@storybook/react-vite",
    options: { builder: { viteConfigPath: ".storybook/vite.config.js" } },
  },
};
export default config;
