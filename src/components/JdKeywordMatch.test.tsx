import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { JdKeywordMatch } from "./JdKeywordMatch";
// Side-effect: initializes i18next so `t()` renders real copy instead of
// raw keys.
import "../i18n";

const noop = () => {};

describe("JdKeywordMatch", () => {
  test("renders the JD textarea", () => {
    render(<JdKeywordMatch onError={noop} />);
    expect(
      screen.getByPlaceholderText(
        "Paste the job description to check it against your CV skills…",
      ),
    ).toBeInTheDocument();
  });

  test("does not show a match result until there is JD text", () => {
    const { container } = render(<JdKeywordMatch onError={noop} />);
    expect(container.querySelector(".zui-jd-match-result")).toBeNull();
  });

  test("emits zui-jd-match classes, never the legacy jd-match name", () => {
    const { container } = render(<JdKeywordMatch onError={noop} />);
    const root = container.firstElementChild;
    expect(root).toHaveClass("zui-jd-match");
    expect(root?.className).not.toMatch(/(^|\s)jd-match(\s|$)/);
    const textarea = screen.getByPlaceholderText(
      "Paste the job description to check it against your CV skills…",
    );
    expect(textarea).toHaveClass("zui-jd-match-input");
    expect(textarea.className).not.toMatch(/(^|\s)jd-match-input(\s|$)/);
  });
});
