# Changelog

All notable changes to **ANIME ARENA: CATACLYSM — 3D RANDOM BATTLE** are documented in this file following Semantic Versioning.

## [1.0.0] — 2026-11-14

### Added
- **Milestone 0 (Project Bootstrap)**:
  - Created isolated Vercel project `anime-arena-cataclysm` (`prj_SqYbnVcKaSezSDYSvxug39MrMSM1`).
  - Established TypeScript + Vite + React 18 + Three.js modular architecture and ADR-001.
  - Created automated glTF 2.0 asset generator and validator (`scripts/generate-assets.mjs`, `scripts/validate-assets.mjs`).
- **Milestone 1 & 2 (Complete Playable Vertical Slice & Content Expansion)**:
  - Implemented 10 original, 9-point validated 3D anime characters (`Kaelen Vance`, `Vespera Noctis`, `Raiden Kurogami`, `Seraphina Solis`, `Zero-Nine (Akira)`, `Malakor the Unbound`, `Lyra Celestis`, `Ryuji Kazama`, `Nyx Valeria`, `Orion Solaris`).
  - Implemented 3 polished Dynamic Living Arenas (`Aetherium Sanctum`, `Neo-Kyoto Crater`, `Obsidian Rift`) with 3 dynamic stages, weather particles, central shrine blessings, and 10 destructible objects per arena.
  - Built authoritative fixed-timestep `BattleSimulation` engine with Hybrid Power Balance, elemental cross-reactions, counters/parries, Awakenings, and Signature Ultimates.
  - Built Local Hybrid AI combining Utility AI intent scoring, Behavior Trees, fighter memory, and an `8x8` dynamic relationship matrix supporting alliances and betrayals.
- **Milestone 3 (Spectator Experience)**:
  - Implemented Intelligent Automatic Cinematic Director Camera, Wide Spectator Camera, and Character Follow Camera.
  - Implemented toggleable **Cinematic HUD** and **Tactical HUD**, playback speed controls (`0.5x`, `1x`, `2x`, `4x`), live combat log, and full post-battle 8-character analytics modal.
- **Milestone 4 (Replay & Persistence)**:
  - Built `HybridReplayController` with timeline scrubbing, snapshot interpolation, and deterministic seed re-simulation verification.
  - Built persistent IndexedDB `BattleArchive` with search, sort, rename, delete, and versioned JSON export/import.
  - Built `ArenaChronicle` computing authentic historical win rates, K/D ratios, Hall of Fame, rivalries, and 12 unlockable achievements.
- **Milestone 5 & 6 (Character Studio, Audio, Settings & Production QA)**:
  - Built `Original Character Studio` with live 3D rig turntable, 13 animation state previews, appearance/ability/AI editor, and Blender-compatible glTF 2.0 import/export.
  - Built 4-bus spatial WebAudio synthesizer (`music`, `sfx`, `voice`, `ambient`) and `Advanced Arena Settings` with presets and Ultra/High/Medium/Low graphics quality controls.
  - Added automated Vitest QA suite (`tests/simulationAndSystems.test.ts`) verifying all core systems.
