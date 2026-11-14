import * as THREE from 'three';
import {
  ArenaDefinition,
  BattleSimulationState,
  CameraMode,
  CharacterDefinition,
  GraphicsQualityPreset,
  PerformanceTelemetry,
} from '../types/game';
import {
  ArticulatedCharacterRig,
  buildArticulatedAnimeCharacter,
  updateCharacterAnimation,
} from './animeCharacterMesh';

export class ArenaSceneRenderer {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private ambientLight: THREE.AmbientLight;
  private dirLight: THREE.DirectionalLight;
  private rimLight: THREE.PointLight;

  private arenaGroup: THREE.Group;
  private skyRingGroup: THREE.Group;
  private weatherPoints: THREE.Points | null = null;
  private fighterRigs = new Map<string, ArticulatedCharacterRig>();
  private destructibleMeshes = new Map<string, { intact: THREE.Group; rubble: THREE.Mesh }>();
  private zoneGroup: THREE.Group;
  private vfxGroup: THREE.Group;
  private allianceLinesGroup: THREE.Group;

  private currentQuality: GraphicsQualityPreset = 'Ultra';
  private cameraMode: CameraMode = 'director';
  private followFighterId: string | null = null;
  private camCurrentPos = new THREE.Vector3(0, 26, 44);
  private camCurrentLookAt = new THREE.Vector3(0, 1.5, 0);
  private directorOrbitAngle = 0;

  // Real-time measured telemetry
  private frameCount = 0;
  private lastFpsUpdate = performance.now();
  private lastFrameTimestamp = performance.now();
  public telemetry: PerformanceTelemetry = {
    fps: 60,
    frameTimeMs: 16.6,
    drawCalls: 0,
    triangles: 0,
    geometriesInMemory: 0,
    texturesInMemory: 0,
    jsHeapMb: null,
  };

  constructor(container: HTMLElement, quality: GraphicsQualityPreset = 'Ultra') {
    this.container = container;
    this.currentQuality = quality;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#090d1e');
    this.scene.fog = new THREE.FogExp2('#090d1e', 0.0085);

    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    this.camera = new THREE.PerspectiveCamera(48, width / height, 0.5, 260);
    this.camera.position.copy(this.camCurrentPos);
    this.camera.lookAt(this.camCurrentLookAt);

    this.renderer = new THREE.WebGLRenderer({
      antialias: quality === 'Ultra' || quality === 'High',
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(width, height);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    this.ambientLight = new THREE.AmbientLight('#93c5fd', 0.95);
    this.scene.add(this.ambientLight);

    this.dirLight = new THREE.DirectionalLight('#fef08a', 1.45);
    this.dirLight.position.set(28, 48, 24);
    this.dirLight.castShadow = quality !== 'Low';
    this.dirLight.shadow.camera.left = -46;
    this.dirLight.shadow.camera.right = 46;
    this.dirLight.shadow.camera.top = 46;
    this.dirLight.shadow.camera.bottom = -46;
    this.dirLight.shadow.camera.near = 1;
    this.dirLight.shadow.camera.far = 130;
    this.scene.add(this.dirLight);

    this.rimLight = new THREE.PointLight('#38bdf8', 2.4, 65);
    this.rimLight.position.set(0, 8, 0);
    this.scene.add(this.rimLight);

    this.arenaGroup = new THREE.Group();
    this.skyRingGroup = new THREE.Group();
    this.zoneGroup = new THREE.Group();
    this.vfxGroup = new THREE.Group();
    this.allianceLinesGroup = new THREE.Group();

    this.scene.add(
      this.arenaGroup,
      this.skyRingGroup,
      this.zoneGroup,
      this.vfxGroup,
      this.allianceLinesGroup
    );

    this.applyQualityPreset(quality);
    container.innerHTML = '';
    container.appendChild(this.renderer.domElement);
  }

  public applyQualityPreset(preset: GraphicsQualityPreset): void {
    this.currentQuality = preset;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

    if (preset === 'Ultra') {
      this.renderer.setPixelRatio(Math.min(dpr, 2.0));
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.dirLight.castShadow = true;
      this.dirLight.shadow.mapSize.set(2048, 2048);
    } else if (preset === 'High') {
      this.renderer.setPixelRatio(Math.min(dpr, 1.5));
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.dirLight.castShadow = true;
      this.dirLight.shadow.mapSize.set(1024, 1024);
    } else if (preset === 'Medium') {
      this.renderer.setPixelRatio(1.0);
      this.renderer.shadowMap.enabled = true;
      this.dirLight.castShadow = true;
      this.dirLight.shadow.mapSize.set(512, 512);
    } else {
      this.renderer.setPixelRatio(0.85);
      this.renderer.shadowMap.enabled = false;
      this.dirLight.castShadow = false;
    }
    this.dirLight.shadow.map?.dispose();
    this.dirLight.shadow.map = null;
  }

  public setCameraMode(mode: CameraMode, followFighterId: string | null = null): void {
    this.cameraMode = mode;
    this.followFighterId = followFighterId;
  }

  public handleResize(): void {
    if (!this.container) return;
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  public loadBattleScene(
    arena: ArenaDefinition,
    fighters: CharacterDefinition[]
  ): void {
    this.clearBattleObjects();

    const segs = this.currentQuality === 'Low' ? 24 : 48;

    // 1. Main Playable Arena Floor Platform
    const floorGeo = new THREE.CylinderGeometry(
      arena.playableRadius,
      arena.playableRadius * 1.06,
      2.4,
      segs
    );
    const floorMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(arena.floorColor),
      roughness: 0.62,
      metalness: 0.25,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.position.set(0, -1.2, 0);
    floorMesh.receiveShadow = this.currentQuality !== 'Low';
    this.arenaGroup.add(floorMesh);

    // 2. Concentric Runic / Tactical Rings on Floor
    for (const r of [8, 18, 28, arena.playableRadius - 0.4]) {
      const ringGeo = new THREE.RingGeometry(r - 0.18, r, segs);
      const ringMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(r > 30 ? arena.rimGlowColor : arena.gridAccentColor),
        side: THREE.DoubleSide,
        transparent: true,
        opacity: r > 30 ? 0.75 : 0.42,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(0, 0.02, 0);
      this.arenaGroup.add(ring);
    }

    // 3. Central Sanctum Altar Pedestal
    const altarBase = new THREE.Mesh(
      new THREE.CylinderGeometry(3.2, 4.0, 0.35, 16),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(arena.gridAccentColor),
        emissive: new THREE.Color(arena.gridAccentColor),
        emissiveIntensity: 0.25,
        roughness: 0.4,
      })
    );
    altarBase.position.set(0, 0.16, 0);
    this.arenaGroup.add(altarBase);

    // 4. Outer Scenic Colosseum Arches / Monoliths (outside playable radius)
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const dist = arena.playableRadius + 4.5;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;

      const spire = new THREE.Mesh(
        new THREE.BoxGeometry(1.8, 11.5, 1.8),
        new THREE.MeshStandardMaterial({
          color: new THREE.Color(arena.floorColor).multiplyScalar(1.3),
          roughness: 0.5,
        })
      );
      spire.position.set(x, 4.5, z);
      spire.lookAt(0, 4.5, 0);
      this.arenaGroup.add(spire);

      const beacon = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.75, 0),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(arena.rimGlowColor) })
      );
      beacon.position.set(x, 11.2, z);
      this.arenaGroup.add(beacon);
    }

    // 5. Rotating Celestial / Cyber Sky Rings
    for (let i = 0; i < 2; i++) {
      const skyRing = new THREE.Mesh(
        new THREE.TorusGeometry(54 + i * 12, 0.35, 8, 64),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(i === 0 ? arena.gridAccentColor : arena.rimGlowColor),
          transparent: true,
          opacity: 0.45,
        })
      );
      skyRing.rotation.x = Math.PI / 2 + (i === 0 ? 0.28 : -0.32);
      skyRing.position.set(0, 18 + i * 6, 0);
      this.skyRingGroup.add(skyRing);
    }

    // 6. Weather / Atmospheric Particle System
    const particleCount =
      this.currentQuality === 'Ultra'
        ? 420
        : this.currentQuality === 'High'
        ? 260
        : this.currentQuality === 'Medium'
        ? 140
        : 60;
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 90;
      positions[i * 3 + 1] = Math.random() * 34 + 1;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 90;
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const pMat = new THREE.PointsMaterial({
      color: new THREE.Color(arena.gridAccentColor),
      size: 0.38,
      transparent: true,
      opacity: 0.72,
    });
    this.weatherPoints = new THREE.Points(pGeo, pMat);
    this.arenaGroup.add(this.weatherPoints);

    // 7. Build Destructible Arena Objects
    for (const dSpec of arena.destructibles) {
      const intact = new THREE.Group();
      intact.position.set(dSpec.position[0], 0, dSpec.position[2]);

      const isCrystal = dSpec.type.includes('crystal') || dSpec.type.includes('core') || dSpec.type.includes('plasma');
      const mainMesh = new THREE.Mesh(
        isCrystal
          ? new THREE.OctahedronGeometry(dSpec.radius * 0.85, 0)
          : new THREE.CylinderGeometry(dSpec.radius * 0.55, dSpec.radius * 0.7, 4.8, 8),
        new THREE.MeshStandardMaterial({
          color: new THREE.Color(dSpec.color),
          emissive: new THREE.Color(dSpec.color),
          emissiveIntensity: isCrystal ? 0.55 : 0.2,
          roughness: 0.35,
          metalness: 0.3,
        })
      );
      mainMesh.position.set(0, isCrystal ? 1.8 : 2.4, 0);
      mainMesh.castShadow = this.currentQuality !== 'Low';
      intact.add(mainMesh);

      const rubble = new THREE.Mesh(
        new THREE.DodecahedronGeometry(dSpec.radius * 0.65, 0),
        new THREE.MeshStandardMaterial({
          color: 0x334155,
          roughness: 0.9,
        })
      );
      rubble.scale.set(1.2, 0.35, 1.2);
      rubble.position.set(dSpec.position[0], 0.25, dSpec.position[2]);
      rubble.visible = false;

      this.arenaGroup.add(intact, rubble);
      this.destructibleMeshes.set(dSpec.id, { intact, rubble });
    }

    // 8. Build Articulated 3D Anime Character Rigs for all 8 Fighters
    for (const charDef of fighters) {
      const rig = buildArticulatedAnimeCharacter(charDef, this.currentQuality);
      this.scene.add(rig.root);
      this.fighterRigs.set(charDef.id, rig);
    }
  }

  public renderSimulationState(
    state: BattleSimulationState,
    arena: ArenaDefinition
  ): void {
    const nowPerf = performance.now();
    const dtMs = nowPerf - this.lastFrameTimestamp;
    this.lastFrameTimestamp = nowPerf;
    this.frameCount++;

    if (nowPerf - this.lastFpsUpdate >= 500) {
      const elapsed = (nowPerf - this.lastFpsUpdate) / 1000;
      const perfMem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
      this.telemetry = {
        fps: Math.min(120, Math.round(this.frameCount / elapsed)),
        frameTimeMs: Number(dtMs.toFixed(1)),
        drawCalls: this.renderer.info.render.calls,
        triangles: this.renderer.info.render.triangles,
        geometriesInMemory: this.renderer.info.memory.geometries,
        texturesInMemory: this.renderer.info.memory.textures,
        jsHeapMb: perfMem ? Math.round(perfMem.usedJSHeapSize / (1024 * 1024)) : null,
      };
      this.frameCount = 0;
      this.lastFpsUpdate = nowPerf;
    }

    // 1. Update Arena Stage Atmosphere & Lighting
    const stageSpec = arena.stages[state.stageNumber - 1] ?? arena.stages[0];
    (this.scene.background as THREE.Color).lerp(new THREE.Color(stageSpec.skyTopColor), 0.04);
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.lerp(new THREE.Color(stageSpec.fogColor), 0.04);
    }
    this.ambientLight.color.lerp(new THREE.Color(stageSpec.ambientLightColor), 0.05);
    this.dirLight.color.lerp(new THREE.Color(stageSpec.directionalLightColor), 0.05);
    this.dirLight.intensity = stageSpec.lightIntensity;

    // Animate Sky Rings & Weather Particles
    this.skyRingGroup.children.forEach((ring, i) => {
      ring.rotation.z = state.elapsedSec * (i === 0 ? 0.14 : -0.19);
    });

    if (this.weatherPoints) {
      this.weatherPoints.rotation.y = state.elapsedSec * 0.06;
    }

    // 2. Update Fighter Positions, Rotations & Skeletal Animations
    for (const fState of state.fighters) {
      const rig = this.fighterRigs.get(fState.id);
      if (!rig) continue;

      rig.root.position.set(fState.position[0], fState.position[1], fState.position[2]);
      rig.root.rotation.y = fState.rotationY;

      updateCharacterAnimation(
        rig,
        fState.animationState,
        state.elapsedSec,
        fState.isAwakened,
        fState.isGuarding
      );
    }

    // 3. Update Destructible Arena Objects
    for (const dState of state.destructibles) {
      const entry = this.destructibleMeshes.get(dState.id);
      if (!entry) continue;
      if (dState.isDestroyed) {
        entry.intact.visible = false;
        entry.rubble.visible = true;
      } else {
        entry.intact.visible = true;
        entry.rubble.visible = false;
        const hpRatio = Math.max(0.35, dState.hp / dState.maxHp);
        entry.intact.scale.set(1, hpRatio, 1);
      }
    }

    // 4. Rebuild Active Environmental Zones & Alliance Tether Lines
    this.disposeGroupChildren(this.zoneGroup);
    for (const zone of state.activeZones) {
      const zRing = new THREE.Mesh(
        new THREE.RingGeometry(Math.max(0.2, zone.radius - 0.35), zone.radius, 32),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(zone.color),
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.78,
        })
      );
      zRing.rotation.x = -Math.PI / 2;
      zRing.position.set(zone.position[0], 0.08, zone.position[2]);

      const zFill = new THREE.Mesh(
        new THREE.CircleGeometry(zone.radius, 32),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(zone.color),
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.2,
        })
      );
      zFill.rotation.x = -Math.PI / 2;
      zFill.position.set(zone.position[0], 0.06, zone.position[2]);
      this.zoneGroup.add(zRing, zFill);
    }

    // Alliance Golden Tether Beams
    this.disposeGroupChildren(this.allianceLinesGroup);
    for (const al of state.alliances) {
      if (al.outcome !== 'active') continue;
      const fA = state.fighters.find((f) => f.id === al.memberAId);
      const fB = state.fighters.find((f) => f.id === al.memberBId);
      if (!fA || !fB || !fA.isAlive || !fB.isAlive) continue;

      const points = [
        new THREE.Vector3(fA.position[0], 1.15, fA.position[2]),
        new THREE.Vector3(
          (fA.position[0] + fB.position[0]) / 2,
          1.85 + Math.sin(state.elapsedSec * 5) * 0.2,
          (fA.position[2] + fB.position[2]) / 2
        ),
        new THREE.Vector3(fB.position[0], 1.15, fB.position[2]),
      ];
      const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
      const lineMat = new THREE.LineBasicMaterial({
        color: 0xfacc15,
        transparent: true,
        opacity: 0.85,
      });
      this.allianceLinesGroup.add(new THREE.Line(lineGeo, lineMat));
    }

    // 5. Render Active Hybrid Anime Cinematic VFX
    this.disposeGroupChildren(this.vfxGroup);
    for (const vfx of state.vfxEvents) {
      const progress = Math.max(
        0,
        Math.min(1, (state.elapsedSec - vfx.createdAtSec) / Math.max(0.1, vfx.durationSec))
      );
      const opacity = Math.max(0, 1 - progress);

      if (vfx.type === 'shockwave' || vfx.type === 'shatter-burst' || vfx.type === 'counter-flash') {
        const currentR = Math.max(0.5, vfx.radius * (0.25 + progress * 0.95));
        const waveRing = new THREE.Mesh(
          new THREE.RingGeometry(currentR * 0.72, currentR, 32),
          new THREE.MeshBasicMaterial({
            color: new THREE.Color(vfx.color),
            side: THREE.DoubleSide,
            transparent: true,
            opacity: opacity * 0.9,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          })
        );
        waveRing.rotation.x = -Math.PI / 2;
        waveRing.position.set(vfx.position[0], 0.18, vfx.position[2]);

        const dome = new THREE.Mesh(
          new THREE.SphereGeometry(currentR * 0.65, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2),
          new THREE.MeshBasicMaterial({
            color: new THREE.Color(vfx.secondaryColor),
            transparent: true,
            opacity: opacity * 0.42,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          })
        );
        dome.position.set(vfx.position[0], 0.05, vfx.position[2]);
        this.vfxGroup.add(waveRing, dome);
      } else if (vfx.type === 'energy-beam' && vfx.targetPosition) {
        const startVec = new THREE.Vector3(vfx.position[0], 1.25, vfx.position[2]);
        const endVec = new THREE.Vector3(
          vfx.targetPosition[0],
          1.15,
          vfx.targetPosition[2]
        );
        const dist = startVec.distanceTo(endVec);
        if (dist > 0.2) {
          const beamGeo = new THREE.CylinderGeometry(0.28, 0.28, dist, 12);
          beamGeo.rotateX(Math.PI / 2);
          const beamMesh = new THREE.Mesh(
            beamGeo,
            new THREE.MeshBasicMaterial({
              color: new THREE.Color(vfx.color),
              transparent: true,
              opacity: opacity * 0.88,
              blending: THREE.AdditiveBlending,
            })
          );
          beamMesh.position.copy(startVec).lerp(endVec, 0.5);
          beamMesh.lookAt(endVec);
          this.vfxGroup.add(beamMesh);
        }
      } else if (
        vfx.type === 'awakening-pillar' ||
        vfx.type === 'elimination-ascension' ||
        vfx.type === 'lightning-strike'
      ) {
        const pillar = new THREE.Mesh(
          new THREE.CylinderGeometry(vfx.radius * 0.35, vfx.radius * 0.5, 18, 16, 1, true),
          new THREE.MeshBasicMaterial({
            color: new THREE.Color(vfx.color),
            side: THREE.DoubleSide,
            transparent: true,
            opacity: opacity * 0.72,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          })
        );
        pillar.position.set(vfx.position[0], 9, vfx.position[2]);
        this.vfxGroup.add(pillar);
      } else if (vfx.type === 'vortex-sphere') {
        const vortex = new THREE.Mesh(
          new THREE.SphereGeometry(vfx.radius * 0.55, 16, 16),
          new THREE.MeshBasicMaterial({
            color: new THREE.Color(vfx.color),
            wireframe: true,
            transparent: true,
            opacity: opacity * 0.82,
          })
        );
        vortex.position.set(
          vfx.targetPosition?.[0] ?? vfx.position[0],
          1.4,
          vfx.targetPosition?.[2] ?? vfx.position[2]
        );
        vortex.rotation.y = state.elapsedSec * 8;
        this.vfxGroup.add(vortex);
      } else {
        // Anime Crescent Slash Arc
        const slash = new THREE.Mesh(
          new THREE.RingGeometry(1.1, 2.25, 16, 1, 0, Math.PI * 1.15),
          new THREE.MeshBasicMaterial({
            color: new THREE.Color(vfx.secondaryColor),
            side: THREE.DoubleSide,
            transparent: true,
            opacity: opacity * 0.92,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          })
        );
        slash.rotation.x = -Math.PI / 2 + 0.25;
        slash.rotation.z = progress * 4.5;
        slash.position.set(vfx.position[0], 1.15, vfx.position[2]);
        this.vfxGroup.add(slash);
      }
    }

    // 6. Update Intelligent Automatic Cinematic Director Camera
    this.updateCameraDirector(state);

    // 7. Render Frame
    this.renderer.render(this.scene, this.camera);
  }

  private updateCameraDirector(state: BattleSimulationState): void {
    this.directorOrbitAngle += 0.0035;
    const alive = state.fighters.filter((f) => f.isAlive);

    let desiredPos = new THREE.Vector3(0, 26, 44);
    let desiredLook = new THREE.Vector3(0, 1.5, 0);

    // Victory Champion Spotlight
    if (state.status === 'completed' && state.winnerId) {
      const champ = state.fighters.find((f) => f.id === state.winnerId) ?? alive[0];
      if (champ) {
        const cx = champ.position[0];
        const cz = champ.position[2];
        desiredPos.set(
          cx + Math.sin(this.directorOrbitAngle * 2.5) * 6.5,
          3.4,
          cz + Math.cos(this.directorOrbitAngle * 2.5) * 6.5
        );
        desiredLook.set(cx, 1.45, cz);
      }
    } else if (this.cameraMode === 'wide') {
      desiredPos.set(
        Math.sin(this.directorOrbitAngle * 0.7) * 48,
        32,
        Math.cos(this.directorOrbitAngle * 0.7) * 48
      );
      desiredLook.set(0, 1.0, 0);
    } else if (this.cameraMode === 'follow' && this.followFighterId) {
      const target =
        state.fighters.find((f) => f.id === this.followFighterId) ?? alive[0];
      if (target) {
        const tx = target.position[0];
        const tz = target.position[2];
        const behindAngle = target.rotationY + Math.PI;
        desiredPos.set(
          tx + Math.sin(behindAngle) * 9.5,
          5.6,
          tz + Math.cos(behindAngle) * 9.5
        );
        const enemy = state.fighters.find((e) => e.id === target.targetId && e.isAlive);
        if (enemy) {
          desiredLook.set(
            (tx + enemy.position[0]) * 0.5,
            1.4,
            (tz + enemy.position[2]) * 0.5
          );
        } else {
          desiredLook.set(tx, 1.45, tz);
        }
      }
    } else {
      // AUTOMATIC CINEMATIC DIRECTOR CAMERA
      // Check for a recent critical event (Ultimate, Elimination, Betrayal, Awakening) within last 2.0s
      const recentCritical = [...state.events]
        .reverse()
        .find(
          (e) =>
            state.elapsedSec - e.timestampSec >= 0 &&
            state.elapsedSec - e.timestampSec <= 2.0 &&
            (e.type === 'ULTIMATE_UNLEASHED' ||
              e.type === 'ELIMINATION' ||
              e.type === 'ALLIANCE_BETRAYED' ||
              e.type === 'AWAKENING_TRIGGERED') &&
            e.position
        );

      if (recentCritical && recentCritical.position) {
        const [ex, , ez] = recentCritical.position;
        desiredPos.set(
          ex + Math.sin(this.directorOrbitAngle * 2.0) * 11.5,
          5.8,
          ez + Math.cos(this.directorOrbitAngle * 2.0) * 11.5
        );
        desiredLook.set(ex, 1.5, ez);
      } else if (alive.length > 0) {
        // Compute active combat centroid & spread
        let sumX = 0;
        let sumZ = 0;
        for (const f of alive) {
          sumX += f.position[0];
          sumZ += f.position[2];
        }
        const avgX = sumX / alive.length;
        const avgZ = sumZ / alive.length;

        // Focus on the most active fighter (lowest HP ratio in combat or casting skill)
        const focalFighter =
          alive.find(
            (f) =>
              f.animationState === 'signatureSkill' ||
              f.animationState === 'heavyAttack' ||
              f.animationState === 'counter'
          ) ?? alive[Math.floor(state.elapsedSec / 6) % alive.length];

        const blendX = avgX * 0.45 + focalFighter.position[0] * 0.55;
        const blendZ = avgZ * 0.45 + focalFighter.position[2] * 0.55;

        // Alternate smoothly between medium combat shots and wide awareness shots
        const isClosePhase = Math.floor(state.elapsedSec / 8) % 2 === 0;
        const camDist = isClosePhase ? 17.5 : 28.0;
        const camHeight = isClosePhase ? 10.5 : 19.5;

        desiredPos.set(
          blendX + Math.sin(this.directorOrbitAngle) * camDist,
          camHeight,
          blendZ + Math.cos(this.directorOrbitAngle) * camDist
        );
        desiredLook.set(blendX, 1.35, blendZ);
      }
    }

    this.camCurrentPos.lerp(desiredPos, 0.065);
    this.camCurrentLookAt.lerp(desiredLook, 0.085);
    this.camera.position.copy(this.camCurrentPos);
    this.camera.lookAt(this.camCurrentLookAt);
    this.rimLight.position.set(this.camCurrentLookAt.x, 7, this.camCurrentLookAt.z);
  }

  private disposeGroupChildren(group: THREE.Group): void {
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
      child.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((m) => m.dispose());
          } else {
            mesh.material.dispose();
          }
        }
      });
    }
  }

  public clearBattleObjects(): void {
    for (const rig of this.fighterRigs.values()) {
      this.scene.remove(rig.root);
      rig.root.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((m) => m.dispose());
          } else {
            mesh.material.dispose();
          }
        }
      });
    }
    this.fighterRigs.clear();
    this.destructibleMeshes.clear();

    this.disposeGroupChildren(this.arenaGroup);
    this.disposeGroupChildren(this.skyRingGroup);
    this.disposeGroupChildren(this.zoneGroup);
    this.disposeGroupChildren(this.vfxGroup);
    this.disposeGroupChildren(this.allianceLinesGroup);
    this.weatherPoints = null;
  }

  public dispose(): void {
    this.clearBattleObjects();
    this.renderer.dispose();
    if (this.renderer.domElement && this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
