import {
  AchievementRecord,
  CharacterChronicleStats,
  CharacterDefinition,
  SavedBattleRecord,
} from '../types/game';

export interface RivalryRecordSummary {
  pairKey: string;
  fighterAName: string;
  fighterBName: string;
  encounters: number;
  aEliminatedB: number;
  bEliminatedA: number;
  alliancesTogether: number;
  betrayalsBetween: number;
}

export interface ArenaChronicleReport {
  totalBattles: number;
  totalBattleDurationSec: number;
  totalEliminations: number;
  totalAlliancesFormed: number;
  totalBetrayals: number;
  totalUltimatesUsed: number;
  characterStats: CharacterChronicleStats[];
  hallOfFame: CharacterChronicleStats[];
  rivalries: RivalryRecordSummary[];
  memorableBattles: SavedBattleRecord[];
  achievements: AchievementRecord[];
}

/**
 * Computes 100% authentic historical statistics & achievements solely from stored battle records.
 * Never fabricates records (Section 17).
 */
export function computeArenaChronicle(
  records: SavedBattleRecord[],
  roster: CharacterDefinition[]
): ArenaChronicleReport {
  const statsMap = new Map<string, CharacterChronicleStats>();

  for (const char of roster) {
    statsMap.set(char.id, {
      characterId: char.id,
      characterName: char.name,
      universe: char.universe,
      battlesEntered: 0,
      victories: 0,
      winRatePercent: 0,
      mvpCount: 0,
      totalEliminations: 0,
      totalDeaths: 0,
      kdRatio: 0,
      totalDamageDealt: 0,
      avgPlacement: 0,
      alliancesFormed: 0,
      betrayalsCommitted: 0,
      ultimatesUnleashed: 0,
    });
  }

  const placementSums = new Map<string, number>();
  const rivalryMap = new Map<string, RivalryRecordSummary>();

  let totalBattleDurationSec = 0;
  let totalEliminations = 0;
  let totalAlliancesFormed = 0;
  let totalBetrayals = 0;
  let totalUltimatesUsed = 0;
  let maxSingleMatchElims = 0;
  let underdogVictoryCount = 0;
  const arenasPlayed = new Set<string>();

  for (const battle of records) {
    totalBattleDurationSec += battle.durationSec;
    totalEliminations += battle.totalEliminations;
    totalAlliancesFormed += battle.totalAlliances;
    totalBetrayals += battle.totalBetrayals;
    arenasPlayed.add(battle.arenaId);

    const winnerDef = roster.find((c) => c.id === battle.winnerId);
    if (winnerDef?.attributes.powerTier === 'A+') {
      underdogVictoryCount++;
    }

    for (const rankEntry of battle.replay.finalRankings) {
      let st = statsMap.get(rankEntry.fighterId);
      if (!st) {
        st = {
          characterId: rankEntry.fighterId,
          characterName: rankEntry.fighterName,
          universe: rankEntry.universe,
          battlesEntered: 0,
          victories: 0,
          winRatePercent: 0,
          mvpCount: 0,
          totalEliminations: 0,
          totalDeaths: 0,
          kdRatio: 0,
          totalDamageDealt: 0,
          avgPlacement: 0,
          alliancesFormed: 0,
          betrayalsCommitted: 0,
          ultimatesUnleashed: 0,
        };
        statsMap.set(rankEntry.fighterId, st);
      }

      st.battlesEntered += 1;
      if (rankEntry.placement === 1 || battle.winnerId === rankEntry.fighterId) {
        st.victories += 1;
      } else {
        st.totalDeaths += 1;
      }
      if (battle.mvpId === rankEntry.fighterId) {
        st.mvpCount += 1;
      }

      st.totalEliminations += rankEntry.eliminations;
      if (rankEntry.eliminations > maxSingleMatchElims) {
        maxSingleMatchElims = rankEntry.eliminations;
      }
      st.totalDamageDealt += rankEntry.damageDealt;
      st.alliancesFormed += rankEntry.alliancesFormed;
      st.betrayalsCommitted += rankEntry.betrayalsCommitted;
      st.ultimatesUnleashed += rankEntry.ultimatesUsed;
      totalUltimatesUsed += rankEntry.ultimatesUsed;

      placementSums.set(
        rankEntry.fighterId,
        (placementSums.get(rankEntry.fighterId) ?? 0) + rankEntry.placement
      );
    }

    // Track Elimination Rivalries
    for (const elim of battle.replay.eliminations) {
      if (!elim.finalHitterId) continue;
      const [idA, idB] = [elim.finalHitterId, elim.victimId].sort();
      const nameA =
        idA === elim.finalHitterId ? elim.finalHitterName : elim.victimName;
      const nameB =
        idB === elim.victimId ? elim.victimName : elim.finalHitterName;
      const key = `${idA}__${idB}`;

      let riv = rivalryMap.get(key);
      if (!riv) {
        riv = {
          pairKey: key,
          fighterAName: nameA,
          fighterBName: nameB,
          encounters: 0,
          aEliminatedB: 0,
          bEliminatedA: 0,
          alliancesTogether: 0,
          betrayalsBetween: 0,
        };
        rivalryMap.set(key, riv);
      }
      riv.encounters += 1;
      if (elim.finalHitterId === idA) {
        riv.aEliminatedB += 1;
      } else {
        riv.bEliminatedA += 1;
      }
    }

    // Track Alliance & Betrayal pairings
    for (const al of battle.replay.alliances) {
      const [idA, idB] = [al.memberAId, al.memberBId].sort();
      const nameA = idA === al.memberAId ? al.memberAName : al.memberBName;
      const nameB = idB === al.memberBId ? al.memberBName : al.memberAName;
      const key = `${idA}__${idB}`;

      let riv = rivalryMap.get(key);
      if (!riv) {
        riv = {
          pairKey: key,
          fighterAName: nameA,
          fighterBName: nameB,
          encounters: 0,
          aEliminatedB: 0,
          bEliminatedA: 0,
          alliancesTogether: 0,
          betrayalsBetween: 0,
        };
        rivalryMap.set(key, riv);
      }
      riv.alliancesTogether += 1;
      if (al.outcome === 'broken-by-betrayal') {
        riv.betrayalsBetween += 1;
      }
    }
  }

  const characterStats: CharacterChronicleStats[] = [];
  for (const st of statsMap.values()) {
    if (st.battlesEntered > 0) {
      st.winRatePercent = Number(((st.victories / st.battlesEntered) * 100).toFixed(1));
      st.kdRatio = Number(
        (st.totalEliminations / Math.max(1, st.totalDeaths)).toFixed(2)
      );
      st.avgPlacement = Number(
        ((placementSums.get(st.characterId) ?? st.battlesEntered * 4.5) / st.battlesEntered).toFixed(2)
      );
    }
    characterStats.push(st);
  }

  characterStats.sort(
    (a, b) =>
      b.victories - a.victories ||
      b.winRatePercent - a.winRatePercent ||
      b.totalEliminations - a.totalEliminations
  );

  const hallOfFame = characterStats.filter((c) => c.victories > 0).slice(0, 5);
  const rivalries = Array.from(rivalryMap.values()).sort(
    (a, b) =>
      b.aEliminatedB + b.bEliminatedA + b.betrayalsBetween * 2 -
      (a.aEliminatedB + a.bEliminatedA + a.betrayalsBetween * 2)
  );

  const memorableBattles = [...records]
    .sort(
      (a, b) =>
        b.totalBetrayals * 3 + b.totalAlliances * 2 + b.durationSec * 0.05 -
        (a.totalBetrayals * 3 + a.totalAlliances * 2 + a.durationSec * 0.05)
    )
    .slice(0, 6);

  const totalBattles = records.length;

  const achievements: AchievementRecord[] = [
    {
      id: 'ach_first_battle',
      title: 'First Cataclysm Witnessed',
      description: 'Observe and archive a complete 8-character Battle Royale from start to champion.',
      category: 'chronicle',
      unlocked: totalBattles >= 1,
      progress: Math.min(1, totalBattles),
      target: 1,
    },
    {
      id: 'ach_five_battles',
      title: 'Grand Spectator of the Rift',
      description: 'Archive 5 completed battles in the local Battle Archive.',
      category: 'chronicle',
      unlocked: totalBattles >= 5,
      progress: Math.min(5, totalBattles),
      target: 5,
    },
    {
      id: 'ach_ten_battles',
      title: 'Keeper of the Eternal Chronicle',
      description: 'Archive 10 completed battles across the realms.',
      category: 'chronicle',
      unlocked: totalBattles >= 10,
      progress: Math.min(10, totalBattles),
      target: 10,
    },
    {
      id: 'ach_first_alliance',
      title: 'Cross-Universe Pact',
      description: 'Witness two fighters forge a dynamic tactical alliance during combat.',
      category: 'alliance',
      unlocked: totalAlliancesFormed >= 1,
      progress: Math.min(1, totalAlliancesFormed),
      target: 1,
    },
    {
      id: 'ach_ten_alliances',
      title: 'Architect of Coalitions',
      description: 'Record 10 tactical alliances across archived battles.',
      category: 'alliance',
      unlocked: totalAlliancesFormed >= 10,
      progress: Math.min(10, totalAlliancesFormed),
      target: 10,
    },
    {
      id: 'ach_first_betrayal',
      title: 'Et Tu, Comrade?',
      description: 'Witness an allied fighter shatter their pact and betray their partner.',
      category: 'alliance',
      unlocked: totalBetrayals >= 1,
      progress: Math.min(1, totalBetrayals),
      target: 1,
    },
    {
      id: 'ach_five_betrayals',
      title: 'Throne of Thorns',
      description: 'Record 5 alliance betrayals across archived battles.',
      category: 'alliance',
      unlocked: totalBetrayals >= 5,
      progress: Math.min(5, totalBetrayals),
      target: 5,
    },
    {
      id: 'ach_rampage',
      title: 'Unstoppable Reaper',
      description: 'Witness a single fighter score 4 or more eliminations in one battle.',
      category: 'combat',
      unlocked: maxSingleMatchElims >= 4,
      progress: Math.min(4, maxSingleMatchElims),
      target: 4,
    },
    {
      id: 'ach_underdog',
      title: 'Triumph Over Power Tiers',
      description: 'Witness an A+ Tier strategist outplay S and S+ Tier juggernauts to win a battle.',
      category: 'combat',
      unlocked: underdogVictoryCount >= 1,
      progress: Math.min(1, underdogVictoryCount),
      target: 1,
    },
    {
      id: 'ach_ultimates',
      title: 'Heavens Sundered',
      description: 'Witness 15 Signature Ultimate attacks unleashed across saved battles.',
      category: 'combat',
      unlocked: totalUltimatesUsed >= 15,
      progress: Math.min(15, totalUltimatesUsed),
      target: 15,
    },
    {
      id: 'ach_all_arenas',
      title: 'Walker of Three Realms',
      description: 'Complete and archive battles in Aetherium Sanctum, Neo-Kyoto Crater, and Obsidian Rift.',
      category: 'arena',
      unlocked: arenasPlayed.size >= 3,
      progress: Math.min(3, arenasPlayed.size),
      target: 3,
    },
    {
      id: 'ach_50_elims',
      title: 'Crucible of Legends',
      description: 'Accumulate 50 total eliminations across archived battles.',
      category: 'combat',
      unlocked: totalEliminations >= 50,
      progress: Math.min(50, totalEliminations),
      target: 50,
    },
  ];

  return {
    totalBattles,
    totalBattleDurationSec: Number(totalBattleDurationSec.toFixed(1)),
    totalEliminations,
    totalAlliancesFormed,
    totalBetrayals,
    totalUltimatesUsed,
    characterStats,
    hallOfFame,
    rivalries,
    memorableBattles,
    achievements,
  };
}
