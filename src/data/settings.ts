import { ArenaSettings } from '../types/game';

const SETTINGS_STORAGE_KEY = 'anime_arena_cataclysm_settings_v1';

export const DEFAULT_ARENA_SETTINGS: ArenaSettings = {
  fighterCount: 8,
  targetDurationPreset: 'standard',
  combatPaceMultiplier: 1.0,
  aiDifficulty: 'Cataclysm',
  allianceTendencyMultiplier: 1.0,
  betrayalTendencyMultiplier: 1.0,
  environmentHazardsEnabled: true,
  destructibleObjectsEnabled: true,
  awakeningEnabled: true,
  ultimatesEnabled: true,
  elementalReactionsEnabled: true,
  autoSkipIntroCinematic: false,
  defaultHudMode: 'tactical',
  graphicsPreset: 'Ultra',
  audio: {
    masterMuted: false,
    musicVolume: 0.55,
    sfxVolume: 0.75,
    voiceVolume: 0.85,
    ambientVolume: 0.5,
  },
};

export const SETTINGS_PRESETS: Record<string, { label: string; description: string; settings: Partial<ArenaSettings> }> = {
  default_random: {
    label: 'Pure Random Cataclysm (Default)',
    description: 'Balanced Hybrid Power simulation targeting 5–8 minutes with full dynamic alliances, awakenings, and environmental destruction.',
    settings: { ...DEFAULT_ARENA_SETTINGS },
  },
  epic_marathon: {
    label: 'Epic Anime Finale (8–10 Min)',
    description: 'Extended tactical endurance with higher durability and deliberate AI spacing.',
    settings: {
      targetDurationPreset: 'epic',
      combatPaceMultiplier: 0.72,
      aiDifficulty: 'Cataclysm',
      allianceTendencyMultiplier: 1.25,
    },
  },
  blitz_showdown: {
    label: 'High-Octane Blitz',
    description: 'Accelerated energy generation and fierce aggression for rapid spectator showcases.',
    settings: {
      targetDurationPreset: 'fast',
      combatPaceMultiplier: 1.45,
      aiDifficulty: 'Cataclysm',
      allianceTendencyMultiplier: 0.8,
      betrayalTendencyMultiplier: 1.4,
    },
  },
  alliance_warfare: {
    label: 'Pact & Betrayal Intrigue',
    description: 'Maximizes cross-universe alliance formation early and dramatic betrayals in the final stages.',
    settings: {
      allianceTendencyMultiplier: 1.75,
      betrayalTendencyMultiplier: 1.65,
      aiDifficulty: 'Cataclysm',
    },
  },
};

export function loadSavedSettings(): ArenaSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_ARENA_SETTINGS, audio: { ...DEFAULT_ARENA_SETTINGS.audio } };
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_ARENA_SETTINGS,
      ...parsed,
      fighterCount: 8,
      audio: {
        ...DEFAULT_ARENA_SETTINGS.audio,
        ...(parsed.audio || {}),
      },
    };
  } catch {
    return { ...DEFAULT_ARENA_SETTINGS, audio: { ...DEFAULT_ARENA_SETTINGS.audio } };
  }
}

export function saveArenaSettings(settings: ArenaSettings): void {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota errors in restricted environments
  }
}
