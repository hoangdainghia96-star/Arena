# Asset Pipeline, Character Studio & Arena Creation Guide

## 1. Professional Asset Pipeline Workflow
**Pipeline Order**: `Blender / Studio Authoring → Asset Validation → Game Integration → Browser Rendering`

All 3D models, materials, animations, VFX, and audio banks are tracked in `/public/assets/asset-manifest.json` and validated via `npm run validate:assets` (`scripts/validate-assets.mjs`).

### 9-Point Character Eligibility Gate
Before any character can enter the Random Battle selection pool, `validateCharacterEligibility` (`src/pipeline/assetPipeline.ts`) verifies:
1. **Authenticity or Originality**: `provenanceType` must be `'original-verified'` or `'official-licensed'`.
2. **Model Quality**: Valid `.gltf` / `.glb` model path and valid humanoid scale bounds (`0.8` – `1.35`).
3. **Skeleton & Rig Compatibility**: Humanoid rig with `>= 20` joints (`Hips`, `Spine`, `Chest`, `Neck`, `Head`, `HairRoot`, left/right arm & leg chains, `WeaponMount`, `CapeRoot`).
4. **Animation Compatibility**: All 13 required combat animation states (`idle`, `move`, `basicCombo`, `heavyAttack`, `defend`, `counter`, `movementSkill`, `signatureSkill`, `ultimate`, `awakening`, `hit`, `eliminated`, `victory`).
5. **Texture & Material Quality**: Compatible with the 4-band stepped anime cel-shader ramp (`high-cel-ramp` or `standard-cel`).
6. **Combat Animation Completeness**: Complete ability definitions for Basic Combo, Heavy Attack, Movement Skill, Defensive Counter, Signature Skill, Awakening, and Signature Ultimate.
7. **Asset Provenance**: Documented author attribution.
8. **Asset License**: Approved free license (`CC0-1.0`, `CC-BY-4.0`, `MIT`, `Apache-2.0`).
9. **IP Web Hosting Clearance**: `webHostingCleared === true` for Vercel distribution.

---

## 2. Creating or Importing Characters in the Original Character Studio
1. Open **Original Character Studio** from the Main Menu.
2. Click **"+ New Original Character"** or select an existing fighter to customize.
3. Configure Identity, 3D Appearance (Primary/Accent/Hair/Aura colors, Weapon archetype, Hair silhouette, Back accessory), Combat Attributes, Abilities, and AI Personality weights.
4. Test all 13 skeletal animations and Awakening/Guard states in the **3D Cel-Shader & Rig Turntable**.
5. Click **"Export glTF 2.0"** to download a standards-compliant `.gltf` file compatible with Blender 3.6+/4.x, or use **"Import & Validate Blender glTF 2.0 Asset"** to validate and load an external `.gltf` character file.

---

## 3. Adding New Dynamic Living Arenas
Arenas are data-driven in `src/data/arenas.ts` (`ArenaDefinition`):
- Set `playableRadius: 38` (entire arena remains playable; no shrinking safe zone).
- Define 3 `ArenaStageSpec` entries (`Stage I`, `Stage II`, `Stage III`) specifying sky colors, fog, directional light intensity, weather particle type, hazard interval, and energy regeneration multiplier.
- Define 10 `DestructibleSpec` entries with positions, HP, and tactical payouts (`energy-surge`, `attack-blessing`, `heal-burst`, `emp-blast`, `gravity-pull`).
