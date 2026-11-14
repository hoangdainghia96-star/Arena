# ANIME ARENA: CATACLYSM — 3D RANDOM BATTLE (`v1.0.0`)

A browser-based, AAA-inspired 3D Anime Battle Royale spectator simulation built from scratch with an authoritative combat simulation engine, local Hybrid AI (Utility AI + Behavior Trees + Memory + Dynamic Relationships), 3-Step Anime Cel-Shading & Inverted-Hull Outlines, 10 eligible original 3D characters, 3 Dynamic Living Arenas, Hybrid Deterministic Replay Engine, Persistent IndexedDB Battle Archive, Arena Chronicle, and Original Character Studio.

---

## 1. Key Capabilities & Implemented Milestones

- **Pure Random 8-Character Battle Royale (Milestone 1 & 2)**:
  - Selects 8 unique, validated characters per match using a deterministic seeded PRNG (`Mulberry32`).
  - Enforces a strict **9-Point Character Eligibility Gate** before any character enters the random pool. If fewer than 8 eligible characters are available, match initialization halts with an informative diagnostic modal.
  - Full playable arena (`38m` radius) with **no shrinking safe zone** — battle pacing is driven by 3 Dynamic Arena Stages, central Sanctum Altar blessings, destructible tactical objects, Awakenings, and escalating energy flow.
- **10 Original Eligible 3D Anime Characters**:
  1. **Kaelen Vance** — *The Crimson Horizon* (`S` Tier, Fire Odachi Duelist)
  2. **Vespera Noctis** — *Empress of the Astral Eclipse* (`S+` Tier, Void Grimoire Schemer)
  3. **Raiden Kurogami** — *Thunderclap Sovereign* (`S` Tier, Lightning Tonfa Berserker)
  4. **Seraphina Solis** — *Valkyrie of the Dawnstar* (`S` Tier, Solar Halberd Guardian)
  5. **Zero-Nine (Akira)** — *Phantom Cyber-Archer* (`A+` Tier, Photon Greatbow Opportunist)
  6. **Malakor the Unbound** — *Abyssal Titan-Reaver* (`S+` Tier, Abyss Scythe Juggernaut)
  7. **Lyra Celestis** — *Chrono-Weaver of Arcadia* (`S` Tier, Chrono Chakram Tactician)
  8. **Ryuji Kazama** — *Tempest Dragon Monk* (`A+` Tier, Wind Greaves Challenger)
  9. **Nyx Valeria** — *Crimson Valkyrie of Iron Rose* (`A+` Tier, Crimson Daggers Executioner)
  10. **Orion Solaris** — *Astral Forge Alchemist* (`A+` Tier, Crystal Gauntlets Strategist)
- **3 Polished Dynamic Living Arenas**:
  1. **Aetherium Sanctum: Floating Sky Cathedral**
  2. **Neo-Kyoto Crater: Cyber-Shrine Ruins**
  3. **Obsidian Rift: Throne of the Fallen Star**
- **Hybrid AI & Dynamic Relationship System**:
  - Combines **Utility AI** (evaluating 8 tactical intents) with **Behavior Trees** and an `8x8` relationship matrix (`trust`, `threat`, `grudge`, `allied | rival | enemy | neutral`).
  - Supports cross-universe alliance formation, coordinated target priority, and dynamic betrayals.
- **Spectator System, Camera Director & HUD Modes (Milestone 3)**:
  - **Auto Cinematic Director Camera**, **Wide Spectator Camera**, and **Follow Fighter Camera**.
  - **Cinematic HUD** (minimalist immersion) and **Tactical HUD** (full 8-fighter live telemetry, alliance tracker, battle feed, GPU metrics).
  - Transport controls: Pause, Resume, Restart, `0.5x`, `1x`, `2x`, `4x` speeds, and live timeline scrubbing.
- **Hybrid Replay Engine, IndexedDB Battle Archive & Arena Chronicle (Milestone 4)**:
  - Combines deterministic seed re-simulation, periodic snapshots, and event logs.
  - Persistent local storage via **IndexedDB** (`anime_arena_cataclysm_db`) with search, sort, rename, delete, and versioned JSON export/import.
  - **Arena Chronicle** aggregates authentic win rates, K/D ratios, Hall of Fame, rivalries, and 12 unlockable achievements.
- **Original Character Studio & Professional Asset Pipeline (Milestone 5 & 6)**:
  - Interactive 3D rig turntable, 13 skeletal animation state previews, appearance/weapon/accessory customization, ability & AI tuning, Blender-compatible glTF 2.0 export/import, and 9-point eligibility verification.

---

## 2. Local Development & Verification Commands

```bash
# Install dependencies
npm install

# Validate the 3D glTF 2.0 asset manifest and character eligibility
npm run validate:assets

# Run the automated Vitest QA suite (Unit, Simulation, Replay Determinism, Archive, Chronicle)
npm test

# Start the local development server
npm run dev

# Build for production
npm run build

# Generate a reproducible release ZIP archive
npm run release:zip
```

---

## 3. Documentation Index

- [`docs/ARCHITECTURE_DECISION_RECORD.md`](docs/ARCHITECTURE_DECISION_RECORD.md) — Technology stack evaluation, authoritative simulation decoupling, and modular architecture.
- [`docs/ASSET_AND_CHARACTER_GUIDE.md`](docs/ASSET_AND_CHARACTER_GUIDE.md) — Blender → Validation → Game Integration → Browser Rendering pipeline, character creation, and arena creation guide.
- [`docs/DEPLOYMENT_AND_RELEASE_GUIDE.md`](docs/DEPLOYMENT_AND_RELEASE_GUIDE.md) — GitHub branch/PR workflow, Vercel project configuration (`prj_SqYbnVcKaSezSDYSvxug39MrMSM1`), preview vs. production gates, and rollback procedures.
- [`CHANGELOG.md`](CHANGELOG.md) — Semantic release history and milestone records.
