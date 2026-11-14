import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  Award,
  Camera,
  CheckCircle2,
  ChevronRight,
  Eye,
  EyeOff,
  FastForward,
  Flame,
  Layers,
  Pause,
  Play,
  RotateCcw,
  Save,
  Shield,
  Sparkles,
  Swords,
  Target,
  Trophy,
  Users,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import {
  ArenaDefinition,
  ArenaSettings,
  BattleEvent,
  BattleSimulationState,
  CameraMode,
  CharacterDefinition,
  PerformanceTelemetry,
  ReplayPayload,
  SavedBattleRecord,
} from '../types/game';
import { BattleSimulation, SIMULATION_DT } from '../engine/combatEngine';
import { HybridReplayController, ReplayVerificationReport } from '../engine/replayEngine';
import { ArenaSceneRenderer } from '../rendering/arenaSceneRenderer';
import {
  loadBattleAssetsStaged,
  selectEightRandomFighters,
  StagedLoadProgress,
} from '../pipeline/assetPipeline';
import {
  createSavedBattleRecordFromReplay,
  saveBattleToArchive,
} from '../persistence/battleArchive';
import { audioEngine } from '../audio/audioEngine';

interface BattleSpectatorViewProps {
  roster: CharacterDefinition[];
  arenas: ArenaDefinition[];
  selectedArenaId: string | 'random';
  settings: ArenaSettings;
  onUpdateSettings: (next: ArenaSettings) => void;
  activeReplayPayload: ReplayPayload | null;
  onClearReplay: () => void;
  onBattleArchived: (record: SavedBattleRecord) => void;
  onNavigate: (tab: 'main' | 'battle' | 'studio' | 'archive' | 'chronicle' | 'settings') => void;
}

export const BattleSpectatorView: React.FC<BattleSpectatorViewProps> = ({
  roster,
  arenas,
  selectedArenaId,
  settings,
  onUpdateSettings,
  activeReplayPayload,
  onClearReplay,
  onBattleArchived,
  onNavigate,
}) => {
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<ArenaSceneRenderer | null>(null);
  const simRef = useRef<BattleSimulation | null>(null);
  const replayCtrlRef = useRef<HybridReplayController | null>(null);
  const lastProcessedEventCountRef = useRef<number>(0);

  const [loadProgress, setLoadProgress] = useState<StagedLoadProgress | null>(null);
  const [eligibilityError, setEligibilityError] = useState<string | null>(null);
  const [showIntroCinematic, setShowIntroCinematic] = useState<boolean>(false);
  const [introStep, setIntroStep] = useState<number>(0);

  const [simState, setSimState] = useState<BattleSimulationState | null>(null);
  const [currentArena, setCurrentArena] = useState<ArenaDefinition>(arenas[0]);
  const [selectedFighters, setSelectedFighters] = useState<CharacterDefinition[]>([]);

  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<0.5 | 1 | 2 | 4>(1);
  const [hudMode, setHudMode] = useState<'cinematic' | 'tactical'>(settings.defaultHudMode);
  const [cameraMode, setCameraMode] = useState<CameraMode>('director');
  const [followFighterId, setFollowFighterId] = useState<string | null>(null);
  const [telemetry, setTelemetry] = useState<PerformanceTelemetry>({
    fps: 60,
    frameTimeMs: 16.6,
    drawCalls: 0,
    triangles: 0,
    geometriesInMemory: 0,
    texturesInMemory: 0,
    jsHeapMb: null,
  });

  const [activeVoiceBanner, setActiveVoiceBanner] = useState<{
    speaker: string;
    line: string;
    type: BattleEvent['type'];
  } | null>(null);

  const [showVictoryModal, setShowVictoryModal] = useState<boolean>(false);
  const [customArchiveName, setCustomArchiveName] = useState<string>('');
  const [archiveSavedBanner, setArchiveSavedBanner] = useState<boolean>(false);
  const [determinismReport, setDeterminismReport] = useState<ReplayVerificationReport | null>(
    null
  );
  const [isReplayMode, setIsReplayMode] = useState<boolean>(Boolean(activeReplayPayload));

  // Initialize a brand-new Random Battle or load a Replay
  const initializeMatch = async (replayToLoad: ReplayPayload | null = activeReplayPayload) => {
    setEligibilityError(null);
    setShowVictoryModal(false);
    setArchiveSavedBanner(false);
    setDeterminismReport(null);
    lastProcessedEventCountRef.current = 0;

    try {
      let chosenArena: ArenaDefinition;
      let chosenFighters: CharacterDefinition[];
      let seedToUse: string | undefined;

      if (replayToLoad) {
        setIsReplayMode(true);
        chosenArena =
          arenas.find((a) => a.id === replayToLoad.arenaId) ?? arenas[0];
        const charMap = new Map(roster.map((c) => [c.id, c]));
        chosenFighters = replayToLoad.characterIds
          .map((id) => charMap.get(id))
          .filter((c): c is CharacterDefinition => Boolean(c));
        if (chosenFighters.length < 8) {
          chosenFighters = selectEightRandomFighters(replayToLoad.seed, roster).selected;
        }
        seedToUse = replayToLoad.seed;
      } else {
        setIsReplayMode(false);
        chosenArena =
          selectedArenaId === 'random'
            ? arenas[Math.floor(Math.random() * arenas.length)]
            : arenas.find((a) => a.id === selectedArenaId) ?? arenas[0];

        const randomSelection = selectEightRandomFighters(undefined, roster);
        chosenFighters = randomSelection.selected;
        seedToUse = randomSelection.seed;
      }

      setCurrentArena(chosenArena);
      setSelectedFighters(chosenFighters);

      // Staged Hybrid Asset Loading (Section 21)
      await loadBattleAssetsStaged(chosenFighters, chosenArena, (prog) => {
        setLoadProgress(prog);
      });

      if (rendererRef.current) {
        rendererRef.current.applyQualityPreset(settings.graphicsPreset);
        rendererRef.current.loadBattleScene(chosenArena, chosenFighters);
      }

      if (replayToLoad) {
        const ctrl = new HybridReplayController(replayToLoad, chosenArena, chosenFighters);
        replayCtrlRef.current = ctrl;
        simRef.current = null;
        const initialReplayState = ctrl.getStateAtTime(0);
        setSimState(initialReplayState);
        setShowIntroCinematic(false);
        setIsPaused(false);
        audioEngine.startBattleMusic(1);
      } else {
        replayCtrlRef.current = null;
        const sim = new BattleSimulation({
          fighters: chosenFighters,
          arena: chosenArena,
          settings,
          seed: seedToUse,
        });
        simRef.current = sim;
        setSimState({ ...sim.state });
        setCustomArchiveName(sim.state.battleName);

        if (!settings.autoSkipIntroCinematic) {
          setShowIntroCinematic(true);
          setIntroStep(0);
        } else {
          setShowIntroCinematic(false);
          audioEngine.startBattleMusic(1);
        }
      }
      setLoadProgress(null);
    } catch (err) {
      setLoadProgress(null);
      setEligibilityError((err as Error).message);
    }
  };

  // Mount Three.js Renderer and start animation loop
  useEffect(() => {
    if (!canvasContainerRef.current) return;
    const renderer = new ArenaSceneRenderer(
      canvasContainerRef.current,
      settings.graphicsPreset
    );
    rendererRef.current = renderer;

    const onResize = () => renderer.handleResize();
    window.addEventListener('resize', onResize);

    initializeMatch(activeReplayPayload);

    return () => {
      window.removeEventListener('resize', onResize);
      audioEngine.stopMusicLoop();
      renderer.dispose();
      rendererRef.current = null;
    };
  }, []);

  // Re-initialize when activeReplayPayload changes
  useEffect(() => {
    if (rendererRef.current) {
      initializeMatch(activeReplayPayload);
    }
  }, [activeReplayPayload]);

  // Sync camera mode to 3D renderer
  useEffect(() => {
    rendererRef.current?.setCameraMode(cameraMode, followFighterId);
  }, [cameraMode, followFighterId]);

  // Sync graphics quality preset live
  useEffect(() => {
    rendererRef.current?.applyQualityPreset(settings.graphicsPreset);
  }, [settings.graphicsPreset]);

  // Intro showcase sequence timer
  useEffect(() => {
    if (!showIntroCinematic) return;
    const timer = window.setInterval(() => {
      setIntroStep((prev) => {
        if (prev >= 8) {
          setShowIntroCinematic(false);
          audioEngine.startBattleMusic(1);
          return prev;
        }
        return prev + 1;
      });
    }, 950);
    return () => window.clearInterval(timer);
  }, [showIntroCinematic]);

  // Main Authoritative Fixed-Timestep Simulation & 3D Render Loop
  useEffect(() => {
    let animFrameId = 0;
    let accumulator = 0;
    let lastTime = performance.now();

    const loop = (now: number) => {
      const dtSec = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;

      const renderer = rendererRef.current;
      const sim = simRef.current;
      const replayCtrl = replayCtrlRef.current;

      if (!showIntroCinematic && !isPaused) {
        if (replayCtrl) {
          const nextTime = replayCtrl.currentSec + dtSec * playbackSpeed;
          const nextState = replayCtrl.getStateAtTime(nextTime);
          setSimState(nextState);
          renderer?.renderSimulationState(nextState, currentArena);
          if (nextTime >= replayCtrl.payload.durationSec) {
            setIsPaused(true);
            setShowVictoryModal(true);
          }
        } else if (sim && sim.state.status === 'running') {
          accumulator += dtSec * playbackSpeed;
          let stepsThisFrame = 0;
          while (accumulator >= SIMULATION_DT && stepsThisFrame < 10) {
            const prevStage = sim.state.stageNumber;
            sim.step();
            accumulator -= SIMULATION_DT;
            stepsThisFrame++;

            if (sim.state.stageNumber !== prevStage) {
              audioEngine.startBattleMusic(sim.state.stageNumber);
            }
            if ((sim.state.status as string) === 'completed') {
              break;
            }
          }

          // Process new audio cues & voice banners
          if (sim.state.events.length > lastProcessedEventCountRef.current) {
            const newEvents = sim.state.events.slice(lastProcessedEventCountRef.current);
            lastProcessedEventCountRef.current = sim.state.events.length;

            for (const ev of newEvents) {
              if (
                ev.type === 'ELIMINATION' ||
                ev.type === 'ULTIMATE_UNLEASHED' ||
                ev.type === 'ALLIANCE_FORMED' ||
                ev.type === 'ALLIANCE_BETRAYED' ||
                ev.type === 'AWAKENING_TRIGGERED' ||
                ev.type === 'VICTORY'
              ) {
                audioEngine.playEventCue(ev);
              }
              if (ev.voiceLine && ev.actorName) {
                setActiveVoiceBanner({
                  speaker: ev.actorName,
                  line: ev.voiceLine,
                  type: ev.type,
                });
              }
            }
          }

          setSimState({ ...sim.state });
          renderer?.renderSimulationState(sim.state, currentArena);

          if ((sim.state.status as string) === 'completed' && !showVictoryModal) {
            const replayPayload = sim.exportReplayPayload();
            const record = createSavedBattleRecordFromReplay(
              replayPayload,
              currentArena.name,
              sim.state.battleName
            );
            saveBattleToArchive(record).then(() => {
              onBattleArchived(record);
              setArchiveSavedBanner(true);
            });
            setShowVictoryModal(true);
          }
        }
      } else if (renderer && simState) {
        renderer.renderSimulationState(simState, currentArena);
      }

      if (renderer) {
        setTelemetry({ ...renderer.telemetry });
      }

      animFrameId = requestAnimationFrame(loop);
    };

    animFrameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animFrameId);
  }, [
    showIntroCinematic,
    isPaused,
    playbackSpeed,
    currentArena,
    showVictoryModal,
    simState?.status,
  ]);

  const handleScrubTimeline = (targetSec: number) => {
    if (replayCtrlRef.current) {
      const next = replayCtrlRef.current.getStateAtTime(targetSec);
      setSimState(next);
      rendererRef.current?.renderSimulationState(next, currentArena);
    } else if (simRef.current) {
      // Allow live timeline inspection by creating a temporary HybridReplayController from current snapshots
      const payload = simRef.current.exportReplayPayload();
      const ctrl = new HybridReplayController(payload, currentArena, selectedFighters);
      setIsPaused(true);
      const next = ctrl.getStateAtTime(targetSec);
      setSimState(next);
      rendererRef.current?.renderSimulationState(next, currentArena);
    }
  };

  const handleSaveArchiveName = async () => {
    if (!simRef.current) return;
    const payload = simRef.current.exportReplayPayload();
    const record = createSavedBattleRecordFromReplay(
      payload,
      currentArena.name,
      customArchiveName
    );
    await saveBattleToArchive(record);
    onBattleArchived(record);
    setArchiveSavedBanner(true);
  };

  const handleVerifyDeterminism = () => {
    const payload =
      replayCtrlRef.current?.payload ?? simRef.current?.exportReplayPayload();
    if (!payload) return;
    const report = HybridReplayController.verifyDeterminism(
      payload,
      roster,
      currentArena
    );
    setDeterminismReport(report);
  };

  const handleWatchCurrentReplay = () => {
    const payload =
      replayCtrlRef.current?.payload ?? simRef.current?.exportReplayPayload();
    if (!payload) return;
    setShowVictoryModal(false);
    initializeMatch(payload);
  };

  if (eligibilityError) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-slate-950/95 p-8 text-center">
        <div className="max-w-xl bg-slate-900 border border-rose-500/40 rounded-2xl p-8 shadow-2xl">
          <div className="w-16 h-16 rounded-full bg-rose-500/20 border border-rose-500/40 flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-rose-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">
            Battle Start Blocked — Eligibility Validation Gate
          </h2>
          <p className="text-slate-300 text-sm mb-6 leading-relaxed">
            {eligibilityError}
          </p>
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 text-left text-xs text-slate-400 mb-6 space-y-1">
            <p className="text-slate-200 font-semibold mb-1">
              Strict Eligibility Policy (Section 6):
            </p>
            <p>• Minimum 8 validated, unique characters required per Random Battle.</p>
            <p>• Characters will never be substituted with unverified placeholders.</p>
            <p>• Enable at least 8 validated characters in the Original Character Studio.</p>
          </div>
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => onNavigate('studio')}
              className="px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm transition"
            >
              Open Character Studio & Registry
            </button>
            <button
              onClick={() => onNavigate('main')}
              className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-sm transition"
            >
              Return to Main Menu
            </button>
          </div>
        </div>
      </div>
    );
  }

  const maxTimelineSec = isReplayMode
    ? replayCtrlRef.current?.payload.durationSec ?? 120
    : Math.max(simState?.elapsedSec ?? 1, 60);

  return (
    <div className="relative w-full h-full overflow-hidden bg-slate-950 select-none">
      {/* 3D WebGL Arena Viewport */}
      <div ref={canvasContainerRef} className="w-full h-full" />

      {/* Staged Asset Loading Overlay */}
      {loadProgress && !loadProgress.completed && (
        <div className="absolute inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center p-8">
          <div className="max-w-md w-full bg-slate-900/90 border border-violet-500/30 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-violet-400">
                Hybrid Asset Pipeline Loader
              </span>
              <span className="text-sm font-bold text-white">{loadProgress.percent}%</span>
            </div>
            <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden mb-4">
              <div
                className="h-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-rose-500 transition-all duration-200"
                style={{ width: `${loadProgress.percent}%` }}
              />
            </div>
            <p className="text-sm font-semibold text-white mb-1">{loadProgress.phase}</p>
            <p className="text-xs text-slate-400 truncate">{loadProgress.detail}</p>
          </div>
        </div>
      )}

      {/* Skippable Cinematic Entrance & Fighter Showcase */}
      {showIntroCinematic && selectedFighters.length === 8 && (
        <div className="absolute inset-0 z-40 bg-gradient-to-t from-slate-950/90 via-slate-950/35 to-slate-950/80 flex flex-col justify-between p-8">
          <div className="flex items-center justify-between">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs font-bold uppercase tracking-widest mb-2">
                <Sparkles className="w-3.5 h-3.5" />
                Arena Reveal & Fighter Showcase
              </div>
              <h1 className="text-3xl font-black tracking-tight text-white">
                {currentArena.name}: <span className="text-amber-400">{currentArena.subtitle}</span>
              </h1>
              <p className="text-xs text-slate-300 max-w-2xl mt-1">
                Seed: <span className="font-mono text-violet-300">{simState?.seed}</span> • 8 Eligible Fighters Randomly Selected
              </p>
            </div>
            <button
              onClick={() => {
                setShowIntroCinematic(false);
                audioEngine.startBattleMusic(1);
              }}
              className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm flex items-center gap-2 shadow-lg cursor-pointer"
            >
              Skip Cinematic Intro
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {introStep < 8 && (
            <div className="max-w-xl bg-slate-900/90 border border-slate-700/80 backdrop-blur-md rounded-2xl p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                  Combatant #{introStep + 1} of 8 • {selectedFighters[introStep].universe}
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-violet-500/20 text-violet-300 border border-violet-500/40">
                  Tier {selectedFighters[introStep].attributes.powerTier} •{' '}
                  {selectedFighters[introStep].aiProfile.archetype}
                </span>
              </div>
              <h2 className="text-2xl font-black text-white">
                {selectedFighters[introStep].name}{' '}
                <span className="text-sm font-medium text-slate-400">
                  — {selectedFighters[introStep].title}
                </span>
              </h2>
              <p className="text-sm italic text-amber-200/90 mt-2">
                "{selectedFighters[introStep].voicePack.intro}"
              </p>
            </div>
          )}
        </div>
      )}

      {/* TOP BAR — Always Visible (Adapts to Cinematic vs Tactical HUD) */}
      {simState && (
        <div className="absolute top-3 left-4 right-4 z-20 flex items-center justify-between pointer-events-none">
          {/* Left: Arena & Stage Pill */}
          <div className="pointer-events-auto flex items-center gap-3 bg-slate-900/85 backdrop-blur-md border border-slate-800/90 px-4 py-2 rounded-xl shadow-lg">
            <button
              onClick={() => {
                onClearReplay();
                onNavigate('main');
              }}
              className="text-xs font-bold text-slate-300 hover:text-white px-2.5 py-1 rounded-lg bg-slate-800/90 hover:bg-slate-700 transition cursor-pointer"
            >
              ← Menu
            </button>
            <div className="h-4 w-px bg-slate-800" />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-extrabold text-white tracking-wide">
                  {currentArena.name}
                </span>
                {isReplayMode && (
                  <span className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-bold uppercase">
                    REPLAY MODE
                  </span>
                )}
              </div>
              <div className="text-[11px] text-violet-300 font-medium">
                {simState.stageName}
              </div>
            </div>
          </div>

          {/* Center: Survivor Counter & Match Clock */}
          <div className="pointer-events-auto flex items-center gap-4 bg-slate-900/90 backdrop-blur-md border border-violet-500/30 px-5 py-2 rounded-xl shadow-xl">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-rose-400" />
              <span className="text-xs uppercase tracking-wider text-slate-400 font-bold">
                Survivors
              </span>
              <span className="text-lg font-black text-white">
                {simState.survivorCount}
                <span className="text-xs text-slate-500 font-semibold">/8</span>
              </span>
            </div>
            <div className="h-5 w-px bg-slate-800" />
            <div className="text-center">
              <span className="text-xs font-mono font-bold text-amber-400">
                {Math.floor(simState.elapsedSec / 60)
                  .toString()
                  .padStart(2, '0')}
                :
                {Math.floor(simState.elapsedSec % 60)
                  .toString()
                  .padStart(2, '0')}
              </span>
            </div>
            <div className="h-5 w-px bg-slate-800" />
            <div className="text-[11px] font-mono text-slate-400">
              {telemetry.fps} FPS • {telemetry.frameTimeMs}ms
            </div>
          </div>

          {/* Right: HUD Mode Toggle & Quick Audio Mute */}
          <div className="pointer-events-auto flex items-center gap-2 bg-slate-900/85 backdrop-blur-md border border-slate-800/90 px-3 py-1.5 rounded-xl shadow-lg">
            <button
              onClick={() =>
                setHudMode((m) => (m === 'tactical' ? 'cinematic' : 'tactical'))
              }
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                hudMode === 'cinematic'
                  ? 'bg-violet-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:text-white'
              }`}
              title="Toggle between Tactical HUD and Minimalist Cinematic HUD"
            >
              {hudMode === 'cinematic' ? (
                <>
                  <Eye className="w-3.5 h-3.5" />
                  Cinematic HUD
                </>
              ) : (
                <>
                  <EyeOff className="w-3.5 h-3.5" />
                  Tactical HUD
                </>
              )}
            </button>

            <button
              onClick={() => {
                const nextAudio = {
                  ...settings.audio,
                  masterMuted: !settings.audio.masterMuted,
                };
                onUpdateSettings({ ...settings, audio: nextAudio });
                audioEngine.updateSettings(nextAudio);
              }}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
              title="Toggle Master Audio"
            >
              {settings.audio.masterMuted ? (
                <VolumeX className="w-4 h-4 text-rose-400" />
              ) : (
                <Volume2 className="w-4 h-4 text-emerald-400" />
              )}
            </button>
          </div>
        </div>
      )}

      {/* TACTICAL HUD PANELS (Hidden when Cinematic HUD is active) */}
      {simState && hudMode === 'tactical' && !showIntroCinematic && (
        <>
          {/* Left Panel: 8 Fighter Live Telemetry Cards */}
          <div className="absolute top-18 left-4 bottom-24 z-10 w-72 flex flex-col gap-1.5 overflow-y-auto pr-1 pointer-events-auto">
            {simState.fighters.map((f) => {
              const def = selectedFighters.find((c) => c.id === f.id);
              const hpPct = Math.max(0, Math.min(100, (f.hp / f.maxHp) * 100));
              const isFollowed = cameraMode === 'follow' && followFighterId === f.id;

              return (
                <div
                  key={f.id}
                  onClick={() => {
                    setCameraMode('follow');
                    setFollowFighterId(f.id);
                  }}
                  className={`p-2.5 rounded-xl border backdrop-blur-md transition cursor-pointer ${
                    !f.isAlive
                      ? 'bg-slate-950/65 border-slate-800/60 opacity-50'
                      : isFollowed
                      ? 'bg-slate-900/95 border-amber-400 shadow-lg'
                      : 'bg-slate-900/80 border-slate-800/90 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{
                          backgroundColor: def?.appearance.primaryColor ?? '#f43f5e',
                        }}
                      />
                      <span className="text-xs font-bold text-white truncate">
                        {f.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {f.isAwakened && f.isAlive && (
                        <span className="px-1.5 py-0.5 rounded bg-rose-500/25 border border-rose-500/50 text-[9px] font-black text-rose-300">
                          AWAKENED
                        </span>
                      )}
                      {f.allyIds.length > 0 && f.isAlive && (
                        <span className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-[9px] font-bold text-amber-300">
                          ALLY
                        </span>
                      )}
                      {!f.isAlive && (
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[9px] font-bold text-slate-400">
                          #{f.finalPlacement}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* HP Bar */}
                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden mb-1">
                    <div
                      className={`h-full transition-all duration-150 ${
                        hpPct > 50
                          ? 'bg-emerald-500'
                          : hpPct > 25
                          ? 'bg-amber-500'
                          : 'bg-rose-500'
                      }`}
                      style={{ width: `${hpPct}%` }}
                    />
                  </div>

                  {/* Energy Bar & Stats Row */}
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <div className="flex items-center gap-1.5 w-24">
                      <Zap className="w-3 h-3 text-cyan-400 shrink-0" />
                      <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-cyan-400 transition-all duration-150"
                          style={{ width: `${f.energy}%` }}
                        />
                      </div>
                    </div>
                    <span className="truncate max-w-[95px] text-[9px] text-violet-300">
                      {f.isAlive ? f.currentIntent.replace(/_/g, ' ') : 'ELIMINATED'}
                    </span>
                    <span className="font-mono text-slate-300">
                      {f.stats.eliminations}K • {Math.round(f.stats.damageDealt)}D
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right Panel: Live Battle Log, Alliances & GPU Telemetry */}
          <div className="absolute top-18 right-4 bottom-24 z-10 w-80 flex flex-col gap-2 pointer-events-auto">
            {/* Active Alliances & Destructibles Summary */}
            <div className="bg-slate-900/85 backdrop-blur-md border border-slate-800/90 rounded-xl p-3">
              <div className="flex items-center justify-between text-xs font-bold text-slate-200 mb-2">
                <span className="flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5 text-amber-400" />
                  Tactical Coalitions & Arena
                </span>
                <span className="text-[10px] text-slate-400">
                  Intact Structures:{' '}
                  {simState.destructibles.filter((d) => !d.isDestroyed).length}/
                  {simState.destructibles.length}
                </span>
              </div>
              {simState.alliances.filter((a) => a.outcome === 'active').length === 0 ? (
                <p className="text-[11px] text-slate-400">
                  No active pacts — all survivors fighting independently.
                </p>
              ) : (
                <div className="space-y-1">
                  {simState.alliances
                    .filter((a) => a.outcome === 'active')
                    .map((al) => (
                      <div
                        key={al.id}
                        className="flex items-center justify-between text-[11px] bg-amber-500/10 border border-amber-500/30 rounded-lg px-2.5 py-1 text-amber-200"
                      >
                        <span className="font-semibold">
                          {al.memberAName} ⟷ {al.memberBName}
                        </span>
                        <span className="text-[9px] uppercase font-bold text-amber-400">
                          Allied
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>

            {/* Live Event & Elimination Feed */}
            <div className="flex-1 bg-slate-900/85 backdrop-blur-md border border-slate-800/90 rounded-xl p-3 flex flex-col min-h-0">
              <div className="flex items-center justify-between text-xs font-bold text-slate-200 mb-2">
                <span className="flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-rose-400" />
                  Live Combat Feed
                </span>
                <span className="text-[10px] text-slate-400">
                  {simState.events.length} Events
                </span>
              </div>
              <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
                {[...simState.events]
                  .slice(-24)
                  .reverse()
                  .map((ev) => (
                    <div
                      key={ev.id}
                      className={`text-[11px] p-2 rounded-lg border leading-snug ${
                        ev.type === 'ELIMINATION' || ev.type === 'VICTORY'
                          ? 'bg-rose-500/15 border-rose-500/40 text-rose-200'
                          : ev.type === 'ALLIANCE_BETRAYED'
                          ? 'bg-fuchsia-500/15 border-fuchsia-500/40 text-fuchsia-200'
                          : ev.type === 'ALLIANCE_FORMED'
                          ? 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                          : ev.type === 'ULTIMATE_UNLEASHED' ||
                            ev.type === 'AWAKENING_TRIGGERED'
                          ? 'bg-violet-500/15 border-violet-500/40 text-violet-200'
                          : 'bg-slate-950/60 border-slate-800/70 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[9px] opacity-75 mb-0.5">
                        <span className="font-bold uppercase">{ev.type.replace(/_/g, ' ')}</span>
                        <span className="font-mono">{ev.timestampSec.toFixed(1)}s</span>
                      </div>
                      <p>{ev.description}</p>
                    </div>
                  ))}
              </div>
            </div>

            {/* Real-Time GPU & Engine Telemetry */}
            <div className="bg-slate-900/85 backdrop-blur-md border border-slate-800/90 rounded-xl px-3 py-2 flex items-center justify-between text-[10px] font-mono text-slate-400">
              <span>Preset: {settings.graphicsPreset}</span>
              <span>Draws: {telemetry.drawCalls}</span>
              <span>Tris: {telemetry.triangles}</span>
              <span>Geoms: {telemetry.geometriesInMemory}</span>
            </div>
          </div>
        </>
      )}

      {/* DRAMATIC VOICE & CINEMATIC CALLOUT BANNER */}
      {activeVoiceBanner && !showIntroCinematic && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-20 pointer-events-none max-w-lg w-full px-4">
          <div className="bg-slate-950/90 border border-violet-500/50 backdrop-blur-md rounded-xl px-5 py-3 shadow-2xl text-center">
            <div className="text-[10px] font-black uppercase tracking-widest text-amber-400 mb-0.5">
              {activeVoiceBanner.speaker} • {activeVoiceBanner.type.replace(/_/g, ' ')}
            </div>
            <p className="text-sm font-bold italic text-white">
              "{activeVoiceBanner.line}"
            </p>
          </div>
        </div>
      )}

      {/* BOTTOM SPECTATOR CONTROLS & TIMELINE BAR */}
      {simState && (
        <div className="absolute bottom-3 left-4 right-4 z-20 bg-slate-900/90 backdrop-blur-md border border-slate-800/90 rounded-2xl px-4 py-2.5 shadow-2xl flex flex-col gap-2">
          {/* Interactive Timeline Scrubber with Event Markers */}
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-mono text-slate-400 w-12">
              {simState.elapsedSec.toFixed(1)}s
            </span>
            <div className="relative flex-1 flex items-center">
              <input
                type="range"
                min={0}
                max={maxTimelineSec}
                step={0.1}
                value={simState.elapsedSec}
                onChange={(e) => handleScrubTimeline( Number(e.target.value) )}
                className="w-full accent-violet-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                title="Scrub Replay / Simulation Timeline"
              />
            </div>
            <span className="text-[11px] font-mono text-slate-400 w-12 text-right">
              {maxTimelineSec.toFixed(0)}s
            </span>
          </div>

          {/* Spectator Transport & Camera Director Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Transport Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsPaused((p) => !p)}
                className="px-3.5 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
              >
                {isPaused ? (
                  <>
                    <Play className="w-3.5 h-3.5" />
                    Resume
                  </>
                ) : (
                  <>
                    <Pause className="w-3.5 h-3.5" />
                    Pause
                  </>
                )}
              </button>

              <button
                onClick={() => {
                  onClearReplay();
                  initializeMatch(null);
                }}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                New Random Battle
              </button>

              {/* Playback Speed Controls */}
              <div className="flex items-center bg-slate-950/80 border border-slate-800 rounded-xl p-0.5">
                {([0.5, 1, 2, 4] as const).map((spd) => (
                  <button
                    key={spd}
                    onClick={() => setPlaybackSpeed(spd)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                      playbackSpeed === spd
                        ? 'bg-rose-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {spd}x
                  </button>
                ))}
              </div>
            </div>

            {/* Camera Director Controls */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400 font-semibold flex items-center gap-1">
                <Camera className="w-3.5 h-3.5 text-violet-400" />
                Camera:
              </span>
              <button
                onClick={() => setCameraMode('director')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  cameraMode === 'director'
                    ? 'bg-violet-600 text-white'
                    : 'bg-slate-800 text-slate-300 hover:text-white'
                }`}
              >
                Auto Director
              </button>
              <button
                onClick={() => setCameraMode('wide')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  cameraMode === 'wide'
                    ? 'bg-violet-600 text-white'
                    : 'bg-slate-800 text-slate-300 hover:text-white'
                }`}
              >
                Wide Spectator
              </button>
              <select
                value={cameraMode === 'follow' && followFighterId ? followFighterId : ''}
                onChange={(e) => {
                  if (e.target.value) {
                    setCameraMode('follow');
                    setFollowFighterId(e.target.value);
                  } else {
                    setCameraMode('director');
                  }
                }}
                className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-1 font-semibold"
              >
                <option value="">Follow Fighter...</option>
                {simState.fighters.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} ({f.isAlive ? `${Math.round(f.hp)} HP` : `Out #${f.finalPlacement}`})
                  </option>
                ))}
              </select>

              {simState.status === 'completed' && !showVictoryModal && (
                <button
                  onClick={() => setShowVictoryModal(true)}
                  className="px-3.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center gap-1 cursor-pointer"
                >
                  <Trophy className="w-3.5 h-3.5" />
                  Results
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* POST-BATTLE CHAMPION VICTORY & FULL 8-CHARACTER ANALYTICS MODAL */}
      {simState && simState.status === 'completed' && showVictoryModal && (
        <div className="absolute inset-0 z-50 bg-slate-950/88 backdrop-blur-md flex items-center justify-center p-6 overflow-y-auto">
          <div className="max-w-5xl w-full bg-slate-900 border border-amber-500/40 rounded-3xl p-6 shadow-2xl my-auto max-h-[92vh] overflow-y-auto">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4 mb-5">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-black uppercase tracking-widest mb-1">
                  <Trophy className="w-4 h-4" />
                  Cataclysm Champion Crowned
                </div>
                <h2 className="text-3xl font-black text-white">
                  {simState.winnerName}{' '}
                  <span className="text-lg font-semibold text-amber-400">
                    — Victor of {currentArena.name}
                  </span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Match Seed: <span className="font-mono text-violet-300">{simState.seed}</span> • Duration:{' '}
                  {simState.elapsedSec.toFixed(1)}s • Battle MVP:{' '}
                  <span className="text-emerald-400 font-bold">{simState.mvpName}</span>
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowVictoryModal(false)}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold cursor-pointer"
                >
                  Inspect 3D Arena
                </button>
                <button
                  onClick={handleWatchCurrentReplay}
                  className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" />
                  Watch Full 3D Replay
                </button>
                <button
                  onClick={() => {
                    onClearReplay();
                    initializeMatch(null);
                  }}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Swords className="w-3.5 h-3.5" />
                  Next Random Battle
                </button>
              </div>
            </div>

            {/* Full 8-Character Ranking Table */}
            <div className="mb-5">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300 mb-2.5">
                Full 8-Combatant Final Standings & Simulation Telemetry
              </h3>
              <div className="overflow-x-auto rounded-2xl border border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/90 text-slate-400 uppercase text-[10px]">
                    <tr>
                      <th className="py-2.5 px-3">Rank</th>
                      <th className="py-2.5 px-3">Combatant</th>
                      <th className="py-2.5 px-3">Universe</th>
                      <th className="py-2.5 px-3">Elims</th>
                      <th className="py-2.5 px-3">Damage Dealt</th>
                      <th className="py-2.5 px-3">Damage Taken</th>
                      <th className="py-2.5 px-3">Ultimates</th>
                      <th className="py-2.5 px-3">Alliances / Betrayals</th>
                      <th className="py-2.5 px-3">Survival</th>
                      <th className="py-2.5 px-3">Eliminated By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 bg-slate-900/60">
                    {[...simState.fighters]
                      .sort((a, b) => (a.finalPlacement ?? 99) - (b.finalPlacement ?? 99))
                      .map((f) => {
                        const killer = simState.fighters.find(
                          (k) => k.id === f.eliminatedById
                        );
                        const isMvp = simState.mvpId === f.id;
                        return (
                          <tr
                            key={f.id}
                            className={
                              f.finalPlacement === 1
                                ? 'bg-amber-500/10 text-white font-semibold'
                                : 'text-slate-300'
                            }
                          >
                            <td className="py-2.5 px-3 font-black">
                              {f.finalPlacement === 1 ? '🏆 #1' : `#${f.finalPlacement}`}
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="flex items-center gap-1.5">
                                <span>{f.name}</span>
                                {isMvp && (
                                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[9px] font-black">
                                    MVP
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-2.5 px-3 text-slate-400">{f.universe}</td>
                            <td className="py-2.5 px-3 font-mono font-bold text-rose-400">
                              {f.stats.eliminations}
                            </td>
                            <td className="py-2.5 px-3 font-mono">
                              {Math.round(f.stats.damageDealt).toLocaleString()}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-400">
                              {Math.round(f.stats.damageTaken).toLocaleString()}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-violet-300">
                              {f.stats.ultimatesUsed}
                            </td>
                            <td className="py-2.5 px-3 font-mono">
                              {f.stats.alliancesFormed} /{' '}
                              <span className="text-fuchsia-400">
                                {f.stats.betrayalsCommitted}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-mono">
                              {f.stats.survivalTimeSec.toFixed(1)}s
                            </td>
                            <td className="py-2.5 px-3 text-slate-400">
                              {f.finalPlacement === 1
                                ? 'SURVIVED (CHAMPION)'
                                : killer
                                ? `${killer.name} (${f.eliminatedByAbility})`
                                : f.eliminatedByAbility || 'Cataclysm Hazard'}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Archive Saving & Deterministic Replay Verification Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2 flex items-center gap-1.5">
                  <Save className="w-3.5 h-3.5 text-emerald-400" />
                  Persistent Battle Archive (IndexedDB)
                </h4>
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="text"
                    value={customArchiveName}
                    onChange={(e) => setCustomArchiveName(e.target.value)}
                    placeholder="Custom Battle Name..."
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white"
                  />
                  <button
                    onClick={handleSaveArchiveName}
                    className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer"
                  >
                    Update Name
                  </button>
                </div>
                {archiveSavedBanner && (
                  <p className="text-[11px] text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Automatically saved to local IndexedDB Battle Archive & Arena Chronicle!
                  </p>
                )}
              </div>

              <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-violet-400" />
                    Hybrid Replay Determinism Validator
                  </h4>
                  <button
                    onClick={handleVerifyDeterminism}
                    className="px-3 py-1 rounded-lg bg-violet-600/30 hover:bg-violet-600/50 border border-violet-500/40 text-violet-200 text-[11px] font-bold cursor-pointer"
                  >
                    Run Seed Re-Simulation Test
                  </button>
                </div>
                {determinismReport ? (
                  <div className="text-[11px] space-y-0.5">
                    <p
                      className={
                        determinismReport.isDeterministicMatch
                          ? 'text-emerald-400 font-bold'
                          : 'text-amber-400 font-bold'
                      }
                    >
                      {determinismReport.notes[0]}
                    </p>
                    <p className="text-slate-400 font-mono">
                      Ticks: {determinismReport.actualTotalTicks}/
                      {determinismReport.expectedTotalTicks} • Winner Match:{' '}
                      {String(
                        determinismReport.actualWinnerId ===
                          determinismReport.expectedWinnerId
                      )}{' '}
                      • Order Match: {String(determinismReport.eliminationOrderMatched)}
                    </p>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400">
                    Click to re-simulate this battle from seed{' '}
                    <span className="font-mono text-slate-300">{simState.seed}</span> and verify bit-exact winner and elimination order.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
