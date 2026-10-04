// Google TV and Android TV browsers report a small viewport (often 960x540 on a
// 1080p set), which would give the TV the tablet layout. Table screens are laid
// out 1920 wide instead, and the browser scales the page to fit the screen.
const DEFAULT = "width=device-width, initial-scale=1.0";

export const onTvAddress = () =>
  location.protocol === "http:" ||
  new URLSearchParams(location.search).has("tv") ||
  location.pathname.replace(/\/+$/, "") === "/tv";

export function fitTvViewport(on) {
  const meta = document.querySelector('meta[name="viewport"]');
  if (meta) meta.setAttribute("content", on ? "width=1920" : DEFAULT);
}
