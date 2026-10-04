const DOT_LAYOUTS = {
  1: [[50, 50]],
  2: [
    [28, 28],
    [72, 72],
  ],
  3: [
    [25, 25],
    [50, 50],
    [75, 75],
  ],
  4: [
    [28, 28],
    [72, 28],
    [28, 72],
    [72, 72],
  ],
  5: [
    [28, 28],
    [72, 28],
    [50, 50],
    [28, 72],
    [72, 72],
  ],
  6: [
    [28, 25],
    [72, 25],
    [28, 50],
    [72, 50],
    [28, 75],
    [72, 75],
  ],
};

function DieFace({ value, rolling }) {
  const safeValue = Number(value) >= 1 && Number(value) <= 6 ? Number(value) : 1;

  return (
    <div className={`die-face ${rolling ? "rolling" : ""}`}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        {DOT_LAYOUTS[safeValue].map(([x, y], index) => (
          <circle key={`${safeValue}-${index}`} cx={x} cy={y} r="8.5" />
        ))}
      </svg>
    </div>
  );
}

function DiceDisplay({ pair, rolling = false }) {
  const [left = 1, right = 1] = Array.isArray(pair) ? pair : [1, 1];

  return (
    <div
      className="dice-display"
      aria-label={pair ? `Dice: ${left} and ${right}` : "Dice not rolled yet"}
    >
      <DieFace value={left} rolling={rolling} />
      <DieFace value={right} rolling={rolling} />
      <span className="dice-total">{pair ? `= ${left + right}` : "Ready"}</span>
    </div>
  );
}

export default DiceDisplay;
