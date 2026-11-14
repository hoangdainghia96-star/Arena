import {
  AbilitySpec,
  ArenaDefinition,
  ArenaSettings,
  BattleEvent,
  BattleSimulationState,
  CharacterDefinition,
  DestructibleRuntimeState,
  EliminationRecord,
  FighterRuntimeState,
  ReplayPayload,
  ReplaySnapshot,
  VFXEventRuntime,
} from '../types/game';
import { SeededRNG } from '../utils/prng';
import {
  evaluateDynamicAlliances,
  initializeRelationships,
  recordCombatInteraction,
} from './relationshipSystem';
import { evaluateFighterAI } from './hybridAI';

export const SIMULATION_TICK_RATE = 20; // 20 authoritative ticks per second
export const SIMULATION_DT = 1 / SIMULATION_TICK_RATE; // 0.05s per tick

export class BattleSimulation {
  public state: BattleSimulationState;
  public readonly rng: SeededRNG;
  public readonly arena: ArenaDefinition;
  public readonly settings: ArenaSettings;
  public readonly characterDefs: Map<string, CharacterDefinition>;
  private snapshots: ReplaySnapshot[] = [];
  private lastAllianceEvalSec = 0;
  private lastHazardSpawnSec = 0;
  private lastShrineSpawnSec = 0;

  constructor(options: {
    fighters: CharacterDefinition[];
    arena: ArenaDefinition;
    settings: ArenaSettings;
    seed?: string;
    battleName?: string;
  }) {
    const { fighters, arena, settings, seed, battleName } = options;
    if (fighters.length !== 8) {
      throw new Error(`BattleSimulation requires exactly 8 unique characters (got ${fighters.length}).`);
    }
    const uniqueCheck = new Set(fighters.map((f) => f.id));
    if (uniqueCheck.size !== 8) {
      throw new Error('BattleSimulation requires 8 unique characters without duplicates.');
    }

    this.rng = new SeededRNG(seed);
    this.arena = arena;
    this.settings = JSON.parse(JSON.stringify(settings));
    this.characterDefs = new Map(fighters.map((c) => [c.id, c]));

    const spawnRadius = 25;
    const runtimeFighters: FighterRuntimeState[] = fighters.map((def, idx) => {
      const angle = (idx / 8) * Math.PI * 2;
      const x = Number((Math.cos(angle) * spawnRadius).toFixed(3));
      const z = Number((Math.sin(angle) * spawnRadius).toFixed(3));
      const facingCenter = Math.atan2(-x, -z);

      return {
        id: def.id,
        name: def.name,
        title: def.title,
        universe: def.universe,
        position: [x, 0, z],
        velocity: [0, 0, 0],
        rotationY: facingCenter,
        hp: def.attributes.maxHp,
        maxHp: def.attributes.maxHp,
        energy: 25,
        maxEnergy: 100,
        attack: def.attributes.attack,
        defense: def.attributes.defense,
        speed: def.attributes.speed,
        isAlive: true,
        isAwakened: false,
        isGuarding: false,
        animationState: 'idle',
        animationTimer: 0,
        comboStep: 0,
        targetId: null,
        allyIds: [],
        currentIntent: 'ENGAGE_PRIMARY_TARGET',
        activeBuffs: {
          atkBoostTimer: 0,
          speedBoostTimer: 0,
          invulnerableTimer: 0,
        },
        statusEffects: {
          burnTimer: 0,
          slowTimer: 0,
          stunTimer: 0,
          shredTimer: 0,
        },
        cooldowns: {
          basicCombo: 0,
          heavyAttack: this.rng.range(0.5, 2.0),
          movementSkill: this.rng.range(0.5, 2.0),
          defensiveCounter: 1.0,
          signatureSkill: this.rng.range(1.5, 4.0),
          ultimate: 5.0,
        },
        stats: {
          damageDealt: 0,
          damageTaken: 0,
          eliminations: 0,
          assists: 0,
          ultimatesUsed: 0,
          signaturesUsed: 0,
          countersLanded: 0,
          destructiblesShattered: 0,
          alliancesFormed: 0,
          betrayalsCommitted: 0,
          survivalTimeSec: 0,
        },
        eliminatedAtSec: null,
        eliminatedById: null,
        eliminatedByAbility: null,
        finalPlacement: null,
        lastDamagedById: null,
        assistDamagerIds: [],
        memory: [],
      };
    });

    const relationships = initializeRelationships(runtimeFighters, this.characterDefs);

    const destructibles: DestructibleRuntimeState[] = settings.destructibleObjectsEnabled
      ? arena.destructibles.map((d) => ({
          id: d.id,
          name: d.name,
          type: d.type,
          position: [...d.position],
          hp: d.maxHp,
          maxHp: d.maxHp,
          radius: d.radius,
          isDestroyed: false,
          payoutType: d.payoutType,
          color: d.color,
        }))
      : [];

    const battleId = `battle_${this.rng.seedString.replace(/[^a-zA-Z0-9]/g, '').slice(-10)}`;

    this.state = {
      battleId,
      battleName: battleName || `${arena.name} Cataclysm #${this.rng.seedString.slice(-4)}`,
      seed: this.rng.seedString,
      arenaId: arena.id,
      arenaName: arena.name,
      tick: 0,
      elapsedSec: 0,
      stageNumber: 1,
      stageName: arena.stages[0].name,
      status: 'running',
      survivorCount: 8,
      fighters: runtimeFighters,
      relationships,
      alliances: [],
      destructibles,
      activeZones: [],
      vfxEvents: [],
      events: [
        {
          id: 'evt_start_0',
          timestampSec: 0,
          tick: 0,
          type: 'BATTLE_START',
          description: `CATACLYSM INITIATED in ${arena.name}! Eight warriors enter the arena: ${runtimeFighters
            .map((f) => f.name)
            .join(', ')}.`,
          importance: 'critical',
          position: [0, 2, 0],
        },
      ],
      eliminations: [],
      winnerId: null,
      winnerName: null,
      mvpId: null,
      mvpName: null,
    };

    this.captureSnapshot();
  }

  private getTargetDurationScale(): number {
    // Adjusts overall damage scaling to meet user's configured battle duration preset
    const presetFactor =
      this.settings.targetDurationPreset === 'fast'
        ? 1.38
        : this.settings.targetDurationPreset === 'epic'
        ? 0.76
        : 1.0;
    return presetFactor * this.settings.combatPaceMultiplier;
  }

  public step(): void {
    if (this.state.status === 'completed' || this.state.status === 'paused') return;

    this.state.tick += 1;
    this.state.elapsedSec = Number((this.state.tick * SIMULATION_DT).toFixed(3));
    const dt = SIMULATION_DT;
    const now = this.state.elapsedSec;

    // 1. Prune expired VFX events
    this.state.vfxEvents = this.state.vfxEvents.filter(
      (vfx) => now - vfx.createdAtSec < vfx.durationSec
    );

    // 2. Check Arena Stage Transitions
    this.updateArenaStage(now);

    // 3. Update Active Environmental Zones & Spawn Dynamic Events
    this.updateArenaZones(dt, now);

    // 4. Evaluate Dynamic Alliances & Betrayals every 2.5s
    if (now - this.lastAllianceEvalSec >= 2.5) {
      this.lastAllianceEvalSec = now;
      const allianceEvents = evaluateDynamicAlliances(
        this.state.fighters,
        this.characterDefs,
        this.state.relationships,
        this.state.alliances,
        this.settings,
        this.rng,
        now,
        this.state.tick
      );
      if (allianceEvents.length > 0) {
        this.state.events.push(...allianceEvents);
        this.captureSnapshot();
      }
    }

    // 5. Update Each Living Fighter
    const currentStageSpec = this.arena.stages[this.state.stageNumber - 1];
    for (const fighter of this.state.fighters) {
      if (!fighter.isAlive) continue;

      fighter.stats.survivalTimeSec = now;
      const def = this.characterDefs.get(fighter.id)!;

      // Update timers & cooldowns
      fighter.cooldowns.basicCombo = Math.max(0, fighter.cooldowns.basicCombo - dt);
      fighter.cooldowns.heavyAttack = Math.max(0, fighter.cooldowns.heavyAttack - dt);
      fighter.cooldowns.movementSkill = Math.max(0, fighter.cooldowns.movementSkill - dt);
      fighter.cooldowns.defensiveCounter = Math.max(0, fighter.cooldowns.defensiveCounter - dt);
      fighter.cooldowns.signatureSkill = Math.max(0, fighter.cooldowns.signatureSkill - dt);
      fighter.cooldowns.ultimate = Math.max(0, fighter.cooldowns.ultimate - dt);

      fighter.activeBuffs.atkBoostTimer = Math.max(0, fighter.activeBuffs.atkBoostTimer - dt);
      fighter.activeBuffs.speedBoostTimer = Math.max(0, fighter.activeBuffs.speedBoostTimer - dt);
      fighter.activeBuffs.invulnerableTimer = Math.max(0, fighter.activeBuffs.invulnerableTimer - dt);

      // Status effects
      if (fighter.statusEffects.burnTimer > 0) {
        fighter.statusEffects.burnTimer = Math.max(0, fighter.statusEffects.burnTimer - dt);
        this.applyDirectDamage(fighter, null, 7.5 * dt, 'Elemental Burn', false);
        if (!fighter.isAlive) continue;
      }
      fighter.statusEffects.slowTimer = Math.max(0, fighter.statusEffects.slowTimer - dt);
      fighter.statusEffects.stunTimer = Math.max(0, fighter.statusEffects.stunTimer - dt);
      fighter.statusEffects.shredTimer = Math.max(0, fighter.statusEffects.shredTimer - dt);

      // Regenerate Energy
      const energyGain =
        def.attributes.energyRegen * currentStageSpec.energyRegenMultiplier * dt * 0.42;
      fighter.energy = Math.min(fighter.maxEnergy, fighter.energy + energyGain);

      // Animation state timer decay
      if (fighter.animationTimer > 0) {
        fighter.animationTimer = Math.max(0, fighter.animationTimer - dt);
        if (fighter.animationTimer === 0) {
          fighter.isGuarding = false;
          fighter.animationState = 'idle';
        }
      }

      // If stunned, cannot act this tick
      if (fighter.statusEffects.stunTimer > 0) {
        fighter.animationState = 'hit';
        continue;
      }

      // Evaluate Hybrid AI (Utility AI + Behavior Tree)
      const aiDecision = evaluateFighterAI(
        fighter,
        def,
        this.state.fighters,
        this.state.relationships,
        this.state.destructibles,
        this.state.activeZones,
        this.arena.playableRadius,
        this.settings,
        this.rng
      );

      fighter.currentIntent = aiDecision.intent;
      fighter.targetId = aiDecision.targetId;

      // Execute movement if not locked in a heavy/ultimate cast animation
      const canMove =
        fighter.animationState === 'idle' ||
        fighter.animationState === 'move' ||
        fighter.animationTimer < 0.25;

      if (canMove && (aiDecision.moveDirection[0] !== 0 || aiDecision.moveDirection[1] !== 0)) {
        let moveSpeed = (fighter.speed / 100) * 8.2;
        if (fighter.isAwakened) moveSpeed *= 1 + def.abilities.awakening.spdBoost;
        if (fighter.activeBuffs.speedBoostTimer > 0) moveSpeed *= 1.25;
        if (fighter.statusEffects.slowTimer > 0) moveSpeed *= 0.58;

        const vx = aiDecision.moveDirection[0] * moveSpeed;
        const vz = aiDecision.moveDirection[1] * moveSpeed;
        fighter.velocity = [vx, 0, vz];
        fighter.position[0] += vx * dt;
        fighter.position[2] += vz * dt;

        // Clamp within full playable arena radius (no shrinking zone!)
        const distFromOrigin = Math.hypot(fighter.position[0], fighter.position[2]);
        if (distFromOrigin > this.arena.playableRadius) {
          const scale = this.arena.playableRadius / distFromOrigin;
          fighter.position[0] *= scale;
          fighter.position[2] *= scale;
        }

        // Face target if engaged, otherwise face movement direction
        const targetFighter = this.state.fighters.find((f) => f.id === fighter.targetId);
        if (targetFighter && targetFighter.isAlive) {
          fighter.rotationY = Math.atan2(
            targetFighter.position[0] - fighter.position[0],
            targetFighter.position[2] - fighter.position[2]
          );
        } else {
          fighter.rotationY = Math.atan2(vx, vz);
        }

        if (fighter.animationState === 'idle') {
          fighter.animationState = 'move';
        }
      } else {
        fighter.velocity = [0, 0, 0];
      }

      // Execute Combat Action if ready
      if (aiDecision.desiredAction !== 'none' && fighter.animationTimer <= 0.15) {
        this.executeFighterAction(
          fighter,
          def,
          aiDecision.desiredAction,
          aiDecision.targetDestructibleId,
          now
        );
      }
    }

    // 6. Resolve Fighter-to-Fighter and Fighter-to-Destructible Physical Separation
    this.resolveCollisions();

    // 7. Capture Periodic Replay Snapshot every 2.0 seconds (40 ticks)
    if (this.state.tick % 40 === 0) {
      this.captureSnapshot();
    }

    // 8. Check Victory Condition
    this.checkVictoryCondition(now);
  }

  private updateArenaStage(now: number): void {
    const aliveCount = this.state.fighters.filter((f) => f.isAlive).length;
    this.state.survivorCount = aliveCount;

    let desiredStage: 1 | 2 | 3 = 1;
    if (now >= 75 || aliveCount <= 3) {
      desiredStage = 3;
    } else if (now >= 32 || aliveCount <= 6) {
      desiredStage = 2;
    }

    if (desiredStage > this.state.stageNumber) {
      this.state.stageNumber = desiredStage;
      const stageSpec = this.arena.stages[desiredStage - 1];
      this.state.stageName = stageSpec.name;

      this.state.events.push({
        id: `evt_stage_${this.state.tick}`,
        timestampSec: now,
        tick: this.state.tick,
        type: 'STAGE_CHANGE',
        description: `ARENA SHIFT: ${stageSpec.name} — ${stageSpec.subtitle}! Energy flow intensifies (${stageSpec.energyRegenMultiplier}x)!`,
        importance: 'critical',
        position: [0, 4, 0],
      });

      this.state.vfxEvents.push({
        id: `vfx_stage_${this.state.tick}`,
        type: 'shockwave',
        position: [0, 0.5, 0],
        color: this.arena.gridAccentColor,
        secondaryColor: this.arena.rimGlowColor,
        radius: this.arena.playableRadius,
        createdAtSec: now,
        durationSec: 1.6,
        label: stageSpec.name,
      });

      this.captureSnapshot();
    }
  }

  private updateArenaZones(dt: number, now: number): void {
    const stageSpec = this.arena.stages[this.state.stageNumber - 1];

    // Spawn Central Shrine Blessing periodically in Stage 2 & 3
    if (this.state.stageNumber >= 2 && now - this.lastShrineSpawnSec >= 22) {
      this.lastShrineSpawnSec = now;
      this.state.activeZones.push({
        id: `zone_shrine_${this.state.tick}`,
        type: 'shrine-blessing',
        ownerId: null,
        position: [0, 0.2, 0],
        radius: 6.5,
        remainingSec: 8.0,
        totalDurationSec: 8.0,
        color: '#fbbf24',
        triggered: false,
      });
      this.state.events.push({
        id: `evt_shrine_${this.state.tick}`,
        timestampSec: now,
        tick: this.state.tick,
        type: 'ARENA_EVENT',
        description: `Central Altar activated in ${this.arena.name}! Contest the Sanctum Core for Aether Regeneration!`,
        importance: 'medium',
        position: [0, 1, 0],
      });
    }

    // Spawn Environmental Hazard Zones when enabled
    if (
      this.settings.environmentHazardsEnabled &&
      now - this.lastHazardSpawnSec >= stageSpec.hazardIntervalSec
    ) {
      this.lastHazardSpawnSec = now;
      const angle = this.rng.range(0, Math.PI * 2);
      const dist = this.rng.range(4, this.arena.playableRadius * 0.72);
      const hx = Number((Math.cos(angle) * dist).toFixed(2));
      const hz = Number((Math.sin(angle) * dist).toFixed(2));

      this.state.activeZones.push({
        id: `zone_hazard_${this.state.tick}`,
        type: 'meteor-hazard',
        ownerId: null,
        position: [hx, 0.2, hz],
        radius: 5.5,
        remainingSec: 2.2,
        totalDurationSec: 2.2,
        color: '#f43f5e',
        triggered: false,
      });
    }

    // Update all active zones
    for (const zone of this.state.activeZones) {
      zone.remainingSec -= dt;

      if (zone.type === 'shrine-blessing') {
        for (const f of this.state.fighters) {
          if (!f.isAlive) continue;
          const d = Math.hypot(f.position[0] - zone.position[0], f.position[2] - zone.position[2]);
          if (d <= zone.radius) {
            f.hp = Math.min(f.maxHp, f.hp + 18 * dt);
            f.energy = Math.min(f.maxEnergy, f.energy + 12 * dt);
            f.activeBuffs.atkBoostTimer = Math.max(f.activeBuffs.atkBoostTimer, 3.0);
          }
        }
      } else if (zone.type === 'meteor-hazard' && zone.remainingSec <= 0.15 && !zone.triggered) {
        zone.triggered = true;
        this.state.vfxEvents.push({
          id: `vfx_meteor_${this.state.tick}_${zone.id}`,
          type: 'shockwave',
          position: [...zone.position],
          color: '#f43f5e',
          secondaryColor: '#f59e0b',
          radius: zone.radius,
          createdAtSec: now,
          durationSec: 0.9,
          label: 'CATACLYSM IMPACT',
        });

        for (const f of this.state.fighters) {
          if (!f.isAlive || f.activeBuffs.invulnerableTimer > 0) continue;
          const d = Math.hypot(f.position[0] - zone.position[0], f.position[2] - zone.position[2]);
          if (d <= zone.radius) {
            this.applyDirectDamage(f, null, 72 * this.getTargetDurationScale(), 'Arena Cataclysm Strike', true);
          }
        }
      } else if (zone.type === 'gravity-well') {
        for (const f of this.state.fighters) {
          if (!f.isAlive || f.id === zone.ownerId) continue;
          if (zone.ownerId && f.allyIds.includes(zone.ownerId)) continue;
          const dx = zone.position[0] - f.position[0];
          const dz = zone.position[2] - f.position[2];
          const d = Math.hypot(dx, dz);
          if (d > 0.5 && d <= zone.radius) {
            f.position[0] += (dx / d) * 4.2 * dt;
            f.position[2] += (dz / d) * 4.2 * dt;
          }
        }
      }
    }

    this.state.activeZones = this.state.activeZones.filter((z) => z.remainingSec > 0);
  }

  private executeFighterAction(
    actor: FighterRuntimeState,
    def: CharacterDefinition,
    action:
      | 'basicCombo'
      | 'heavyAttack'
      | 'movementSkill'
      | 'defensiveCounter'
      | 'signatureSkill'
      | 'ultimate'
      | 'awakening'
      | 'attackDestructible',
    targetDestructibleId: string | undefined,
    now: number
  ): void {
    // 1. Handle Awakening Transformation
    if (action === 'awakening') {
      actor.isAwakened = true;
      actor.animationState = 'awakening';
      actor.animationTimer = 0.85;
      actor.energy = Math.min(actor.maxEnergy, actor.energy + 35);
      actor.activeBuffs.invulnerableTimer = 1.1;

      this.state.vfxEvents.push({
        id: `vfx_awaken_${this.state.tick}_${actor.id}`,
        type: 'awakening-pillar',
        position: [...actor.position],
        color: def.appearance.auraColor,
        secondaryColor: def.appearance.accentColor,
        radius: 5.5,
        createdAtSec: now,
        durationSec: 1.4,
        label: def.abilities.awakening.name,
      });

      this.state.events.push({
        id: `evt_awaken_${this.state.tick}_${actor.id}`,
        timestampSec: now,
        tick: this.state.tick,
        type: 'AWAKENING_TRIGGERED',
        actorId: actor.id,
        actorName: actor.name,
        abilityName: def.abilities.awakening.name,
        description: `AWAKENING! ${actor.name} unleashed "${def.abilities.awakening.name}"! Aura and combat attributes surge!`,
        importance: 'high',
        position: [...actor.position],
        voiceLine: def.voicePack.awakening,
      });
      this.captureSnapshot();
      return;
    }

    // 2. Handle Attacking a Destructible Arena Object
    if (action === 'attackDestructible') {
      if (targetDestructibleId) {
        const dest = this.state.destructibles.find((d) => d.id === targetDestructibleId);
        if (dest && !dest.isDestroyed) {
          actor.animationState = 'heavyAttack';
          actor.animationTimer = 0.45;
          actor.cooldowns.basicCombo = 0.65;
          const dmg = actor.attack * 1.35;
          this.damageDestructible(dest, actor, dmg, now);
        }
      }
      return;
    }

    // 3. Resolve Ability Spec
    const abilityMap: Record<
      'basicCombo' | 'heavyAttack' | 'movementSkill' | 'defensiveCounter' | 'signatureSkill' | 'ultimate',
      AbilitySpec
    > = {
      basicCombo: def.abilities.basicCombo,
      heavyAttack: def.abilities.heavyAttack,
      movementSkill: def.abilities.movementSkill,
      defensiveCounter: def.abilities.defensiveCounter,
      signatureSkill: def.abilities.signatureSkill,
      ultimate: def.abilities.ultimate,
    };

    const ability = abilityMap[action];
    if (!ability) return;

    // Deduct energy and set cooldown
    actor.energy = Math.max(0, actor.energy - ability.energyCost);
    actor.cooldowns[action] = ability.cooldownSec;

    if (action === 'basicCombo') {
      actor.comboStep = (actor.comboStep % 3) + 1;
      actor.animationState = 'basicCombo';
      actor.animationTimer = 0.35;
      actor.energy = Math.min(actor.maxEnergy, actor.energy + 6);
    } else if (action === 'heavyAttack') {
      actor.animationState = 'heavyAttack';
      actor.animationTimer = 0.5;
      actor.energy = Math.min(actor.maxEnergy, actor.energy + 8);
    } else if (action === 'movementSkill') {
      actor.animationState = 'movementSkill';
      actor.animationTimer = 0.4;
      actor.activeBuffs.invulnerableTimer = 0.45;

      // Dash burst displacement
      const dashDist = Math.min(ability.range * 0.55, 7.5);
      actor.position[0] += Math.sin(actor.rotationY) * dashDist;
      actor.position[2] += Math.cos(actor.rotationY) * dashDist;
      const dOrigin = Math.hypot(actor.position[0], actor.position[2]);
      if (dOrigin > this.arena.playableRadius) {
        actor.position[0] *= this.arena.playableRadius / dOrigin;
        actor.position[2] *= this.arena.playableRadius / dOrigin;
      }
    } else if (action === 'defensiveCounter') {
      actor.isGuarding = true;
      actor.animationState = 'defend';
      actor.animationTimer = 0.65;
    } else if (action === 'signatureSkill') {
      actor.animationState = 'signatureSkill';
      actor.animationTimer = 0.6;
      actor.stats.signaturesUsed += 1;
    } else if (action === 'ultimate') {
      actor.animationState = 'ultimate';
      actor.animationTimer = 1.05;
      actor.activeBuffs.invulnerableTimer = 1.0;
      actor.stats.ultimatesUsed += 1;
    }

    const target = this.state.fighters.find((f) => f.id === actor.targetId && f.isAlive);
    const impactCenter: [number, number, number] =
      target && Math.hypot(target.position[0] - actor.position[0], target.position[2] - actor.position[2]) <= ability.range + 2
        ? [...target.position]
        : [
            actor.position[0] + Math.sin(actor.rotationY) * Math.min(ability.range, 5.5),
            0.8,
            actor.position[2] + Math.cos(actor.rotationY) * Math.min(ability.range, 5.5),
          ];

    // Emit VFX for the ability
    const vfxType: VFXEventRuntime['type'] =
      action === 'ultimate'
        ? 'shockwave'
        : ability.effectType === 'beam' || ability.effectType === 'projectile'
        ? 'energy-beam'
        : ability.effectType === 'vortex'
        ? 'vortex-sphere'
        : ability.element === 'lightning'
        ? 'lightning-strike'
        : action === 'defensiveCounter'
        ? 'counter-flash'
        : 'slash-arc';

    this.state.vfxEvents.push({
      id: `vfx_${this.state.tick}_${actor.id}_${action}`,
      type: vfxType,
      position: [...actor.position],
      targetPosition: impactCenter,
      color: def.appearance.primaryColor,
      secondaryColor: def.appearance.accentColor,
      radius: ability.aoeRadius,
      createdAtSec: now,
      durationSec: action === 'ultimate' ? 1.45 : action === 'signatureSkill' ? 0.9 : 0.45,
      label: action === 'ultimate' || action === 'signatureSkill' ? ability.name : undefined,
    });

    // Spawn lingering gravity well if vortex signature/ultimate
    if (ability.effectType === 'vortex' && (action === 'signatureSkill' || action === 'ultimate')) {
      this.state.activeZones.push({
        id: `zone_vortex_${this.state.tick}_${actor.id}`,
        type: 'gravity-well',
        ownerId: actor.id,
        position: [...impactCenter],
        radius: ability.aoeRadius * 1.15,
        remainingSec: 3.0,
        totalDurationSec: 3.0,
        color: def.appearance.primaryColor,
        triggered: true,
      });
    }

    // Log Signature & Ultimate Events
    if (action === 'ultimate') {
      this.state.events.push({
        id: `evt_ult_${this.state.tick}_${actor.id}`,
        timestampSec: now,
        tick: this.state.tick,
        type: 'ULTIMATE_UNLEASHED',
        actorId: actor.id,
        actorName: actor.name,
        targetId: target?.id,
        targetName: target?.name,
        abilityName: ability.name,
        description: `ULTIMATE ART! ${actor.name} unleashed "${ability.name}"${
          target ? ` targeting ${target.name}` : ''
        }!`,
        importance: 'critical',
        position: [...impactCenter],
        voiceLine: def.voicePack.ultimate,
      });
      this.captureSnapshot();
    } else if (action === 'signatureSkill') {
      this.state.events.push({
        id: `evt_sig_${this.state.tick}_${actor.id}`,
        timestampSec: now,
        tick: this.state.tick,
        type: 'SKILL_USED',
        actorId: actor.id,
        actorName: actor.name,
        targetId: target?.id,
        targetName: target?.name,
        abilityName: ability.name,
        description: `${actor.name} cast Signature Skill "${ability.name}"!`,
        importance: 'medium',
        position: [...impactCenter],
        voiceLine: def.voicePack.signature,
      });
    }

    // Hit detection against enemy fighters in range/AoE
    for (const enemy of this.state.fighters) {
      if (!enemy.isAlive || enemy.id === actor.id) continue;
      // Allies do not take friendly fire
      if (actor.allyIds.includes(enemy.id)) continue;

      const distToImpact = Math.hypot(
        enemy.position[0] - impactCenter[0],
        enemy.position[2] - impactCenter[2]
      );
      const distToActor = Math.hypot(
        enemy.position[0] - actor.position[0],
        enemy.position[2] - actor.position[2]
      );

      const isHit =
        distToImpact <= ability.aoeRadius + 0.9 ||
        (ability.effectType === 'slash' && distToActor <= ability.range + 0.6);

      if (isHit) {
        this.resolveCombatHit(actor, def, enemy, ability, action === 'ultimate', now);
      }
    }

    // Also check if AoE hits nearby destructible objects
    if (this.settings.destructibleObjectsEnabled) {
      for (const dest of this.state.destructibles) {
        if (dest.isDestroyed) continue;
        const d = Math.hypot(dest.position[0] - impactCenter[0], dest.position[2] - impactCenter[2]);
        if (d <= ability.aoeRadius + dest.radius) {
          this.damageDestructible(dest, actor, actor.attack * ability.damageMultiplier * 0.75, now);
        }
      }
    }
  }

  private resolveCombatHit(
    attacker: FighterRuntimeState,
    attackerDef: CharacterDefinition,
    defender: FighterRuntimeState,
    ability: AbilitySpec,
    isUltimate: boolean,
    now: number
  ): void {
    if (!defender.isAlive || defender.activeBuffs.invulnerableTimer > 0) return;

    const defenderDef = this.characterDefs.get(defender.id)!;

    // Check if Defender is Guarding / Parrying!
    if (defender.isGuarding && !isUltimate) {
      defender.isGuarding = false;
      defender.animationState = 'counter';
      defender.animationTimer = 0.45;
      defender.stats.countersLanded += 1;
      defender.energy = Math.min(defender.maxEnergy, defender.energy + 18);

      const counterDmg =
        defender.attack *
        defenderDef.abilities.defensiveCounter.damageMultiplier *
        0.55 *
        this.getTargetDurationScale();

      this.state.vfxEvents.push({
        id: `vfx_parry_${this.state.tick}_${defender.id}`,
        type: 'counter-flash',
        position: [...defender.position],
        color: '#fef08a',
        secondaryColor: defenderDef.appearance.primaryColor,
        radius: 3.5,
        createdAtSec: now,
        durationSec: 0.55,
        label: 'COUNTER PARRY!',
      });

      this.state.events.push({
        id: `evt_parry_${this.state.tick}_${defender.id}`,
        timestampSec: now,
        tick: this.state.tick,
        type: 'COUNTER_PARRY',
        actorId: defender.id,
        actorName: defender.name,
        targetId: attacker.id,
        targetName: attacker.name,
        abilityName: defenderDef.abilities.defensiveCounter.name,
        description: `PARRY REVERSAL! ${defender.name} deflected ${attacker.name}'s ${ability.name} with "${defenderDef.abilities.defensiveCounter.name}"!`,
        importance: 'high',
        position: [...defender.position],
      });

      this.applyDirectDamage(
        attacker,
        defender,
        counterDmg,
        defenderDef.abilities.defensiveCounter.name,
        true
      );
      return;
    }

    // Calculate Authoritative Hybrid Damage
    let atkStat = attacker.attack;
    if (attacker.isAwakened) atkStat *= 1 + attackerDef.abilities.awakening.atkBoost;
    if (attacker.activeBuffs.atkBoostTimer > 0) atkStat *= 1.22;

    let defStat = defender.defense;
    if (defender.isAwakened) defStat *= 1 + defenderDef.abilities.awakening.defBoost;
    if (defender.statusEffects.shredTimer > 0) defStat *= 0.74;

    // Hybrid Power Tier Bonus (preserves canonical strength advantage while keeping strategy decisive)
    const tierMult =
      attackerDef.attributes.powerTier === 'S+'
        ? 1.08
        : attackerDef.attributes.powerTier === 'S'
        ? 1.03
        : 1.0;

    // Executioner bonus against wounded targets
    const executionBonus =
      attackerDef.aiProfile.archetype === 'Executioner' && defender.hp / defender.maxHp < 0.4
        ? 1.25
        : 1.0;

    const isCrit = this.rng.chance(attackerDef.attributes.critChance);
    const critMult = isCrit ? 1.35 : 1.0;

    const mitigation = 100 / (100 + defStat * 0.85);
    let rawDamage =
      atkStat *
      ability.damageMultiplier *
      tierMult *
      executionBonus *
      critMult *
      mitigation *
      0.52 *
      this.getTargetDurationScale();

    // Check Cross-Character Elemental Reaction!
    if (this.settings.elementalReactionsEnabled) {
      let reactionName: string | null = null;
      if (
        defender.statusEffects.burnTimer > 0 &&
        (ability.element === 'wind' || ability.element === 'lightning')
      ) {
        reactionName = 'TEMPEST OVERLOAD';
        rawDamage *= 1.32;
        defender.statusEffects.burnTimer = 0;
      } else if (
        defender.statusEffects.slowTimer > 0 &&
        (ability.element === 'solar' || ability.element === 'crystal')
      ) {
        reactionName = 'CHRONO-PRISM SHATTER';
        rawDamage *= 1.3;
        defender.statusEffects.slowTimer = 0;
      } else if (
        defender.statusEffects.shredTimer > 0 &&
        (ability.element === 'void' || ability.element === 'abyss')
      ) {
        reactionName = 'ECLIPSE RUPTURE';
        rawDamage *= 1.34;
        defender.statusEffects.shredTimer = 0;
      }

      if (reactionName) {
        this.state.events.push({
          id: `evt_react_${this.state.tick}_${attacker.id}_${defender.id}`,
          timestampSec: now,
          tick: this.state.tick,
          type: 'ELEMENTAL_REACTION',
          actorId: attacker.id,
          actorName: attacker.name,
          targetId: defender.id,
          targetName: defender.name,
          abilityName: reactionName,
          description: `ELEMENTAL CROSS-REACTION! ${attacker.name} triggered [${reactionName}] on ${defender.name} for amplified cataclysm damage!`,
          importance: 'high',
          position: [...defender.position],
        });
      }
    }

    // Apply status effect from ability
    if (ability.statusEffect === 'burn') {
      defender.statusEffects.burnTimer = 3.5;
    } else if (ability.statusEffect === 'slow') {
      defender.statusEffects.slowTimer = 3.5;
    } else if (ability.statusEffect === 'stun') {
      defender.statusEffects.stunTimer = 0.75;
    } else if (ability.statusEffect === 'shred') {
      defender.statusEffects.shredTimer = 4.5;
    } else if (ability.statusEffect === 'drain') {
      attacker.hp = Math.min(attacker.maxHp, attacker.hp + rawDamage * 0.28);
    }

    // Knockback impulse on heavy or ultimate hits
    if (isUltimate || ability.damageMultiplier >= 1.5) {
      const dx = defender.position[0] - attacker.position[0];
      const dz = defender.position[2] - attacker.position[2];
      const dist = Math.hypot(dx, dz) || 1;
      const push = isUltimate ? 3.2 : 1.4;
      defender.position[0] += (dx / dist) * push;
      defender.position[2] += (dz / dist) * push;
      const dOrigin = Math.hypot(defender.position[0], defender.position[2]);
      if (dOrigin > this.arena.playableRadius) {
        defender.position[0] *= this.arena.playableRadius / dOrigin;
        defender.position[2] *= this.arena.playableRadius / dOrigin;
      }
    }

    recordCombatInteraction(this.state.relationships, attacker, defender, rawDamage, now);
    this.applyDirectDamage(defender, attacker, rawDamage, ability.name, true);
  }

  private applyDirectDamage(
    victim: FighterRuntimeState,
    attacker: FighterRuntimeState | null,
    amount: number,
    abilityName: string,
    triggerHitAnim: boolean
  ): void {
    if (!victim.isAlive) return;

    const finalDmg = Math.max(1, amount);
    victim.hp = Math.max(0, victim.hp - finalDmg);
    victim.stats.damageTaken += finalDmg;
    victim.energy = Math.min(victim.maxEnergy, victim.energy + finalDmg * 0.045);

    if (attacker) {
      attacker.stats.damageDealt += finalDmg;
      if (victim.lastDamagedById && victim.lastDamagedById !== attacker.id) {
        if (!victim.assistDamagerIds.includes(victim.lastDamagedById)) {
          victim.assistDamagerIds.push(victim.lastDamagedById);
        }
      }
      victim.lastDamagedById = attacker.id;
    }

    if (triggerHitAnim && victim.animationState !== 'ultimate' && victim.animationState !== 'awakening') {
      victim.animationState = 'hit';
      victim.animationTimer = 0.22;
    }

    if (victim.hp <= 0) {
      this.handleElimination(victim, attacker, abilityName);
    }
  }

  private damageDestructible(
    dest: DestructibleRuntimeState,
    attacker: FighterRuntimeState,
    damage: number,
    now: number
  ): void {
    if (dest.isDestroyed) return;
    dest.hp = Math.max(0, dest.hp - damage);
    if (dest.hp <= 0) {
      dest.isDestroyed = true;
      attacker.stats.destructiblesShattered += 1;

      // Apply Strategic Environmental Payout!
      if (dest.payoutType === 'energy-surge') {
        attacker.energy = Math.min(attacker.maxEnergy, attacker.energy + 45);
      } else if (dest.payoutType === 'attack-blessing') {
        attacker.activeBuffs.atkBoostTimer = 10.0;
        attacker.activeBuffs.speedBoostTimer = 10.0;
      } else if (dest.payoutType === 'heal-burst') {
        attacker.hp = Math.min(attacker.maxHp, attacker.hp + attacker.maxHp * 0.22);
      } else if (dest.payoutType === 'emp-blast') {
        for (const f of this.state.fighters) {
          if (!f.isAlive || f.id === attacker.id || attacker.allyIds.includes(f.id)) continue;
          const d = Math.hypot(f.position[0] - dest.position[0], f.position[2] - dest.position[2]);
          if (d <= 8.5) {
            f.statusEffects.stunTimer = 1.4;
            this.applyDirectDamage(f, attacker, 55, `${dest.name} EMP Detonation`, true);
          }
        }
      } else if (dest.payoutType === 'gravity-pull') {
        this.state.activeZones.push({
          id: `zone_starcore_${this.state.tick}_${dest.id}`,
          type: 'gravity-well',
          ownerId: attacker.id,
          position: [...dest.position],
          radius: 9.0,
          remainingSec: 4.5,
          totalDurationSec: 4.5,
          color: dest.color,
          triggered: true,
        });
      }

      this.state.vfxEvents.push({
        id: `vfx_shatter_${this.state.tick}_${dest.id}`,
        type: 'shatter-burst',
        position: [...dest.position],
        color: dest.color,
        secondaryColor: '#ffffff',
        radius: 5.0,
        createdAtSec: now,
        durationSec: 1.2,
        label: `${dest.name} Shattered!`,
      });

      this.state.events.push({
        id: `evt_shatter_${this.state.tick}_${dest.id}`,
        timestampSec: now,
        tick: this.state.tick,
        type: 'DESTRUCTIBLE_SHATTERED',
        actorId: attacker.id,
        actorName: attacker.name,
        description: `ENVIRONMENT SHATTERED! ${attacker.name} destroyed ${dest.name} and triggered [${dest.payoutType.toUpperCase()}]!`,
        importance: 'medium',
        position: [...dest.position],
      });
    }
  }

  private handleElimination(
    victim: FighterRuntimeState,
    directKiller: FighterRuntimeState | null,
    abilityName: string
  ): void {
    const now = this.state.elapsedSec;
    const aliveBefore = this.state.fighters.filter((f) => f.isAlive).length;
    const placement = aliveBefore; // 8th down to 2nd

    victim.isAlive = false;
    victim.hp = 0;
    victim.animationState = 'eliminated';
    victim.animationTimer = 999;
    victim.eliminatedAtSec = now;
    victim.finalPlacement = placement;

    const killer =
      directKiller ??
      this.state.fighters.find((f) => f.id === victim.lastDamagedById) ??
      null;

    victim.eliminatedById = killer?.id ?? null;
    victim.eliminatedByAbility = abilityName;

    if (killer) {
      killer.stats.eliminations += 1;
      killer.energy = Math.min(killer.maxEnergy, killer.energy + 30);
    }

    // Credit assists
    for (const assistId of victim.assistDamagerIds) {
      if (assistId !== killer?.id) {
        const assister = this.state.fighters.find((f) => f.id === assistId);
        if (assister) assister.stats.assists += 1;
      }
    }

    // Dissolve any active alliances involving victim
    for (const other of this.state.fighters) {
      other.allyIds = other.allyIds.filter((id) => id !== victim.id);
    }
    for (const al of this.state.alliances) {
      if (al.outcome === 'active' && (al.memberAId === victim.id || al.memberBId === victim.id)) {
        al.endedAtSec = now;
        al.outcome = 'dissolved-by-elimination';
      }
    }

    const elimRecord: EliminationRecord = {
      order: this.state.eliminations.length + 1,
      victimId: victim.id,
      victimName: victim.name,
      finalHitterId: killer?.id ?? null,
      finalHitterName: killer?.name ?? 'Arena Cataclysm Hazard',
      abilityUsed: abilityName,
      timestampSec: now,
      placement,
    };
    this.state.eliminations.push(elimRecord);
    this.state.survivorCount = this.state.fighters.filter((f) => f.isAlive).length;

    // Non-graphic cinematic astral ascension VFX
    this.state.vfxEvents.push({
      id: `vfx_elim_${this.state.tick}_${victim.id}`,
      type: 'elimination-ascension',
      position: [...victim.position],
      color: '#f43f5e',
      secondaryColor: '#fde047',
      radius: 4.5,
      createdAtSec: now,
      durationSec: 1.8,
      label: `${victim.name} Eliminated (#${placement})`,
    });

    this.state.events.push({
      id: `evt_elim_${this.state.tick}_${victim.id}`,
      timestampSec: now,
      tick: this.state.tick,
      type: 'ELIMINATION',
      actorId: killer?.id,
      actorName: killer?.name ?? 'Arena Cataclysm',
      targetId: victim.id,
      targetName: victim.name,
      abilityName,
      description: `ELIMINATED! ${victim.name} fell to ${
        killer ? `${killer.name}'s "${abilityName}"` : abilityName
      } (Finished #${placement} • ${this.state.survivorCount} Survivors Remain)!`,
      importance: 'critical',
      position: [...victim.position],
    });

    this.captureSnapshot();
  }

  private resolveCollisions(): void {
    const alive = this.state.fighters.filter((f) => f.isAlive);
    const minFighterDist = 1.45;

    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        const a = alive[i];
        const b = alive[j];
        const dx = b.position[0] - a.position[0];
        const dz = b.position[2] - a.position[2];
        const dist = Math.hypot(dx, dz);
        if (dist > 0.001 && dist < minFighterDist) {
          const overlap = (minFighterDist - dist) * 0.5;
          const nx = dx / dist;
          const nz = dz / dist;
          a.position[0] -= nx * overlap;
          a.position[2] -= nz * overlap;
          b.position[0] += nx * overlap;
          b.position[2] += nz * overlap;
        }
      }

      // Destructible pillar collision
      for (const dest of this.state.destructibles) {
        if (dest.isDestroyed) continue;
        const f = alive[i];
        const dx = f.position[0] - dest.position[0];
        const dz = f.position[2] - dest.position[2];
        const dist = Math.hypot(dx, dz);
        const minDist = dest.radius + 0.7;
        if (dist > 0.001 && dist < minDist) {
          const push = minDist - dist;
          f.position[0] += (dx / dist) * push;
          f.position[2] += (dz / dist) * push;
        }
      }
    }
  }

  private checkVictoryCondition(now: number): void {
    const alive = this.state.fighters.filter((f) => f.isAlive);
    if (alive.length <= 1) {
      let champion = alive[0];
      if (!champion) {
        // Simultaneous double-KO edge case: last eliminated fighter with highest damage dealt wins
        champion = [...this.state.fighters].sort(
          (a, b) => (b.eliminatedAtSec ?? 0) - (a.eliminatedAtSec ?? 0) || b.stats.damageDealt - a.stats.damageDealt
        )[0];
        champion.isAlive = true;
        champion.hp = 1;
      }

      champion.finalPlacement = 1;
      champion.animationState = 'victory';
      champion.stats.survivalTimeSec = now;
      this.state.survivorCount = 1;
      this.state.status = 'completed';
      this.state.winnerId = champion.id;
      this.state.winnerName = champion.name;

      // Compute MVP based on composite performance score (Damage + Eliminations + Survival + Placement)
      const mvp = [...this.state.fighters].sort((a, b) => {
        const scoreA =
          a.stats.damageDealt +
          a.stats.eliminations * 420 +
          a.stats.assists * 150 +
          a.stats.countersLanded * 110 +
          (a.finalPlacement === 1 ? 550 : 0);
        const scoreB =
          b.stats.damageDealt +
          b.stats.eliminations * 420 +
          b.stats.assists * 150 +
          b.stats.countersLanded * 110 +
          (b.finalPlacement === 1 ? 550 : 0);
        return scoreB - scoreA;
      })[0];

      this.state.mvpId = mvp.id;
      this.state.mvpName = mvp.name;

      const champDef = this.characterDefs.get(champion.id);
      this.state.events.push({
        id: `evt_victory_${this.state.tick}`,
        timestampSec: now,
        tick: this.state.tick,
        type: 'VICTORY',
        actorId: champion.id,
        actorName: champion.name,
        description: `CHAMPION CROWNED! ${champion.name} (${champion.title}) claims victory in ${this.arena.name} with ${champion.stats.eliminations} eliminations and ${Math.round(
          champion.stats.damageDealt
        )} damage dealt!`,
        importance: 'critical',
        position: [...champion.position],
        voiceLine: champDef?.voicePack.victory,
      });

      this.captureSnapshot();
    }
  }

  public captureSnapshot(): void {
    const snap: ReplaySnapshot = {
      tick: this.state.tick,
      elapsedSec: this.state.elapsedSec,
      stageNumber: this.state.stageNumber,
      survivorCount: this.state.survivorCount,
      fighters: this.state.fighters.map((f) => ({
        id: f.id,
        position: [
          Number(f.position[0].toFixed(2)),
          Number(f.position[1].toFixed(2)),
          Number(f.position[2].toFixed(2)),
        ],
        rotationY: Number(f.rotationY.toFixed(3)),
        hp: Math.round(f.hp),
        energy: Math.round(f.energy),
        isAlive: f.isAlive,
        isAwakened: f.isAwakened,
        isGuarding: f.isGuarding,
        animationState: f.animationState,
        targetId: f.targetId,
        allyIds: [...f.allyIds],
        currentIntent: f.currentIntent,
        damageDealt: Math.round(f.stats.damageDealt),
        eliminations: f.stats.eliminations,
        finalPlacement: f.finalPlacement,
      })),
      destructibles: this.state.destructibles.map((d) => ({
        id: d.id,
        hp: Math.round(d.hp),
        isDestroyed: d.isDestroyed,
      })),
      activeZones: this.state.activeZones.map((z) => ({ ...z, position: [...z.position] })),
    };

    // Avoid duplicate tick snapshots
    if (
      this.snapshots.length === 0 ||
      this.snapshots[this.snapshots.length - 1].tick !== snap.tick
    ) {
      this.snapshots.push(snap);
    } else {
      this.snapshots[this.snapshots.length - 1] = snap;
    }
  }

  public getSnapshots(): ReplaySnapshot[] {
    return this.snapshots;
  }

  public exportReplayPayload(): ReplayPayload {
    const rankings = [...this.state.fighters]
      .sort((a, b) => (a.finalPlacement ?? 99) - (b.finalPlacement ?? 99))
      .map((f, idx) => {
        const killer = this.state.fighters.find((k) => k.id === f.eliminatedById);
        return {
          placement: f.finalPlacement ?? idx + 1,
          fighterId: f.id,
          fighterName: f.name,
          universe: f.universe,
          eliminations: f.stats.eliminations,
          damageDealt: Math.round(f.stats.damageDealt),
          damageTaken: Math.round(f.stats.damageTaken),
          ultimatesUsed: f.stats.ultimatesUsed,
          alliancesFormed: f.stats.alliancesFormed,
          betrayalsCommitted: f.stats.betrayalsCommitted,
          survivalTimeSec: Number(f.stats.survivalTimeSec.toFixed(1)),
          eliminatedByName: killer ? killer.name : f.isAlive ? null : 'Arena Cataclysm',
        };
      });

    return {
      schemaVersion: '1.0.0',
      battleId: this.state.battleId,
      battleName: this.state.battleName,
      createdAtIso: new Date().toISOString(),
      seed: this.state.seed,
      arenaId: this.state.arenaId,
      characterIds: this.state.fighters.map((f) => f.id),
      settingsSnapshot: this.settings,
      totalTicks: this.state.tick,
      durationSec: this.state.elapsedSec,
      winnerId: this.state.winnerId ?? rankings[0].fighterId,
      winnerName: this.state.winnerName ?? rankings[0].fighterName,
      mvpId: this.state.mvpId ?? rankings[0].fighterId,
      mvpName: this.state.mvpName ?? rankings[0].fighterName,
      finalRankings: rankings,
      eliminations: [...this.state.eliminations],
      alliances: [...this.state.alliances],
      events: [...this.state.events],
      snapshots: [...this.snapshots],
    };
  }
}
