import * as THREE from 'three';
import { createTextures } from './textures.js';
import { createMaterials } from './materials.js';
import {
  buildFrontSteps,
  computeDormerSpec,
  buildDormerUnit,
  buildChimneyUnit,
  buildPitchedDoorHood,
  buildFlushCrossGable,
  buildInnPorchAndProps,
  buildGreenhouseLeanTo,
  buildForgeShedAndHearth,
  buildKitchenGarden,
  buildWaterwheelAssembly,
  buildWindmillTowerAndSails,
  buildCoreShell,
  finalizeRoofTiles,
  mergeStatic,
} from './parts.js';

export const VILLAGE_BUILDING_SPECS = {
  inn: {
    id: 'inn',
    name: '1. Crossroads Inn & Bakery',
    x: -15.5,
    z: -14.5,
    y: 0.0,
    w: 10.4,
    d: 7.4,
    wallH: 5.75,
    roofH: 3.4,
    rotY: Math.atan2(15.5, 14.5),
    stories: 2,
    subDepth: 1.5,
    colliderPad: 0.6,
  },
  herbalist: {
    id: 'herbalist',
    name: '2. Apothecary & Herb Conservatory',
    x: 16.5,
    z: -13.5,
    y: 0.0,
    w: 8.6,
    d: 6.4,
    wallH: 4.45,
    roofH: 3.0,
    rotY: Math.atan2(-16.5, 13.5),
    stories: 1.5,
    subDepth: 1.5,
    colliderPad: 0.5,
  },
  smithy: {
    id: 'smithy',
    name: '3. Foothill Smithy & Cooperage',
    x: 16.8,
    z: 14.2,
    y: 0.0,
    w: 9.0,
    d: 6.8,
    wallH: 4.55,
    roofH: 3.1,
    rotY: Math.atan2(-16.8, -14.2),
    stories: 1.5,
    subDepth: 1.5,
    colliderPad: 0.5,
  },
  gardener: {
    id: 'gardener',
    name: '4. Shepherd & Gardener Cottage',
    x: -15.8,
    z: 14.8,
    y: 0.0,
    w: 8.2,
    d: 6.2,
    wallH: 4.1,
    roofH: 2.9,
    rotY: Math.atan2(15.8, -14.8),
    stories: 1,
    subDepth: 1.5,
    colliderPad: 0.5,
    gardenPatch: { ox: 6.5, oz: 0.0, w: 4.4, d: 5.6 },
  },
  watermill: {
    id: 'watermill',
    name: '5. Waterfall Stream Mill',
    x: -44.0,
    z: -18.0,
    y: 0.3,
    w: 7.8,
    d: 6.4,
    wallH: 4.75,
    roofH: 3.0,
    rotY: 0.42,
    stories: 1.5,
    subDepth: 2.6,
    colliderPad: 0.5,
  },
};

export const LINEUP_SPECS = [
  { ...VILLAGE_BUILDING_SPECS.inn, x: -31.5, y: 0, z: 0, rotY: 0.12 },
  { ...VILLAGE_BUILDING_SPECS.herbalist, x: -14.5, y: 0, z: 0, rotY: 0.08 },
  { ...VILLAGE_BUILDING_SPECS.smithy, x: 0.0, y: 0, z: 0, rotY: -0.08 },
  { ...VILLAGE_BUILDING_SPECS.gardener, x: 16.0, y: 0, z: 0, rotY: -0.1 },
  { ...VILLAGE_BUILDING_SPECS.watermill, x: 34.5, y: 0.3, z: 0, rotY: 0.12 },
];

export function createHousesKit(renderer = null) {
  const textures = createTextures(renderer);
  const materials = createMaterials(textures);

  function buildVillageBuilding(type, opts = {}) {
    const baseSpec = VILLAGE_BUILDING_SPECS[type] || VILLAGE_BUILDING_SPECS.inn;
    const spec = { ...baseSpec, ...opts };
    const { w, d, wallH, roofH, subDepth = 1.5, colliderPad = 0.5 } = spec;
    const plinthH = 0.55;
    const eaveY = plinthH + wallH;
    const ridgeY = eaveY + roofH;

    const group = new THREE.Group();
    group.name = `house-${type}`;
    if (opts.x !== undefined || opts.y !== undefined || opts.z !== undefined) {
      group.position.set(opts.x ?? 0, opts.y ?? 0, opts.z ?? 0);
    }
    if (opts.rotY !== undefined) {
      group.rotation.y = opts.rotY;
    }

    const add = (obj) => {
      group.add(obj);
      return obj;
    };
    const place = (obj, x, y, z, rotY = 0) => {
      obj.position.set(x, y, z);
      obj.rotation.y = rotY;
      group.add(obj);
      return obj;
    };

    const stepInfo = buildFrontSteps(add, materials, {
      doorX: 0,
      wallZ: d * 0.5,
      stepW: 2.24,
      subDepth,
    });

    let wheelGroup = null;
    let sailsGroup = null;

    if (type === 'inn') {
      const dormer = computeDormerSpec({
        x: 3.45,
        d,
        eaveY,
        ridgeY,
        width: 1.5,
        wallH: 1.0,
        rise: 0.82,
        seed: 140,
      });
      buildCoreShell(add, place, materials, {
        w,
        d,
        wallH,
        roofH,
        plinthH,
        subDepth,
        floorY: 3.24,
        winSideX: 3.68,
        upperWins: true,
        centerUpperWin: true,
        pilasters: true,
        seed: 100,
        skipFront: (pos) => {
          const gableSpan = 2.08 * (1 - Math.max(0, pos.y - (eaveY - 0.12)) / roofH) - 0.24;
          return Math.abs(pos.x) < gableSpan || dormer.skipFn(pos);
        },
      });
      buildFlushCrossGable(add, materials, {
        d,
        eaveY: eaveY - 0.12,
        ridgeY,
        halfW: 1.98,
        roofHalf: 2.28,
        seed: 130,
      });
      buildDormerUnit(add, place, materials, dormer);
      buildChimneyUnit(add, materials, { x: 3.85, z: -0.75, baseY: eaveY + 0.5, topY: ridgeY + 1.05 });
      buildInnPorchAndProps(add, materials, { d, plinthH, subDepth, seed: 150 });
    } else if (type === 'herbalist') {
      const dormer = computeDormerSpec({
        x: 1.72,
        d,
        eaveY,
        ridgeY,
        width: 1.54,
        wallH: 1.0,
        rise: 0.82,
        seed: 230,
      });
      buildCoreShell(add, place, materials, {
        w,
        d,
        wallH,
        roofH,
        plinthH,
        subDepth,
        floorY: 3.1,
        winSideX: 2.65,
        sideWinLeft: false,
        seed: 200,
        skipFront: dormer.skipFn,
      });
      buildDormerUnit(add, place, materials, dormer);
      buildChimneyUnit(add, materials, { x: -2.85, z: -0.6, baseY: eaveY + 0.4, topY: ridgeY + 0.95 });
      buildPitchedDoorHood(add, materials, { x: 0, y: 3.3, wallZ: d / 2, width: 2.22, rise: 0.56, depth: 0.94, seed: 240 });
      buildGreenhouseLeanTo(add, materials, { wallX: -w / 2, subDepth, seed: 250 });
    } else if (type === 'smithy') {
      const dormer = computeDormerSpec({
        x: -1.8,
        d,
        eaveY,
        ridgeY,
        width: 1.56,
        wallH: 1.02,
        rise: 0.84,
        seed: 330,
      });
      buildCoreShell(add, place, materials, {
        w,
        d,
        wallH,
        roofH,
        plinthH,
        subDepth,
        floorY: 3.12,
        winSideX: 2.8,
        sideWinRight: false,
        skipRightGableCenter: true,
        seed: 300,
        skipFront: dormer.skipFn,
      });
      buildDormerUnit(add, place, materials, dormer);
      buildPitchedDoorHood(add, materials, { x: 0, y: 3.32, wallZ: d / 2, width: 2.24, rise: 0.58, depth: 0.96, seed: 340 });
      buildForgeShedAndHearth(add, place, materials, { wallX: w / 2, ridgeY, subDepth, seed: 350 });
    } else if (type === 'gardener') {
      const dormer = computeDormerSpec({
        x: -1.62,
        d,
        eaveY,
        ridgeY,
        width: 1.52,
        wallH: 0.98,
        rise: 0.8,
        seed: 430,
      });
      buildCoreShell(add, place, materials, {
        w,
        d,
        wallH,
        roofH,
        plinthH,
        subDepth,
        floorY: 3.08,
        winSideX: 2.5,
        seed: 400,
        skipFront: dormer.skipFn,
      });
      buildDormerUnit(add, place, materials, dormer);
      buildChimneyUnit(add, materials, { x: -2.65, z: -0.58, baseY: eaveY + 0.35, topY: ridgeY + 0.9 });
      buildPitchedDoorHood(add, materials, { x: 0, y: 3.28, wallZ: d / 2, width: 2.22, rise: 0.56, depth: 0.96, seed: 440 });
      buildKitchenGarden(add, place, materials, {
        wallX: w / 2,
        gardenPatch: spec.gardenPatch || { ox: 6.5, oz: 0, w: 4.4, d: 5.6 },
        subDepth,
        seed: 450,
      });
    } else if (type === 'watermill') {
      const dormer = computeDormerSpec({
        x: 1.52,
        d,
        eaveY,
        ridgeY,
        width: 1.52,
        wallH: 1.0,
        rise: 0.82,
        seed: 530,
      });
      buildCoreShell(add, place, materials, {
        w,
        d,
        wallH,
        roofH,
        plinthH,
        subDepth: 2.6,
        floorY: 3.12,
        stoneLowerH: 2.55,
        winSideX: 2.42,
        sideWinLeft: false,
        seed: 500,
        skipFront: dormer.skipFn,
      });
      buildDormerUnit(add, place, materials, dormer);
      buildPitchedDoorHood(add, materials, { x: 0, y: 3.32, wallZ: d / 2, width: 2.2, rise: 0.56, depth: 0.94, seed: 540 });
      wheelGroup = buildWaterwheelAssembly(add, materials, {
        wallX: -w * 0.5,
        wheelX: -w * 0.5 - 0.72,
        wheelY: 0.85,
        subDepth: 2.6,
        inValley: Boolean(spec.inValley || spec.hasWaterwheel),
      });
      sailsGroup = buildWindmillTowerAndSails(add, materials, {
        wallX: w * 0.5,
        subDepth: 2.6,
      });
    }

    finalizeRoofTiles(add, materials);
    group.userData.plinthH = plinthH;
    group.userData.eaveY = eaveY;
    group.userData.ridgeY = ridgeY;
    mergeStatic(group, { outline: 0.018, materials, plinthH, eaveY });

    const cx = spec.x ?? 0;
    const cy = spec.y ?? 0;
    const cz = spec.z ?? 0;
    const rotY = spec.rotY ?? 0;
    const cos = Math.cos(rotY);
    const sin = Math.sin(rotY);

    const doorDist = stepInfo.z; // d * 0.5 + 1.35
    const doorWorldOffset = new THREE.Vector3(
      Math.sin(rotY) * doorDist,
      0,
      Math.cos(rotY) * doorDist,
    );
    doorWorldOffset.localX = 0;
    doorWorldOffset.localZ = doorDist;

    const collider = {
      id: spec.id || type,
      type: 'obb',
      x: cx,
      y: cy,
      z: cz,
      w,
      d,
      halfW: w * 0.5 + colliderPad,
      halfD: d * 0.5 + colliderPad,
      hx: w * 0.5 + colliderPad,
      hz: d * 0.5 + colliderPad,
      height: ridgeY,
      rotY,
    };

    const makeWingObb = (wing, lx, lz, hx, hz, height = eaveY) => {
      const wx = cx + lx * cos + lz * sin;
      const wz = cz - lx * sin + lz * cos;
      return {
        id: `${spec.id || type}-${wing}`,
        parentId: spec.id || type,
        wing,
        type: 'obb',
        x: wx,
        y: cy,
        z: wz,
        localX: lx,
        localZ: lz,
        w: hx * 2,
        d: hz * 2,
        halfW: hx,
        halfD: hz,
        hx,
        hz,
        height,
        rotY,
      };
    };

    const wingColliders = [];
    if (type === 'inn') {
      wingColliders.push(
        makeWingObb('porch-steps', 0, d * 0.5 + 1.15, 2.35, 1.25, 3.5),
        makeWingObb('outdoor-table', -3.55, d * 0.5 + 1.35, 1.15, 1.05, 1.2),
      );
    } else if (type === 'herbalist') {
      wingColliders.push(
        makeWingObb('conservatory', -w * 0.5 - 1.25, 0.2, 1.45, 2.35, 3.6),
        makeWingObb('front-steps', 0, d * 0.5 + 0.9, 1.3, 0.95, 1.0),
      );
    } else if (type === 'smithy') {
      wingColliders.push(
        makeWingObb('forge-shed', w * 0.5 + 1.75, 0.35, 1.85, 2.35, 4.3),
        makeWingObb('front-steps', 0, d * 0.5 + 0.9, 1.3, 0.95, 1.0),
      );
    } else if (type === 'gardener') {
      wingColliders.push(
        makeWingObb(
          'kitchen-garden',
          spec.gardenPatch?.ox ?? 6.5,
          spec.gardenPatch?.oz ?? 0,
          2.35,
          2.95,
          1.2,
        ),
        makeWingObb('front-steps', 0, d * 0.5 + 0.9, 1.3, 0.95, 1.0),
      );
    } else if (type === 'watermill') {
      wingColliders.push(
        makeWingObb('waterwheel', -w * 0.5 - 0.85, 0, 1.15, 2.45, 3.5),
        makeWingObb('front-steps', 0, d * 0.5 + 0.9, 1.3, 0.95, 1.0),
      );
    }

    const colliders = [collider, ...wingColliders];

    const update = (dt = 0) => {
      if (wheelGroup) wheelGroup.rotation.x += dt * 1.15;
      if (sailsGroup) sailsGroup.rotation.z -= dt * 0.65;
    };

    return { group, doorWorldOffset, collider, wingColliders, colliders, update };
  }

  function buildAllVillageBuildings(buildingsSpec = Object.values(VILLAGE_BUILDING_SPECS)) {
    const group = new THREE.Group();
    group.name = 'village-buildings';
    const buildings = [];
    const colliders = [];
    const updaters = [];

    for (const spec of buildingsSpec) {
      const id = spec.id || spec.type;
      const built = buildVillageBuilding(id, spec);
      group.add(built.group);
      buildings.push({ id, spec, ...built });
      colliders.push(...built.colliders);
      updaters.push(built.update);
    }

    // Batch all 5 static building shells, outlines, and roof tiles into <= 15 draw calls total
    mergeStatic(group, { outline: 0.018, materials });

    const update = (dt = 0) => {
      for (const fn of updaters) fn(dt);
    };

    return { group, buildings, colliders, update };
  }

  return {
    textures,
    materials,
    mats: materials,
    buildVillageBuilding,
    createBuilding: buildVillageBuilding,
    buildAllVillageBuildings,
  };
}
