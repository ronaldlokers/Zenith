import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { Documents } from "./Documents";
// Side-effect: initializes i18next so `t()` renders real copy instead of
// raw keys.
import "../i18n";

const noop = () => {};

describe("Documents", () => {
  test("renders the label input and attach button", () => {
    render(<Documents applicationId={1} onError={noop} />);
    expect(
      screen.getByPlaceholderText("Label (CV v3, cover letter, …)"),
    ).toBeInTheDocument();
    expect(screen.getByText("Attach file")).toBeInTheDocument();
  });

  test("renders the empty document list", () => {
    const { container } = render(
      <Documents applicationId={1} onError={noop} />,
    );
    expect(container.querySelector(".zui-docs-items")).toBeInTheDocument();
  });

  test("emits zui-docs classes, never the legacy docs name", () => {
    const { container } = render(
      <Documents applicationId={1} onError={noop} />,
    );
    const root = container.firstElementChild;
    expect(root).toHaveClass("zui-docs");
    expect(root?.className).not.toMatch(/(^|\s)docs(\s|$)/);
    const add = container.querySelector(".zui-docs-add");
    expect(add).toBeInTheDocument();
    expect(add?.className).not.toMatch(/(^|\s)docs-add(\s|$)/);
  });
});
