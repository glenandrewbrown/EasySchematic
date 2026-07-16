import { describe, expect, test } from "vitest";
import {
  formatFeetInches,
  formatLengthMode,
  formatLengthParts,
  formatMeters,
  metersToFeetInches,
  FEET_PER_METER,
} from "../lengthFormat";

describe("metersToFeetInches", () => {
  test("splits a length into whole feet and inches", () => {
    // 18 m = 59.055 ft -> 59' 0.66" -> 59' 1"
    expect(metersToFeetInches(18)).toEqual({ feet: 59, inches: 1 });
  });

  test("carries at 12 inches rather than emitting 12", () => {
    // Any length that rounds to 12" must roll into the next foot: 0.3048 m is exactly 1 ft.
    for (let m = 0; m < 30; m += 0.01) {
      const { inches } = metersToFeetInches(m);
      expect(inches).toBeLessThan(12);
      expect(inches).toBeGreaterThanOrEqual(0);
    }
  });

  test("rounds up into a whole foot instead of reporting 0 feet 12 inches", () => {
    // 0.3047 m rounds to 12" of the 0th foot — it must present as 1' 0".
    expect(metersToFeetInches(0.3047)).toEqual({ feet: 1, inches: 0 });
  });

  test("handles zero", () => {
    expect(metersToFeetInches(0)).toEqual({ feet: 0, inches: 0 });
  });

  test("keeps the sign on a negative length", () => {
    expect(metersToFeetInches(-1).feet).toBeLessThanOrEqual(0);
  });
});

describe("formatFeetInches", () => {
  test("renders feet and inches with prime marks", () => {
    expect(formatFeetInches(18)).toBe("59′ 1″");
  });

  test("uses the shared metre-to-foot ratio", () => {
    expect(FEET_PER_METER).toBeCloseTo(3.28084, 5);
  });
});

describe("formatMeters", () => {
  test("renders one decimal place", () => {
    expect(formatMeters(18)).toBe("18.0 m");
    expect(formatMeters(1.25)).toBe("1.3 m");
  });
});

describe("formatLengthMode", () => {
  test("metric mode", () => {
    expect(formatLengthMode(18, "m")).toBe("18.0 m");
  });

  test("imperial mode", () => {
    expect(formatLengthMode(18, "ft")).toBe("59′ 1″");
  });

  test("both mode shows metric and imperial together", () => {
    expect(formatLengthMode(18, "both")).toBe("18.0 m · 59′ 1″");
  });

  test("a non-finite length renders as an em dash in every mode", () => {
    for (const mode of ["m", "ft", "both"] as const) {
      expect(formatLengthMode(NaN, mode)).toBe("—");
      expect(formatLengthMode(Infinity, mode)).toBe("—");
    }
  });
});

describe("formatLengthParts", () => {
  test("single-unit modes have no secondary line", () => {
    expect(formatLengthParts(18, "m")).toEqual({ primary: "18.0 m", secondary: null });
    expect(formatLengthParts(18, "ft")).toEqual({ primary: "59′ 1″", secondary: null });
  });

  test("both mode splits into primary metric and secondary imperial", () => {
    expect(formatLengthParts(18, "both")).toEqual({ primary: "18.0 m", secondary: "59′ 1″" });
  });

  test("a non-finite length has no secondary line", () => {
    expect(formatLengthParts(NaN, "both")).toEqual({ primary: "—", secondary: null });
  });
});
