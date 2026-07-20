import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

test("jsdom project renders React", () => {
  render(<p>hello</p>);
  expect(screen.getByText("hello")).toBeInTheDocument();
});
