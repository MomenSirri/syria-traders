// PostCSS plugin: before each declaration that uses newer CSS, add a simpler copy
// for old smart-TV browsers. Current browsers use the original, which comes last;
// old ones drop it as invalid and keep the copy.
//   color-mix(in srgb, A 70%, B) -> the larger share (A)
//   clamp(min, preferred, max)   -> preferred
//   min(a, ...) / max(a, ...)    -> a
//   dvh, svh, lvh                -> vh
//   inset: ...                   -> top, right, bottom, left (in place)
//   gap, row-gap, column-gap     -> grid-gap, grid-row-gap, grid-column-gap
// Colours like #ffffff12 become rgba() in place, which every browser reads.
const FUNCTIONS = /(^|[^\w-])(color-mix|clamp|min|max)\(/i;

// Splits "a, b(c, d), e" on top-level commas.
function splitArgs(text) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "(") depth++;
    else if (text[i] === ")") depth--;
    else if (text[i] === "," && depth === 0) {
      parts.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(text.slice(start).trim());
  return parts;
}

function dominantColor(args) {
  const [, ...colors] = args; // drop "in srgb"
  const parsed = colors.map((entry) => {
    const match = entry.match(/^(.*?)\s+([\d.]+)%$/);
    return match ? { color: match[1], share: Number(match[2]) } : { color: entry, share: null };
  });
  const known = parsed.reduce((sum, entry) => sum + (entry.share ?? 0), 0);
  const unknown = parsed.filter((entry) => entry.share === null);
  unknown.forEach((entry) => (entry.share = (100 - known) / unknown.length));
  return parsed.reduce((best, entry) => (entry.share > best.share ? entry : best)).color;
}

function simplify(value) {
  let result = value.replace(/(\d)(dvh|svh|lvh)\b/g, "$1vh");
  for (let guard = 0; guard < 50; guard++) {
    const match = FUNCTIONS.exec(result);
    if (!match) break;
    const name = match[2].toLowerCase();
    const open = match.index + match[1].length + name.length;
    let depth = 0;
    let close = open;
    for (; close < result.length; close++) {
      if (result[close] === "(") depth++;
      else if (result[close] === ")" && --depth === 0) break;
    }
    const args = splitArgs(result.slice(open + 1, close));
    const replacement =
      name === "color-mix" ? dominantColor(args) : name === "clamp" ? args[1] : args[0];
    result = result.slice(0, open - name.length) + replacement + result.slice(close + 1);
  }
  return result;
}

const hexAlpha = (value) =>
  value.replace(/#([0-9a-f]{8}|[0-9a-f]{4})\b/gi, (_, hex) => {
    const full = hex.length === 4 ? [...hex].map((c) => c + c).join("") : hex;
    const [r, g, b, a] = full.match(/../g).map((pair) => parseInt(pair, 16));
    return `rgba(${r}, ${g}, ${b}, ${Number((a / 255).toFixed(3))})`;
  });

function legacyCss() {
  return {
    postcssPlugin: "syria-traders-legacy-css",
    Declaration(decl) {
      if (decl.legacyCopy) return;
      decl.value = hexAlpha(decl.value);
      if (decl.prop.startsWith("--")) return;
      // Chrome before 66 only knows the grid- prefixed names.
      if (["gap", "row-gap", "column-gap"].includes(decl.prop))
        decl.cloneBefore({ prop: `grid-${decl.prop}` }).legacyCopy = true;
      if (decl.prop === "inset") {
        const [top, right = top, bottom = top, left = right] = decl.value.split(/\s+/);
        // Longhands mean the same everywhere, so replace rather than copy.
        Object.entries({ top, right, bottom, left }).forEach(([prop, value]) => {
          decl.cloneBefore({ prop, value }).legacyCopy = true;
        });
        decl.remove();
        return;
      }
      const simpler = simplify(decl.value);
      if (simpler !== decl.value) decl.cloneBefore({ value: simpler }).legacyCopy = true;
    },
  };
}
legacyCss.postcss = true;

export default legacyCss;
