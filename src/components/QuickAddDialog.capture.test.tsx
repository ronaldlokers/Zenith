import { describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuickAddDialog } from "./QuickAddDialog";
import type { Company } from "../types";

vi.mock("../api", () => ({
  api: { create: vi.fn(), importUrl: vi.fn() },
}));

const COMPANIES = [
  { id: 7, name: "Northwind" },
  { id: 8, name: "Initech" },
] as unknown as Company[];

function open(prefill?: { title?: string; company?: string; url?: string }) {
  function Harness() {
    const [shown] = useState(true);
    return shown ? (
      <QuickAddDialog
        companies={COMPANIES}
        prefill={prefill}
        onClose={() => {}}
        onCreated={() => {}}
        onError={() => {}}
      />
    ) : null;
  }
  render(<Harness />);
}

describe("a job captured from a posting", () => {
  it("arrives in the form ready to confirm", async () => {
    // The bookmarklet hands over what the page said about itself. Nothing is
    // saved until someone presses a button here — that is the whole reason
    // capture opens this dialog rather than posting from the job board.
    open({
      title: "Staff Platform Engineer",
      company: "Northwind",
      url: "https://northwind.example/jobs/42",
    });
    expect(
      (screen.getByLabelText("Title", { exact: true }) as HTMLInputElement).value,
    ).toBe("Staff Platform Engineer");
    expect(
      screen.getByRole("combobox", { name: /company/i }),
    ).toHaveValue("7");
  });

  it("matches a company by name rather than inventing one", async () => {
    // A captured site name is a guess. Creating a company from it would fill
    // the list with near-duplicates nobody chose to add.
    open({ title: "SRE", company: "Northwind Cloud Systems Ltd" });
    expect(screen.getByRole("combobox", { name: /company/i })).toHaveValue("");
    expect(
      (screen.getByLabelText("Title", { exact: true }) as HTMLInputElement).value,
    ).toBe("SRE");
  });

  it("leaves the form empty when nothing was captured", async () => {
    open();
    expect(
      (screen.getByLabelText("Title", { exact: true }) as HTMLInputElement).value,
    ).toBe("");
  });

  it("does not let a saved draft overwrite what was just captured", async () => {
    // Someone arriving from the bookmarklet is adding the job they are
    // looking at, not resuming an older one. The draft stays for the next
    // ordinary open.
    sessionStorage.setItem(
      "zenith_quickadd_draft",
      JSON.stringify({ title: "An older job", companyId: 8, url: "", status: "interested" }),
    );
    open({ title: "The job on screen" });
    expect(
      (screen.getByLabelText("Title", { exact: true }) as HTMLInputElement).value,
      "a restored draft replaced the captured job",
    ).toBe("The job on screen");
    expect(
      sessionStorage.getItem("zenith_quickadd_draft"),
      "the draft was consumed by a capture that did not use it",
    ).not.toBeNull();
    sessionStorage.clear();
  });

  it("keeps the captured link as the application's url", async () => {
    const user = userEvent.setup();
    open({ title: "SRE", url: "https://northwind.example/jobs/42" });
    const url = screen.getByRole("textbox", { name: /paste a link/i });
    expect(url).toHaveValue("https://northwind.example/jobs/42");
    await user.clear(url);
    expect(url).toHaveValue("");
  });
});
