import { useEffect, useRef, useState } from "react";

function AnimatedNumber({ value, duration = 420 }) {
  const [displayValue, setDisplayValue] = useState(value);
  const previousValueRef = useRef(value);

  useEffect(() => {
    const startValue = previousValueRef.current;
    const endValue = value;
    previousValueRef.current = value;

    if (startValue === endValue) {
      setDisplayValue(endValue);
      return undefined;
    }

    const start = performance.now();
    let rafId;

    const tick = (timestamp) => {
      const progress = Math.min(1, (timestamp - start) / duration);
      const next = Math.round(startValue + (endValue - startValue) * progress);
      setDisplayValue(next);
      if (progress < 1) {
        rafId = requestAnimationFrame(tick);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [value, duration]);

  return <>{displayValue}</>;
}

export default AnimatedNumber;
