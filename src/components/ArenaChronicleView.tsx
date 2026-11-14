import React from 'react';
import { Award, CheckCircle2, Flame, Shield, Swords, Trophy, Users } from 'lucide-react';
import { CharacterDefinition, SavedBattleRecord } from '../types/game';
import { computeArenaChronicle } from '../persistence/arenaChronicle';

interface ArenaChronicleViewProps {
  records: SavedBattleRecord[];
  roster: CharacterDefinition[];
  onBack: () => void;
}

export const ArenaChronicleView: React.FC<ArenaChronicleViewProps> = ({
  records,
  roster,
  onBack,
}) => {
  const chronicle = computeArenaChronicle(records, roster);

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
              <Trophy className="w-4 h-4 text-amber-400" />
              Advanced Arena Chronicle — Hall of Fame & Historical Ledger
            </h1>
            <p className="text-xs text-slate-400">
              100% Authentic Statistics Computed from {chronicle.totalBattles} Stored Battle Record(s)
            </p>
          </div>
        </div>
      </div>

      {/* Main Scrollable Body */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Top KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
            <div className="text-[11px] font-bold uppercase text-slate-400">
              Total Battles Archived
            </div>
            <div className="text-2xl font-black text-white mt-1">
              {chronicle.totalBattles}
            </div>
          </div>
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
            <div className="text-[11px] font-bold uppercase text-slate-400">
              Total Eliminations
            </div>
            <div className="text-2xl font-black text-rose-400 mt-1">
              {chronicle.totalEliminations}
            </div>
          </div>
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
            <div className="text-[11px] font-bold uppercase text-slate-400">
              Tactical Alliances
            </div>
            <div className="text-2xl font-black text-amber-400 mt-1">
              {chronicle.totalAlliancesFormed}
            </div>
          </div>
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
            <div className="text-[11px] font-bold uppercase text-slate-400">
              Betrayals Recorded
            </div>
            <div className="text-2xl font-black text-fuchsia-400 mt-1">
              {chronicle.totalBetrayals}
            </div>
          </div>
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
            <div className="text-[11px] font-bold uppercase text-slate-400">
              Ultimates Unleashed
            </div>
            <div className="text-2xl font-black text-violet-400 mt-1">
              {chronicle.totalUltimatesUsed}
            </div>
          </div>
        </div>

        {/* Character Performance & Win-Rate Table */}
        <div>
          <h2 className="text-sm font-black uppercase tracking-wider text-slate-200 mb-3 flex items-center gap-2">
            <Swords className="w-4 h-4 text-rose-400" />
            Character Performance Rankings & Hall of Fame
          </h2>
          <div className="overflow-x-auto rounded-2xl border border-slate-800">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900 text-slate-400 text-[10px] uppercase">
                <tr>
                  <th className="py-2.5 px-3">Fighter</th>
                  <th className="py-2.5 px-3">Universe</th>
                  <th className="py-2.5 px-3">Battles</th>
                  <th className="py-2.5 px-3">Victories</th>
                  <th className="py-2.5 px-3">Win Rate</th>
                  <th className="py-2.5 px-3">MVPs</th>
                  <th className="py-2.5 px-3">Elims / Deaths</th>
                  <th className="py-2.5 px-3">K/D Ratio</th>
                  <th className="py-2.5 px-3">Avg Rank</th>
                  <th className="py-2.5 px-3">Alliances / Betrayals</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 bg-slate-900/40">
                {chronicle.characterStats.map((st) => (
                  <tr key={st.characterId} className="text-slate-200">
                    <td className="py-2.5 px-3 font-bold text-white">
                      {st.characterName}
                    </td>
                    <td className="py-2.5 px-3 text-slate-400">{st.universe}</td>
                    <td className="py-2.5 px-3 font-mono">{st.battlesEntered}</td>
                    <td className="py-2.5 px-3 font-mono font-bold text-amber-400">
                      {st.victories}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-emerald-400">
                      {st.winRatePercent}%
                    </td>
                    <td className="py-2.5 px-3 font-mono text-violet-300">
                      {st.mvpCount}
                    </td>
                    <td className="py-2.5 px-3 font-mono">
                      {st.totalEliminations} / {st.totalDeaths}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold">
                      {st.kdRatio}
                    </td>
                    <td className="py-2.5 px-3 font-mono">
                      {st.battlesEntered > 0 ? `#${st.avgPlacement}` : '—'}
                    </td>
                    <td className="py-2.5 px-3 font-mono">
                      {st.alliancesFormed} /{' '}
                      <span className="text-fuchsia-400">
                        {st.betrayalsCommitted}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Rivalry & Alliance Matrix + Achievements */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Rivalry & Alliance Ledger */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-3 flex items-center gap-1.5">
              <Users className="w-4 h-4 text-amber-400" />
              Notable Rivalries, Alliances & Betrayal Pairings
            </h3>
            {chronicle.rivalries.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">
                No historical rivalry or alliance records yet. Complete a battle to populate the chronicle!
              </p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {chronicle.rivalries.slice(0, 10).map((riv) => (
                  <div
                    key={riv.pairKey}
                    className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-bold text-white">
                        {riv.fighterAName} vs. {riv.fighterBName}
                      </span>
                      <div className="text-[10px] text-slate-400">
                        Kill Score: {riv.aEliminatedB} – {riv.bEliminatedA}
                      </div>
                    </div>
                    <div className="text-right text-[10px] font-mono">
                      <span className="text-amber-300">
                        Alliances: {riv.alliancesTogether}
                      </span>
                      {' • '}
                      <span className="text-fuchsia-400">
                        Betrayals: {riv.betrayalsBetween}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Unlockable Arena Achievements */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-3 flex items-center gap-1.5">
              <Award className="w-4 h-4 text-emerald-400" />
              Cataclysm Chronicle Achievements (
              {chronicle.achievements.filter((a) => a.unlocked).length}/
              {chronicle.achievements.length})
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
              {chronicle.achievements.map((ach) => (
                <div
                  key={ach.id}
                  className={`p-2.5 rounded-xl border text-xs ${
                    ach.unlocked
                      ? 'bg-emerald-500/10 border-emerald-500/40 text-white'
                      : 'bg-slate-950/50 border-slate-800/80 text-slate-400'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold truncate">{ach.title}</span>
                    <span className="text-[10px] font-mono">
                      {ach.progress}/{ach.target}
                    </span>
                  </div>
                  <p className="text-[10px] opacity-80 leading-snug">
                    {ach.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
