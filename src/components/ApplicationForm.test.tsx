import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type { Company, Contact, RoleTypeDef } from "../types";
import { ApplicationForm } from "./ApplicationForm";
// Side-effect: initializes i18next so `t()` renders real copy instead of
// raw keys.
import "../i18n";

const mockCompanies: Company[] = [];
const mockContacts: Contact[] = [];
const mockRoleTypes: RoleTypeDef[] = [
  { id: 1, slug: "other", label: "Other", sort_order: 0 },
];

const noop = () => {};

function renderForm(overrides: Partial<Parameters<typeof ApplicationForm>[0]> = {}) {
  return render(
    <ApplicationForm
      initial={null}
      companies={mockCompanies}
      contacts={mockContacts}
      roleTypes={mockRoleTypes}
      applications={[]}
      onSubmit={noop}
      onCancel={noop}
      onError={noop}
      {...overrides}
    />,
  );
}

describe("ApplicationForm", () => {
  test("renders the form fields", () => {
    renderForm();
    expect(screen.getByRole("textbox", { name: /title/i })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /role/i })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /url/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  // Title is the only required field; the native `required` attribute is
  // what blocks submission until it's filled — verify both halves: the
  // field is marked required, and once filled, submit reaches onSubmit.
  test("title is required, and submitting a filled form calls onSubmit", () => {
    const onSubmit = vi.fn();
    renderForm({ onSubmit });
    const title = screen.getByRole("textbox", { name: /title/i });
    expect(title).toBeRequired();

    fireEvent.change(title, { target: { value: "Staff Engineer" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Staff Engineer" }),
    );
  });

  test("emits zui-url-row on the URL row, never the legacy url-row name", () => {
    const { container } = renderForm();
    const row = container.querySelector(".zui-url-row");
    expect(row).not.toBeNull();
    expect(container.querySelector(".url-row")).toBeNull();
  });
});

describe("salary range", () => {
  // A range that runs backwards was accepted in silence — 120000 to 90000
  // saved with no complaint — and then read as a range everywhere it
  // appeared, including the offer comparison, which does arithmetic on the
  // two numbers.
  //
  // The fix is the max field's `min` attribute bound to whatever the min
  // field holds, so the constraint API blocks it. This form already leans on
  // that API for the required title, and it brings blocking, focus and
  // screen-reader announcement without a second validation path or a message
  // to translate.
  const min = () => screen.getByLabelText(/min/i) as HTMLInputElement;
  const max = () => screen.getByLabelText(/max/i) as HTMLInputElement;

  test("will not accept a maximum below the minimum", () => {
    renderForm();
    fireEvent.change(min(), { target: { value: "120000" } });
    fireEvent.change(max(), { target: { value: "90000" } });
    expect(max().checkValidity(), "a backwards range must not validate").toBe(false);
    expect(max().validationMessage).toBeTruthy();
  });

  test("accepts a range the right way round", () => {
    renderForm();
    fireEvent.change(min(), { target: { value: "90000" } });
    fireEvent.change(max(), { target: { value: "120000" } });
    expect(max().checkValidity()).toBe(true);
  });

  test("leaves a maximum alone when there is no minimum", () => {
    // Half a range is a normal thing to know: "up to 80k" is information.
    // Only the max is constrained for the same reason — giving the min a max
    // as well would fight whoever fills the two in the order they are shown.
    renderForm();
    fireEvent.change(max(), { target: { value: "80000" } });
    expect(max().checkValidity()).toBe(true);
  });

  test("still refuses a negative maximum", () => {
    // The floor the field had before this, which the new bound must not
    // quietly replace.
    renderForm();
    fireEvent.change(max(), { target: { value: "-5" } });
    expect(max().checkValidity()).toBe(false);
  });
});
