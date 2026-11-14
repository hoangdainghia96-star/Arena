import React, { useEffect, useState } from 'react';
import {
  Archive,
  Award,
  CheckCircle2,
  Cpu,
  Layers,
  Play,
  Settings,
  ShieldCheck,
  Sparkles,
  Swords,
  Trophy,
  Zap,
} from 'lucide-react';
import {
  ArenaSettings,
  CharacterDefinition,
  ReplayPayload,
  SavedBattleRecord,
} from './types/game';
import { ARENA_DEFINITIONS } from './data/arenas';
import { loadSavedSettings, saveArenaSettings } from './data/settings';
import {
  getAllRegisteredCharacters,
  getEligibleCharacters,
  selectEightRandomFighters,
} from './pipeline/assetPipeline';
import {
  createSavedBattleRecordFromReplay,
  listArchivedBattles,
  saveBattleToArchive,
} from './persistence/battleArchive';
import { BattleSimulation } from './engine/combatEngine';
import { BattleSpectatorView } from './components/BattleSpectatorView';
import { CharacterStudioView } from './components/CharacterStudioView';
import { BattleArchiveView } from './components/BattleArchiveView';
import { ArenaChronicleView } from './components/ArenaChronicleView';
import { SettingsView } from './components/SettingsView';
import { audioEngine } from './audio/audioEngine';

type ActiveScreen =
  | 'main'
  | 'battle'
  | 'studio'
  | 'archive'
  | 'chronicle'
  | 'settings';

export const App: React.FC = () => {
  const [activeScreen, setActiveScreen] = useState<ActiveScreen>('main');
  const [roster, setRoster] = useState<CharacterDefinition[]>(() =>
    getAllRegisteredCharacters()
  );
  const [settings, setSettings] = useState<ArenaSettings>(() =>
    loadSavedSettings()
  );
  const [selectedArenaId, setSelectedArenaId] = useState<string | 'random'>(
    'random'
  );
  const [archivedBattles, setArchivedBattles] = useState<SavedBattleRecord[]>(
    []
  );
  const [activeReplayPayload, setActiveReplayPayload] =
    useState<ReplayPayload | null>(null);
  const [quickSimNotice, setQuickSimNotice] = useState<string | null>(null);

  const refreshArchive = async () => {
    const list = await listArchivedBattles();
    setArchivedBattles(list);
  };

  useEffect(() => {
    refreshArchive();
    audioEngine.updateSettings(settings.audio);
  }, []);

  const handleUpdateSettings = (next: ArenaSettings) => {
    setSettings(next);
    saveArenaSettings(next);
  };

  // Run an instant authoritative headless battle simulation and archive it (great for testing Replay & Chronicle immediately)
  const handleRunInstantSimulatedBattle = async () => {
    try {
      const chosenArena =
        selectedArenaId === 'random'
          ? ARENA_DEFINITIONS[
              Math.floor(Math.random() * ARENA_DEFINITIONS.length)
            ]
          : ARENA_DEFINITIONS.find((a) => a.id === selectedArenaId) ??
            ARENA_DEFINITIONS[0];

      const { selected, seed } = selectEightRandomFighters(undefined, roster);
      const sim = new BattleSimulation({
        fighters: selected,
        arena: chosenArena,
        settings,
        seed,
      });

      let safetySteps = 0;
      while (sim.state.status !== 'completed' && safetySteps < 20000) {
        sim.step();
        safetySteps++;
      }

      const payload = sim.exportReplayPayload();
      const record = createSavedBattleRecordFromReplay(payload, chosenArena.name);
      await saveBattleToArchive(record);
      await refreshArchive();
      setQuickSimNotice(
        `Simulated "${record.battleName}" in ${chosenArena.name}: Champion ${record.winnerName} (${record.durationSec.toFixed(1)}s, ${record.totalAlliances} alliances, ${record.totalBetrayals} betrayals) saved to Archive!`
      );
    } catch (err) {
      setQuickSimNotice(`Simulation blocked: ${(err as Error).message}`);
    }
  };

  const { eligible } = getEligibleCharacters(roster);

  if (activeScreen === 'battle') {
    return (
      <BattleSpectatorView
        roster={roster}
        arenas={ARENA_DEFINITIONS}
        selectedArenaId={selectedArenaId}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        activeReplayPayload={activeReplayPayload}
        onClearReplay={() => setActiveReplayPayload(null)}
        onBattleArchived={async () => {
          await refreshArchive();
        }}
        onNavigate={(tab) => setActiveScreen(tab)}
      />
    );
  }

  if (activeScreen === 'studio') {
    return (
      <CharacterStudioView
        roster={roster}
        onRosterUpdated={(next) => setRoster(next)}
        onBack={() => setActiveScreen('main')}
      />
    );
  }

  if (activeScreen === 'archive') {
    return (
      <BattleArchiveView
        records={archivedBattles}
        onRefreshRecords={refreshArchive}
        onLaunchReplay={(payload) => {
          setActiveReplayPayload(payload);
          setActiveScreen('battle');
        }}
        onBack={() => setActiveScreen('main')}
      />
    );
  }

  if (activeScreen === 'chronicle') {
    return (
      <ArenaChronicleView
        records={archivedBattles}
        roster={roster}
        onBack={() => setActiveScreen('main')}
      />
    );
  }

  if (activeScreen === 'settings') {
    return (
      <SettingsView
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        onBack={() => setActiveScreen('main')}
      />
    );
  }

  return (
    <div className="relative h-full w-full bg-[#05070f] text-slate-100 flex flex-col justify-between overflow-y-auto">
      {/* Subtle Ambient Background Gradient */}
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(124,58,237,0.22),_rgba(15,23,42,0.92)_65%,_#05070f_100%)]" />

      {/* Top System Status Bar */}
      <header className="relative z-10 flex flex-wrap items-center justify-between gap-4 px-8 py-4 border-b border-slate-800/80 bg-slate-950/70 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-rose-500 via-fuchsia-600 to-violet-600 flex items-center justify-center shadow-lg">
            <Swords className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="text-xs font-black uppercase tracking-widest text-rose-400">
              AAA-Inspired 3D Anime Spectator Simulation
            </span>
            <h1 className="text-lg font-black tracking-tight text-white">
              ANIME ARENA: CATACLYSM — <span className="text-amber-400">v1.0.0</span>
            </h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span className="text-slate-300">
              Eligible Roster:{' '}
              <strong className="text-white">
                {eligible.length}/{roster.length}
              </strong>{' '}
              (Min 8)
            </span>
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center gap-2">
            <Layers className="w-4 h-4 text-violet-400" />
            <span className="text-slate-300">
              3D Arenas: <strong className="text-white">{ARENA_DEFINITIONS.length}</strong>
            </span>
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center gap-2">
            <Cpu className="w-4 h-4 text-cyan-400" />
            <span className="text-slate-300">
              Graphics: <strong className="text-cyan-300">{settings.graphicsPreset}</strong>
            </span>
          </div>
        </div>
      </header>

      {/* Center Hero & Main Command Deck */}
      <main className="relative z-10 max-w-6xl w-full mx-auto px-8 py-8 my-auto space-y-8">
        {/* Hero Banner */}
        <div className="bg-slate-900/75 border border-violet-500/30 rounded-3xl p-8 shadow-2xl backdrop-blur-md">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-7 space-y-4">
              <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs font-extrabold uppercase tracking-widest">
                <Sparkles className="w-3.5 h-3.5" />
                8-Character Pure Random 3D Battle Royale
              </div>
              <h2 className="text-4xl sm:text-5xl font-black tracking-tight text-white leading-tight">
                WITNESS THE{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-400 via-amber-300 to-violet-400">
                  CATACLYSM
                </span>
              </h2>
              <p className="text-sm text-slate-300 leading-relaxed max-w-2xl">
                Eight validated anime warriors enter a living 3D colosseum. Driven by local Hybrid Utility AI, Behavior Trees, dynamic cross-universe alliances, ruthless betrayals, Awakenings, and Signature Ultimates — no scripts, no predetermined winners, 100% authoritative simulation.
              </p>

              {/* Primary Launch Buttons */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  onClick={() => {
                    setActiveReplayPayload(null);
                    setActiveScreen('battle');
                  }}
                  className="px-7 py-4 rounded-2xl bg-gradient-to-r from-rose-600 via-pink-600 to-violet-600 hover:from-rose-500 hover:to-violet-500 text-white font-black text-base flex items-center gap-3 shadow-xl shadow-rose-600/25 transition transform hover:-translate-y-0.5 cursor-pointer"
                >
                  <Play className="w-5 h-5 fill-white" />
                  START 3D RANDOM BATTLE
                </button>

                <button
                  onClick={handleRunInstantSimulatedBattle}
                  className="px-4 py-4 rounded-2xl bg-slate-800/90 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-xs flex items-center gap-2 transition cursor-pointer"
                  title="Run a complete 8-fighter battle simulation instantaneously and save to the Battle Archive"
                >
                  <Zap className="w-4 h-4 text-amber-400" />
                  Instant Sim & Archive Match
                </button>
              </div>

              {quickSimNotice && (
                <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-xs text-emerald-200 flex items-center justify-between">
                  <span>{quickSimNotice}</span>
                  <button
                    onClick={() => setQuickSimNotice(null)}
                    className="text-emerald-300 font-bold ml-3"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>

            {/* Right: 3 Polished Dynamic Living Arenas Selector */}
            <div className="lg:col-span-5 bg-slate-950/85 border border-slate-800 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase tracking-wider text-amber-400">
                  Select Living 3D Arena
                </span>
                <span className="text-[11px] text-slate-400">
                  Full Arena Playable • No Shrinking Zone
                </span>
              </div>

              <div className="space-y-2">
                <button
                  onClick={() => setSelectedArenaId('random')}
                  className={`w-full text-left p-3 rounded-xl border transition cursor-pointer ${
                    selectedArenaId === 'random'
                      ? 'bg-violet-600/25 border-violet-500 text-white'
                      : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold">
                      🎲 Pure Random Arena Selection (Default)
                    </span>
                    <span className="text-[10px] font-bold text-violet-300">
                      ALL 3 REALMS
                    </span>
                  </div>
                </button>

                {ARENA_DEFINITIONS.map((arena) => (
                  <button
                    key={arena.id}
                    onClick={() => setSelectedArenaId(arena.id)}
                    className={`w-full text-left p-3 rounded-xl border transition cursor-pointer ${
                      selectedArenaId === arena.id
                        ? 'bg-violet-600/25 border-violet-500 text-white'
                        : 'bg-slate-900/80 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs font-bold text-white">
                        {arena.name}:{' '}
                        <span className="text-amber-300">{arena.subtitle}</span>
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">
                        10 Destructibles
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 line-clamp-1">
                      {arena.description}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 4 Secondary Feature Modules Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <button
            onClick={() => setActiveScreen('studio')}
            className="text-left p-5 rounded-2xl bg-slate-900/80 hover:bg-slate-900 border border-slate-800 hover:border-violet-500/50 transition group cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-violet-500/20 border border-violet-500/40 flex items-center justify-center mb-3 group-hover:scale-105 transition">
              <Sparkles className="w-5 h-5 text-violet-400" />
            </div>
            <h3 className="text-sm font-black text-white mb-1">
              Original Character Studio
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Customize 3D rigs, weapons, abilities, AI personalities, glTF 2.0 import/export, and 9-point eligibility validation.
            </p>
          </button>

          <button
            onClick={() => setActiveScreen('archive')}
            className="text-left p-5 rounded-2xl bg-slate-900/80 hover:bg-slate-900 border border-slate-800 hover:border-amber-500/50 transition group cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center mb-3 group-hover:scale-105 transition">
              <Archive className="w-5 h-5 text-amber-400" />
            </div>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-black text-white">Battle Archive & Replays</h3>
              <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold">
                {archivedBattles.length} Saved
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Persistent IndexedDB battle vault with search, JSON import/export, and deterministic 3D replay scrubbing.
            </p>
          </button>

          <button
            onClick={() => setActiveScreen('chronicle')}
            className="text-left p-5 rounded-2xl bg-slate-900/80 hover:bg-slate-900 border border-slate-800 hover:border-emerald-500/50 transition group cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center mb-3 group-hover:scale-105 transition">
              <Trophy className="w-5 h-5 text-emerald-400" />
            </div>
            <h3 className="text-sm font-black text-white mb-1">
              Arena Chronicle & Hall of Fame
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Long-term character win rates, MVP leaderboards, rivalry & betrayal matrices, and 12 unlockable achievements.
            </p>
          </button>

          <button
            onClick={() => setActiveScreen('settings')}
            className="text-left p-5 rounded-2xl bg-slate-900/80 hover:bg-slate-900 border border-slate-800 hover:border-cyan-500/50 transition group cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center mb-3 group-hover:scale-105 transition">
              <Settings className="w-5 h-5 text-cyan-400" />
            </div>
            <h3 className="text-sm font-black text-white mb-1">
              Advanced Arena Settings
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Configure battle duration targets, AI alliance/betrayal multipliers, Ultra/High/Medium/Low graphics, and 4-bus audio.
            </p>
          </button>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 px-8 py-3 border-t border-slate-800/80 bg-slate-950/80 text-[11px] text-slate-400 flex flex-wrap items-center justify-between gap-2">
        <span>
          ANIME ARENA: CATACLYSM • 100% Local Authoritative Simulation, Hybrid AI & WebGL Cel-Shader Pipeline
        </span>
        <span className="font-mono text-slate-500">
          10 Eligible Characters • 3 Living Arenas • Deterministic Seed Replay Engine
        </span>
      </footer>
    </div>
  );
};
