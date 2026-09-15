import { describe, expect, it } from "vitest";
import { shareLowerBound } from "../src/runner/report";

// The no-dominant-genome check flags an option only when its top-quartile share is above the
// limit beyond sampling noise (decided 2026-09-14).

const Z95 = 1.645;

describe("dominance is judged beyond sampling noise", () => {
  it("the lower bound sits below the observed share and tightens as the sample grows", () => {
    const small = shareLowerBound(45, 100, Z95);
    const large = shareLowerBound(450, 1000, Z95);
    expect(small).toBeLessThan(0.45);
    expect(large).toBeLessThan(0.45);
    expect(large).toBeGreaterThan(small);
    expect(shareLowerBound(45, 100, 0)).toBeCloseTo(0.45, 12);
  });

  it("45% of 100 top-quartile runs is within noise of 40%, but 45% of 1000 is not", () => {
    expect(shareLowerBound(45, 100, Z95)).toBeLessThan(0.4);
    expect(shareLowerBound(450, 1000, Z95)).toBeGreaterThan(0.4);
  });

  it("a clear outlier is flagged even in a small sample, and nothing is flagged from no runs", () => {
    expect(shareLowerBound(60, 100, Z95)).toBeGreaterThan(0.4);
    expect(shareLowerBound(0, 0, Z95)).toBe(0);
  });
});
