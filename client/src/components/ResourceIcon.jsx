// Custom resource glyphs: solid ink silhouettes on a 24px grid with light facet
// details, drawn to sit on the tinted resource chips and stay legible from 12px
// on a phone to 40px on a TV. Inline SVG, so they work offline on the LAN.
const INK = "#1d2430";
const LIGHT = "#fff8e6";

const GLYPHS = {
  wheat: (
    <>
      <path d="M11.2 8.5h1.6V22h-1.6z" fill={INK} />
      <path d="M12 18.5c-2.6-.2-4.6 1-5.6 3 2.4.4 4.6-.6 5.6-3zM12 18.5c2.6-.2 4.6 1 5.6 3-2.4.4-4.6-.6-5.6-3z" fill={INK} />
      <ellipse cx="12" cy="5.4" rx="1.9" ry="3.3" fill={INK} />
      <ellipse cx="9.1" cy="10.1" rx="1.8" ry="3.2" transform="rotate(-38 9.1 10.1)" fill={INK} />
      <ellipse cx="14.9" cy="10.1" rx="1.8" ry="3.2" transform="rotate(38 14.9 10.1)" fill={INK} />
      <ellipse cx="9.1" cy="14.4" rx="1.8" ry="3.2" transform="rotate(-38 9.1 14.4)" fill={INK} />
      <ellipse cx="14.9" cy="14.4" rx="1.8" ry="3.2" transform="rotate(38 14.9 14.4)" fill={INK} />
      <path d="M11.4 3.6v2.6M8.6 8.6l1 1.6M15.4 8.6l-1 1.6M8.6 12.9l1 1.6M15.4 12.9l-1 1.6" stroke={LIGHT} strokeOpacity=".55" strokeWidth=".9" strokeLinecap="round" />
    </>
  ),
  wood: (
    <>
      <path d="M12 1.8 17.2 8.4h-2.6l4.6 5.8h-2.8l4.4 5.6H3.2l4.4-5.6H4.8l4.6-5.8H6.8z" fill={INK} />
      <path d="M10.6 19.8h2.8v3h-2.8z" fill={INK} />
      <path d="M12 4.6 9.6 7.8M12 9.6l-3.4 4.4M12 15.2l-4 4.6" stroke={LIGHT} strokeOpacity=".5" strokeWidth="1" strokeLinecap="round" />
    </>
  ),
  stone: (
    <>
      <path d="M2.8 19.6 5.6 10.4 10.8 5.6l6.2 1.6 4.2 6.4-1 6z" fill={INK} />
      <path d="M10.8 5.6 12 12l-6.4-1.6M12 12l9.2 1.6M12 12l1.2 7.6" fill="none" stroke={LIGHT} strokeOpacity=".55" strokeWidth="1.1" strokeLinejoin="round" />
      <path d="M6.2 12.6 7.8 17" stroke={LIGHT} strokeOpacity=".3" strokeWidth="1" strokeLinecap="round" />
    </>
  ),
  brick: (
    <>
      <rect x="1.8" y="13" width="9.7" height="7" rx="1.2" fill={INK} />
      <rect x="12.5" y="13" width="9.7" height="7" rx="1.2" fill={INK} />
      <rect x="7.15" y="4.8" width="9.7" height="7" rx="1.2" fill={INK} />
      <path d="M3.2 14.6h6.9M13.9 14.6h6.9M8.55 6.4h6.9" stroke={LIGHT} strokeOpacity=".45" strokeWidth="1.1" strokeLinecap="round" />
      <circle cx="12" cy="9" r=".9" fill={LIGHT} fillOpacity=".35" />
      <circle cx="6.6" cy="17.3" r=".9" fill={LIGHT} fillOpacity=".35" />
      <circle cx="17.4" cy="17.3" r=".9" fill={LIGHT} fillOpacity=".35" />
    </>
  ),
  sheep: (
    <>
      <path d="M9 16.6h1.7v4.6H9zM12.4 16.6h1.7v4.6h-1.7zM16 16.6h1.7v4.6H16z" fill={INK} />
      <g fill={INK}>
        <circle cx="10.2" cy="10.8" r="3.6" />
        <circle cx="14" cy="9.4" r="3.8" />
        <circle cx="17.8" cy="11.4" r="3.4" />
        <circle cx="15.6" cy="14.4" r="3.4" />
        <circle cx="11.4" cy="14.4" r="3.4" />
      </g>
      <path d="M11.2 9.2a2.2 2.2 0 0 1 2.6-1.4M15.6 12.2a2 2 0 0 1 2.4.2" fill="none" stroke={LIGHT} strokeOpacity=".5" strokeWidth="1" strokeLinecap="round" />
      <ellipse cx="5.6" cy="12.2" rx="2.9" ry="2.3" fill={INK} stroke={LIGHT} strokeOpacity=".8" strokeWidth=".9" />
      <path d="M6.2 9.8c.8-.9 2-1.1 2.8-.6-.3 1-1.2 1.6-2.2 1.6z" fill={INK} />
      <circle cx="4.7" cy="11.7" r=".75" fill={LIGHT} />
    </>
  ),
};

function ResourceIcon({ resource, size = 18 }) {
  const glyph = GLYPHS[resource];
  if (!glyph) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="resource-glyph">
      {glyph}
    </svg>
  );
}

export default ResourceIcon;
