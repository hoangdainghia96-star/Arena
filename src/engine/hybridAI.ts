import {
  ArenaSettings,
  ArenaZoneRuntime,
  CharacterDefinition,
  DestructibleRuntimeState,
  FighterRuntimeState,
  RelationshipCell,
  TacticalIntent,
} from '../types/game';
import { SeededRNG } from '../utils/prng';

export interface AIDecisionOutput {
  intent: TacticalIntent;
  targetId: string | null;
  moveDirection: [number, number]; // Normalized X, Z vector
  desiredAction:
    | 'none'
    | 'basicCombo'
    | 'heavyAttack'
    | 'movementSkill'
    | 'defensiveCounter'
    | 'signatureSkill'
    | 'ultimate'
    | 'awakening'
    | 'attackDestructible';
  targetDestructibleId?: string;
}

/**
 * Hybrid AI Engine:
 * 1. Utility AI scores all strategic intents based on personality weights, HP, energy, relationships, and environment.
 * 2. Behavior Tree selects target, movement vector, and ability execution.
 */
export function evaluateFighterAI(
  self: FighterRuntimeState,
  selfDef: CharacterDefinition,
  allFighters: FighterRuntimeState[],
  relationships: Record<string, Record<string, RelationshipCell>>,
  destructibles: DestructibleRuntimeState[],
  activeZones: ArenaZoneRuntime[],
  playableRadius: number,
  settings: ArenaSettings,
  rng: SeededRNG
): AIDecisionOutput {
  const enemies = allFighters.filter(
    (f) => f.isAlive && f.id !== self.id && !self.allyIds.includes(f.id)
  );
  const allies = allFighters.filter((f) => f.isAlive && self.allyIds.includes(f.id));

  if (enemies.length === 0) {
    return {
      intent: 'ENGAGE_PRIMARY_TARGET',
      targetId: null,
      moveDirection: [0, 0],
      desiredAction: 'none',
    };
  }

  const hpRatio = self.hp / self.maxHp;
  const profile = selfDef.aiProfile;

  // --- STEP 1: CHECK IMMEDIATE AWAKENING ---
  if (
    settings.awakeningEnabled &&
    !self.isAwakened &&
    hpRatio <= selfDef.abilities.awakening.hpThreshold
  ) {
    return {
      intent: 'UNLEASH_ULTIMATE_OR_AWAKEN',
      targetId: self.targetId ?? enemies[0].id,
      moveDirection: [0, 0],
      desiredAction: 'awakening',
    };
  }

  // --- STEP 2: CHECK HAZARD EVASION (UTILITY SCORE) ---
  const dangerousZone = activeZones.find((z) => {
    if (z.type === 'shrine-blessing') return false;
    if (z.ownerId === self.id || (z.ownerId && self.allyIds.includes(z.ownerId))) return false;
    const d = Math.hypot(self.position[0] - z.position[0], self.position[2] - z.position[2]);
    return d < z.radius + 1.5;
  });

  if (dangerousZone && profile.caution > 0.2) {
    const dx = self.position[0] - dangerousZone.position[0];
    const dz = self.position[2] - dangerousZone.position[2];
    const len = Math.hypot(dx, dz) || 1;
    const evadeDir: [number, number] = [dx / len, dz / len];
    const canDash = self.cooldowns.movementSkill <= 0 && self.energy >= selfDef.abilities.movementSkill.energyCost;
    return {
      intent: 'EVADE_HAZARD_OR_ULTIMATE',
      targetId: self.targetId,
      moveDirection: evadeDir,
      desiredAction: canDash ? 'movementSkill' : 'none',
    };
  }

  // --- STEP 3: TARGET SCORING (UTILITY AI) ---
  let bestTarget: FighterRuntimeState = enemies[0];
  let bestTargetScore = -9999;

  for (const enemy of enemies) {
    const dist = Math.hypot(
      enemy.position[0] - self.position[0],
      enemy.position[2] - self.position[2]
    );
    const enemyHpRatio = enemy.hp / enemy.maxHp;
    const rel = relationships[self.id]?.[enemy.id];
    const grudge = rel?.grudge ?? 0;
    const threat = rel?.threat ?? 25;

    let score = 100 - dist * 2.1;

    // Grudge and Rivalry weight
    score += grudge * 0.65;
    if (rel?.status === 'rival') score += 28;
    if (rel?.betrayedAt) score += 65; // Punish betrayers!

    // Personality-specific target evaluation
    if (profile.archetype === 'Executioner' || profile.archetype === 'Opportunist') {
      if (enemyHpRatio < 0.4) score += (1 - enemyHpRatio) * 90;
    } else if (profile.archetype === 'Challenger' || profile.archetype === 'Duelist') {
      score += threat * 0.7;
    } else if (profile.archetype === 'Guardian') {
      // Prioritize enemies attacking our ally
      const isAttackingAlly = allies.some((al) => enemy.targetId === al.id);
      if (isAttackingAlly) score += 75;
    }

    // Coordinated alliance focus bonus
    if (allies.some((al) => al.targetId === enemy.id)) {
      score += 38;
    }

    // Stickiness to current target to prevent jitter
    if (self.targetId === enemy.id) {
      score += 16;
    }

    if (score > bestTargetScore) {
      bestTargetScore = score;
      bestTarget = enemy;
    }
  }

  const distToTarget = Math.hypot(
    bestTarget.position[0] - self.position[0],
    bestTarget.position[2] - self.position[2]
  );

  // --- STEP 4: SCORE STRATEGIC INTENTS ---
  let chosenIntent: TacticalIntent = 'ENGAGE_PRIMARY_TARGET';
  if (bestTarget.hp / bestTarget.maxHp < 0.35) {
    chosenIntent = 'EXECUTE_WOUNDED';
  } else if (allies.some((al) => al.hp / al.maxHp < 0.5 && bestTarget.targetId === al.id)) {
    chosenIntent = 'ASSIST_ALLY';
  }

  // Check if a shrine blessing zone or weakened destructible object is nearby and high-value
  const blessingZone = activeZones.find((z) => z.type === 'shrine-blessing');
  if (blessingZone && profile.objectiveFocus > 0.55) {
    const distToBlessing = Math.hypot(
      blessingZone.position[0] - self.position[0],
      blessingZone.position[2] - self.position[2]
    );
    if (distToBlessing > 2.5 && distToBlessing < 18 && hpRatio < 0.85) {
      const dx = blessingZone.position[0] - self.position[0];
      const dz = blessingZone.position[2] - self.position[2];
      const len = Math.hypot(dx, dz) || 1;
      return {
        intent: 'CONTEST_ARENA_OBJECTIVE',
        targetId: bestTarget.id,
        moveDirection: [dx / len, dz / len],
        desiredAction: distToTarget <= selfDef.abilities.basicCombo.range ? 'basicCombo' : 'none',
      };
    }
  }

  if (settings.destructibleObjectsEnabled && profile.objectiveFocus > 0.6) {
    const nearDestructible = destructibles.find((d) => {
      if (d.isDestroyed) return false;
      const dist = Math.hypot(d.position[0] - self.position[0], d.position[2] - self.position[2]);
      return dist < 5.5 && (distToTarget > 9 || d.hp < 140);
    });
    if (nearDestructible) {
      const dx = nearDestructible.position[0] - self.position[0];
      const dz = nearDestructible.position[2] - self.position[2];
      const len = Math.hypot(dx, dz) || 1;
      return {
        intent: 'CONTEST_ARENA_OBJECTIVE',
        targetId: bestTarget.id,
        moveDirection: len > 2.6 ? [dx / len, dz / len] : [0, 0],
        desiredAction: len <= 4.2 ? 'attackDestructible' : 'none',
        targetDestructibleId: nearDestructible.id,
      };
    }
  }

  // --- STEP 5: BEHAVIOR TREE — MOVEMENT & POSITIONING ---
  const dirToTargetX = (bestTarget.position[0] - self.position[0]) / (distToTarget || 1);
  const dirToTargetZ = (bestTarget.position[2] - self.position[2]) / (distToTarget || 1);

  let moveX = dirToTargetX;
  let moveZ = dirToTargetZ;

  const preferredDist =
    profile.preferredRange === 'ranged' ? 11.5 : profile.preferredRange === 'mid' ? 7.2 : 3.1;

  if (profile.preferredRange === 'ranged' && distToTarget < 6.2 && hpRatio < 0.75) {
    // Ranged kiting behavior: back away while strafing
    moveX = -dirToTargetX * 0.8 + -dirToTargetZ * 0.4;
    moveZ = -dirToTargetZ * 0.8 + dirToTargetX * 0.4;
  } else if (Math.abs(distToTarget - preferredDist) < 1.3) {
    // Tactical strafing around target
    const strafeSign = (self.id.charCodeAt(5) % 2 === 0 ? 1 : -1);
    moveX = -dirToTargetZ * 0.65 * strafeSign;
    moveZ = dirToTargetX * 0.65 * strafeSign;
  }

  // Keep comfortably within the playable arena boundary
  const distFromCenter = Math.hypot(self.position[0], self.position[2]);
  if (distFromCenter > playableRadius - 3.5) {
    const pullInX = -self.position[0] / (distFromCenter || 1);
    const pullInZ = -self.position[2] / (distFromCenter || 1);
    moveX = moveX * 0.35 + pullInX * 0.65;
    moveZ = moveZ * 0.35 + pullInZ * 0.65;
  }

  const moveLen = Math.hypot(moveX, moveZ) || 1;
  const normalizedMove: [number, number] = [moveX / moveLen, moveZ / moveLen];

  // --- STEP 6: BEHAVIOR TREE — COMBAT ACTION SELECTION ---
  // 6A. Check Ultimate Attack
  if (
    settings.ultimatesEnabled &&
    self.energy >= 100 &&
    self.cooldowns.ultimate <= 0 &&
    distToTarget <= selfDef.abilities.ultimate.range
  ) {
    return {
      intent: 'UNLEASH_ULTIMATE_OR_AWAKEN',
      targetId: bestTarget.id,
      moveDirection: normalizedMove,
      desiredAction: 'ultimate',
    };
  }

  // 6B. Check Defensive Guard / Counter when under heavy focus fire
  const attackersTargetingSelf = enemies.filter(
    (e) =>
      e.targetId === self.id &&
      Math.hypot(e.position[0] - self.position[0], e.position[2] - self.position[2]) < 6.0
  );
  if (
    attackersTargetingSelf.length > 0 &&
    self.cooldowns.defensiveCounter <= 0 &&
    self.energy >= selfDef.abilities.defensiveCounter.energyCost &&
    (hpRatio < 0.65 || attackersTargetingSelf.length >= 2) &&
    rng.chance(0.32 + profile.caution * 0.35)
  ) {
    return {
      intent: 'DEFEND_AND_COUNTER',
      targetId: attackersTargetingSelf[0].id,
      moveDirection: [0, 0],
      desiredAction: 'defensiveCounter',
    };
  }

  // 6C. Check Signature Skill
  if (
    self.cooldowns.signatureSkill <= 0 &&
    self.energy >= selfDef.abilities.signatureSkill.energyCost &&
    distToTarget <= selfDef.abilities.signatureSkill.range
  ) {
    return {
      intent: chosenIntent,
      targetId: bestTarget.id,
      moveDirection: normalizedMove,
      desiredAction: 'signatureSkill',
    };
  }

  // 6D. Check Movement Skill (Gap closer for melee or escape for ranged)
  if (
    self.cooldowns.movementSkill <= 0 &&
    self.energy >= selfDef.abilities.movementSkill.energyCost
  ) {
    if (profile.preferredRange === 'melee' && distToTarget > 7.5 && distToTarget < 16.5) {
      return {
        intent: chosenIntent,
        targetId: bestTarget.id,
        moveDirection: [dirToTargetX, dirToTargetZ],
        desiredAction: 'movementSkill',
      };
    }
    if (profile.preferredRange === 'ranged' && distToTarget < 4.5) {
      return {
        intent: 'EVADE_HAZARD_OR_ULTIMATE',
        targetId: bestTarget.id,
        moveDirection: [-dirToTargetX, -dirToTargetZ],
        desiredAction: 'movementSkill',
      };
    }
  }

  // 6E. Check Heavy Attack
  if (
    self.cooldowns.heavyAttack <= 0 &&
    self.energy >= selfDef.abilities.heavyAttack.energyCost &&
    distToTarget <= selfDef.abilities.heavyAttack.range
  ) {
    return {
      intent: chosenIntent,
      targetId: bestTarget.id,
      moveDirection: normalizedMove,
      desiredAction: 'heavyAttack',
    };
  }

  // 6F. Check Basic 3-Hit Combo
  if (
    self.cooldowns.basicCombo <= 0 &&
    distToTarget <= selfDef.abilities.basicCombo.range
  ) {
    return {
      intent: chosenIntent,
      targetId: bestTarget.id,
      moveDirection: normalizedMove,
      desiredAction: 'basicCombo',
    };
  }

  return {
    intent: chosenIntent,
    targetId: bestTarget.id,
    moveDirection: normalizedMove,
    desiredAction: 'none',
  };
}
