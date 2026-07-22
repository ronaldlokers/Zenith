import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, test } from "vitest";
import { NotificationBell } from "./NotificationBell";
// Side-effect: initializes i18next so `t()` renders real copy instead of
// raw keys.
import "../i18n";

// NotificationBell calls useNavigate(), which requires a router context.
function renderBell() {
  return render(
    <MemoryRouter>
      <NotificationBell />
    </MemoryRouter>,
  );
}

describe("NotificationBell", () => {
  test("renders the bell button", () => {
    renderBell();
    expect(
      screen.getByRole("button", { name: "Notifications" }),
    ).toBeInTheDocument();
  });

  test("clicking the bell opens the panel", () => {
    renderBell();
    fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
    expect(screen.getByRole("dialog", { name: "Notifications" })).toBeInTheDocument();
  });

  test("emits zui-notification classes, never the legacy notification name", () => {
    const { container } = renderBell();
    const bell = container.querySelector("span");
    expect(bell).toHaveClass("zui-notification-bell");
    expect(bell?.className).not.toMatch(/(^|\s)notification-bell(\s|$)/);

    fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
    const panel = screen.getByRole("dialog", { name: "Notifications" });
    expect(panel).toHaveClass("zui-notification-panel");
    expect(panel.className).not.toMatch(/(^|\s)notification-panel(\s|$)/);
  });
});
