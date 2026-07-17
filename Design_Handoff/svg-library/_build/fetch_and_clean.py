#!/usr/bin/env python3
"""
Fetch each curated SVG, clean it so the EasySchematic injector keeps it intact,
write it into the right category subfolder, and emit manifest.json.

Cleaning rules (match src/svgSanitizer.ts allowlist + task spec):
  - drop <?xml?>, <!DOCTYPE>, XML comments, <script>, on* handlers, external refs
  - drop width/height attrs on the root (KEEP viewBox so it scales/tints)
  - for monochrome line-art (force_cc): set stroke/fill -> "currentColor"
  - normalise self-closing + collapse whitespace
"""
from __future__ import annotations

import json
import re
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from sources import (  # noqa: E402
    REPOS,
    GAMEICON_AUTHORS,
    GENERIC,
    AUDIO,
    NETWORK,
    FURNITURE,
    VIDEO,
    LIGHTING,
    COMPUTE,
    POWER,
)

LIB_ROOT = Path(__file__).resolve().parent.parent
CATEGORIES = {
    "generic": GENERIC,
    "audio": AUDIO,
    "video": VIDEO,
    "lighting": LIGHTING,
    "network": NETWORK,
    "compute": COMPUTE,
    "power": POWER,
    "furniture": FURNITURE,
}

# Build the human label from an id ("round-table" -> "Round Table").
SPECIAL_CASE = {"di": "DI", "dsp": "DSP", "dj": "DJ", "iem": "IEM",
                "nas": "NAS", "nic": "NIC", "poe": "PoE", "rf": "RF",
                "fa": "", "io": "I/O", "tv": "TV", "ptz": "PTZ",
                "led": "LED", "pdu": "PDU", "ups": "UPS", "kvm": "KVM",
                "hdmi": "HDMI", "sbc": "SBC"}


def humanize(stem: str) -> str:
    words = []
    for w in stem.split("-"):
        if w in SPECIAL_CASE:
            mapped = SPECIAL_CASE[w]
            if mapped:
                words.append(mapped)
        else:
            words.append(w.capitalize())
    return " ".join(words).strip()


# ---------------------------------------------------------------------------
# SVG cleaning
# ---------------------------------------------------------------------------
COMMENT_RE = re.compile(r"<!--.*?-->", re.DOTALL)
DOCTYPE_RE = re.compile(r"<!DOCTYPE[^>]*>", re.IGNORECASE)
XMLDECL_RE = re.compile(r"<\?xml[^>]*\?>", re.IGNORECASE)
SCRIPT_RE = re.compile(r"<script\b[^>]*>.*?</script\s*>", re.IGNORECASE | re.DOTALL)
ON_HANDLER_RE = re.compile(r'\son\w+\s*=\s*"[^"]*"', re.IGNORECASE)
WIDTH_HEIGHT_RE = re.compile(r'\s(width|height)\s*=\s*"[^"]*"', re.IGNORECASE)
# strip xmlns:xlink / class / id-on-root noise that is harmless but unneeded
CLASS_RE = re.compile(r'\sclass\s*=\s*"[^"]*"', re.IGNORECASE)
EXTERNAL_HREF_RE = re.compile(r'\s(?:xlink:)?href\s*=\s*"(?:https?:)?//[^"]*"', re.IGNORECASE)
WS_RE = re.compile(r">\s+<")
# A concrete colour value we should swap for currentColor: hex, rgb(), or a
# named colour — but NEVER "none", "currentColor", or "transparent".
_CONCRETE_COLOR = r'(?!none"|currentColor"|transparent")[^"]*'
FILL_VAL_RE = re.compile(r'(\sfill\s*=\s*")' + _CONCRETE_COLOR + r'(")', re.IGNORECASE)
STROKE_VAL_RE = re.compile(r'(\sstroke\s*=\s*")' + _CONCRETE_COLOR + r'(")', re.IGNORECASE)
ROOT_HAS_FILL_NONE_RE = re.compile(r'<svg\b[^>]*\bfill\s*=\s*"none"', re.IGNORECASE)
# game-icons.net glyphs are a full-bleed background path + a white foreground
# glyph. Drop the background so the icon tints as line/solid art, not a block.
GAMEICON_BG_RE = re.compile(r'<path\b[^>]*\bd\s*=\s*"M0 0h512v512H0z"[^>]*/>', re.IGNORECASE)


def clean_svg(raw: str, force_current_color: bool, is_gameicon: bool = False) -> str:
    s = raw.strip()
    s = XMLDECL_RE.sub("", s)
    s = DOCTYPE_RE.sub("", s)
    s = COMMENT_RE.sub("", s)
    s = SCRIPT_RE.sub("", s)
    s = ON_HANDLER_RE.sub("", s)
    s = EXTERNAL_HREF_RE.sub("", s)
    s = WIDTH_HEIGHT_RE.sub("", s)
    s = CLASS_RE.sub("", s)
    if is_gameicon:
        s = GAMEICON_BG_RE.sub("", s)

    # Ensure viewBox exists; if a material-symbols glyph lost it, bail loud.
    if "viewbox" not in s.lower():
        raise ValueError("missing viewBox after clean")

    if force_current_color:
        # Stroke-based line-art (Tabler/Lucide/Feather) keeps fill="none" and
        # paints via stroke; fill-based art (Material/FA/Bootstrap) paints via
        # fill. Detect which BEFORE rewriting, then make the paint hook
        # currentColor so the app can tint it via `color`.
        stroke_based = bool(ROOT_HAS_FILL_NONE_RE.search(s))

        # Swap every concrete colour value -> currentColor (preserve none/transparent).
        s = FILL_VAL_RE.sub(r"\1currentColor\2", s)
        s = STROKE_VAL_RE.sub(r"\1currentColor\2", s)

        def _root(m: re.Match[str]) -> str:
            head = m.group(0)
            if stroke_based:
                # fill="none" is already present; guarantee a stroke hook.
                if "stroke=" not in head:
                    head = head[:-1] + ' stroke="currentColor">'
            else:
                if "fill=" not in head:
                    head = head[:-1] + ' fill="currentColor">'
            return head

        s = re.sub(r"<svg\b[^>]*>", _root, s, count=1)

    s = WS_RE.sub("><", s)
    return s.strip()


# ---------------------------------------------------------------------------
# Tags from the embedded Tabler comment (best effort) + subcategory fallback
# ---------------------------------------------------------------------------
def extract_tabler_tags(raw: str) -> list[str]:
    m = re.search(r"tags:\s*\[([^\]]*)\]", raw)
    if not m:
        return []
    return [t.strip().strip('"').strip("'") for t in m.group(1).split(",") if t.strip()]


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "easyschematic-svglib/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:  # noqa: S310 (trusted GH hosts)
        return resp.read().decode("utf-8")


def gameicon_author(path: str) -> str:
    stem = path.split("/")[0]
    return GAMEICON_AUTHORS.get(stem, stem)


def main() -> int:
    manifest: list[dict] = []
    failures: list[str] = []
    seen_ids: set[tuple[str, str]] = set()

    for category, rows in CATEGORIES.items():
        out_dir = LIB_ROOT / category
        out_dir.mkdir(parents=True, exist_ok=True)
        for (subcat, file_id, repo_key, path, force_cc) in rows:
            key = (category, file_id)
            if key in seen_ids:
                print(f"  ! dup id skipped: {category}/{file_id}")
                continue
            repo = REPOS[repo_key]
            url = repo["base"] + path
            try:
                raw = fetch(url)
            except Exception as exc:  # noqa: BLE001
                failures.append(f"{category}/{file_id}  <-  {url}  ({exc})")
                continue
            try:
                cleaned = clean_svg(raw, force_cc, is_gameicon=(repo_key == "gameicons"))
            except Exception as exc:  # noqa: BLE001
                failures.append(f"{category}/{file_id}  CLEAN-FAIL  ({exc})")
                continue

            (out_dir / f"{file_id}.svg").write_text(cleaned + "\n", encoding="utf-8")
            seen_ids.add(key)

            tags = extract_tabler_tags(raw)
            base_tags = list(dict.fromkeys(
                [subcat.replace("-", " "), category] + [t for t in tags[:6]]
            ))

            attribution = repo["attribution"]
            if repo_key == "gameicons":
                attribution = f"{gameicon_author(path)} — game-icons.net, CC BY 3.0"

            manifest.append({
                "id": file_id,
                "name": humanize(file_id),
                "category": category,
                "subcategory": subcat,
                "tags": base_tags,
                "file": f"{category}/{file_id}.svg",
                "source": repo["source"],
                "license": repo["license"],
                "attribution": attribution,
            })

    manifest.sort(key=lambda m: (m["category"], m["subcategory"], m["id"]))
    (LIB_ROOT / "manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )

    # Summary
    by_cat: dict[str, int] = {}
    for m in manifest:
        by_cat[m["category"]] = by_cat.get(m["category"], 0) + 1
    print("\n=== WROTE ===")
    for c, n in sorted(by_cat.items()):
        print(f"  {c:10s} {n}")
    print(f"  {'TOTAL':10s} {len(manifest)}")
    if failures:
        print("\n=== FAILURES ===")
        for f in failures:
            print("  " + f)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
