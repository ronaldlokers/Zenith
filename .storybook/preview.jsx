/* eslint-disable react/only-export-components -- a Storybook preview file must
   export its config (globalTypes/decorators/parameters) beside the decorator
   component; there is nowhere else for them to live. */
import React from "react";
// The design-system token files, so stories render on real Zenith tokens.
import "./preview-styles.css";

/**
 * Theme switcher mirroring the app's three locked themes: Automatic follows the
 * OS and is expressed as *no* data-theme attribute, exactly as in the app.
 */
export const globalTypes = {
  theme: {
    name: "Theme",
    description: "Zenith color theme",
    defaultValue: "auto",
    toolbar: {
      icon: "mirror",
      items: [
        { value: "auto", title: "Automatic" },
        { value: "light", title: "Light" },
        { value: "dark", title: "Dark" },
      ],
      dynamicTitle: true,
    },
  },
};

// Capitalised because it *is* a component — the hooks lint rule keys off the name.
const WithTheme = (Story, context) => {
  const theme = context.globals.theme || "auto";
  React.useEffect(() => {
    if (theme === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);
  return React.createElement(
    "div",
    {
      style: {
        background: "var(--bg)",
        color: "var(--ink)",
        padding: 24,
        minHeight: "100vh",
        fontFamily: "var(--sans)",
      },
    },
    React.createElement(Story),
  );
};

export const decorators = [WithTheme];

export const parameters = {
  controls: { matchers: { color: /(background|color)$/i, date: /Date$/ } },
  options: {
    storySort: {
      order: ["Foundations", "Core", "Forms", "Feedback", "Navigation", "Data", "Icons"],
    },
  },
};
