/** @type {import('@storybook/react-vite').StorybookConfig} */
const config = {
  // Phase 1: stories live in the design-system bundle, which is synced from
  // the Claude Design project (see .design-sync/config.json). As components
  // are extracted out of src/App.tsx they inherit these components' prop APIs
  // and the stories get repointed at src/.
  stories: ["../.claude/skills/zenith-design/stories/**/*.stories.@(js|jsx)"],
  addons: ["@storybook/addon-a11y", "@storybook/addon-docs"],
  // No telemetry is a locked product decision — Storybook opts in by default.
  core: { disableTelemetry: true },
  framework: {
    name: "@storybook/react-vite",
    options: { builder: { viteConfigPath: ".storybook/vite.config.js" } },
  },
};
export default config;
