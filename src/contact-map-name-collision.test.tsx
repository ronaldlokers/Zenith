import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { ContactRelationshipMap } from "./companies";
import type { Application, Contact } from "./types";
// Side-effect: initializes i18next so t("company.contactMap") renders real
// copy instead of the raw key.
import "./i18n";

// Two contacts at the same company sharing an exact name ("Alex") — not
// unusual. One is referenced by a referral link (contact_id 2), the other
// is an unrelated contact who never appears in any application (contact_id
// 3). Keying the "already shown" set by display name instead of contact id
// makes the second Alex vanish from the map instead of rendering as an
// unlinked node.
const contacts: Contact[] = [
  { id: 1, name: "Jordan", role: "Recruiter" },
  { id: 2, name: "Alex", role: "Engineer" },
  { id: 3, name: "Alex", role: "Designer" },
] as unknown as Contact[];

const applications: Application[] = [
  {
    id: 100,
    referred_by_contact_id: 1,
    referred_by_name: "Jordan",
    contact_id: 2,
    contact_name: "Alex",
  },
] as unknown as Application[];

test("setup produces exactly one referral link between Jordan and the linked Alex", () => {
  // Guards against the test proving nothing because the collision never
  // actually happens (e.g. the two Alexes aren't really both present, or
  // the link doesn't really reference one of them).
  render(<ContactRelationshipMap contacts={contacts} applications={applications} />);
  const links = document.querySelectorAll(".contact-map-link");
  expect(links).toHaveLength(1);
  expect(links[0].textContent).toContain("Jordan");
  expect(links[0].textContent).toContain("Alex");
});

describe("contact map name collision", () => {
  test("both same-named contacts render: one linked, one unlinked", () => {
    render(<ContactRelationshipMap contacts={contacts} applications={applications} />);

    // The linked Alex (id 2) appears inside the referral link.
    const link = document.querySelector(".contact-map-link");
    expect(link?.textContent).toContain("Alex");

    // The unrelated Alex (id 3) must still show up, as an unlinked node —
    // not silently dropped because her name string collides with the
    // linked contact's.
    const unlinkedList = document.querySelector(".contact-map-list");
    expect(unlinkedList?.textContent).toContain("Designer");
    const unlinkedItems = document.querySelectorAll(".contact-map-list li");
    expect(unlinkedItems).toHaveLength(1);
  });

  test("a genuinely linked contact is not also double-rendered as unlinked", () => {
    // Jordan (id 1) and the referred Alex (id 2) are both in the one
    // referral link above — neither should reappear in the unlinked list.
    render(<ContactRelationshipMap contacts={contacts} applications={applications} />);
    const unlinkedNames = [...document.querySelectorAll(".contact-map-list li")].map(
      (li) => li.textContent,
    );
    expect(unlinkedNames.some((t) => t?.includes("Recruiter"))).toBe(false);
    expect(unlinkedNames.some((t) => t?.includes("Engineer"))).toBe(false);
  });

  test("sanity: everyone renders unlinked when no application references any contact", () => {
    // Proves the duplicate-render assertion above isn't vacuous: if the
    // component (wrongly) treated everyone as unlinked, this is what it
    // would look like — all three contacts in the unlinked list, none in a
    // link. The test above must fail if this becomes the actual behaviour
    // for the linked fixture.
    render(<ContactRelationshipMap contacts={contacts} applications={[]} />);
    expect(document.querySelectorAll(".contact-map-link")).toHaveLength(0);
    expect(document.querySelectorAll(".contact-map-list li")).toHaveLength(3);
  });

  test("renders the map heading", () => {
    render(<ContactRelationshipMap contacts={contacts} applications={applications} />);
    expect(screen.getByText("Contacts")).toBeInTheDocument();
  });
});
