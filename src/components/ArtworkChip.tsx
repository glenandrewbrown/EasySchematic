import { useSchematicStore } from "../store";
import { resolveArtworkSvg } from "../deviceArtwork";
import { deviceClassColor } from "../deviceClassColor";
import type { Port } from "../types";

interface ArtworkChipProps {
  /** Qualified symbol id ("category/id") or uploaded svgAssets key; absent → class default. */
  artworkAssetId?: string;
  device: { deviceType?: string; category?: string; ports?: readonly Port[] };
  /** Outer chip size in px — 24 default node header, 16 compact, 20 library rows. */
  size?: number;
  /** Tint override; defaults to the device class colour so chip = node border hue. */
  color?: string;
  className?: string;
}

/**
 * The device artwork chip (board 3b): the SAME resolved vector everywhere a device shows
 * its identity — node header, library/quick-add rows, Inspector hero, editor preview.
 * SVG sources are trusted (bundled symbol library) or sanitized on upload (addSvgAsset).
 */
export default function ArtworkChip({ artworkAssetId, device, size = 24, color, className }: ArtworkChipProps) {
  const svgAssets = useSchematicStore((s) => s.svgAssets);
  const svg = resolveArtworkSvg(artworkAssetId, svgAssets, device);
  const tint = color ?? deviceClassColor(device.ports as Port[] | undefined);
  return (
    <span
      aria-hidden
      className={`artwork-chip inline-flex items-center justify-center rounded-[5px] flex-none overflow-hidden ${className ?? ""}`}
      style={{
        width: size,
        height: size,
        color: tint,
        background: `color-mix(in srgb, ${tint} 15%, transparent)`,
      }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
