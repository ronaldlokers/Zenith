import { fireEvent, render } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { SettingsRow } from "./row";
// Side-effect: initializes i18next so `t()` renders real copy instead of keys.
import "../i18n";

// The row states a setting's value and keeps its control behind a
// disclosure. Both halves matter: a row that does not say what it is set to
// is worse than the control it replaced, and a disclosure that does not
// actually reach the control is a dead end for anyone not using a mouse.
describe("settings row", () => {
  function renderRow() {
    return render(
      <SettingsRow label="Language" value="English">
        <label className="settings-field">
          <span>Language</span>
          <select aria-label="Language">
            <option>English</option>
          </select>
        </label>
      </SettingsRow>,
    );
  }

  test("states the current value without opening anything", () => {
    const { container } = renderRow();
    // Scoped to the row: the closed panel still holds an <option> saying the
    // same word.
    expect(container.querySelector(".set-row-value")?.textContent).toBe(
      "English",
    );
    expect(container.querySelector(".set-row-panel")?.hasAttribute("hidden")).toBe(
      true,
    );
  });

  test("the row is a disclosure, wired to the panel it opens", () => {
    const { container } = renderRow();
    const line = container.querySelector(".set-row-line")!;
    const panel = container.querySelector(".set-row-panel")!;
    expect(line.getAttribute("aria-expanded")).toBe("false");
    // aria-controls has to name the panel, or the relationship exists only
    // visually and a screen reader announces a button that does nothing.
    expect(line.getAttribute("aria-controls")).toBe(panel.id);
    expect(panel.id).toBeTruthy();

    fireEvent.click(line);
    expect(line.getAttribute("aria-expanded")).toBe("true");
    expect(panel.hasAttribute("hidden")).toBe(false);

    fireEvent.click(line);
    expect(panel.hasAttribute("hidden")).toBe(true);
  });

  test("keeps the control's own label in the accessibility tree", () => {
    // It is hidden visually because the row already says it — but it is what
    // names the control, so removing it would leave an unnamed select.
    const { container } = renderRow();
    fireEvent.click(container.querySelector(".set-row-line")!);
    const span = container.querySelector(".set-row-panel .settings-field span");
    expect(span?.textContent).toBe("Language");
  });
});
