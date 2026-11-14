import * as THREE from 'three';
import {
  CharacterDefinition,
  FighterAnimationState,
  GraphicsQualityPreset,
} from '../types/game';

let cachedToonGradientMap: THREE.DataTexture | null = null;

/**
 * Generates a crisp 4-band anime cel-shading ramp texture using NearestFilter.
 */
export function getAnimeCelGradientMap(): THREE.DataTexture {
  if (cachedToonGradientMap) return cachedToonGradientMap;
  const colors = new Uint8Array([
    68, 68, 78, 255,   // Deep anime shadow band
    138, 138, 152, 255, // Mid-shadow band
    215, 215, 228, 255, // Lit band
    255, 255, 255, 255, // Specular rim band
  ]);
  const texture = new THREE.DataTexture(colors, 4, 1, THREE.RGBAFormat);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  cachedToonGradientMap = texture;
  return texture;
}

export interface ArticulatedCharacterRig {
  characterId: string;
  root: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  hair: THREE.Group;
  accessory: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  weapon: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  auraRing: THREE.Mesh;
  awakeningCorona: THREE.Mesh;
  guardDome: THREE.Mesh;
  targetLine?: THREE.Line;
}

function createCelMaterial(hexColor: string, emissiveHex?: string, emissiveIntensity = 0.15): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({
    color: new THREE.Color(hexColor),
    gradientMap: getAnimeCelGradientMap(),
    emissive: emissiveHex ? new THREE.Color(emissiveHex) : new THREE.Color(hexColor),
    emissiveIntensity,
  });
}

function addOutlineSubmesh(mesh: THREE.Mesh, thickness = 0.032): void {
  const outlineMat = new THREE.MeshBasicMaterial({
    color: 0x070912,
    side: THREE.BackSide,
  });
  const outline = new THREE.Mesh(mesh.geometry, outlineMat);
  outline.scale.setScalar(1 + thickness);
  outline.name = 'cel_outline';
  mesh.add(outline);
}

export function buildArticulatedAnimeCharacter(
  def: CharacterDefinition,
  quality: GraphicsQualityPreset = 'Ultra'
): ArticulatedCharacterRig {
  const enableOutlines = quality === 'Ultra' || quality === 'High';
  const segs = quality === 'Low' ? 8 : quality === 'Medium' ? 12 : 16;

  const root = new THREE.Group();
  root.name = `Fighter_${def.id}`;
  const scale = def.appearance.heightScale || 1.0;
  root.scale.setScalar(scale);

  const primaryMat = createCelMaterial(def.appearance.primaryColor, def.appearance.primaryColor, 0.14);
  const secondaryMat = createCelMaterial(def.appearance.secondaryColor, '#000000', 0.04);
  const accentMat = createCelMaterial(def.appearance.accentColor, def.appearance.accentColor, 0.35);
  const skinMat = createCelMaterial(def.appearance.skinTone, def.appearance.skinTone, 0.06);
  const hairMat = createCelMaterial(def.appearance.hairColor, def.appearance.hairColor, 0.18);

  const hips = new THREE.Group();
  hips.position.set(0, 0.95, 0);
  root.add(hips);

  // --- TORSO & ANIME COAT ---
  const torso = new THREE.Group();
  hips.add(torso);

  const chestMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.21, 0.68, segs),
    secondaryMat
  );
  chestMesh.position.set(0, 0.34, 0);
  chestMesh.castShadow = quality !== 'Low';
  if (enableOutlines) addOutlineSubmesh(chestMesh, 0.04);
  torso.add(chestMesh);

  // Anime Jacket / Armor Mantle
  const coatFlair = new THREE.Mesh(
    new THREE.ConeGeometry(0.38, 0.56, segs, 1, true),
    primaryMat
  );
  coatFlair.position.set(0, 0.05, 0);
  torso.add(coatFlair);

  // Glowing Astral Core Crest on Chest
  const chestCore = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.1, 0),
    accentMat
  );
  chestCore.position.set(0, 0.44, 0.25);
  torso.add(chestCore);

  // --- HEAD, ANIME EYES & STYLIZED HAIR ---
  const head = new THREE.Group();
  head.position.set(0, 0.82, 0);
  torso.add(head);

  const headSphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, segs, segs),
    skinMat
  );
  headSphere.scale.set(0.95, 1.05, 0.96);
  headSphere.castShadow = quality !== 'Low';
  if (enableOutlines) addOutlineSubmesh(headSphere, 0.045);
  head.add(headSphere);

  // Glowing Anime Eyes
  const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(def.appearance.eyeColor) });
  const eyeGeo = new THREE.BoxGeometry(0.065, 0.045, 0.03);
  const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
  leftEye.position.set(-0.08, 0.02, 0.22);
  const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
  rightEye.position.set(0.08, 0.02, 0.22);
  head.add(leftEye, rightEye);

  // Distinct Hair Silhouette
  const hair = new THREE.Group();
  head.add(hair);

  const hairCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.255, segs, segs, 0, Math.PI * 2, 0, Math.PI * 0.65),
    hairMat
  );
  hairCap.position.set(0, 0.03, -0.02);
  hair.add(hairCap);

  if (def.appearance.hairStyle === 'twintails') {
    for (const side of [-1, 1]) {
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.72, 8), hairMat);
      tail.position.set(side * 0.28, -0.18, -0.1);
      tail.rotation.z = side * 0.35;
      tail.rotation.x = 0.25;
      hair.add(tail);
    }
  } else if (def.appearance.hairStyle === 'horned-mane') {
    const hornMat = createCelMaterial('#1f2937', def.appearance.accentColor, 0.4);
    for (const side of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.38, 8), hornMat);
      horn.position.set(side * 0.16, 0.28, 0.05);
      horn.rotation.z = -side * 0.35;
      horn.rotation.x = -0.2;
      hair.add(horn);
    }
  } else {
    // Stylized anime hair spikes
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.32, 6), hairMat);
      spike.position.set(Math.sin(angle) * 0.18, 0.18, Math.cos(angle) * 0.16 - 0.04);
      spike.rotation.x = Math.cos(angle) * 0.55 - 0.2;
      spike.rotation.z = -Math.sin(angle) * 0.55;
      hair.add(spike);
    }
  }

  // --- DISTINCTIVE BACK ACCESSORY / WINGS / HALO / CAPE ---
  const accessory = new THREE.Group();
  accessory.position.set(0, 0.55, -0.22);
  torso.add(accessory);

  if (def.appearance.accessory === 'astral-halo' || def.appearance.accessory === 'chrono-ring') {
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(0.55, 0.035, 8, 24),
      accentMat
    );
    halo.position.set(0, 0.25, -0.15);
    accessory.add(halo);
  } else if (def.appearance.accessory === 'solar-wings') {
    for (const side of [-1, 1]) {
      for (let w = 0; w < 3; w++) {
        const wingBlade = new THREE.Mesh(
          new THREE.BoxGeometry(0.68 - w * 0.12, 0.09, 0.03),
          accentMat
        );
        wingBlade.position.set(side * (0.38 + w * 0.06), 0.18 - w * 0.16, -0.1);
        wingBlade.rotation.z = side * (0.35 - w * 0.22);
        accessory.add(wingBlade);
      }
    }
  } else if (def.appearance.accessory === 'thunder-drums' || def.appearance.accessory === 'runic-orbs') {
    for (let d = 0; d < 5; d++) {
      const a = (d / 5) * Math.PI * 1.4 - Math.PI * 0.2;
      const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), accentMat);
      orb.position.set(Math.cos(a) * 0.52, Math.sin(a) * 0.52 + 0.15, -0.15);
      accessory.add(orb);
    }
  } else {
    // Flowing Anime Cape / Mantle
    const capeGeo = new THREE.BoxGeometry(0.58, 0.95, 0.04);
    const capeMesh = new THREE.Mesh(capeGeo, primaryMat);
    capeMesh.position.set(0, -0.35, -0.06);
    capeMesh.rotation.x = 0.18;
    accessory.add(capeMesh);
  }

  // --- ARMS & WEAPONS ---
  const leftArm = new THREE.Group();
  leftArm.position.set(-0.34, 0.58, 0);
  torso.add(leftArm);

  const leftArmMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.075, 0.065, 0.56, 8),
    primaryMat
  );
  leftArmMesh.position.set(0, -0.24, 0);
  leftArm.add(leftArmMesh);

  const rightArm = new THREE.Group();
  rightArm.position.set(0.34, 0.58, 0);
  torso.add(rightArm);

  const rightArmMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.075, 0.065, 0.56, 8),
    primaryMat
  );
  rightArmMesh.position.set(0, -0.24, 0);
  rightArm.add(rightArmMesh);

  // Weapon Group attached to Right Hand
  const weapon = new THREE.Group();
  weapon.position.set(0, -0.5, 0.12);
  rightArm.add(weapon);

  buildWeaponMesh(weapon, def.appearance.weapon, accentMat, secondaryMat);

  // --- LEGS ---
  const leftLeg = new THREE.Group();
  leftLeg.position.set(-0.14, 0, 0);
  hips.add(leftLeg);

  const leftLegMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.095, 0.075, 0.88, 8),
    secondaryMat
  );
  leftLegMesh.position.set(0, -0.44, 0);
  leftLeg.add(leftLegMesh);

  const rightLeg = new THREE.Group();
  rightLeg.position.set(0.14, 0, 0);
  hips.add(rightLeg);

  const rightLegMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.095, 0.075, 0.88, 8),
    secondaryMat
  );
  rightLegMesh.position.set(0, -0.44, 0);
  rightLeg.add(rightLegMesh);

  // --- GROUND SELECTION / FACTION RING & AWAKENING AURA ---
  const auraRing = new THREE.Mesh(
    new THREE.RingGeometry(0.68, 0.86, 24),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(def.appearance.primaryColor),
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.75,
    })
  );
  auraRing.rotation.x = -Math.PI / 2;
  auraRing.position.set(0, 0.04, 0);
  root.add(auraRing);

  const awakeningCorona = new THREE.Mesh(
    new THREE.CylinderGeometry(0.65, 0.85, 2.2, 16, 1, true),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(def.appearance.auraColor),
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  awakeningCorona.position.set(0, 1.1, 0);
  awakeningCorona.visible = false;
  root.add(awakeningCorona);

  const guardDome = new THREE.Mesh(
    new THREE.SphereGeometry(1.15, 16, 12),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(def.appearance.accentColor),
      wireframe: true,
      transparent: true,
      opacity: 0.55,
    })
  );
  guardDome.position.set(0, 1.05, 0);
  guardDome.visible = false;
  root.add(guardDome);

  return {
    characterId: def.id,
    root,
    hips,
    torso,
    head,
    hair,
    accessory,
    leftArm,
    rightArm,
    weapon,
    leftLeg,
    rightLeg,
    auraRing,
    awakeningCorona,
    guardDome,
  };
}

function buildWeaponMesh(
  weaponGroup: THREE.Group,
  weaponType: CharacterDefinition['appearance']['weapon'],
  accentMat: THREE.Material,
  darkMat: THREE.Material
): void {
  if (weaponType === 'odachi') {
    const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.35, 8), darkMat);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.45, 0.08), accentMat);
    blade.position.set(0, 0.85, 0);
    weaponGroup.add(hilt, blade);
    weaponGroup.rotation.x = Math.PI * 0.38;
  } else if (weaponType === 'scythe') {
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.85, 8), darkMat);
    shaft.position.set(0, 0.45, 0);
    const crescent = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.95, 6), accentMat);
    crescent.position.set(0, 1.35, 0.38);
    crescent.rotation.x = Math.PI * 0.55;
    weaponGroup.add(shaft, crescent);
    weaponGroup.rotation.x = Math.PI * 0.25;
  } else if (weaponType === 'halberd') {
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 1.75, 8), darkMat);
    shaft.position.set(0, 0.45, 0);
    const spearTip = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.55, 6), accentMat);
    spearTip.position.set(0, 1.45, 0);
    weaponGroup.add(shaft, spearTip);
    weaponGroup.rotation.x = Math.PI * 0.3;
  } else if (weaponType === 'greatbow') {
    const bowArc = new THREE.Mesh(
      new THREE.TorusGeometry(0.55, 0.035, 8, 18, Math.PI),
      accentMat
    );
    bowArc.rotation.z = -Math.PI / 2;
    weaponGroup.add(bowArc);
  } else if (weaponType === 'grimoire') {
    const book = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.42, 0.08), accentMat);
    book.position.set(0.15, 0.35, 0.35);
    weaponGroup.add(book);
  } else if (weaponType === 'chakram') {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.04, 8, 20), accentMat);
    weaponGroup.add(ring);
  } else {
    // Gauntlets / Tonfa / Daggers / Greaves
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.65, 0.14), accentMat);
    blade.position.set(0, 0.2, 0.1);
    weaponGroup.add(blade);
    weaponGroup.rotation.x = Math.PI * 0.4;
  }
}

/**
 * Procedural Skeletal Animation Driver for all 13 FighterAnimationStates.
 */
export function updateCharacterAnimation(
  rig: ArticulatedCharacterRig,
  animState: FighterAnimationState,
  elapsedSec: number,
  isAwakened: boolean,
  isGuarding: boolean
): void {
  const phase = elapsedSec * 7.5 + rig.characterId.charCodeAt(5);

  rig.awakeningCorona.visible = isAwakened && animState !== 'eliminated';
  if (rig.awakeningCorona.visible) {
    rig.awakeningCorona.rotation.y = elapsedSec * 3.2;
    const pulse = 1 + Math.sin(elapsedSec * 9) * 0.08;
    rig.awakeningCorona.scale.set(pulse, 1, pulse);
  }

  rig.guardDome.visible = isGuarding && animState !== 'eliminated';
  if (rig.guardDome.visible) {
    rig.guardDome.rotation.y = -elapsedSec * 2.5;
  }

  if (animState === 'eliminated') {
    // Non-graphic fallen kneel/dissolution pose
    rig.hips.position.y = 0.32;
    rig.torso.rotation.x = 0.55;
    rig.leftArm.rotation.x = 0.4;
    rig.rightArm.rotation.x = 0.4;
    rig.leftLeg.rotation.x = -1.2;
    rig.rightLeg.rotation.x = -1.1;
    rig.auraRing.visible = false;
    return;
  }

  rig.auraRing.visible = true;
  rig.accessory.rotation.x = 0.15 + Math.sin(phase * 0.8) * 0.12;

  switch (animState) {
    case 'move': {
      rig.hips.position.y = 0.93 + Math.abs(Math.sin(phase * 1.4)) * 0.08;
      rig.torso.rotation.x = 0.22; // Anime sprint lean
      rig.torso.rotation.y = Math.sin(phase * 1.4) * 0.12;
      rig.leftLeg.rotation.x = Math.sin(phase * 1.4) * 0.75;
      rig.rightLeg.rotation.x = -Math.sin(phase * 1.4) * 0.75;
      rig.leftArm.rotation.x = -Math.sin(phase * 1.4) * 0.65;
      rig.rightArm.rotation.x = Math.sin(phase * 1.4) * 0.55 - 0.3;
      break;
    }
    case 'basicCombo': {
      rig.hips.position.y = 0.9;
      rig.torso.rotation.x = 0.18;
      rig.torso.rotation.y = Math.sin(elapsedSec * 28) * 0.65;
      rig.rightArm.rotation.x = -1.4 + Math.cos(elapsedSec * 28) * 0.95;
      rig.rightArm.rotation.z = -0.35;
      rig.leftArm.rotation.x = -0.5;
      break;
    }
    case 'heavyAttack':
    case 'signatureSkill': {
      rig.hips.position.y = 1.05;
      rig.torso.rotation.x = -0.15;
      rig.torso.rotation.y = Math.sin(elapsedSec * 18) * 0.85;
      rig.rightArm.rotation.x = -2.1 + Math.sin(elapsedSec * 20) * 1.2;
      rig.leftArm.rotation.x = -1.2;
      break;
    }
    case 'ultimate': {
      // Dramatic aerial ascension pose during Ultimate
      rig.hips.position.y = 2.15 + Math.sin(elapsedSec * 12) * 0.25;
      rig.torso.rotation.x = -0.25;
      rig.torso.rotation.y = elapsedSec * 6.0;
      rig.leftArm.rotation.z = -0.85;
      rig.rightArm.rotation.z = 0.85;
      rig.rightArm.rotation.x = -1.8;
      break;
    }
    case 'awakening': {
      rig.hips.position.y = 1.45;
      rig.torso.rotation.x = -0.35;
      rig.leftArm.rotation.z = -1.1;
      rig.rightArm.rotation.z = 1.1;
      break;
    }
    case 'movementSkill': {
      rig.hips.position.y = 1.15;
      rig.torso.rotation.x = 0.48;
      rig.leftLeg.rotation.x = -0.6;
      rig.rightLeg.rotation.x = 0.5;
      break;
    }
    case 'defend':
    case 'counter': {
      rig.hips.position.y = 0.86;
      rig.torso.rotation.x = 0.1;
      rig.rightArm.rotation.x = -1.35;
      rig.rightArm.rotation.z = 0.55;
      rig.leftArm.rotation.x = -1.2;
      break;
    }
    case 'hit': {
      rig.hips.position.y = 0.92;
      rig.torso.rotation.x = -0.32;
      rig.leftArm.rotation.x = 0.35;
      rig.rightArm.rotation.x = 0.35;
      break;
    }
    case 'victory': {
      rig.hips.position.y = 0.98 + Math.sin(phase * 0.6) * 0.04;
      rig.torso.rotation.x = -0.12;
      rig.torso.rotation.y = Math.sin(phase * 0.4) * 0.2;
      rig.rightArm.rotation.x = -2.45; // Raised weapon triumphantly
      rig.leftArm.rotation.z = -0.35;
      break;
    }
    case 'idle':
    default: {
      rig.hips.position.y = 0.95 + Math.sin(phase * 0.5) * 0.03;
      rig.torso.rotation.x = 0.04;
      rig.torso.rotation.y = Math.sin(phase * 0.35) * 0.08;
      rig.leftArm.rotation.x = Math.sin(phase * 0.5) * 0.12;
      rig.rightArm.rotation.x = -0.25 + Math.cos(phase * 0.5) * 0.12;
      rig.leftLeg.rotation.x = 0;
      rig.rightLeg.rotation.x = 0;
      break;
    }
  }
}
