import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  CheckCircle2,
  Download,
  FileCheck,
  Plus,
  Save,
  ShieldAlert,
  Sparkles,
  Trash2,
  Upload,
  UserCheck,
} from 'lucide-react';
import {
  AccessoryType,
  AIPersonalityType,
  CharacterDefinition,
  FighterAnimationState,
  HairStyle,
  PowerTier,
  WeaponArchetype,
} from '../types/game';
import { REQUIRED_ANIMATION_STATES } from '../data/characters';
import {
  deleteCustomCharacter,
  exportCharacterToGltfJson,
  upsertRegisteredCharacter,
  validateCharacterEligibility,
  validateGltfJsonAsset,
} from '../pipeline/assetPipeline';
import {
  ArticulatedCharacterRig,
  buildArticulatedAnimeCharacter,
  updateCharacterAnimation,
} from '../rendering/animeCharacterMesh';

interface CharacterStudioViewProps {
  roster: CharacterDefinition[];
  onRosterUpdated: (nextRoster: CharacterDefinition[]) => void;
  onBack: () => void;
}

export const CharacterStudioView: React.FC<CharacterStudioViewProps> = ({
  roster,
  onRosterUpdated,
  onBack,
}) => {
  const [selectedId, setSelectedId] = useState<string>(roster[0]?.id ?? 'char_kaelen');
  const [draft, setDraft] = useState<CharacterDefinition>(() =>
    JSON.parse(JSON.stringify(roster[0]))
  );
  const [previewAnim, setPreviewAnim] = useState<FighterAnimationState>('idle');
  const [previewAwakened, setPreviewAwakened] = useState<boolean>(false);
  const [previewGuarding, setPreviewGuarding] = useState<boolean>(false);
  const [activeStudioTab, setActiveStudioTab] = useState<
    'identity' | 'appearance' | 'combat' | 'ai' | 'pipeline'
  >('identity');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [importDiag, setImportDiag] = useState<string | null>(null);

  const previewContainerRef = useRef<HTMLDivElement | null>(null);
  const rigRef = useRef<ArticulatedCharacterRig | null>(null);
  const animStateRef = useRef<{
    state: FighterAnimationState;
    awakened: boolean;
    guarding: boolean;
  }>({
    state: 'idle',
    awakened: false,
    guarding: false,
  });

  useEffect(() => {
    animStateRef.current = {
      state: previewAnim,
      awakened: previewAwakened,
      guarding: previewGuarding,
    };
  }, [previewAnim, previewAwakened, previewGuarding]);

  // Select character from roster list
  const handleSelectCharacter = (char: CharacterDefinition) => {
    setSelectedId(char.id);
    setDraft(JSON.parse(JSON.stringify(char)));
    setStatusMessage(null);
  };

  // Create a brand-new Original Character template
  const handleCreateNewOriginal = () => {
    const newId = `char_custom_${Date.now().toString(36)}`;
    const template: CharacterDefinition = {
      ...JSON.parse(JSON.stringify(roster[0])),
      id: newId,
      name: 'Aurelia Astra',
      title: 'Starlight Valkyrie',
      universe: 'Original Studio Creation',
      isOriginal: true,
      biography:
        'An independently designed original anime warrior created in the Cataclysm Character Studio.',
      appearance: {
        primaryColor: '#8b5cf6',
        secondaryColor: '#0f172a',
        accentColor: '#38bdf8',
        hairColor: '#f472b6',
        eyeColor: '#38bdf8',
        skinTone: '#fde6d8',
        auraColor: '#8b5cf6',
        hairStyle: 'twintails',
        weapon: 'halberd',
        accessory: 'astral-halo',
        heightScale: 1.0,
      },
      assetMetadata: {
        modelPath: `/assets/models/${newId}.gltf`,
        format: 'gltf-2.0',
        provenanceType: 'original-verified',
        author: 'User Studio Creator',
        license: 'CC0-1.0',
        webHostingCleared: true,
        boneCount: 22,
        requiredBonesPresent: true,
        animationClipsPresent: REQUIRED_ANIMATION_STATES,
        textureQuality: 'high-cel-ramp',
      },
      enabledInPool: true,
    };
    const next = upsertRegisteredCharacter(template);
    onRosterUpdated(next);
    setSelectedId(newId);
    setDraft(template);
    setStatusMessage(`Created new original character "${template.name}" and added to registry!`);
  };

  const handleSaveCharacter = () => {
    const next = upsertRegisteredCharacter(draft);
    onRosterUpdated(next);
    setStatusMessage(`Saved "${draft.name}" to Character Registry & Random Battle Pool!`);
  };

  const handleDeleteCustom = () => {
    if (!draft.id.startsWith('char_custom_')) return;
    const next = deleteCustomCharacter(draft.id);
    onRosterUpdated(next);
    if (next.length > 0) {
      handleSelectCharacter(next[0]);
    }
    setStatusMessage('Deleted custom character.');
  };

  const handleExportGltf = () => {
    const json = exportCharacterToGltfJson(draft);
    const blob = new Blob([json], { type: 'model/gltf+json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${draft.id}.gltf`;
    a.click();
    URL.revokeObjectURL(url);
    setStatusMessage(`Exported Blender-compatible glTF 2.0 file: ${draft.id}.gltf`);
  };

  const handleImportGltfFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || '');
      const result = validateGltfJsonAsset(content);
      if (!result.valid) {
        setImportDiag(`Validation Failed: ${result.errors.join(' | ')}`);
        return;
      }
      if (result.extractedCharacter) {
        const importedChar: CharacterDefinition = {
          ...result.extractedCharacter,
          id: result.extractedCharacter.id || `char_custom_${Date.now().toString(36)}`,
        };
        const next = upsertRegisteredCharacter(importedChar);
        onRosterUpdated(next);
        setSelectedId(importedChar.id);
        setDraft(importedChar);
        setImportDiag(
          `Successfully validated & imported "${importedChar.name}" (${result.boneCount} bones, ${result.meshCount} mesh, ${result.animationClips.length} clips).`
        );
      } else {
        setDraft((prev) => ({
          ...prev,
          assetMetadata: {
            ...prev.assetMetadata,
            boneCount: result.boneCount,
            requiredBonesPresent: result.boneCount >= 20,
            animationClipsPresent: result.animationClips,
          },
        }));
        setImportDiag(
          `glTF 2.0 Rig Validated: ${result.boneCount} joints, ${result.meshCount} meshes, ${result.animationClips.length} animations.`
        );
      }
    };
    reader.readAsText(file);
  };

  // Interactive 3D Character Preview Canvas
  useEffect(() => {
    const container = previewContainerRef.current;
    if (!container) return;

    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#090d1b');

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    camera.position.set(0, 1.65, 4.2);
    camera.lookAt(0, 1.15, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight('#93c5fd', 1.1);
    const dir = new THREE.DirectionalLight('#fef08a', 1.6);
    dir.position.set(4, 8, 5);
    scene.add(ambient, dir);

    // Pedestal Turntable
    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(1.25, 1.4, 0.16, 32),
      new THREE.MeshStandardMaterial({
        color: '#1e293b',
        roughness: 0.4,
        metalness: 0.5,
      })
    );
    pedestal.position.set(0, -0.08, 0);
    scene.add(pedestal);

    const rig = buildArticulatedAnimeCharacter(draft, 'Ultra');
    rigRef.current = rig;
    scene.add(rig.root);

    let frameId = 0;
    const startTime = performance.now();

    const animate = (now: number) => {
      const elapsedSec = (now - startTime) / 1000;
      rig.root.rotation.y = Math.sin(elapsedSec * 0.65) * 0.55;
      updateCharacterAnimation(
        rig,
        animStateRef.current.state,
        elapsedSec,
        animStateRef.current.awakened,
        animStateRef.current.guarding
      );
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };
    frameId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frameId);
      renderer.dispose();
    };
  }, [draft.appearance, draft.id]);

  const validation = validateCharacterEligibility(draft);
  const eligibleCount = roster.filter(
    (c) => c.enabledInPool && validateCharacterEligibility(c).isEligible
  ).length;

  return (
    <div className="h-full w-full bg-slate-950 text-slate-100 flex flex-col overflow-hidden">
      {/* Studio Header */}
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
              <Sparkles className="w-4 h-4 text-violet-400" />
              Original Character Studio & Professional Asset Pipeline
            </h1>
            <p className="text-xs text-slate-400">
              Eligible Random Battle Pool:{' '}
              <span
                className={
                  eligibleCount >= 8
                    ? 'text-emerald-400 font-bold'
                    : 'text-rose-400 font-bold'
                }
              >
                {eligibleCount} / {roster.length} Fighters Active (Min 8 Required)
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleCreateNewOriginal}
            className="px-3.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            New Original Character
          </button>
          <button
            onClick={handleExportGltf}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Export glTF 2.0
          </button>
          <button
            onClick={handleSaveCharacter}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            Save Character
          </button>
        </div>
      </div>

      {statusMessage && (
        <div className="bg-emerald-500/15 border-b border-emerald-500/30 px-6 py-2 text-xs text-emerald-300 font-semibold flex items-center justify-between">
          <span>{statusMessage}</span>
          <button onClick={() => setStatusMessage(null)} className="text-emerald-200">
            ✕
          </button>
        </div>
      )}

      {/* Main 3-Column Studio Layout */}
      <div className="flex-1 grid grid-cols-12 min-h-0 overflow-hidden">
        {/* LEFT COLUMN (3 cols): Registered Character Roster */}
        <div className="col-span-3 border-r border-slate-800 bg-slate-900/50 p-4 overflow-y-auto space-y-2">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
            Registered Fighters ({roster.length})
          </div>
          {roster.map((c) => {
            const v = validateCharacterEligibility(c);
            const active = c.id === selectedId;
            return (
              <div
                key={c.id}
                onClick={() => handleSelectCharacter(c)}
                className={`p-3 rounded-xl border transition cursor-pointer ${
                  active
                    ? 'bg-violet-600/20 border-violet-500 text-white'
                    : 'bg-slate-900/80 border-slate-800 hover:border-slate-700 text-slate-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: c.appearance.primaryColor }}
                    />
                    <span className="text-xs font-bold truncate">{c.name}</span>
                  </div>
                  <span className="text-[10px] font-black px-2 py-0.5 rounded bg-slate-800 text-amber-300">
                    {c.attributes.powerTier}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-400">
                  <span className="truncate">{c.title}</span>
                  <span
                    className={
                      c.enabledInPool && v.isEligible
                        ? 'text-emerald-400 font-bold'
                        : 'text-rose-400 font-bold'
                    }
                  >
                    {c.enabledInPool && v.isEligible ? 'ELIGIBLE' : 'DISABLED'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* CENTER COLUMN (4 cols): Live 3D Rig & Animation Previewer + 9-Point Eligibility Gate */}
        <div className="col-span-4 border-r border-slate-800 bg-slate-950 p-4 flex flex-col gap-3 overflow-y-auto">
          <div className="relative h-72 w-full rounded-2xl overflow-hidden border border-slate-800 bg-slate-900">
            <div ref={previewContainerRef} className="w-full h-full" />
            <div className="absolute top-3 left-3 bg-slate-950/85 border border-slate-800 px-3 py-1 rounded-lg text-[11px] font-bold text-slate-200">
              3D Cel-Shader & Rig Turntable
            </div>
            <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2">
              <button
                onClick={() => setPreviewAwakened((a) => !a)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer ${
                  previewAwakened
                    ? 'bg-rose-600 text-white'
                    : 'bg-slate-900/90 text-slate-300 border border-slate-700'
                }`}
              >
                Awakening Aura: {previewAwakened ? 'ON' : 'OFF'}
              </button>
              <button
                onClick={() => setPreviewGuarding((g) => !g)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer ${
                  previewGuarding
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-slate-900/90 text-slate-300 border border-slate-700'
                }`}
              >
                Guard Barrier: {previewGuarding ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>

          {/* Animation State Tester */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-3">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
              Preview Skeletal Animation Clip ({REQUIRED_ANIMATION_STATES.length} States)
            </div>
            <div className="flex flex-wrap gap-1.5">
              {REQUIRED_ANIMATION_STATES.map((st) => (
                <button
                  key={st}
                  onClick={() => setPreviewAnim(st)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                    previewAnim === st
                      ? 'bg-violet-600 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          {/* 9-Point Character Eligibility Validator */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-3.5 flex-1">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-1.5">
                {validation.isEligible ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <ShieldAlert className="w-4 h-4 text-rose-400" />
                )}
                9-Point Eligibility Validation
              </span>
              <span
                className={`text-[10px] font-black px-2 py-0.5 rounded ${
                  validation.isEligible
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                }`}
              >
                {validation.isEligible ? 'PASSED ALL CHECKS' : 'INELIGIBLE'}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-1 text-[11px]">
              {Object.entries(validation.checks).map(([key, passed]) => (
                <div
                  key={key}
                  className="flex items-center justify-between py-1 px-2 rounded bg-slate-950/60"
                >
                  <span className="text-slate-300">
                    {key.replace(/([A-Z])/g, ' $1').toUpperCase()}
                  </span>
                  <span
                    className={
                      passed
                        ? 'text-emerald-400 font-bold'
                        : 'text-rose-400 font-bold'
                    }
                  >
                    {passed ? '✓ PASS' : '✕ FAIL'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN (5 cols): Multi-Tab Character & Asset Pipeline Editor */}
        <div className="col-span-5 bg-slate-900/40 p-5 flex flex-col min-h-0 overflow-y-auto">
          {/* Sub-navigation tabs */}
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 p-1 rounded-xl mb-4">
            {(
              [
                ['identity', 'Identity & Lore'],
                ['appearance', '3D Appearance'],
                ['combat', 'Stats & Skills'],
                ['ai', 'AI & Strategy'],
                ['pipeline', 'glTF & License'],
              ] as const
            ).map(([tabKey, label]) => (
              <button
                key={tabKey}
                onClick={() => setActiveStudioTab(tabKey)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  activeStudioTab === tabKey
                    ? 'bg-violet-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {activeStudioTab === 'identity' && (
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 font-semibold mb-1">
                  Character Name
                </label>
                <input
                  type="text"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-slate-400 font-semibold mb-1">
                  Epithet / Title
                </label>
                <input
                  type="text"
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-slate-400 font-semibold mb-1">
                  Origin Universe
                </label>
                <input
                  type="text"
                  value={draft.universe}
                  onChange={(e) => setDraft({ ...draft, universe: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-slate-400 font-semibold mb-1">
                  Biography & Lore
                </label>
                <textarea
                  rows={4}
                  value={draft.biography}
                  onChange={(e) =>
                    setDraft({ ...draft, biography: e.target.value })
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
                />
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-900 border border-slate-800">
                <div>
                  <div className="font-bold text-white">
                    Include in Random Battle Selection Pool
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Requires at least 8 enabled & validated characters across the roster.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={draft.enabledInPool}
                  onChange={(e) =>
                    setDraft({ ...draft, enabledInPool: e.target.checked })
                  }
                  className="w-5 h-5 accent-violet-500 cursor-pointer"
                />
              </div>

              {draft.id.startsWith('char_custom_') && (
                <button
                  onClick={handleDeleteCustom}
                  className="px-4 py-2 rounded-xl bg-rose-600/20 border border-rose-500/40 text-rose-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete Custom Character
                </button>
              )}
            </div>
          )}

          {activeStudioTab === 'appearance' && (
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">
                    Primary Outfit Color
                  </label>
                  <input
                    type="color"
                    value={draft.appearance.primaryColor}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        appearance: {
                          ...draft.appearance,
                          primaryColor: e.target.value,
                        },
                      })
                    }
                    className="w-full h-9 rounded-lg bg-slate-900 border border-slate-700 cursor-pointer"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">
                    Accent & Weapon Glow
                  </label>
                  <input
                    type="color"
                    value={draft.appearance.accentColor}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        appearance: {
                          ...draft.appearance,
                          accentColor: e.target.value,
                        },
                      })
                    }
                    className="w-full h-9 rounded-lg bg-slate-900 border border-slate-700 cursor-pointer"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">
                    Hair Color
                  </label>
                  <input
                    type="color"
                    value={draft.appearance.hairColor}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        appearance: {
                          ...draft.appearance,
                          hairColor: e.target.value,
                        },
                      })
                    }
                    className="w-full h-9 rounded-lg bg-slate-900 border border-slate-700 cursor-pointer"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">
                    Awakening Aura Color
                  </label>
                  <input
                    type="color"
                    value={draft.appearance.auraColor}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        appearance: {
                          ...draft.appearance,
                          auraColor: e.target.value,
                        },
                      })
                    }
                    className="w-full h-9 rounded-lg bg-slate-900 border border-slate-700 cursor-pointer"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">
                  3D Weapon Archetype
                </label>
                <select
                  value={draft.appearance.weapon}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      appearance: {
                        ...draft.appearance,
                        weapon: e.target.value as WeaponArchetype,
                      },
                    })
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
                >
                  {[
                    'odachi',
                    'grimoire',
                    'tonfa',
                    'halberd',
                    'greatbow',
                    'scythe',
                    'chakram',
                    'greaves',
                    'daggers',
                    'gauntlets',
                  ].map((w) => (
                    <option key={w} value={w}>
                      {w.toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">
                  Anime Hair Silhouette
                </label>
                <select
                  value={draft.appearance.hairStyle}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      appearance: {
                        ...draft.appearance,
                        hairStyle: e.target.value as HairStyle,
                      },
                    })
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
                >
                  {[
                    'spiky',
                    'twintails',
                    'cyber-swept',
                    'braided-crown',
                    'visor-crop',
                    'horned-mane',
                    'ribbon-long',
                    'headband-wild',
                    'gothic-bob',
                    'alchemist-crest',
                  ].map((h) => (
                    <option key={h} value={h}>
                      {h.toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">
                  Back Accessory / Wings / Halo
                </label>
                <select
                  value={draft.appearance.accessory}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      appearance: {
                        ...draft.appearance,
                        accessory: e.target.value as AccessoryType,
                      },
                    })
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
                >
                  {[
                    'cape',
                    'astral-halo',
                    'thunder-drums',
                    'solar-wings',
                    'tactical-cloak',
                    'abyss-mantle',
                    'chrono-ring',
                    'dragon-sash',
                    'rose-chains',
                    'runic-orbs',
                  ].map((a) => (
                    <option key={a} value={a}>
                      {a.toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {activeStudioTab === 'combat' && (
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">
                    Max HP ({draft.attributes.maxHp})
                  </label>
                  <input
                    type="range"
                    min={850}
                    max={1600}
                    step={10}
                    value={draft.attributes.maxHp}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        attributes: {
                          ...draft.attributes,
                          maxHp: Number(e.target.value),
                        },
                      })
                    }
                    className="w-full accent-violet-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">
                    Attack ({draft.attributes.attack})
                  </label>
                  <input
                    type="range"
                    min={75}
                    max={115}
                    value={draft.attributes.attack}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        attributes: {
                          ...draft.attributes,
                          attack: Number(e.target.value),
                        },
                      })
                    }
                    className="w-full accent-rose-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">
                    Defense ({draft.attributes.defense})
                  </label>
                  <input
                    type="range"
                    min={55}
                    max={105}
                    value={draft.attributes.defense}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        attributes: {
                          ...draft.attributes,
                          defense: Number(e.target.value),
                        },
                      })
                    }
                    className="w-full accent-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 font-semibold mb-1">
                    Speed ({draft.attributes.speed})
                  </label>
                  <input
                    type="range"
                    min={65}
                    max={105}
                    value={draft.attributes.speed}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        attributes: {
                          ...draft.attributes,
                          speed: Number(e.target.value),
                        },
                      })
                    }
                    className="w-full accent-cyan-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">
                  Hybrid Power Tier
                </label>
                <select
                  value={draft.attributes.powerTier}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      attributes: {
                        ...draft.attributes,
                        powerTier: e.target.value as PowerTier,
                      },
                    })
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
                >
                  <option value="S+">S+ Tier (Cataclysm Sovereign)</option>
                  <option value="S">S Tier (High Vanguard)</option>
                  <option value="A+">A+ Tier (Master Tactician)</option>
                </select>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-2">
                <div className="font-bold text-amber-400">
                  Signature & Ultimate Kit
                </div>
                <div>
                  <span className="text-slate-400">Basic Combo: </span>
                  <input
                    type="text"
                    value={draft.abilities.basicCombo.name}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        abilities: {
                          ...draft.abilities,
                          basicCombo: {
                            ...draft.abilities.basicCombo,
                            name: e.target.value,
                          },
                        },
                      })
                    }
                    className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-white ml-2"
                  />
                </div>
                <div>
                  <span className="text-slate-400">Signature Skill: </span>
                  <input
                    type="text"
                    value={draft.abilities.signatureSkill.name}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        abilities: {
                          ...draft.abilities,
                          signatureSkill: {
                            ...draft.abilities.signatureSkill,
                            name: e.target.value,
                          },
                        },
                      })
                    }
                    className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-white ml-2"
                  />
                </div>
                <div>
                  <span className="text-slate-400">Awakening Form: </span>
                  <input
                    type="text"
                    value={draft.abilities.awakening.name}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        abilities: {
                          ...draft.abilities,
                          awakening: {
                            ...draft.abilities.awakening,
                            name: e.target.value,
                          },
                        },
                      })
                    }
                    className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-white ml-2"
                  />
                </div>
                <div>
                  <span className="text-slate-400">Signature Ultimate: </span>
                  <input
                    type="text"
                    value={draft.abilities.ultimate.name}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        abilities: {
                          ...draft.abilities,
                          ultimate: {
                            ...draft.abilities.ultimate,
                            name: e.target.value,
                          },
                        },
                      })
                    }
                    className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-white ml-2"
                  />
                </div>
              </div>
            </div>
          )}

          {activeStudioTab === 'ai' && (
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 font-semibold mb-1">
                  Hybrid AI Personality Archetype
                </label>
                <select
                  value={draft.aiProfile.archetype}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      aiProfile: {
                        ...draft.aiProfile,
                        archetype: e.target.value as AIPersonalityType,
                      },
                    })
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
                >
                  {[
                    'Duelist',
                    'Schemer',
                    'Berserker',
                    'Guardian',
                    'Opportunist',
                    'Juggernaut',
                    'Tactician',
                    'Challenger',
                    'Executioner',
                    'Strategist',
                  ].map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">
                  Aggression Weight ({Math.round(draft.aiProfile.aggression * 100)}%)
                </label>
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={draft.aiProfile.aggression}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      aiProfile: {
                        ...draft.aiProfile,
                        aggression: Number(e.target.value),
                      },
                    })
                  }
                  className="w-full accent-rose-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">
                  Alliance Formation Tendency (
                  {Math.round(draft.aiProfile.allianceTendency * 100)}%)
                </label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={draft.aiProfile.allianceTendency}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      aiProfile: {
                        ...draft.aiProfile,
                        allianceTendency: Number(e.target.value),
                      },
                    })
                  }
                  className="w-full accent-amber-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">
                  Alliance Loyalty / Honor ({Math.round(draft.aiProfile.loyalty * 100)}%)
                </label>
                <input
                  type="range"
                  min={0.05}
                  max={1}
                  step={0.05}
                  value={draft.aiProfile.loyalty}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      aiProfile: {
                        ...draft.aiProfile,
                        loyalty: Number(e.target.value),
                      },
                    })
                  }
                  className="w-full accent-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-semibold mb-1">
                  Strategic Objective Directive
                </label>
                <textarea
                  rows={3}
                  value={draft.aiProfile.strategicObjective}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      aiProfile: {
                        ...draft.aiProfile,
                        strategicObjective: e.target.value,
                      },
                    })
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
                />
              </div>
            </div>
          )}

          {activeStudioTab === 'pipeline' && (
            <div className="space-y-3 text-xs">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-1.5">
                <div className="font-bold text-white flex items-center gap-1.5">
                  <FileCheck className="w-4 h-4 text-violet-400" />
                  Asset Manifest & Provenance Record
                </div>
                <p className="text-slate-400">
                  Model Path:{' '}
                  <span className="font-mono text-slate-200">
                    {draft.assetMetadata.modelPath}
                  </span>
                </p>
                <p className="text-slate-400">
                  Format:{' '}
                  <span className="font-mono text-slate-200">
                    {draft.assetMetadata.format}
                  </span>{' '}
                  • Skeleton Joints:{' '}
                  <span className="font-mono text-emerald-400">
                    {draft.assetMetadata.boneCount} Bones
                  </span>
                </p>
                <p className="text-slate-400">
                  License:{' '}
                  <span className="font-mono text-amber-300">
                    {draft.assetMetadata.license}
                  </span>{' '}
                  • Author: {draft.assetMetadata.author}
                </p>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
                <label className="block font-bold text-white mb-1 flex items-center gap-1.5">
                  <Upload className="w-4 h-4 text-emerald-400" />
                  Import & Validate Blender glTF 2.0 Asset (.gltf / .json)
                </label>
                <p className="text-[11px] text-slate-400 mb-2">
                  Pipeline Order: Blender → Validation → Game Integration → Browser Rendering
                </p>
                <input
                  type="file"
                  accept=".gltf,.json"
                  onChange={handleImportGltfFile}
                  className="w-full text-xs text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-violet-600 file:text-white hover:file:bg-violet-500 cursor-pointer"
                />
                {importDiag && (
                  <p className="mt-2 p-2 rounded bg-slate-950 border border-slate-800 text-[11px] text-emerald-300">
                    {importDiag}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
