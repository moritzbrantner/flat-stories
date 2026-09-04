import { describe, expect, it } from "vitest";
import { snapPoint, snapValue } from "./snapping";

describe("grid snapping", () => {
  it("rounds coordinates to the nearest positive grid step", () => {
    expect(snapValue(14.9, 10)).toBe(10);
    expect(snapValue(15.1, 10)).toBe(20);
    expect(snapPoint({ x: -14.9, y: 25.2 }, 10)).toEqual({ x: -10, y: 30 });
  });

  it("leaves values alone when snapping is disabled by an invalid step", () => {
    expect(snapValue(12.5, 0)).toBe(12.5);
  });
});
