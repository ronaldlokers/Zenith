import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, test } from "vitest";
import { AiKeyGate } from "./AiKeyGate";
import { AiStatusContext, type AiStatus } from "../ai-status-context";
// Side-effect: initializes i18next so `t()` renders real copy.
import "../i18n";

function renderGate(status: Partial<AiStatus>) {
  const value: AiStatus = {
    configured: false,
    hint: null,
    loading: false,
    refresh: () => {},
    ...status,
  };
  return render(
    <MemoryRouter>
      <AiStatusContext.Provider value={value}>
        <AiKeyGate>
          <button>Start</button>
        </AiKeyGate>
      </AiStatusContext.Provider>
    </MemoryRouter>,
  );
}

describe("AiKeyGate", () => {
  test("renders children once a key is configured", () => {
    renderGate({ configured: true });
    expect(screen.getByRole("button", { name: "Start" })).toBeDefined();
    expect(screen.queryByRole("link")).toBeNull();
  });

  test("shows a settings link when no key is configured", () => {
    renderGate({ configured: false });
    expect(screen.queryByRole("button", { name: "Start" })).toBeNull();
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/settings?s=account");
  });

  test("renders nothing while status is still loading", () => {
    const { container } = renderGate({ loading: true });
    expect(container.textContent).toBe("");
  });
});
