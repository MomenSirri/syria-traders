export const HEX_PRESET_ASSETS = [
  { id: "wheat", label: "River and grain", resource: "wheat", url: "/terrain/wheat.svg" },
  { id: "wood", label: "Coastal woodland", resource: "wood", url: "/terrain/wood.svg" },
  { id: "stone", label: "Mountain stone", resource: "stone", url: "/terrain/stone.svg" },
  { id: "brick", label: "Courtyard and craft", resource: "brick", url: "/terrain/brick.svg" },
  { id: "sheep", label: "Pastoral hills", resource: "sheep", url: "/terrain/sheep.svg" },
  { id: "desert", label: "The Badiya", resource: "desert", url: "/terrain/desert.svg" },
];
export const DEFAULT_ASSET_BY_RESOURCE = Object.fromEntries(HEX_PRESET_ASSETS.map((asset) => [asset.resource, asset.id]));
export function presetMapById() { return Object.fromEntries(HEX_PRESET_ASSETS.map((asset) => [asset.id, asset])); }
// Painted territory art (webp) where it exists; the generated flat scenes (svg)
// cover the rest, and uploads or unknown names fall back to the resource art.
const slug = (region) => region.toLowerCase().replace(/[^a-z]+/g, "-");
const PAINTED = new Set([
  "afrin-highlands", "aleppo", "badiya", "damascus", "daraa", "deir-ez-zor", "hama",
  "hasakah", "homs", "idlib", "jabal-ansariyah", "latakia", "manbij", "palmyra-foothills",
  "quneitra-plains", "raqqa-steppe", "rif-dimashq", "suwayda", "tartus",
  // Tunisian regions of the 7-8 player map, painted with Codex.
  "ain-draham", "ariana", "beja", "ben-arous", "bizerte", "carthage", "djerba", "dougga",
  "douz", "el-djem", "gabes", "gafsa", "jendouba", "kairouan", "kasserine", "le-kef",
  "manouba", "monastir", "nabeul", "sbeitla", "sfax", "sidi-bouzid", "siliana", "sousse",
  "tabarka", "tataouine", "tozeur", "zaghouan",
]);
export const regionArtUrl = (region) => {
  const name = slug(region);
  return `/terrain/regions/${name}.${PAINTED.has(name) ? "webp" : "svg"}`;
};
