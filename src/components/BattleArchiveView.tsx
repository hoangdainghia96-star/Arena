import React, { useState } from 'react';
import {
  Archive,
  Download,
  Edit3,
  Play,
  Search,
  Trash2,
  Trophy,
  Upload,
} from 'lucide-react';
import { ReplayPayload, SavedBattleRecord } from '../types/game';
import {
  clearAllArchivedBattles,
  deleteArchivedBattle,
  exportArchiveToJson,
  importArchiveFromJson,
  renameArchivedBattle,
} from '../persistence/battleArchive';

interface BattleArchiveViewProps {
  records: SavedBattleRecord[];
  onRefreshRecords: () => Promise<void>;
  onLaunchReplay: (payload: ReplayPayload) => void;
  onBack: () => void;
}

export const BattleArchiveView: React.FC<BattleArchiveViewProps> = ({
  records,
  onRefreshRecords,
  onLaunchReplay,
  onBack,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'duration' | 'betrayals'>(
    'newest'
  );
  const [selectedBattle, setSelectedBattle] = useState<SavedBattleRecord | null>(
    records[0] ?? null
  );
  const [editingName, setEditingName] = useState<string>('');
  const [statusNote, setStatusNote] = useState<string | null>(null);

  const filtered = records
    .filter((r) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        r.battleName.toLowerCase().includes(q) ||
        r.winnerName.toLowerCase().includes(q) ||
        r.arenaName.toLowerCase().includes(q) ||
        r.seed.toLowerCase().includes(q) ||
        r.participantNames.some((p) => p.toLowerCase().includes(q))
      );
    })
    .sort((a, b) => {
      if (sortBy === 'oldest') return a.createdAtIso.localeCompare(b.createdAtIso);
      if (sortBy === 'duration') return b.durationSec - a.durationSec;
      if (sortBy === 'betrayals') return b.totalBetrayals - a.totalBetrayals;
      return b.createdAtIso.localeCompare(a.createdAtIso);
    });

  const handleExportAll = () => {
    const json = exportArchiveToJson(records);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `anime-arena-cataclysm-archive-${records.length}-battles.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatusNote(`Exported ${records.length} battle records to JSON.`);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const content = String(reader.result || '');
      const res = await importArchiveFromJson(content);
      await onRefreshRecords();
      setStatusNote(
        `Imported ${res.importedCount} battle record(s). ${
          res.errors.length > 0 ? `Warnings: ${res.errors.join('; ')}` : ''
        }`
      );
    };
    reader.readAsText(file);
  };

  const handleRename = async (battleId: string) => {
    if (!editingName.trim()) return;
    await renameArchivedBattle(battleId, editingName.trim());
    await onRefreshRecords();
    setEditingName('');
    setStatusNote('Updated battle archive name.');
  };

  const handleDelete = async (battleId: string) => {
    await deleteArchivedBattle(battleId);
    await onRefreshRecords();
    if (selectedBattle?.battleId === battleId) {
      setSelectedBattle(null);
    }
    setStatusNote('Deleted battle record from IndexedDB archive.');
  };

  return (
    <div className="h-full w-full bg-slate-950 text-slate-100 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3.5 bg-slate-900/90 border-b border-slate-800">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 cursor-pointer"
          >
            ← Back to Menu
          </button>
          <div>
            <h1 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
              <Archive className="w-4 h-4 text-amber-400" />
              Persistent Battle Archive & Hybrid Replay Vault
            </h1>
            <p className="text-xs text-slate-400">
              IndexedDB Local Storage • {records.length} Completed Battle(s) Archived
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <label className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer">
            <Upload className="w-3.5 h-3.5" />
            Import Archive JSON
            <input
              type="file"
              accept=".json"
              onChange={handleImportFile}
              className="hidden"
            />
          </label>
          <button
            onClick={handleExportAll}
            disabled={records.length === 0}
            className="px-3.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Export All JSON
          </button>
          {records.length > 0 && (
            <button
              onClick={async () => {
                await clearAllArchivedBattles();
                await onRefreshRecords();
                setSelectedBattle(null);
                setStatusNote('Cleared all archived battles.');
              }}
              className="px-3 py-2 rounded-xl bg-rose-600/20 hover:bg-rose-600/35 border border-rose-500/40 text-rose-300 text-xs font-bold cursor-pointer"
            >
              Clear Vault
            </button>
          )}
        </div>
      </div>

      {statusNote && (
        <div className="bg-violet-500/15 border-b border-violet-500/30 px-6 py-2 text-xs text-violet-200 flex items-center justify-between">
          <span>{statusNote}</span>
          <button onClick={() => setStatusNote(null)}>✕</button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 grid grid-cols-12 min-h-0 overflow-hidden">
        {/* Left: Search, Sort & Battle List */}
        <div className="col-span-5 border-r border-slate-800 bg-slate-900/40 p-4 flex flex-col gap-3 min-h-0">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by battle name, champion, arena, seed..."
                className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white"
              />
            </div>
            <select
              value={sortBy}
              onChange={(e) =>
                setSortBy(
                  e.target.value as 'newest' | 'oldest' | 'duration' | 'betrayals'
                )
              }
              className="bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-xs text-slate-200"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="duration">Longest Duration</option>
              <option value="betrayals">Most Betrayals</option>
            </select>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {filtered.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-xs">
                No archived battles match your filter. Complete a Random Battle or import an archive JSON file!
              </div>
            ) : (
              filtered.map((rec) => {
                const isSelected = selectedBattle?.battleId === rec.battleId;
                return (
                  <div
                    key={rec.battleId}
                    onClick={() => {
                      setSelectedBattle(rec);
                      setEditingName(rec.battleName);
                    }}
                    className={`p-3.5 rounded-2xl border transition cursor-pointer ${
                      isSelected
                        ? 'bg-violet-600/20 border-violet-500 text-white'
                        : 'bg-slate-900/80 border-slate-800 hover:border-slate-700 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-extrabold text-white truncate">
                        {rec.battleName}
                      </span>
                      <span className="text-[10px] font-mono text-amber-400">
                        {rec.durationSec.toFixed(1)}s
                      </span>
                    </div>
                    <div className="text-[11px] text-emerald-400 font-bold mb-1">
                      🏆 Champion: {rec.winnerName} • MVP: {rec.mvpName}
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span>{rec.arenaName}</span>
                      <span>
                        Alliances: {rec.totalAlliances} • Betrayals: {rec.totalBetrayals}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Detailed Battle Inspector & 3D Replay Launcher */}
        <div className="col-span-7 p-6 overflow-y-auto">
          {!selectedBattle ? (
            <div className="h-full flex items-center justify-center text-slate-500 text-sm">
              Select an archived battle on the left to inspect full rankings and launch its 3D Replay.
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-4 bg-slate-900/80 border border-slate-800 rounded-2xl p-5">
                <div className="space-y-1">
                  <div className="text-xs font-bold uppercase tracking-wider text-amber-400">
                    {selectedBattle.arenaName} • Seed: {selectedBattle.seed}
                  </div>
                  <h2 className="text-2xl font-black text-white">
                    {selectedBattle.battleName}
                  </h2>
                  <p className="text-xs text-slate-300">
                    {selectedBattle.memorableHeadline}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onLaunchReplay(selectedBattle.replay)}
                    className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black flex items-center gap-2 shadow-lg cursor-pointer"
                  >
                    <Play className="w-4 h-4" />
                    Launch 3D Replay
                  </button>
                  <button
                    onClick={() => handleDelete(selectedBattle.battleId)}
                    className="p-2.5 rounded-xl bg-slate-800 hover:bg-rose-600/30 text-slate-300 hover:text-rose-300 cursor-pointer"
                    title="Delete Battle Record"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Rename Battle Row */}
              <div className="flex items-center gap-2 bg-slate-900/60 border border-slate-800 rounded-xl p-3">
                <Edit3 className="w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  placeholder="Rename this archived battle..."
                  className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
                />
                <button
                  onClick={() => handleRename(selectedBattle.battleId)}
                  className="px-3.5 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold cursor-pointer"
                >
                  Save Name
                </button>
              </div>

              {/* Standings Table */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Recorded 8-Fighter Final Standings
                </h3>
                <div className="overflow-x-auto rounded-2xl border border-slate-800">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-900 text-slate-400 text-[10px] uppercase">
                      <tr>
                        <th className="py-2 px-3">Place</th>
                        <th className="py-2 px-3">Fighter</th>
                        <th className="py-2 px-3">Elims</th>
                        <th className="py-2 px-3">Damage</th>
                        <th className="py-2 px-3">Ultimates</th>
                        <th className="py-2 px-3">Alliances / Betrayals</th>
                        <th className="py-2 px-3">Eliminated By</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 bg-slate-900/40">
                      {selectedBattle.replay.finalRankings.map((r) => (
                        <tr key={r.fighterId} className="text-slate-200">
                          <td className="py-2 px-3 font-black">
                            {r.placement === 1 ? '🏆 #1' : `#${r.placement}`}
                          </td>
                          <td className="py-2 px-3 font-semibold">{r.fighterName}</td>
                          <td className="py-2 px-3 font-mono text-rose-400">
                            {r.eliminations}
                          </td>
                          <td className="py-2 px-3 font-mono">
                            {r.damageDealt.toLocaleString()}
                          </td>
                          <td className="py-2 px-3 font-mono text-violet-300">
                            {r.ultimatesUsed}
                          </td>
                          <td className="py-2 px-3 font-mono">
                            {r.alliancesFormed} / {r.betrayalsCommitted}
                          </td>
                          <td className="py-2 px-3 text-slate-400">
                            {r.eliminatedByName ?? 'Survived'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
