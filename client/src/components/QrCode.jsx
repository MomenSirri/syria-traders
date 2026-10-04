import { useMemo } from "react";
import qrcode from "qrcode-generator";

// Draws the invite link as an SVG QR code, so phones can join by pointing a camera at the TV.
export default function QrCode({ text, label }) {
  const path = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(text);
    qr.make();
    const size = qr.getModuleCount();
    let d = "";
    for (let row = 0; row < size; row++)
      for (let col = 0; col < size; col++) if (qr.isDark(row, col)) d += `M${col} ${row}h1v1h-1z`;
    return { d, size };
  }, [text]);
  return (
    <svg
      className="qr-code"
      viewBox={`-4 -4 ${path.size + 8} ${path.size + 8}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
    >
      <rect x="-4" y="-4" width={path.size + 8} height={path.size + 8} fill="#fff" />
      <path d={path.d} fill="#111" />
    </svg>
  );
}
