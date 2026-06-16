/**
 * Pure security utility for sanitizing user-imported SVG before it is injected
 * via `dangerouslySetInnerHTML`. SVG can carry script execution vectors
 * (`<script>`, `on*` event handlers, `javascript:` URIs, external `<use>`
 * references, `<foreignObject>` HTML embedding), so untrusted markup must be
 * scrubbed to an allowlist before it ever reaches the DOM.
 *
 * Two code paths exist so this works in both environments:
 *  - Browser: a real `DOMParser` walks the tree against an element/attribute
 *    allowlist (robust, structure-aware).
 *  - Node / vitest (no `DOMParser`): a conservative regex fallback strips the
 *    same dangerous constructs textually.
 *
 * The fallback is intentionally pessimistic: when in doubt it removes content
 * rather than risk passing an execution vector through.
 */

/** SVG elements permitted to survive sanitization. Anything else is removed. */
const ALLOWED_ELEMENTS: ReadonlySet<string> = new Set([
  "svg",
  "g",
  "path",
  "rect",
  "circle",
  "ellipse",
  "polygon",
  "polyline",
  "line",
  "text",
  "tspan",
  "defs",
  "clipPath",
  "mask",
  "symbol",
  "use",
  "linearGradient",
  "radialGradient",
  "stop",
  "title",
  "desc",
]);

/** Attributes permitted on surviving elements. Anything else is removed. */
const ALLOWED_ATTRS: ReadonlySet<string> = new Set([
  "viewBox",
  "width",
  "height",
  "x",
  "y",
  "rx",
  "ry",
  "cx",
  "cy",
  "r",
  "d",
  "points",
  "fill",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-dasharray",
  "opacity",
  "fill-opacity",
  "stroke-opacity",
  "transform",
  "id",
  "class",
  "href",
  "xlink:href",
  "clip-path",
  "mask",
  "font-size",
  "font-family",
  "font-weight",
  "text-anchor",
  "dominant-baseline",
  "offset",
  "stop-color",
  "stop-opacity",
  "gradientUnits",
  "gradientTransform",
  "x1",
  "y1",
  "x2",
  "y2",
  "fx",
  "fy",
  "preserveAspectRatio",
  "display",
  "visibility",
  "overflow",
]);

/** Elements removed outright regardless of allowlist (defense in depth). */
const FORBIDDEN_ELEMENTS: ReadonlySet<string> = new Set([
  "script",
  "foreignobject",
]);

/** Matches dangerous URI schemes that can execute code. */
const DANGEROUS_URI_RE = /(?:javascript|vbscript):/i;

/** Matches any `data:` URI that is not an image (only `data:image/` is safe). */
const NON_IMAGE_DATA_URI_RE = /data:(?!image\/)/i;

/** Returns true when an attribute value carries an unsafe URI scheme. */
function hasDangerousUri(value: string): boolean {
  return DANGEROUS_URI_RE.test(value) || NON_IMAGE_DATA_URI_RE.test(value);
}

/**
 * Returns true when a reference value is unsafe for `href` / `xlink:href`.
 * Only internal fragment references (`#id`) are allowed; external schemes,
 * protocol-relative URLs, and dangerous URIs are rejected.
 */
function isUnsafeReference(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.startsWith("#")) return false;
  return true;
}

/**
 * Browser path: parse, walk the tree against the allowlist, and re-serialize.
 * Returns sanitized markup, or null if the input cannot be made safe.
 */
function sanitizeWithDomParser(raw: string): string | null {
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(raw, "image/svg+xml");
  } catch {
    return null;
  }

  // A `<parsererror>` node signals malformed XML; refuse it entirely.
  if (doc.getElementsByTagName("parsererror").length > 0) return null;

  const root = doc.documentElement;
  if (!root || root.tagName.toLowerCase() !== "svg") return null;

  // Collect elements first; mutating the tree while iterating a live list is
  // error-prone, so snapshot into an array and act on it.
  const elements: Element[] = [];
  const walker = (node: Element): void => {
    elements.push(node);
    for (const child of Array.from(node.children)) walker(child);
  };
  walker(root);

  for (const el of elements) {
    // The root may have been detached when an ancestor was removed.
    if (!el.isConnected && el !== root) continue;

    const tag = el.tagName.toLowerCase();

    if (FORBIDDEN_ELEMENTS.has(tag) || !ALLOWED_ELEMENTS.has(tag)) {
      el.remove();
      continue;
    }

    sanitizeElementAttributes(el);
  }

  let serialized: string;
  try {
    serialized = new XMLSerializer().serializeToString(root);
  } catch {
    return null;
  }

  const trimmed = serialized.trim();
  if (trimmed.length === 0 || !trimmed.includes("<svg")) return null;
  return trimmed;
}

/** Strips unsafe attributes from a single allowlisted element in place. */
function sanitizeElementAttributes(el: Element): void {
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase();
    const value = attr.value;

    // Remove all event handlers (onload, onerror, onclick, ...).
    if (name.startsWith("on")) {
      el.removeAttribute(attr.name);
      continue;
    }

    if (!ALLOWED_ATTRS.has(attr.name) && !ALLOWED_ATTRS.has(name)) {
      el.removeAttribute(attr.name);
      continue;
    }

    if (hasDangerousUri(value)) {
      el.removeAttribute(attr.name);
      continue;
    }

    if (
      (name === "href" || name === "xlink:href") &&
      isUnsafeReference(value)
    ) {
      el.removeAttribute(attr.name);
    }
  }
}

/**
 * Node / test path: a conservative regex scrub. This cannot understand SVG
 * structure, so it errs toward removal — stripping known-dangerous constructs
 * and event handlers while leaving benign geometry intact.
 * Returns the cleaned string if an `<svg` root survives, else null.
 */
function sanitizeWithRegex(raw: string): string | null {
  let out = raw;

  // Remove <script>...</script> (including unterminated trailing scripts).
  out = out.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "");
  out = out.replace(/<script\b[^>]*>[\s\S]*$/gi, "");

  // Remove <foreignObject>...</foreignObject> (HTML embedding vector).
  out = out.replace(
    /<foreignObject\b[^>]*>[\s\S]*?<\/foreignObject\s*>/gi,
    "",
  );
  out = out.replace(/<foreignObject\b[^>]*\/>/gi, "");
  out = out.replace(/<foreignObject\b[^>]*>[\s\S]*$/gi, "");

  // Strip on* event-handler attributes (double-quoted, single-quoted, bare).
  out = out.replace(/\son\w+\s*=\s*"[^"]*"/gi, "");
  out = out.replace(/\son\w+\s*=\s*'[^']*'/gi, "");
  out = out.replace(/\son\w+\s*=\s*[^\s>]+/gi, "");

  // Neutralize any attribute carrying a dangerous URI scheme.
  out = out.replace(
    /\s[\w:-]+\s*=\s*"(?:[^"]*?)(?:javascript|vbscript):[^"]*"/gi,
    "",
  );
  out = out.replace(
    /\s[\w:-]+\s*=\s*'(?:[^']*?)(?:javascript|vbscript):[^']*'/gi,
    "",
  );

  // Neutralize non-image data: URIs (data:image/ is permitted, others are not).
  out = out.replace(
    /\s[\w:-]+\s*=\s*"data:(?!image\/)[^"]*"/gi,
    "",
  );
  out = out.replace(
    /\s[\w:-]+\s*=\s*'data:(?!image\/)[^']*'/gi,
    "",
  );

  // Strip external href / xlink:href (http, https, protocol-relative).
  out = out.replace(
    /\s(?:xlink:)?href\s*=\s*"(?:https?:)?\/\/[^"]*"/gi,
    "",
  );
  out = out.replace(
    /\s(?:xlink:)?href\s*=\s*'(?:https?:)?\/\/[^']*'/gi,
    "",
  );

  const trimmed = out.trim();
  if (trimmed.length === 0 || !trimmed.includes("<svg")) return null;
  return trimmed;
}

/**
 * Sanitizes raw SVG markup down to a safe allowlisted subset.
 *
 * @param rawSvg Untrusted SVG source (e.g. an uploaded icon file).
 * @returns Sanitized SVG markup, or `null` when the input is empty, malformed,
 *          or cannot be reduced to something safe to render.
 */
export function sanitizeSvg(rawSvg: string): string | null {
  if (typeof rawSvg !== "string") return null;

  const raw = rawSvg.trim();
  if (raw.length === 0) return null;

  if (typeof DOMParser !== "undefined") {
    return sanitizeWithDomParser(raw);
  }
  return sanitizeWithRegex(raw);
}

/** Named alias for {@link sanitizeSvg}, used by call sites elsewhere. */
export const sanitizeSvgMarkup = sanitizeSvg;
