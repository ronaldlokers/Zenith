import { describe, expect, it } from "vitest";
import { buildNegotiationDraft, MIN_POOL_FOR_MEDIAN } from "../src/format";

// The offer benchmark is the highest-stakes number in the app: it is money,
// and it feeds a line the user reads out in a salary conversation
// ("~12% below the median of my other offers for this role — worth
// raising"). Off a single other offer that sentence was false twice — there
// is no median of one number, and "my other offers" was one offer.
//
// The floor is the guard, so the floor is what gets pinned. Three is the
// smallest pool where a median is not simply the one value or the midpoint
// of two.
describe("offer benchmark floor", () => {
  it("will not call a pool of one or two a median", () => {
    expect(MIN_POOL_FOR_MEDIAN).toBe(3);
    expect(MIN_POOL_FOR_MEDIAN).toBeGreaterThan(2);
  });
});

const t = ((key: string, vars?: Record<string, unknown>) =>
  vars ? `${key}:${JSON.stringify(vars)}` : key) as never;

const offer = (id: number, comp: number, role = "platform") => ({
  id,
  title: `Role ${id}`,
  status: "offer",
  role_type: role,
  company_name: `Co ${id}`,
  salary_min: comp,
  salary_max: comp,
  salary_currency: "EUR",
  bonus: null,
  equity_value: null,
}) as never;

describe("buildNegotiationDraft", () => {
  it("omits the median line with only one other offer", () => {
    const mine = offer(1, 90000);
    const brief = buildNegotiationDraft(mine, [mine, offer(2, 120000)], t);
    expect(brief).not.toContain("negotiationBelowMarket");
    // Nothing is lost: the competing-offer line already names it, and
    // truthfully, which is why the floor costs no information here.
    expect(brief).toContain("negotiationCompeting");
  });

  it("states it once there are three to median", () => {
    const mine = offer(1, 90000);
    const brief = buildNegotiationDraft(
      mine,
      [mine, offer(2, 120000), offer(3, 130000), offer(4, 140000)],
      t,
    );
    expect(brief).toContain("negotiationBelowMarket");
  });
});
