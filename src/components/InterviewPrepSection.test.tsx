import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { api } from "../api";
import type { PrepItem } from "../types";
import { InterviewPrepSection } from "./InterviewPrepSection";
// Side-effect: initializes i18next so `t()` renders real copy instead of
// raw keys.
import "../i18n";

// InterviewPrepSection renders nothing (`if (!items) return null`) until
// its prep-items fetch resolves, so the api module is mocked here — unlike
// components that render a stable shell independent of their data.
vi.mock("../api", () => ({
  api: {
    list: vi.fn(),
  },
}));

const noop = () => {};

const mockItems: PrepItem[] = [
  {
    id: 1,
    application_id: 1,
    text: "Research the company",
    done: false,
    sort_order: 0,
    created_at: "2026-07-01T00:00:00.000Z",
  },
];

describe("InterviewPrepSection", () => {
  test("renders items once the fetch resolves", async () => {
    vi.mocked(api.list).mockResolvedValue(mockItems);
    render(<InterviewPrepSection applicationId={1} onError={noop} />);
    expect(
      await screen.findByText("Research the company"),
    ).toBeInTheDocument();
  });

  test("renders the starter checklist button when there are no items", async () => {
    vi.mocked(api.list).mockResolvedValue([]);
    render(<InterviewPrepSection applicationId={1} onError={noop} />);
    expect(
      await screen.findByText("+ Add a starter checklist"),
    ).toBeInTheDocument();
  });

  test("emits zui-prep classes, never the legacy prep name", async () => {
    vi.mocked(api.list).mockResolvedValue(mockItems);
    const { container } = render(
      <InterviewPrepSection applicationId={1} onError={noop} />,
    );
    await screen.findByText("Research the company");
    const root = container.firstElementChild;
    expect(root).toHaveClass("zui-prep-checklist");
    expect(root?.className).not.toMatch(/(^|\s)prep-checklist(\s|$)/);
  });
});
