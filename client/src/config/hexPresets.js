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
