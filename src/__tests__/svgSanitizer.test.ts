import { describe, expect, it } from "vitest";
import { sanitizeSvg, sanitizeSvgMarkup } from "../svgSanitizer";

// These tests run under the vitest "node" environment, which has no DOMParser,
// so they exercise the conservative regex fallback path in sanitizeSvg.

describe("sanitizeSvg (regex fallback path)", () => {
  it("removes a nested <script> element but keeps the benign <path>", () => {
    // Arrange
    const raw = '<svg><script>alert(1)</script><path d="M0 0"/></svg>';

    // Act
    const result = sanitizeSvg(raw);

    // Assert
    expect(result).not.toBeNull();
    expect(result).not.toContain("<script");
    expect(result).not.toContain("alert(1)");
    expect(result).toContain('<path d="M0 0"');
  });

  it("strips onload and onerror event-handler attributes", () => {
    // Arrange
    const raw =
      '<svg onload="steal()"><image onerror="evil()" /><path d="M0 0"/></svg>';

    // Act
    const result = sanitizeSvg(raw);

    // Assert
    expect(result).not.toBeNull();
    expect(result).not.toMatch(/onload/i);
    expect(result).not.toMatch(/onerror/i);
    expect(result).not.toContain("steal()");
    expect(result).not.toContain("evil()");
  });

  it("strips an external http href reference", () => {
    // Arrange
    const raw = '<svg><use href="http://evil.com/x.svg#a" /></svg>';

    // Act
    const result = sanitizeSvg(raw);

    // Assert
    expect(result).not.toBeNull();
    expect(result).not.toContain("evil.com");
    expect(result).not.toContain("http://");
  });

  it("strips a javascript: URI from an attribute", () => {
    // Arrange
    const raw = '<svg><a href="javascript:alert(1)"><path d="M0 0"/></a></svg>';

    // Act
    const result = sanitizeSvg(raw);

    // Assert
    expect(result).not.toBeNull();
    expect(result).not.toMatch(/javascript:/i);
    expect(result).not.toContain("alert(1)");
  });

  it("passes a benign SVG through and preserves the <svg> root", () => {
    // Arrange
    const raw =
      '<svg viewBox="0 0 24 24"><rect x="0" y="0" width="24" height="24" fill="#000"/></svg>';

    // Act
    const result = sanitizeSvg(raw);

    // Assert
    expect(result).not.toBeNull();
    expect(result).toContain("<svg");
    expect(result).toContain('viewBox="0 0 24 24"');
    expect(result).toContain("<rect");
  });

  it("returns null for an empty string", () => {
    // Arrange
    const raw = "";

    // Act
    const result = sanitizeSvg(raw);

    // Assert
    expect(result).toBeNull();
  });

  it("returns null for whitespace-only input", () => {
    // Arrange
    const raw = "   \n\t  ";

    // Act
    const result = sanitizeSvg(raw);

    // Assert
    expect(result).toBeNull();
  });

  it("returns null for non-svg garbage input", () => {
    // Arrange
    const raw = "not an svg at all <div>hi</div>";

    // Act
    const result = sanitizeSvg(raw);

    // Assert
    expect(result).toBeNull();
  });

  it("exposes sanitizeSvgMarkup as an alias of sanitizeSvg", () => {
    // Arrange / Act / Assert
    expect(sanitizeSvgMarkup).toBe(sanitizeSvg);
  });
});
