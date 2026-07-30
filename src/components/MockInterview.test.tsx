import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { MockInterview } from "./MockInterview";
// Side-effect: initializes i18next so `t()` renders real copy instead of
// raw keys.
import "../i18n";

const props = {
  title: "Staff Engineer",
  company: "Acme Corp",
  jobDescription: null,
  onError: () => {},
};

describe("MockInterview", () => {
  // Self-contained: only zui- and shared-primitive classes, so the catalog
  // matches production without App.css (which Storybook never loads).
  test("emits zui-transcript, never the legacy mock- names", () => {
    const { container } = render(<MockInterview {...props} />);
    expect(container.innerHTML).toContain("zui-transcript");
    expect(container.innerHTML).not.toMatch(/class="[^"]*\bmock-/);
  });

  // Before any exchange exists the component is just the prompt and its
  // start control; the transcript log only appears once a turn has run.
  test("offers a way to start before any exchange exists", () => {
    render(<MockInterview {...props} />);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });
});
