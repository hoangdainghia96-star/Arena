import React from 'react';
import { RotateCcw, Settings, Sliders, Volume2 } from 'lucide-react';
import { ArenaSettings, GraphicsQualityPreset } from '../types/game';
import { DEFAULT_ARENA_SETTINGS, SETTINGS_PRESETS } from '../data/settings';
import { audioEngine } from '../audio/audioEngine';

interface SettingsViewProps {
  settings: ArenaSettings;
  onUpdateSettings: (next: ArenaSettings) => void;
  onBack: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onUpdateSettings,
  onBack,
}) => {
  const applyChange = (partial: Partial<ArenaSettings>) => {
    const next = { ...settings, ...partial };
    onUpdateSettings(next);
    if (partial.audio) {
      audioEngine.updateSettings(next.audio);
    }
  };

  const applyPreset = (presetKey: string) => {
    const preset = SETTINGS_PRESETS[presetKey];
    if (!preset) return;
    const next: ArenaSettings = {
      ...settings,
      ...preset.settings,
      audio: { ...settings.audio, ...(preset.settings.audio || {}) },
    };
    onUpdateSettings(next);
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
              <Settings className="w-4 h-4 text-violet-400" />
              Advanced Arena Settings & Engine Configuration
            </h1>
            <p className="text-xs text-slate-400">
              Every setting directly controls authoritative simulation, Hybrid AI, 3D rendering, and 4-bus WebAudio
            </p>
          </div>
        </div>

        <button
          onClick={() => {
            onUpdateSettings({
              ...DEFAULT_ARENA_SETTINGS,
              audio: { ...DEFAULT_ARENA_SETTINGS.audio },
            });
            audioEngine.updateSettings(DEFAULT_ARENA_SETTINGS.audio);
          }}
          className="px-4 py-2 rounded-xl bg-rose-600/20 hover:bg-rose-600/35 border border-rose-500/40 text-rose-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset to Default
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 max-w-5xl mx-auto w-full space-y-6">
        {/* Configuration Presets */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5">
          <h2 className="text-xs font-bold uppercase tracking-wider text-violet-300 mb-3 flex items-center gap-2">
            <Sliders className="w-4 h-4" />
            Simulation Configuration Presets
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Object.entries(SETTINGS_PRESETS).map(([key, p]) => (
              <button
                key={key}
                onClick={() => applyPreset(key)}
                className="text-left p-3.5 rounded-xl bg-slate-950/80 hover:bg-violet-600/15 border border-slate-800 hover:border-violet-500/50 transition cursor-pointer"
              >
                <div className="text-xs font-bold text-white mb-1">{p.label}</div>
                <p className="text-[11px] text-slate-400">{p.description}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Simulation, AI & Combat Rules */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-4 text-xs">
            <h3 className="font-bold uppercase tracking-wider text-amber-400">
              Battle Pacing & Hybrid AI Rules
            </h3>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Battle Duration Target Preset
              </label>
              <select
                value={settings.targetDurationPreset}
                onChange={(e) =>
                  applyChange({
                    targetDurationPreset: e.target.value as
                      | 'fast'
                      | 'standard'
                      | 'epic',
                  })
                }
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white"
              >
                <option value="fast">Fast Showdown (3–5 Min Scale)</option>
                <option value="standard">Standard Cataclysm (5–8 Min Target)</option>
                <option value="epic">Epic Endurance Finale (8–10 Min Scale)</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Combat Pace Multiplier ({settings.combatPaceMultiplier.toFixed(2)}x)
              </label>
              <input
                type="range"
                min={0.5}
                max={2.0}
                step={0.05}
                value={settings.combatPaceMultiplier}
                onChange={(e) =>
                  applyChange({ combatPaceMultiplier: Number(e.target.value) })
                }
                className="w-full accent-violet-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Alliance Formation Tendency ({settings.allianceTendencyMultiplier.toFixed(2)}x)
              </label>
              <input
                type="range"
                min={0}
                max={2.0}
                step={0.1}
                value={settings.allianceTendencyMultiplier}
                onChange={(e) =>
                  applyChange({
                    allianceTendencyMultiplier: Number(e.target.value),
                  })
                }
                className="w-full accent-amber-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Betrayal Frequency Multiplier ({settings.betrayalTendencyMultiplier.toFixed(2)}x)
              </label>
              <input
                type="range"
                min={0}
                max={2.0}
                step={0.1}
                value={settings.betrayalTendencyMultiplier}
                onChange={(e) =>
                  applyChange({
                    betrayalTendencyMultiplier: Number(e.target.value),
                  })
                }
                className="w-full accent-fuchsia-500"
              />
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-800">
              {(
                [
                  ['environmentHazardsEnabled', 'Dynamic Arena Weather & Cataclysm Hazards'],
                  ['destructibleObjectsEnabled', 'Destructible Pillars, Crystals & Payouts'],
                  ['awakeningEnabled', 'Character Awakening Transformations'],
                  ['ultimatesEnabled', 'Signature Ultimate Attacks'],
                  ['elementalReactionsEnabled', 'Cross-Character Elemental Reactions'],
                  ['autoSkipIntroCinematic', 'Auto-Skip Pre-Battle Entrance Showcase'],
                ] as const
              ).map(([field, label]) => (
                <label
                  key={field}
                  className="flex items-center justify-between py-1 cursor-pointer"
                >
                  <span className="text-slate-300">{label}</span>
                  <input
                    type="checkbox"
                    checked={settings[field]}
                    onChange={(e) =>
                      applyChange({ [field]: e.target.checked } as Partial<ArenaSettings>)
                    }
                    className="w-4 h-4 accent-violet-500"
                  />
                </label>
              ))}
            </div>
          </div>

          {/* 3D Graphics Quality & 4-Channel Audio Mixer */}
          <div className="space-y-6">
            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-3 text-xs">
              <h3 className="font-bold uppercase tracking-wider text-cyan-400">
                3D Cel-Shader Graphics Quality Preset
              </h3>
              <div className="grid grid-cols-4 gap-2">
                {(['Ultra', 'High', 'Medium', 'Low'] as GraphicsQualityPreset[]).map(
                  (preset) => (
                    <button
                      key={preset}
                      onClick={() => applyChange({ graphicsPreset: preset })}
                      className={`py-2.5 rounded-xl font-bold transition cursor-pointer ${
                        settings.graphicsPreset === preset
                          ? 'bg-cyan-500 text-slate-950 shadow-lg'
                          : 'bg-slate-950 border border-slate-800 text-slate-300 hover:text-white'
                      }`}
                    >
                      {preset}
                    </button>
                  )
                )}
              </div>
              <p className="text-[11px] text-slate-400">
                Ultra enables 2x DPR, 2048px soft shadows, inverted-hull anime ink outlines, and 420 atmospheric particles.
              </p>
            </div>

            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <h3 className="font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                  <Volume2 className="w-4 h-4" />
                  4-Channel Spatial Audio Mixer
                </h3>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <span className="text-slate-400">Mute All</span>
                  <input
                    type="checkbox"
                    checked={settings.audio.masterMuted}
                    onChange={(e) =>
                      applyChange({
                        audio: {
                          ...settings.audio,
                          masterMuted: e.target.checked,
                        },
                      })
                    }
                    className="w-4 h-4 accent-rose-500"
                  />
                </label>
              </div>

              {(
                [
                  ['musicVolume', 'Battle BGM & Fanfare Volume'],
                  ['sfxVolume', 'Combat & Spatial Skill SFX Volume'],
                  ['voiceVolume', 'Character Voice Callouts Volume'],
                  ['ambientVolume', 'Arena Atmospheric Ambience Volume'],
                ] as const
              ).map(([channel, label]) => (
                <div key={channel}>
                  <div className="flex justify-between text-slate-300 mb-1">
                    <span>{label}</span>
                    <span className="font-mono">
                      {Math.round(settings.audio[channel] * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={settings.audio[channel]}
                    onChange={(e) =>
                      applyChange({
                        audio: {
                          ...settings.audio,
                          [channel]: Number(e.target.value),
                        },
                      })
                    }
                    className="w-full accent-emerald-500"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
