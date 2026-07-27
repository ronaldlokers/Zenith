import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { RowMenu } from "./RowMenu";

const items = [
  { label: "Move up", onSelect: () => {}, disabled: true },
  { label: "Move down", onSelect: () => {} },
  { label: "Edit", onSelect: () => {} },
  { label: "Delete", onSelect: () => {}, danger: true },
];

describe("RowMenu", () => {
  test("renders only the ⋯ trigger until opened", () => {
    render(<RowMenu label="Actions for Staff Engineer" items={items} />);
    const trigger = screen.getByRole("button", {
      name: "Actions for Staff Engineer",
    });
    expect(trigger).toHaveTextContent("⋯");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  test("opens on click and lists every action", () => {
    render(<RowMenu label="Actions" items={items} />);
    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getAllByRole("menuitem")).toHaveLength(4);
    expect(screen.getByRole("menuitem", { name: "Move up" })).toBeDisabled();
    expect(screen.getByRole("menuitem", { name: "Delete" })).toHaveClass(
      "danger",
    );
  });

  test("selecting an action runs it and closes the menu", () => {
    const onSelect = vi.fn();
    render(
      <RowMenu label="Actions" items={[{ label: "Edit", onSelect }]} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Edit" }));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  test("Escape closes the menu", () => {
    render(<RowMenu label="Actions" items={items} />);
    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  test("emits zui-rowmenu class names", () => {
    const { container } = render(<RowMenu label="Actions" items={items} />);
    expect(container.firstChild).toHaveClass("zui-rowmenu");
    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    expect(screen.getByRole("menu")).toHaveClass("zui-rowmenu-pop");
  });
});
