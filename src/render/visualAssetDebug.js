export function deriveVisualAssetDebugState({
  manifestTheme = "flat_worldsim",
  tileMaterials = [],
  iconMaterials = [],
  unitSpriteCount = 0,
} = {}) {
  const tileList = Array.from(tileMaterials ?? []);
  const iconList = Array.from(iconMaterials ?? []);
  const resolvedTheme = String(manifestTheme || "flat_worldsim");

  return {
    visualAssetPack: resolvedTheme,
    tileTexturesLoaded: tileList.length > 0 && tileList.every((material) => Boolean(material?.map)),
    iconAtlasLoaded: iconList.some((material) => Boolean(material?.map)),
    unitSpriteLoaded: Number(unitSpriteCount) > 0,
  };
}
