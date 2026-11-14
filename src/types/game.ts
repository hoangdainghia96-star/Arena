export type PowerTier = 'S+' | 'S' | 'A+';

export type ElementType =
  | 'fire'
  | 'void'
  | 'lightning'
  | 'solar'
  | 'photon'
  | 'abyss'
  | 'chrono'
  | 'wind'
  | 'crimson'
  | 'crystal';

export type WeaponArchetype =
  | 'odachi'
  | 'grimoire'
  | 'tonfa'
  | 'halberd'
  | 'greatbow'
  | 'scythe'
  | 'chakram'
  | 'greaves'
  | 'daggers'
  | 'gauntlets';

export type HairStyle = 'spiky' | 'twintails' | 'cyber-swept' | 'braided-crown' | 'visor-crop' | 'horned-mane' | 'ribbon-long' | 'headband-wild' | 'gothic-bob' | 'alchemist-crest';

export type AccessoryType = 'cape' | 'astral-halo' | 'thunder-drums' | 'solar-wings' | 'tactical-cloak' | 'abyss-mantle' | 'chrono-ring' | 'dragon-sash' | 'rose-chains' | 'runic-orbs';

export type AIPersonalityType =
  | 'Duelist'
  | 'Schemer'
  | 'Berserker'
  | 'Guardian'
  | 'Opportunist'
  | 'Juggernaut'
  | 'Tactician'
  | 'Challenger'
  | 'Executioner'
  | 'Strategist';

export type FighterAnimationState =
  | 'idle'
  | 'move'
  | 'basicCombo'
  | 'heavyAttack'
  | 'defend'
  | 'counter'
  | 'movementSkill'
  | 'signatureSkill'
  | 'ultimate'
  | 'awakening'
  | 'hit'
  | 'eliminated'
  | 'victory';

export interface CharacterAppearance {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  hairColor: string;
  eyeColor: string;
  skinTone: string;
  auraColor: string;
  hairStyle: HairStyle;
  weapon: WeaponArchetype;
  accessory: AccessoryType;
  heightScale: number;
}

export interface AbilitySpec {
  id: string;
  name: string;
  description: string;
  element: ElementType;
  damageMultiplier: number;
  range: number;
  aoeRadius: number;
  cooldownSec: number;
  energyCost: number;
  effectType: 'slash' | 'projectile' | 'vortex' | 'beam' | 'shockwave' | 'dash' | 'guard' | 'buff';
  statusEffect?: 'burn' | 'slow' | 'stun' | 'shred' | 'drain';
}

export interface CharacterAttributes {
  maxHp: number;
  attack: number;
  defense: number;
  speed: number;
  energyRegen: number;
  critChance: number;
  powerTier: PowerTier;
}

export interface AIPersonalityProfile {
  archetype: AIPersonalityType;
  aggression: number; // 0..1
  allianceTendency: number; // 0..1
  loyalty: number; // 0..1 (inverse of betrayal likelihood)
  objectiveFocus: number; // 0..1
  caution: number; // 0..1
  preferredRange: 'melee' | 'mid' | 'ranged';
  strategicObjective: string;
}

export interface CharacterVoicePack {
  intro: string;
  attack: string;
  signature: string;
  awakening: string;
  ultimate: string;
  allianceFormed: string;
  betrayal: string;
  victory: string;
  pitchHz: number;
  timbre: 'heroic' | 'mystic' | 'fierce' | 'noble' | 'cool' | 'titan';
}

export interface CharacterAssetMetadata {
  modelPath: string;
  format: 'gltf-2.0' | 'glb-2.0';
  provenanceType: 'original-verified' | 'official-licensed';
  author: string;
  license: string;
  webHostingCleared: boolean;
  boneCount: number;
  requiredBonesPresent: boolean;
  animationClipsPresent: FighterAnimationState[];
  textureQuality: 'high-cel-ramp' | 'standard-cel';
}

export interface CharacterDefinition {
  id: string;
  name: string;
  title: string;
  universe: string;
  isOriginal: boolean;
  biography: string;
  appearance: CharacterAppearance;
  attributes: CharacterAttributes;
  abilities: {
    basicCombo: AbilitySpec;
    heavyAttack: AbilitySpec;
    movementSkill: AbilitySpec;
    defensiveCounter: AbilitySpec;
    signatureSkill: AbilitySpec;
    awakening: {
      name: string;
      description: string;
      hpThreshold: number;
      atkBoost: number;
      spdBoost: number;
      defBoost: number;
    };
    ultimate: AbilitySpec;
  };
  aiProfile: AIPersonalityProfile;
  initialRelationships: Record<string, 'ally-inclined' | 'rival' | 'neutral'>;
  voicePack: CharacterVoicePack;
  assetMetadata: CharacterAssetMetadata;
  enabledInPool: boolean;
}

export interface CharacterValidationResult {
  characterId: string;
  characterName: string;
  isEligible: boolean;
  checks: {
    authenticityOrOriginality: boolean;
    modelQuality: boolean;
    skeletonAndRigCompatibility: boolean;
    animationCompatibility: boolean;
    textureQuality: boolean;
    combatAnimationCompleteness: boolean;
    assetProvenance: boolean;
    assetLicense: boolean;
    ipRightsCleared: boolean;
  };
  errors: string[];
}

export interface DestructibleSpec {
  id: string;
  name: string;
  type: 'runic-pillar' | 'aether-crystal' | 'plasma-tower' | 'torii-guardian' | 'void-monolith' | 'star-core';
  position: [number, number, number];
  maxHp: number;
  radius: number;
  payoutType: 'energy-surge' | 'attack-blessing' | 'emp-blast' | 'gravity-pull' | 'heal-burst';
  color: string;
}

export interface ArenaStageSpec {
  stageNumber: 1 | 2 | 3;
  name: string;
  subtitle: string;
  startTimeRatio: number; // 0, 0.35, 0.70
  skyTopColor: string;
  skyBottomColor: string;
  fogColor: string;
  ambientLightColor: string;
  directionalLightColor: string;
  lightIntensity: number;
  weatherType: 'clear-petals' | 'astral-sparks' | 'neon-rain' | 'thunder-storm' | 'void-embers' | 'eclipse-meteors';
  hazardIntervalSec: number;
  energyRegenMultiplier: number;
}

export interface ArenaDefinition {
  id: string;
  name: string;
  subtitle: string;
  theme: 'sanctum' | 'neokyoto' | 'obsidian';
  description: string;
  playableRadius: number; // Entire arena remains playable (no shrinking zone)
  floorColor: string;
  gridAccentColor: string;
  rimGlowColor: string;
  stages: [ArenaStageSpec, ArenaStageSpec, ArenaStageSpec];
  destructibles: DestructibleSpec[];
  modelPath: string;
}

export type RelationshipStatus = 'allied' | 'rival' | 'enemy' | 'neutral';

export interface RelationshipCell {
  fromId: string;
  toId: string;
  status: RelationshipStatus;
  trust: number; // -100 to +100
  threat: number; // 0 to 100
  grudge: number; // 0 to 100
  allianceFormedAt?: number;
  betrayedAt?: number;
}

export type TacticalIntent =
  | 'ENGAGE_PRIMARY_TARGET'
  | 'EXECUTE_WOUNDED'
  | 'ASSIST_ALLY'
  | 'CONTEST_ARENA_OBJECTIVE'
  | 'EVADE_HAZARD_OR_ULTIMATE'
  | 'DEFEND_AND_COUNTER'
  | 'UNLEASH_ULTIMATE_OR_AWAKEN'
  | 'BETRAY_ALLY';

export interface FighterMemoryEntry {
  timestamp: number;
  type: 'attacked_by' | 'assisted_by' | 'allied_with' | 'betrayed_by' | 'eliminated_foe';
  actorId: string;
  value: number;
}

export interface FighterRuntimeState {
  id: string;
  name: string;
  title: string;
  universe: string;
  position: [number, number, number];
  velocity: [number, number, number];
  rotationY: number;
  hp: number;
  maxHp: number;
  energy: number; // 0..100
  maxEnergy: number;
  attack: number;
  defense: number;
  speed: number;
  isAlive: boolean;
  isAwakened: boolean;
  isGuarding: boolean;
  animationState: FighterAnimationState;
  animationTimer: number;
  comboStep: number;
  targetId: string | null;
  allyIds: string[];
  currentIntent: TacticalIntent;
  activeBuffs: {
    atkBoostTimer: number;
    speedBoostTimer: number;
    invulnerableTimer: number;
  };
  statusEffects: {
    burnTimer: number;
    slowTimer: number;
    stunTimer: number;
    shredTimer: number;
  };
  cooldowns: {
    basicCombo: number;
    heavyAttack: number;
    movementSkill: number;
    defensiveCounter: number;
    signatureSkill: number;
    ultimate: number;
  };
  stats: {
    damageDealt: number;
    damageTaken: number;
    eliminations: number;
    assists: number;
    ultimatesUsed: number;
    signaturesUsed: number;
    countersLanded: number;
    destructiblesShattered: number;
    alliancesFormed: number;
    betrayalsCommitted: number;
    survivalTimeSec: number;
  };
  eliminatedAtSec: number | null;
  eliminatedById: string | null;
  eliminatedByAbility: string | null;
  finalPlacement: number | null; // 1..8
  lastDamagedById: string | null;
  assistDamagerIds: string[];
  memory: FighterMemoryEntry[];
}

export interface DestructibleRuntimeState {
  id: string;
  name: string;
  type: DestructibleSpec['type'];
  position: [number, number, number];
  hp: number;
  maxHp: number;
  radius: number;
  isDestroyed: boolean;
  payoutType: DestructibleSpec['payoutType'];
  color: string;
}

export interface ArenaZoneRuntime {
  id: string;
  type: 'shrine-blessing' | 'meteor-hazard' | 'gravity-well' | 'chrono-dome' | 'emp-field' | 'solar-consecration';
  ownerId: string | null;
  position: [number, number, number];
  radius: number;
  remainingSec: number;
  totalDurationSec: number;
  color: string;
  triggered: boolean;
}

export interface VFXEventRuntime {
  id: string;
  type: 'slash-arc' | 'energy-beam' | 'shockwave' | 'lightning-strike' | 'vortex-sphere' | 'awakening-pillar' | 'shatter-burst' | 'elimination-ascension' | 'counter-flash';
  position: [number, number, number];
  targetPosition?: [number, number, number];
  color: string;
  secondaryColor: string;
  radius: number;
  createdAtSec: number;
  durationSec: number;
  label?: string;
}

export type BattleEventType =
  | 'BATTLE_START'
  | 'STAGE_CHANGE'
  | 'SKILL_USED'
  | 'ULTIMATE_UNLEASHED'
  | 'AWAKENING_TRIGGERED'
  | 'COUNTER_PARRY'
  | 'ELEMENTAL_REACTION'
  | 'ALLIANCE_FORMED'
  | 'ALLIANCE_BETRAYED'
  | 'DESTRUCTIBLE_SHATTERED'
  | 'ARENA_EVENT'
  | 'ELIMINATION'
  | 'VICTORY';

export interface BattleEvent {
  id: string;
  timestampSec: number;
  tick: number;
  type: BattleEventType;
  actorId?: string;
  actorName?: string;
  targetId?: string;
  targetName?: string;
  abilityName?: string;
  description: string;
  importance: 'low' | 'medium' | 'high' | 'critical';
  position?: [number, number, number];
  voiceLine?: string;
}

export interface EliminationRecord {
  order: number; // 1 = first eliminated (8th place), 7 = 7th eliminated (2nd place)
  victimId: string;
  victimName: string;
  finalHitterId: string | null;
  finalHitterName: string;
  abilityUsed: string;
  timestampSec: number;
  placement: number; // 8 down to 2
}

export interface AllianceRecord {
  id: string;
  memberAId: string;
  memberAName: string;
  memberBId: string;
  memberBName: string;
  formedAtSec: number;
  endedAtSec: number | null;
  outcome: 'active' | 'broken-by-betrayal' | 'dissolved-by-elimination' | 'final-two-standoff';
  betrayerId?: string;
}

export interface BattleSimulationState {
  battleId: string;
  battleName: string;
  seed: string;
  arenaId: string;
  arenaName: string;
  tick: number;
  elapsedSec: number;
  stageNumber: 1 | 2 | 3;
  stageName: string;
  status: 'initializing' | 'intro' | 'running' | 'paused' | 'completed';
  survivorCount: number;
  fighters: FighterRuntimeState[];
  relationships: Record<string, Record<string, RelationshipCell>>;
  alliances: AllianceRecord[];
  destructibles: DestructibleRuntimeState[];
  activeZones: ArenaZoneRuntime[];
  vfxEvents: VFXEventRuntime[];
  events: BattleEvent[];
  eliminations: EliminationRecord[];
  winnerId: string | null;
  winnerName: string | null;
  mvpId: string | null;
  mvpName: string | null;
}

export interface ReplaySnapshot {
  tick: number;
  elapsedSec: number;
  stageNumber: 1 | 2 | 3;
  survivorCount: number;
  fighters: Array<{
    id: string;
    position: [number, number, number];
    rotationY: number;
    hp: number;
    energy: number;
    isAlive: boolean;
    isAwakened: boolean;
    isGuarding: boolean;
    animationState: FighterAnimationState;
    targetId: string | null;
    allyIds: string[];
    currentIntent: TacticalIntent;
    damageDealt: number;
    eliminations: number;
    finalPlacement: number | null;
  }>;
  destructibles: Array<{
    id: string;
    hp: number;
    isDestroyed: boolean;
  }>;
  activeZones: ArenaZoneRuntime[];
}

export interface ReplayPayload {
  schemaVersion: '1.0.0';
  battleId: string;
  battleName: string;
  createdAtIso: string;
  seed: string;
  arenaId: string;
  characterIds: string[];
  settingsSnapshot: ArenaSettings;
  totalTicks: number;
  durationSec: number;
  winnerId: string;
  winnerName: string;
  mvpId: string;
  mvpName: string;
  finalRankings: Array<{
    placement: number;
    fighterId: string;
    fighterName: string;
    universe: string;
    eliminations: number;
    damageDealt: number;
    damageTaken: number;
    ultimatesUsed: number;
    alliancesFormed: number;
    betrayalsCommitted: number;
    survivalTimeSec: number;
    eliminatedByName: string | null;
  }>;
  eliminations: EliminationRecord[];
  alliances: AllianceRecord[];
  events: BattleEvent[];
  snapshots: ReplaySnapshot[];
}

export interface SavedBattleRecord {
  battleId: string;
  battleName: string;
  createdAtIso: string;
  arenaId: string;
  arenaName: string;
  seed: string;
  durationSec: number;
  winnerId: string;
  winnerName: string;
  mvpId: string;
  mvpName: string;
  participantIds: string[];
  participantNames: string[];
  totalEliminations: number;
  totalAlliances: number;
  totalBetrayals: number;
  memorableHeadline: string;
  replay: ReplayPayload;
}

export interface CharacterChronicleStats {
  characterId: string;
  characterName: string;
  universe: string;
  battlesEntered: number;
  victories: number;
  winRatePercent: number;
  mvpCount: number;
  totalEliminations: number;
  totalDeaths: number;
  kdRatio: number;
  totalDamageDealt: number;
  avgPlacement: number;
  alliancesFormed: number;
  betrayalsCommitted: number;
  ultimatesUnleashed: number;
}

export interface AchievementRecord {
  id: string;
  title: string;
  description: string;
  category: 'combat' | 'alliance' | 'chronicle' | 'arena';
  unlocked: boolean;
  unlockedAtIso?: string;
  progress: number;
  target: number;
}

export type GraphicsQualityPreset = 'Ultra' | 'High' | 'Medium' | 'Low';

export interface ArenaSettings {
  fighterCount: 8; // Core Battle Royale rule requires 8 unique fighters
  targetDurationPreset: 'fast' | 'standard' | 'epic'; // fast (3-5m), standard (5-8m), epic (8-10m)
  combatPaceMultiplier: number; // Scales damage/cooldown tempo to achieve target duration
  aiDifficulty: 'Tactical' | 'Master' | 'Cataclysm';
  allianceTendencyMultiplier: number; // 0.0 to 2.0
  betrayalTendencyMultiplier: number; // 0.0 to 2.0
  environmentHazardsEnabled: boolean;
  destructibleObjectsEnabled: boolean;
  awakeningEnabled: boolean;
  ultimatesEnabled: boolean;
  elementalReactionsEnabled: boolean;
  autoSkipIntroCinematic: boolean;
  defaultHudMode: 'cinematic' | 'tactical';
  graphicsPreset: GraphicsQualityPreset;
  audio: {
    masterMuted: boolean;
    musicVolume: number; // 0..1
    sfxVolume: number; // 0..1
    voiceVolume: number; // 0..1
    ambientVolume: number; // 0..1
  };
}

export type CameraMode = 'director' | 'wide' | 'follow' | 'free-orbit';

export interface PerformanceTelemetry {
  fps: number;
  frameTimeMs: number;
  drawCalls: number;
  triangles: number;
  geometriesInMemory: number;
  texturesInMemory: number;
  jsHeapMb: number | null;
}
