# Architecture Decision Record (ADR-001): Anime Arena: Cataclysm

## Status
Accepted — 2026-11-14

## Context
**ANIME ARENA: CATACLYSM — 3D RANDOM BATTLE** requires a browser-based, AAA-inspired 3D anime Battle Royale spectator game operating 100% locally without external AI APIs or backend dependencies, while delivering:
1. Authoritative combat simulation strictly separated from visual presentation.
2. Local Hybrid AI (Utility AI + Behavior Trees + Memory + Dynamic Relationships/Alliances/Betrayals).
3. Stylized anime 3D cel-shading with configurable quality presets (`Ultra`, `High`, `Medium`, `Low`) and strict GPU memory disposal.
4. Deterministic Hybrid Replay Engine, IndexedDB Battle Archive, Arena Chronicle, and Original Character Studio with glTF 2.0 validation.

## Evaluated 3D & Frontend Stacks

| Option | Strengths | Tradeoffs | Decision |
| :--- | :--- | :--- | :--- |
| **Three.js (`three`) + TypeScript + React 18 + Vite** | Direct control over WebGL render loop, custom 4-band stepped `MeshToonMaterial` gradient maps, inverted-hull anime outlines, explicit `geometry.dispose()` / `material.dispose()`, lightweight bundle, zero reconciliation overhead in 60fps simulation ticks. | Requires explicit scene graph management class (`ArenaSceneRenderer`). | **SELECTED** |
| **React Three Fiber (R3F)** | Declarative JSX scene graph. | React reconciliation overhead for rapid particle/VFX creation and 20Hz authoritative simulation ticks; extra peer dependency complexity. | Rejected |
| **Babylon.js** | Full-featured game engine. | Much larger bundle footprint (>2.5MB gzipped) and heavier initialization for static Vercel deployments. | Rejected |

## Modular System Boundaries

```text
src/
├── types/game.ts                 # Authoritative data contracts across all modules
├── utils/prng.ts                 # Deterministic Mulberry32 PRNG & Fisher-Yates shuffler
├── data/
│   ├── characters.ts             # 10 Original Eligible Characters (stats, skills, AI, lore)
│   ├── arenas.ts                 # 3 Dynamic Living Arenas (stages, lighting, destructibles)
│   └── settings.ts               # Configurable simulation, AI, graphics, and audio presets
├── pipeline/
│   └── assetPipeline.ts          # 9-Point Character Validator, Staged Hybrid Loader, glTF 2.0 I/O
├── engine/
│   ├── relationshipSystem.ts     # 8x8 Trust/Threat/Grudge Matrix, Alliances & Betrayals
│   ├── hybridAI.ts               # Utility AI Intent Scorer + Behavior Tree Executor
│   ├── combatEngine.ts           # Authoritative Fixed-Timestep BattleSimulation (DOM-independent)
│   └── replayEngine.ts           # Hybrid Replay Controller & Deterministic Seed Verifier
├── persistence/
│   ├── battleArchive.ts          # IndexedDB Battle Vault + Safe JSON Export/Import Migration
│   └── arenaChronicle.ts         # Historical Win-Rates, Hall of Fame, Rivalries & Achievements
├── audio/
│   └── audioEngine.ts            # 4-Bus Spatial WebAudio Synthesizer (BGM, SFX, Voices, Ambience)
├── rendering/
│   ├── animeCharacterMesh.ts     # Articulated 22-Joint 3D Anime Rig, Cel-Shader & 13 Animations
│   └── arenaSceneRenderer.ts     # Three.js Arena Scene, Hybrid VFX, Camera Director & Telemetry
└── components/
    ├── BattleSpectatorView.tsx   # Live 3D Spectator View, Cinematic/Tactical HUD, Post-Battle Modal
    ├── CharacterStudioView.tsx   # Original Character Studio & glTF Validator
    ├── BattleArchiveView.tsx     # IndexedDB Battle History & Replay Launcher
    ├── ArenaChronicleView.tsx    # Hall of Fame, Leaderboards & Achievements
    └── SettingsView.tsx          # Advanced Arena Settings
```

## Separation of Authoritative Simulation and Visual Presentation
- `BattleSimulation` (`src/engine/combatEngine.ts`) advances at a fixed logical tick (`SIMULATION_DT = 0.05s`, 20Hz) and never imports Three.js, React, or WebAudio.
- All hit detection, cooldowns, energy costs, elemental cross-reactions, destructible payouts, alliance formations, betrayals, and eliminations are resolved purely inside `BattleSimulation`.
- `ArenaSceneRenderer` (`src/rendering/arenaSceneRenderer.ts`) reads `BattleSimulationState` (or `HybridReplayController.getStateAtTime(t)`) to position 3D rigs, drive skeletal animations, spawn visual VFX, and direct the camera. Visual effects never determine damage or outcomes.
