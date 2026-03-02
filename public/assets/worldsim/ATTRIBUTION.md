# WorldSim Visual Pack Attribution

Downloaded and integrated on **March 2, 2026**.

## 1) Terrain / Environment Tiles
- Source: https://cainos.itch.io/pixel-art-top-down-basic
- Local archive: `public/assets/worldsim/tiles/Pixel-Art-Top-Down---Basic-v1-2-3.zip`
- License note from source page:
  - Can be used in free/commercial projects
  - Modification allowed
  - Credit not required (appreciated)
  - Redistribution/resell not allowed

## 2) UI / Tile Iconography
- Source: https://cainos.itch.io/pixel-art-icon-pack-rpg
- Local archive: `public/assets/worldsim/icons/Pixel-Art-Icon-Pack---RPG.zip`
- License note from source page:
  - Can be used in free/commercial projects
  - Modification allowed
  - Credit not required (appreciated)
  - Redistribution/resell not allowed

## 3) Unit Sprite Set
- Planned URL in implementation brief: https://free-game-assets.itch.io/top-down-character
- Status: returned 404 on March 2, 2026
- Replacement used: https://free-game-assets.itch.io/free-base-4-direction-female-character-pixel-art
- Local archive: `public/assets/worldsim/units/Free-Base-4-Direction-Female-Character-Pixel-Art.zip`
- License references from source page:
  - Primary page: includes link to https://craftpix.net/file-licenses/
  - Included local file: `public/assets/worldsim/units/free-base-4-direction-female-character/License.txt`

## Notes
- Raw source pages used during acquisition are saved under `public/assets/worldsim/ui/` for traceability.
- Project integration uses only the subset required by runtime rendering/UI.
- Runtime references the normalized no-space aliases under:
  - `public/assets/worldsim/icons/flat/*.png`
  - `public/assets/worldsim/units/flat/*.png`
  These are direct copies from the source packs above for stable URL loading.
