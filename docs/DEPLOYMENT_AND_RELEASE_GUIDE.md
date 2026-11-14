# Deployment, Git Workflow & Release Management Guide

## 1. Git Repository & Branch Workflow
The project follows a strict feature-branch workflow keeping `main` stable:
- `main` — Verified, production-ready baseline (`v1.0.0`).
- `feature/project-bootstrap` — Initial scaffold, asset pipeline, and configuration.
- `feature/core-simulation-and-3d-engine` — Authoritative combat simulation, Hybrid AI, 3D cel-shader renderer, Replay Engine, Battle Archive, Arena Chronicle, and Character Studio.

### Pushing Local Repository to Private GitHub Repository
Because the Arena platform does not expose a direct GitHub connector (`status: "unsupported"`), the complete Git repository with branch history is maintained locally in `/home/user/.git`. To push to a private GitHub repository under your account (`hoangdainghia96-star/anime-arena-cataclysm`):
```bash
gh repo create anime-arena-cataclysm --private --source=. --remote=origin --push
# Or with standard git remote:
git remote add origin git@github.com:hoangdainghia96-star/anime-arena-cataclysm.git
git push -u origin main --all
```

---

## 2. Vercel Project & Preview/Production Pipeline
A dedicated, isolated Vercel project was created via the connected Vercel integration without touching any existing projects or domains:
- **Project Name**: `anime-arena-cataclysm`
- **Project ID**: `prj_SqYbnVcKaSezSDYSvxug39MrMSM1`
- **Team / Scope**: `team_gBddsOL3SnDZZSOfaIuoHUFf` (`hoangdainghia96-star's projects`, Hobby Plan)
- **Framework Preset**: `vite` (`buildCommand: "npm run build"`, `installCommand: "npm install"`, `outputDirectory: "dist"`)

### Controlled Production Release Policy
- Preview / Staging deployments validate every milestone.
- **Production releases require explicit user approval** before promoting or deploying with `target: "production"`.

---

## 3. Reproducible Release ZIP Archives & Rollback
Run `npm run release:zip` (`scripts/create-release-zip.mjs`) to generate a self-contained, reproducible release archive at `releases/anime-arena-cataclysm-v1.0.0.zip` containing all source code, configuration files, lockfile, validated 3D glTF assets, documentation, and `.env.example` (excluding `node_modules`, `dist`, and secrets).
