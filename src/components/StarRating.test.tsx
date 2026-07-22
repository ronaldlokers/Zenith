import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { StarRating } from "./StarRating";

describe("StarRating", () => {
  test("renders `max` radio buttons", () => {
    render(<StarRating value={null} max={5} onChange={vi.fn()} />);
    expect(screen.getAllByRole("radio")).toHaveLength(5);
  });

  test("clicking star 3 calls onChange(3)", () => {
    const onChange = vi.fn();
    render(<StarRating value={null} onChange={onChange} />);
    fireEvent.click(screen.getAllByRole("radio")[2]);
    expect(onChange).toHaveBeenCalledWith(3);
  });

  test("clicking the current value calls onChange(null)", () => {
    const onChange = vi.fn();
    render(<StarRating value={3} onChange={onChange} />);
    fireEvent.click(screen.getAllByRole("radio")[2]);
    expect(onChange).toHaveBeenCalledWith(null);
  });

  test("aria-checked reflects value", () => {
    render(<StarRating value={2} onChange={vi.fn()} />);
    const radios = screen.getAllByRole("radio");
    expect(radios[1]).toHaveAttribute("aria-checked", "true");
    expect(radios[0]).toHaveAttribute("aria-checked", "false");
    expect(radios[2]).toHaveAttribute("aria-checked", "false");
  });

  // The component must be self-contained: no App.css class names, because
  // Storybook never loads App.css and the catalog must match production.
  test("emits zui-star classes, not legacy fit-star names", () => {
    render(<StarRating value={2} onChange={vi.fn()} />);
    const radios = screen.getAllByRole("radio");
    const cls = radios[1].className.split(/\s+/);
    expect(cls).toContain("zui-star");
    expect(cls).toContain("zui-star--on");
    expect(cls).not.toContain("fit-star");
    expect(cls).not.toContain("on");
  });

  test("disabled disables the buttons", () => {
    render(<StarRating value={null} onChange={vi.fn()} disabled />);
    for (const radio of screen.getAllByRole("radio")) {
      expect(radio).toBeDisabled();
    }
  });
});
