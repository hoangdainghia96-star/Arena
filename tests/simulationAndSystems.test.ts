import { describe, expect, it } from 'vitest';
import { INITIAL_CHARACTER_ROSTER } from '../src/data/characters';
import { ARENA_DEFINITIONS } from '../src/data/arenas';
import { DEFAULT_ARENA_SETTINGS } from '../src/data/settings';
import {
  exportCharacterToGltfJson,
  selectEightRandomFighters,
  validateCharacterEligibility,
  validateGltfJsonAsset,
} from '../src/pipeline/assetPipeline';
import { BattleSimulation } from '../src/engine/combatEngine';
import { HybridReplayController } from '../src/engine/replayEngine';
import {
  clearAllArchivedBattles,
  createSavedBattleRecordFromReplay,
  exportArchiveToJson,
  importArchiveFromJson,
  listArchivedBattles,
  renameArchivedBattle,
  saveBattleToArchive,
} from '../src/persistence/battleArchive';
import { computeArenaChronicle } from '../src/persistence/arenaChronicle';

describe('ANIME ARENA: CATACLYSM — Production QA Suite', () => {
  it('1. Validates all 10 initial characters pass the 9-point eligibility gate', () => {
    expect(INITIAL_CHARACTER_ROSTER.length).toBeGreaterThanOrEqual(8);
    for (const char of INITIAL_CHARACTER_ROSTER) {
      const res = validateCharacterEligibility(char);
      expect(res.isEligible).toBe(true);
      expect(res.errors).toEqual([]);
      expect(Object.values(res.checks).every(Boolean)).toBe(true);
    }
  });

  it('2. Selects exactly 8 unique eligible characters and blocks when < 8 are eligible', () => {
    const { selected } = selectEightRandomFighters('QA-SEED-101', INITIAL_CHARACTER_ROSTER);
    expect(selected.length).toBe(8);
    const uniqueIds = new Set(selected.map((c) => c.id));
    expect(uniqueIds.size).toBe(8);

    // Disable 4 characters so only 6 remain eligible -> must block battle start
    const insufficientRoster = INITIAL_CHARACTER_ROSTER.map((c, idx) => ({
      ...c,
      enabledInPool: idx < 6,
    }));
    expect(() => selectEightRandomFighters('QA-SEED-FAIL', insufficientRoster)).toThrow(
      /INSUFFICIENT_ELIGIBLE_FIGHTERS/
    );
  });

  it('3. Exports and validates Blender-compatible glTF 2.0 character assets', () => {
    const sample = INITIAL_CHARACTER_ROSTER[0];
    const gltfJson = exportCharacterToGltfJson(sample);
    const validation = validateGltfJsonAsset(gltfJson);
    expect(validation.valid).toBe(true);
    expect(validation.boneCount).toBeGreaterThanOrEqual(22);
    expect(validation.meshCount).toBeGreaterThanOrEqual(1);
    expect(validation.animationClips.length).toBe(13);
  });

  it('4. Runs a complete 8-fighter Battle Royale to a single surviving champion with valid rankings', () => {
    const { selected } = selectEightRandomFighters('QA-BATTLE-ALPHA', INITIAL_CHARACTER_ROSTER);
    const arena = ARENA_DEFINITIONS[0];
    const sim = new BattleSimulation({
      fighters: selected,
      arena,
      settings: {
        ...DEFAULT_ARENA_SETTINGS,
        targetDurationPreset: 'fast',
        combatPaceMultiplier: 1.5,
      },
      seed: 'QA-BATTLE-ALPHA',
    });

    let steps = 0;
    while (sim.state.status !== 'completed' && steps < 15000) {
      sim.step();
      steps++;
    }

    expect(sim.state.status).toBe('completed');
    expect(sim.state.survivorCount).toBe(1);
    expect(sim.state.winnerId).toBeTruthy();
    expect(sim.state.mvpId).toBeTruthy();
    expect(sim.state.eliminations.length).toBe(7);

    // Verify all 8 placements are distinct 1..8
    const placements = sim.state.fighters
      .map((f) => f.finalPlacement)
      .sort((a, b) => (a ?? 0) - (b ?? 0));
    expect(placements).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);

    // Verify every fighter stayed inside playable arena bounds (no shrinking zone)
    for (const f of sim.state.fighters) {
      const dist = Math.hypot(f.position[0], f.position[2]);
      expect(dist).toBeLessThanOrEqual(arena.playableRadius + 0.05);
      expect(f.hp).toBeGreaterThanOrEqual(0);
    }
  });

  it('5. Verifies 100% deterministic Replay consistency and timeline scrubbing', () => {
    const { selected } = selectEightRandomFighters('QA-REPLAY-DETERMINISM', INITIAL_CHARACTER_ROSTER);
    const arena = ARENA_DEFINITIONS[1];
    const sim = new BattleSimulation({
      fighters: selected,
      arena,
      settings: {
        ...DEFAULT_ARENA_SETTINGS,
        combatPaceMultiplier: 1.6,
      },
      seed: 'QA-REPLAY-DETERMINISM',
    });

    while (sim.state.status !== 'completed') {
      sim.step();
    }

    const payload = sim.exportReplayPayload();
    const report = HybridReplayController.verifyDeterminism(
      payload,
      INITIAL_CHARACTER_ROSTER,
      arena
    );

    expect(report.isDeterministicMatch).toBe(true);
    expect(report.actualWinnerId).toBe(payload.winnerId);
    expect(report.actualTotalTicks).toBe(payload.totalTicks);
    expect(report.eliminationOrderMatched).toBe(true);
    expect(report.finalRankingMatched).toBe(true);

    // Test timeline scrubbing at start, midpoint, and end
    const controller = new HybridReplayController(payload, arena, selected);
    const startState = controller.getStateAtTime(0);
    expect(startState.survivorCount).toBe(8);

    const midState = controller.getStateAtTime(payload.durationSec * 0.5);
    expect(midState.elapsedSec).toBeCloseTo(payload.durationSec * 0.5, 1);

    const endState = controller.getStateAtTime(payload.durationSec);
    expect(endState.status).toBe('completed');
    expect(endState.winnerId).toBe(payload.winnerId);
  });

  it('6. Persists battles in Battle Archive, exports/imports JSON, and computes authentic Arena Chronicle stats', async () => {
    await clearAllArchivedBattles();

    const { selected } = selectEightRandomFighters('QA-ARCHIVE-SEED', INITIAL_CHARACTER_ROSTER);
    const arena = ARENA_DEFINITIONS[2];
    const sim = new BattleSimulation({
      fighters: selected,
      arena,
      settings: { ...DEFAULT_ARENA_SETTINGS, combatPaceMultiplier: 1.7 },
      seed: 'QA-ARCHIVE-SEED',
    });
    while (sim.state.status !== 'completed') {
      sim.step();
    }

    const payload = sim.exportReplayPayload();
    const record = createSavedBattleRecordFromReplay(
      payload,
      arena.name,
      'Obsidian QA Championship'
    );
    await saveBattleToArchive(record);

    const list1 = await listArchivedBattles();
    expect(list1.length).toBe(1);
    expect(list1[0].battleName).toBe('Obsidian QA Championship');

    await renameArchivedBattle(record.battleId, 'Renamed Cataclysm Finals');
    const list2 = await listArchivedBattles();
    expect(list2[0].battleName).toBe('Renamed Cataclysm Finals');

    // Test JSON Export & Re-Import
    const exportedJson = exportArchiveToJson(list2);
    await clearAllArchivedBattles();
    expect((await listArchivedBattles()).length).toBe(0);

    const importRes = await importArchiveFromJson(exportedJson);
    expect(importRes.importedCount).toBe(1);
    expect(importRes.errors).toEqual([]);

    const list3 = await listArchivedBattles();
    expect(list3.length).toBe(1);

    // Test Arena Chronicle aggregation
    const chronicle = computeArenaChronicle(list3, INITIAL_CHARACTER_ROSTER);
    expect(chronicle.totalBattles).toBe(1);
    expect(chronicle.totalEliminations).toBe(7);
    const champStat = chronicle.characterStats.find(
      (c) => c.characterId === record.winnerId
    );
    expect(champStat?.victories).toBe(1);
    expect(champStat?.winRatePercent).toBe(100);
    expect(
      chronicle.achievements.find((a) => a.id === 'ach_first_battle')?.unlocked
    ).toBe(true);
  });
});
