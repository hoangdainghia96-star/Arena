import {
  AllianceRecord,
  ArenaSettings,
  BattleEvent,
  CharacterDefinition,
  FighterRuntimeState,
  RelationshipCell,
} from '../types/game';
import { SeededRNG } from '../utils/prng';

export function initializeRelationships(
  fighters: FighterRuntimeState[],
  definitions: Map<string, CharacterDefinition>
): Record<string, Record<string, RelationshipCell>> {
  const matrix: Record<string, Record<string, RelationshipCell>> = {};

  for (const a of fighters) {
    matrix[a.id] = {};
    const defA = definitions.get(a.id);
    for (const b of fighters) {
      if (a.id === b.id) continue;
      const defB = definitions.get(b.id);
      const initialPref = defA?.initialRelationships?.[b.id] ?? 'neutral';

      let trust = 0;
      let grudge = 0;
      let status: RelationshipCell['status'] = 'neutral';

      if (initialPref === 'ally-inclined') {
        trust = 28;
        status = 'neutral';
      } else if (initialPref === 'rival') {
        trust = -35;
        grudge = 35;
        status = 'rival';
      }

      // Same-universe bonus unless rivals
      if (defA && defB && defA.universe === defB.universe && initialPref !== 'rival') {
        trust += 14;
      }

      // High base threat for S+ juggernauts
      const baseThreat =
        defB?.attributes.powerTier === 'S+' ? 45 : defB?.attributes.powerTier === 'S' ? 30 : 20;

      matrix[a.id][b.id] = {
        fromId: a.id,
        toId: b.id,
        status,
        trust: Math.max(-100, Math.min(100, trust)),
        threat: baseThreat,
        grudge,
      };
    }
  }

  return matrix;
}

export function recordCombatInteraction(
  matrix: Record<string, Record<string, RelationshipCell>>,
  attacker: FighterRuntimeState,
  victim: FighterRuntimeState,
  damage: number,
  elapsedSec: number
): void {
  const cellVictimToAttacker = matrix[victim.id]?.[attacker.id];
  if (cellVictimToAttacker) {
    cellVictimToAttacker.grudge = Math.min(100, cellVictimToAttacker.grudge + damage * 0.12);
    cellVictimToAttacker.threat = Math.min(100, cellVictimToAttacker.threat + damage * 0.09);
    cellVictimToAttacker.trust = Math.max(-100, cellVictimToAttacker.trust - damage * 0.15);
    if (cellVictimToAttacker.status === 'neutral' && cellVictimToAttacker.grudge > 30) {
      cellVictimToAttacker.status = 'enemy';
    }
  }

  // Record in victim's tactical memory (keep recent 16 entries)
  victim.memory.push({
    timestamp: elapsedSec,
    type: 'attacked_by',
    actorId: attacker.id,
    value: Math.round(damage),
  });
  if (victim.memory.length > 16) victim.memory.shift();

  // If attacker hit someone who recently attacked another third fighter, that third fighter gains trust toward attacker!
  const recentTargetOfVictim = victim.targetId;
  if (recentTargetOfVictim && recentTargetOfVictim !== attacker.id) {
    const thirdCell = matrix[recentTargetOfVictim]?.[attacker.id];
    if (thirdCell && thirdCell.status !== 'allied') {
      thirdCell.trust = Math.min(100, thirdCell.trust + damage * 0.08);
    }
  }
}

export function evaluateDynamicAlliances(
  fighters: FighterRuntimeState[],
  definitions: Map<string, CharacterDefinition>,
  matrix: Record<string, Record<string, RelationshipCell>>,
  alliances: AllianceRecord[],
  settings: ArenaSettings,
  rng: SeededRNG,
  elapsedSec: number,
  tick: number
): BattleEvent[] {
  const newEvents: BattleEvent[] = [];
  const alive = fighters.filter((f) => f.isAlive);

  // If only 2 fighters remain, any active alliance between them must end (either honorable final duel or betrayal)
  if (alive.length === 2) {
    const [a, b] = alive;
    if (a.allyIds.includes(b.id)) {
      const defA = definitions.get(a.id);
      const defB = definitions.get(b.id);
      const loyaltyA = defA?.aiProfile.loyalty ?? 0.5;
      const loyaltyB = defB?.aiProfile.loyalty ?? 0.5;

      const activeAlliance = alliances.find(
        (al) =>
          al.outcome === 'active' &&
          ((al.memberAId === a.id && al.memberBId === b.id) ||
            (al.memberAId === b.id && al.memberBId === a.id))
      );

      a.allyIds = a.allyIds.filter((id) => id !== b.id);
      b.allyIds = b.allyIds.filter((id) => id !== a.id);
      if (matrix[a.id]?.[b.id]) matrix[a.id][b.id].status = 'rival';
      if (matrix[b.id]?.[a.id]) matrix[b.id][a.id].status = 'rival';

      // Determine if one betrays the other or if it's a final standoff
      if (loyaltyA < 0.65 || loyaltyB < 0.65) {
        const betrayer = loyaltyA <= loyaltyB ? a : b;
        const betrayed = betrayer.id === a.id ? b : a;
        const betrayerDef = definitions.get(betrayer.id);
        betrayer.stats.betrayalsCommitted += 1;
        if (activeAlliance) {
          activeAlliance.endedAtSec = elapsedSec;
          activeAlliance.outcome = 'broken-by-betrayal';
          activeAlliance.betrayerId = betrayer.id;
        }
        if (matrix[betrayed.id]?.[betrayer.id]) {
          matrix[betrayed.id][betrayer.id].grudge = 100;
          matrix[betrayed.id][betrayer.id].trust = -100;
          matrix[betrayed.id][betrayer.id].betrayedAt = elapsedSec;
        }
        newEvents.push({
          id: `evt_betray_${tick}_${betrayer.id}`,
          timestampSec: elapsedSec,
          tick,
          type: 'ALLIANCE_BETRAYED',
          actorId: betrayer.id,
          actorName: betrayer.name,
          targetId: betrayed.id,
          targetName: betrayed.name,
          description: `${betrayer.name} shattered the pact and betrayed ${betrayed.name} in the final showdown!`,
          importance: 'critical',
          position: [...betrayer.position],
          voiceLine: betrayerDef?.voicePack.betrayal,
        });
      } else {
        if (activeAlliance) {
          activeAlliance.endedAtSec = elapsedSec;
          activeAlliance.outcome = 'final-two-standoff';
        }
        newEvents.push({
          id: `evt_standoff_${tick}`,
          timestampSec: elapsedSec,
          tick,
          type: 'ALLIANCE_BETRAYED',
          actorId: a.id,
          actorName: a.name,
          targetId: b.id,
          targetName: b.name,
          description: `With all other rivals fallen, allies ${a.name} and ${b.name} dissolve their pact for a final duel of honor!`,
          importance: 'high',
          position: [...a.position],
        });
      }
    }
    return newEvents;
  }

  if (alive.length < 3) return newEvents;

  // 1. Check existing active alliances for mid-battle strategic betrayal
  for (const alliance of alliances) {
    if (alliance.outcome !== 'active') continue;
    const memberA = fighters.find((f) => f.id === alliance.memberAId);
    const memberB = fighters.find((f) => f.id === alliance.memberBId);
    if (!memberA || !memberB) continue;

    if (!memberA.isAlive || !memberB.isAlive) {
      alliance.endedAtSec = elapsedSec;
      alliance.outcome = 'dissolved-by-elimination';
      memberA.allyIds = memberA.allyIds.filter((id) => id !== memberB.id);
      memberB.allyIds = memberB.allyIds.filter((id) => id !== memberA.id);
      continue;
    }

    // Minimum alliance duration before betrayal check: 14 seconds
    if (elapsedSec - alliance.formedAtSec < 14) continue;

    for (const [candidate, partner] of [
      [memberA, memberB],
      [memberB, memberA],
    ]) {
      const def = definitions.get(candidate.id);
      if (!def) continue;
      const loyalty = def.aiProfile.loyalty;
      const partnerHpRatio = partner.hp / partner.maxHp;

      // Opportunistic/Schemer/Executioner characters consider betraying when partner is weakened or few survivors remain
      let betrayalScore = (1 - loyalty) * 0.45 * settings.betrayalTendencyMultiplier;
      if (partnerHpRatio < 0.38) betrayalScore += (1 - loyalty) * 0.35;
      if (alive.length <= 4) betrayalScore += (1 - loyalty) * 0.3;

      if (loyalty < 0.78 && betrayalScore > 0.48 && rng.chance(0.18 * settings.betrayalTendencyMultiplier)) {
        alliance.endedAtSec = elapsedSec;
        alliance.outcome = 'broken-by-betrayal';
        alliance.betrayerId = candidate.id;
        candidate.allyIds = candidate.allyIds.filter((id) => id !== partner.id);
        partner.allyIds = partner.allyIds.filter((id) => id !== candidate.id);
        candidate.stats.betrayalsCommitted += 1;
        candidate.targetId = partner.id;
        candidate.currentIntent = 'BETRAY_ALLY';

        if (matrix[candidate.id]?.[partner.id]) {
          matrix[candidate.id][partner.id].status = 'enemy';
          matrix[candidate.id][partner.id].trust = -90;
        }
        if (matrix[partner.id]?.[candidate.id]) {
          matrix[partner.id][candidate.id].status = 'enemy';
          matrix[partner.id][candidate.id].trust = -100;
          matrix[partner.id][candidate.id].grudge = 100;
          matrix[partner.id][candidate.id].betrayedAt = elapsedSec;
        }

        newEvents.push({
          id: `evt_betray_${tick}_${candidate.id}`,
          timestampSec: elapsedSec,
          tick,
          type: 'ALLIANCE_BETRAYED',
          actorId: candidate.id,
          actorName: candidate.name,
          targetId: partner.id,
          targetName: partner.name,
          description: `BETRAYAL! ${candidate.name} turned on allied partner ${partner.name} when their guard dropped!`,
          importance: 'critical',
          position: [...candidate.position],
          voiceLine: def.voicePack.betrayal,
        });
        break;
      }
    }
  }

  // 2. Evaluate new alliance formation among unallied fighters
  if (settings.allianceTendencyMultiplier <= 0) return newEvents;

  const activeAllianceCount = alliances.filter((a) => a.outcome === 'active').length;
  if (activeAllianceCount >= 2) return newEvents; // Cap concurrent alliances at 2 pairs (4 fighters max)

  const unallied = alive.filter((f) => f.allyIds.length === 0);
  if (unallied.length < 2) return newEvents;

  // Identify current highest-threat juggernaut/kill-leader
  const topThreatFighter = [...alive].sort(
    (a, b) => b.hp + b.stats.damageDealt * 0.5 - (a.hp + a.stats.damageDealt * 0.5)
  )[0];

  for (let i = 0; i < unallied.length; i++) {
    for (let j = i + 1; j < unallied.length; j++) {
      const fA = unallied[i];
      const fB = unallied[j];
      if (fA.allyIds.length > 0 || fB.allyIds.length > 0) continue;

      const defA = definitions.get(fA.id);
      const defB = definitions.get(fB.id);
      if (!defA || !defB) continue;

      const cellAB = matrix[fA.id]?.[fB.id];
      const cellBA = matrix[fB.id]?.[fA.id];
      if (!cellAB || !cellBA) continue;

      // Never ally if bitter enemies or already betrayed each other
      if (cellAB.betrayedAt || cellBA.betrayedAt) continue;
      if (cellAB.grudge > 55 || cellBA.grudge > 55) continue;

      const dist = Math.hypot(fA.position[0] - fB.position[0], fA.position[2] - fB.position[2]);
      if (dist > 22) continue;

      const avgTendency =
        ((defA.aiProfile.allianceTendency + defB.aiProfile.allianceTendency) / 2) *
        settings.allianceTendencyMultiplier;

      const mutualTrust = (cellAB.trust + cellBA.trust) / 2;
      const commonEnemyBonus =
        topThreatFighter && topThreatFighter.id !== fA.id && topThreatFighter.id !== fB.id ? 18 : 0;

      const allianceDesire = mutualTrust + commonEnemyBonus + avgTendency * 32;

      if (allianceDesire >= 36 && rng.chance(0.24 * Math.min(1.6, settings.allianceTendencyMultiplier))) {
        fA.allyIds.push(fB.id);
        fB.allyIds.push(fA.id);
        fA.stats.alliancesFormed += 1;
        fB.stats.alliancesFormed += 1;

        cellAB.status = 'allied';
        cellAB.trust = Math.min(100, cellAB.trust + 35);
        cellAB.allianceFormedAt = elapsedSec;

        cellBA.status = 'allied';
        cellBA.trust = Math.min(100, cellBA.trust + 35);
        cellBA.allianceFormedAt = elapsedSec;

        // Share common high-threat target if neither targets an ally
        if (topThreatFighter && topThreatFighter.id !== fA.id && topThreatFighter.id !== fB.id) {
          fA.targetId = topThreatFighter.id;
          fB.targetId = topThreatFighter.id;
        }

        const record: AllianceRecord = {
          id: `pact_${tick}_${fA.id}_${fB.id}`,
          memberAId: fA.id,
          memberAName: fA.name,
          memberBId: fB.id,
          memberBName: fB.name,
          formedAtSec: elapsedSec,
          endedAtSec: null,
          outcome: 'active',
        };
        alliances.push(record);

        newEvents.push({
          id: `evt_ally_${tick}_${fA.id}_${fB.id}`,
          timestampSec: elapsedSec,
          tick,
          type: 'ALLIANCE_FORMED',
          actorId: fA.id,
          actorName: fA.name,
          targetId: fB.id,
          targetName: fB.name,
          description: `TACTICAL PACT! ${fA.name} (${fA.universe}) and ${fB.name} (${fB.universe}) formed a cross-arena alliance!`,
          importance: 'high',
          position: [
            (fA.position[0] + fB.position[0]) / 2,
            1.2,
            (fA.position[2] + fB.position[2]) / 2,
          ],
          voiceLine: defA.voicePack.allianceFormed,
        });
        return newEvents; // Max 1 new alliance per evaluation cycle
      }
    }
  }

  return newEvents;
}
