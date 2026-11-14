import { ReplayPayload, SavedBattleRecord } from '../types/game';

const DB_NAME = 'anime_arena_cataclysm_db';
const DB_VERSION = 1;
const STORE_NAME = 'battles';
const FALLBACK_STORAGE_KEY = 'anime_arena_cataclysm_archive_fallback_v1';

let memoryFallbackStore: SavedBattleRecord[] = [];

function hasIndexedDB(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

function openArchiveDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!hasIndexedDB()) {
      reject(new Error('IndexedDB unavailable in this environment'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'battleId' });
        store.createIndex('createdAtIso', 'createdAtIso', { unique: false });
        store.createIndex('winnerId', 'winnerId', { unique: false });
        store.createIndex('arenaId', 'arenaId', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
  });
}

function loadFallbackRecords(): SavedBattleRecord[] {
  try {
    const raw = localStorage.getItem(FALLBACK_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        memoryFallbackStore = parsed;
      }
    }
  } catch {
    // Use memoryFallbackStore
  }
  return [...memoryFallbackStore];
}

function saveFallbackRecords(records: SavedBattleRecord[]): void {
  memoryFallbackStore = [...records];
  try {
    localStorage.setItem(FALLBACK_STORAGE_KEY, JSON.stringify(records));
  } catch {
    // Quota reached or restricted
  }
}

export function createSavedBattleRecordFromReplay(
  replay: ReplayPayload,
  arenaName: string,
  customBattleName?: string
): SavedBattleRecord {
  const betrayals = replay.alliances.filter((a) => a.outcome === 'broken-by-betrayal').length;
  const topEliminator = [...replay.finalRankings].sort((a, b) => b.eliminations - a.eliminations)[0];

  const memorableHeadline =
    betrayals > 0
      ? `${replay.winnerName} triumphed amidst ${betrayals} dramatic alliance betrayal(s) in ${arenaName}!`
      : topEliminator && topEliminator.eliminations >= 3
      ? `${topEliminator.fighterName} went on a ${topEliminator.eliminations}-elimination rampage before ${replay.winnerName} claimed the crown!`
      : `${replay.winnerName} outlasted 7 rivals over ${replay.durationSec.toFixed(1)}s in ${arenaName}!`;

  return {
    battleId: replay.battleId,
    battleName: customBattleName?.trim() || replay.battleName,
    createdAtIso: replay.createdAtIso,
    arenaId: replay.arenaId,
    arenaName,
    seed: replay.seed,
    durationSec: replay.durationSec,
    winnerId: replay.winnerId,
    winnerName: replay.winnerName,
    mvpId: replay.mvpId,
    mvpName: replay.mvpName,
    participantIds: replay.finalRankings.map((r) => r.fighterId),
    participantNames: replay.finalRankings.map((r) => r.fighterName),
    totalEliminations: replay.eliminations.length,
    totalAlliances: replay.alliances.length,
    totalBetrayals: betrayals,
    memorableHeadline,
    replay: {
      ...replay,
      battleName: customBattleName?.trim() || replay.battleName,
    },
  };
}

export async function saveBattleToArchive(record: SavedBattleRecord): Promise<void> {
  try {
    const db = await openArchiveDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(record);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch {
    const existing = loadFallbackRecords().filter((r) => r.battleId !== record.battleId);
    existing.unshift(record);
    saveFallbackRecords(existing);
  }
}

export async function listArchivedBattles(): Promise<SavedBattleRecord[]> {
  try {
    const db = await openArchiveDB();
    return await new Promise<SavedBattleRecord[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        db.close();
        const items = (req.result as SavedBattleRecord[]) || [];
        items.sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso));
        resolve(items);
      };
      req.onerror = () => {
        db.close();
        reject(req.error);
      };
    });
  } catch {
    const items = loadFallbackRecords();
    items.sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso));
    return items;
  }
}

export async function renameArchivedBattle(battleId: string, newName: string): Promise<void> {
  const all = await listArchivedBattles();
  const target = all.find((b) => b.battleId === battleId);
  if (!target) return;
  target.battleName = newName.trim() || target.battleName;
  target.replay.battleName = target.battleName;
  await saveBattleToArchive(target);
}

export async function deleteArchivedBattle(battleId: string): Promise<void> {
  try {
    const db = await openArchiveDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(battleId);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch {
    const remaining = loadFallbackRecords().filter((r) => r.battleId !== battleId);
    saveFallbackRecords(remaining);
  }
}

export async function clearAllArchivedBattles(): Promise<void> {
  try {
    const db = await openArchiveDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.clear();
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch {
    saveFallbackRecords([]);
  }
}

export interface ArchiveExportBundle {
  schemaVersion: '1.0.0';
  exportedAtIso: string;
  application: 'ANIME ARENA: CATACLYSM';
  recordCount: number;
  records: SavedBattleRecord[];
}

export function exportArchiveToJson(records: SavedBattleRecord[]): string {
  const bundle: ArchiveExportBundle = {
    schemaVersion: '1.0.0',
    exportedAtIso: new Date().toISOString(),
    application: 'ANIME ARENA: CATACLYSM',
    recordCount: records.length,
    records,
  };
  return JSON.stringify(bundle, null, 2);
}

/**
 * Safely validates and migrates imported Battle Archive JSON bundles (Section 16).
 */
export async function importArchiveFromJson(rawJson: string): Promise<{
  importedCount: number;
  errors: string[];
}> {
  const errors: string[] = [];
  try {
    const parsed = JSON.parse(rawJson);
    const candidateRecords: unknown[] = Array.isArray(parsed?.records)
      ? parsed.records
      : parsed?.battleId && parsed?.replay
      ? [parsed]
      : [];

    if (candidateRecords.length === 0) {
      return {
        importedCount: 0,
        errors: ['No valid battle records found in imported JSON file.'],
      };
    }

    let importedCount = 0;
    for (const item of candidateRecords) {
      const rec = item as Partial<SavedBattleRecord>;
      if (
        !rec.battleId ||
        !rec.winnerId ||
        !rec.replay ||
        !Array.isArray(rec.replay.finalRankings) ||
        !Array.isArray(rec.replay.snapshots)
      ) {
        errors.push(`Skipped malformed battle record: ${rec.battleId ?? 'unknown'}`);
        continue;
      }

      // Safe schema migration if an older minor version was imported
      const migrated: SavedBattleRecord = {
        battleId: rec.battleId,
        battleName: rec.battleName || `Imported Battle ${rec.battleId}`,
        createdAtIso: rec.createdAtIso || new Date().toISOString(),
        arenaId: rec.arenaId || 'arena_sanctum',
        arenaName: rec.arenaName || 'Aetherium Sanctum',
        seed: rec.seed || rec.replay.seed || 'IMPORTED-SEED',
        durationSec: Number(rec.durationSec ?? rec.replay.durationSec ?? 0),
        winnerId: rec.winnerId,
        winnerName: rec.winnerName || rec.replay.winnerName || 'Unknown Champion',
        mvpId: rec.mvpId || rec.replay.mvpId || rec.winnerId,
        mvpName: rec.mvpName || rec.replay.mvpName || rec.winnerName || 'Unknown MVP',
        participantIds:
          rec.participantIds || rec.replay.finalRankings.map((r) => r.fighterId),
        participantNames:
          rec.participantNames || rec.replay.finalRankings.map((r) => r.fighterName),
        totalEliminations: rec.totalEliminations ?? rec.replay.eliminations?.length ?? 7,
        totalAlliances: rec.totalAlliances ?? rec.replay.alliances?.length ?? 0,
        totalBetrayals:
          rec.totalBetrayals ??
          (rec.replay.alliances?.filter((a) => a.outcome === 'broken-by-betrayal').length || 0),
        memorableHeadline:
          rec.memorableHeadline ||
          `${rec.winnerName || 'Champion'} victorious in ${rec.arenaName || 'the Arena'}!`,
        replay: {
          ...rec.replay,
          schemaVersion: '1.0.0',
        },
      };

      await saveBattleToArchive(migrated);
      importedCount++;
    }

    return { importedCount, errors };
  } catch (err) {
    return {
      importedCount: 0,
      errors: [`JSON parse error: ${(err as Error).message}`],
    };
  }
}
