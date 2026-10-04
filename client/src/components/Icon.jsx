// One stroke icon family (24px grid, 1.8 stroke, round caps) for every control.
const PATHS = {
  road: "M4 20L10 4h4l6 16M12 5v3m0 3v3m0 3v3",
  village: "M3 11l9-8 9 8M6 9v12h12V9M10 21v-7h4v7",
  city: "M3 21V9h7v12M10 21V3h11v18M13 7h5m-5 4h5m-5 4h5",
  roll: "M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2M8 8h.01M16 16h.01M12 12h.01",
  end: "M4 12h16m-6-6 6 6-6 6",
  help: "M12 21a9 9 0 100-18 9 9 0 000 18zM9.1 9a3 3 0 015.8 1c0 2-3 3-3 3M12 17h.01",
  exit: "M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9",
  close: "M18 6 6 18M6 6l12 12",
  plus: "M12 5v14M5 12h14",
  soundOn: "M11 5 6 9H2v6h4l5 4V5zM15.5 8.5a5 5 0 010 7M19 5a10 10 0 010 14",
  soundOff: "M11 5 6 9H2v6h4l5 4V5zM22 9l-6 6M16 9l6 6",
  swap: "M7 16V4M3 8l4-4 4 4M17 8v12M21 16l-4 4-4-4",
  upload: "M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12",
  shuffle: "M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5",
  copy: "M8 8h12v12H8zM16 8V4H4v12h4",
  card: "M7 3h10a2 2 0 012 2v14a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2zM12 8l1.2 2.5 2.8.4-2 1.9.5 2.7-2.5-1.3-2.5 1.3.5-2.7-2-1.9 2.8-.4z",
};

export default function Icon({ name, size = 18, className = "btn-icon" }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
