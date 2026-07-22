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
