import { describe, expect, it } from "vitest";
import { DAY_OPTIONS, MAX_DAYS } from "./store";
import { decodeScenario } from "./url";

describe("mission length in shared links", () => {
  it("keeps every length the menu offers, up to a year", () => {
    for (const d of DAY_OPTIONS) expect(decodeScenario(`?s=apollo-11&start=2027-09-15&d=${d}`)?.days).toBe(d);
    expect(Math.max(...DAY_OPTIONS)).toBe(MAX_DAYS);
  });

  it("ignores lengths beyond a year or below a day", () => {
    expect(decodeScenario("?s=apollo-11&start=2027-09-15&d=400")?.days).toBeUndefined();
    expect(decodeScenario("?s=apollo-11&start=2027-09-15&d=0")?.days).toBeUndefined();
  });
});
