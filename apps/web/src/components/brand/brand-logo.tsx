/**
 * Official upCarrera brand mark, rendered from the vector assets in
 * `public/brand/` (derived from the master logo PDF).
 *
 *  - `color`  full lockup, green mark + dark wordmark — use on LIGHT surfaces.
 *  - `light`  full lockup, green mark + white wordmark — use on DARK surfaces.
 *  - `mark`   graduation-cap mark only — favicons, collapsed sidebar, avatars.
 */
type BrandVariant = "color" | "light" | "mark";

const SOURCES: Record<BrandVariant, string> = {
  color: "/brand/logo-color.svg",
  light: "/brand/logo-light.svg",
  mark: "/brand/mark.svg",
};

interface BrandLogoProps {
  variant?: BrandVariant;
  className?: string;
  alt?: string;
}

export function BrandLogo({
  variant = "color",
  className,
  alt = "upCarrera",
}: BrandLogoProps) {
  return (
    <img
      src={SOURCES[variant]}
      alt={alt}
      className={className}
      draggable={false}
      decoding="async"
    />
  );
}
