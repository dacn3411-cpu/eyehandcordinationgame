/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import { buildBarrierObstacle, buildContainerObstacle, buildDroneObstacle } from './valorantKit';
import { createReinforcedCoverBox } from './courtyardKit';
import {
  ARENA,
  ColliderShape,
  computeLaserTrackSpecForDifficulty,
  computeMissionBracketVisualState,
  DIFFICULTY_CONFIG,
  generateIndoorRangeTargetSlots,
  isWorldTargetAllowedForMode,
  LaserTrackDifficultySpec,
  PALETTE,
  SpawnDirectionSector,
  TargetTypeId,
  TARGET_TYPES,
  TRAINING_MODES,
  TrainingModeId,
  validateLaserTrackWorldBounds,
} from './rules';
import {
  addCartoonOutline,
  buildHologramTargetMesh,
  createToonMat,
  FrameShapeKind,
  getShapeKindForType,
  SpawnAnchor,
  TargetVisualBuild,
} from './worldBuilder';

export interface SpawnNotificationEvent {
  typeId: TargetTypeId;
  sector: SpawnDirectionSector;
  isOffscreen: boolean;
  x: number;
  y: number;
  z: number;
}

export interface ActiveTargetInstance {
  instanceId: string;
  groupId: string | null;
  typeId: TargetTypeId;
  visualColor: string;
  shapeKind: FrameShapeKind;
  isMissionCorrect: boolean;
  anchorId: string | null;
  spawnSector: SpawnDirectionSector;
  wasRearOrOffscreenSpawn: boolean;
  unseenDurationSec: number;
  hintCounted: boolean;
  baseX: number;
  baseY: number;
  baseZ: number;
  diameter: number;
  difficulty: number;
  speed: number;
  lifetime: number;
  age: number;
  pattern: number;
  moveDirX: number;
  moveDirY: number;
  moveAxis: 'x' | 'y';
  turnTimer: number;
  nextTurnInterval: number;
  lissajousFreqX: number;
  lissajousFreqY: number;
  lissajousFreqZ: number;
  phaseOffset: number;
  isGolden: boolean;
  hit: boolean;
  dying: boolean;
  dyingTimer: number;
  shakeTimer: number;
  firstSeenTimeMs: number | null;
  spawnTimeMs: number;
  laserTrackSpec?: LaserTrackDifficultySpec;
  laserProgress: number;
  isIndoorChallengeTarget?: boolean;
  /** Map mode: how far this target may fly before it would enter a wall (measured once when it appears). */
  flightLimits?: { minX: number; maxX: number; zRoomNeg: number; zRoomPos: number };
  /** Map mode: seconds the target has been hidden behind map geometry from the player's eye. */
  hiddenSec?: number;
  /** Map mode: seconds hidden since the target was last seen (turning around did not bring it back). */
  hiddenTotalSec?: number;
  losCheckTimer?: number;
  visual: TargetVisualBuild;
}

/**
 * How far a target can travel from `origin` along `dir` before it would touch map geometry:
 * the closest hit at the target's centre and at its top/bottom (`heights`), minus `margin`, capped at `maxDist`.
 */
export function measureFlightRoom(params: {
  origin: THREE.Vector3;
  dir: THREE.Vector3;
  maxDist: number;
  margin: number;
  obstacles: THREE.Object3D[];
  raycaster?: THREE.Raycaster;
  heights?: number[];
}): number {
  const { origin, dir, maxDist, margin, obstacles } = params;
  if (obstacles.length === 0) return maxDist;
  const ray = params.raycaster ?? new THREE.Raycaster();
  const d = dir.clone().normalize();
  let room = maxDist;
  for (const h of params.heights ?? [0]) {
    ray.set(new THREE.Vector3(origin.x, origin.y + h, origin.z), d);
    ray.near = 0;
    ray.far = maxDist + margin;
    const hit = ray.intersectObjects(obstacles, true)[0];
    if (hit) room = Math.min(room, Math.max(0, hit.distance - margin));
  }
  return room;
}

export interface GGroupMissionInfo {
  groupId: string;
  mode: 'color' | 'shape' | 'both';
  targetColorHex: string;
  targetColorName: string;
  targetShapeKind: FrameShapeKind;
  targetShapeName: string;
  remainingCorrect: number;
}

const COLOR_CHOICES: Array<{ hex: string; name: string }> = [
  { hex: PALETTE.cyan, name: '시안' },
  { hex: PALETTE.magenta, name: '마젠타' },
  { hex: PALETTE.orange, name: '주황' },
  { hex: PALETTE.blue, name: '파랑' },
  { hex: PALETTE.lime, name: '연두' },
  { hex: PALETTE.yellow, name: '노랑' },
];

const SHAPE_CHOICES: Array<{ kind: FrameShapeKind; name: string }> = [
  { kind: 'shield', name: '방패 사각' },
  { kind: 'circle', name: '원형' },
  { kind: 'diamond', name: '마름모' },
  { kind: 'hexagon', name: '육각형' },
  { kind: 'star', name: '오각 별' },
];

function easeOutBack(x: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

export class TargetAndObstacleManager {
  public scene: THREE.Scene;
  public anchors: SpawnAnchor[];
  public lowQuality: boolean;
  public activeTargets: ActiveTargetInstance[] = [];
  public currentGMission: GGroupMissionInfo | null = null;
  public unshotEventSeenTimeMs: number | null = null;

  public activeObstacles: ActiveObstacleInstance[] = [];
  public staticLevelObstacles: THREE.Object3D[] = [];
  public staticLevelColliders: ColliderShape[] = [];
  public baseArenaColliders: ColliderShape[] = [];
  public environmentObstacles: THREE.Object3D[] = [];
  public indoorEnvironmentObstacles: THREE.Object3D[] = [];
  public isIndoorChallengeActive = false;
  /**
   * 'arena': the built-in arena's fixed flight bounds. 'map': a loaded .glb map, where flying targets
   * keep to their own spawn area, turn back before walls and turn around when they hide behind cover.
   */
  public flightBoundsMode: 'arena' | 'map' = 'arena';

  private suspendedArenaTargets: ActiveTargetInstance[] = [];
  private suspendedArenaObstacles: ActiveObstacleInstance[] = [];
  private suspendedGMission: GGroupMissionInfo | null = null;
  private suspendedSpawnTimer = 0.6;

  private nextTargetCounter = 1;
  private spawnTimer = 0.6;
  private losRaycaster = new THREE.Raycaster();
  private cachedObstacleBoxes: THREE.Box3[] | null = null;

  constructor(
    scene: THREE.Scene,
    anchors: SpawnAnchor[],
    lowQuality: boolean,
    environmentObstacles: THREE.Object3D[] = [],
    baseArenaColliders: ColliderShape[] = [],
    indoorEnvironmentObstacles: THREE.Object3D[] = [],
  ) {
    this.scene = scene;
    this.anchors = anchors;
    this.lowQuality = lowQuality;
    this.environmentObstacles = environmentObstacles;
    this.baseArenaColliders = baseArenaColliders;
    this.indoorEnvironmentObstacles = indoorEnvironmentObstacles;
  }

  public setBaseArenaColliders(colliders: ColliderShape[]) {
    this.baseArenaColliders = colliders;
    this.cachedObstacleBoxes = null;
  }

  private getObstacleBoxesWithMargin(margin: number): THREE.Box3[] {
    if (!this.cachedObstacleBoxes) {
      const boxes: THREE.Box3[] = [];
      for (const obs of this.environmentObstacles) {
        obs.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(obs);
        if (box.isEmpty()) continue;
        // Skip flat ground floor plane so elevated air tracks are judged against 1.0m minY + walls/pillars/crates
        const sizeX = box.max.x - box.min.x;
        const sizeZ = box.max.z - box.min.z;
        if (box.max.y <= 0.35 && sizeX > 22 && sizeZ > 22) continue;
        boxes.push(box);
      }
      this.cachedObstacleBoxes = boxes;
    }
    const allBoxes = this.cachedObstacleBoxes.map((b) => b.clone().expandByScalar(margin));
    for (const sObs of this.staticLevelObstacles) {
      sObs.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(sObs);
      if (!box.isEmpty()) {
        allBoxes.push(box.expandByScalar(margin));
      }
    }
    return allBoxes;
  }

  private isLaserTrackPlacementValid(params: {
    cx: number;
    cy: number;
    cz: number;
    px: number;
    pz: number;
    spec: LaserTrackDifficultySpec;
    eyeOrigin: THREE.Vector3;
    obstacleBoxes: THREE.Box3[];
  }): boolean {
    const { cx, cy, cz, px, pz, spec, eyeOrigin, obstacleBoxes } = params;
    const allColliders = [...this.baseArenaColliders, ...this.staticLevelColliders];
    const boundsRes = validateLaserTrackWorldBounds({
      centerX: cx,
      centerY: cy,
      centerZ: cz,
      playerX: px,
      playerZ: pz,
      spec,
      colliders: allColliders,
      margin: 0.55,
      minY: 1.0,
      maxY: 6.8,
      sampleChecks: 14,
    });
    if (!boundsRes.valid) return false;

    const tmpPt = new THREE.Vector3();
    for (const wp of boundsRes.worldTestPoints) {
      tmpPt.set(wp.x, wp.y, wp.z);
      for (const box of obstacleBoxes) {
        if (box.containsPoint(tmpPt)) {
          return false;
        }
      }
    }

    // Guarantee Line-of-Sight from eyeOrigin to start, center, and end points of the track
    const pts = spec.points;
    if (pts.length > 0) {
      const yaw = Math.atan2(px - cx, pz - cz);
      const cosY = Math.cos(yaw);
      const sinY = Math.sin(yaw);
      const toWorldVec = (lx: number, ly: number) =>
        new THREE.Vector3(cx + lx * cosY, cy + ly, cz - lx * sinY);

      const startW = toWorldVec(pts[0].x, pts[0].y);
      const midPt = pts[Math.floor(pts.length * 0.5)];
      const midW = toWorldVec(midPt.x, midPt.y);
      const endPt = pts[pts.length - 1];
      const endW = toWorldVec(endPt.x, endPt.y);

      if (
        !this.hasLineOfSight(eyeOrigin, startW) ||
        !this.hasLineOfSight(eyeOrigin, midW) ||
        !this.hasLineOfSight(eyeOrigin, endW)
      ) {
        return false;
      }
    }

    return true;
  }

  /**
   * Map mode: if most of a target's flight path is hidden from `eye` (crates, tarps, low walls), raise it
   * 0.8 / 1.6 / 2.4 m when there is headroom and the raised path is mostly visible. Returns true if moved.
   */
  private liftTargetIntoView(t: ActiveTargetInstance, eye: THREE.Vector3): boolean {
    if (t.typeId === 'H' || !t.flightLimits) return false;
    const lim = t.flightLimits;
    const xs = [Math.max(lim.minX, t.baseX - 2), t.baseX, Math.min(lim.maxX, t.baseX + 2)];
    const visibleAt = (y: number) => {
      let n = 0;
      for (const x of xs) {
        for (const dy of [-0.5, 0.5]) {
          if (this.hasLineOfSight(eye, new THREE.Vector3(x, y + dy, t.baseZ))) n++;
        }
      }
      return n;
    };
    if (visibleAt(t.baseY) >= 4) return false;
    const obstacles = [...this.environmentObstacles, ...this.staticLevelObstacles];
    const margin = t.diameter * 0.5 + 0.3;
    const headroom = measureFlightRoom({
      origin: new THREE.Vector3(t.baseX, t.baseY, t.baseZ),
      dir: new THREE.Vector3(0, 1, 0),
      maxDist: 4,
      margin,
      obstacles,
      raycaster: this.losRaycaster,
    });
    for (const lift of [0.8, 1.6, 2.4]) {
      // keep room for the vertical bob (up to ~0.85 m) under any ceiling or overhang
      if (headroom < lift + 0.85) break;
      if (visibleAt(t.baseY + lift) >= 4) {
        t.baseY += lift;
        t.visual.root.position.y += lift;
        t.flightLimits = this.measureTargetFlightLimits(t);
        return true;
      }
    }
    return false;
  }

  /** Map mode: measure once how far a target may fly sideways and in depth before reaching a wall. */
  private measureTargetFlightLimits(t: ActiveTargetInstance): {
    minX: number;
    maxX: number;
    zRoomNeg: number;
    zRoomPos: number;
  } {
    const obstacles = [...this.environmentObstacles, ...this.staticLevelObstacles];
    const origin = new THREE.Vector3(t.baseX, t.baseY, t.baseZ);
    const margin = t.diameter * 0.5 + 0.3;
    const heights = [0, 0.6, -0.6];
    const sideSpan = t.typeId === 'C' ? 18 : 5.2;
    const room = (dx: number, dz: number, span: number) =>
      measureFlightRoom({
        origin,
        dir: new THREE.Vector3(dx, 0, dz),
        maxDist: span,
        margin,
        obstacles,
        raycaster: this.losRaycaster,
        heights,
      });
    const limits = {
      minX: t.baseX - room(-1, 0, sideSpan),
      maxX: t.baseX + room(1, 0, sideSpan),
      zRoomNeg: room(0, -1, 1.6),
      zRoomPos: room(0, 1, 1.6),
    };
    this.losRaycaster.near = 0;
    return limits;
  }

  public hasLineOfSight(origin: THREE.Vector3, targetPos: THREE.Vector3): boolean {
    const obstacles = this.isIndoorChallengeActive
      ? this.indoorEnvironmentObstacles
      : [...this.environmentObstacles, ...this.staticLevelObstacles];
    if (obstacles.length === 0) return true;
    const dir = targetPos.clone().sub(origin);
    const dist = dir.length();
    if (dist <= 0.2) return true;
    dir.divideScalar(dist);
    for (const obs of obstacles) {
      obs.updateMatrixWorld(true);
    }
    this.losRaycaster.set(origin, dir);
    this.losRaycaster.near = 0.05;
    this.losRaycaster.far = Math.max(0.06, dist - 0.15);
    const hits = this.losRaycaster.intersectObjects(obstacles, true);
    return hits.length === 0;
  }

  public clearAll() {
    for (const t of this.activeTargets) {
      this.scene.remove(t.visual.root);
    }
    this.activeTargets = [];
    for (const st of this.suspendedArenaTargets) {
      this.scene.remove(st.visual.root);
    }
    this.suspendedArenaTargets = [];
    this.currentGMission = null;
    this.suspendedGMission = null;
    this.unshotEventSeenTimeMs = null;
    this.isIndoorChallengeActive = false;

    for (const o of this.activeObstacles) {
      this.scene.remove(o.mesh);
      if (o.warningMesh) this.scene.remove(o.warningMesh);
    }
    this.activeObstacles = [];
    for (const so of this.suspendedArenaObstacles) {
      this.scene.remove(so.mesh);
      if (so.warningMesh) this.scene.remove(so.warningMesh);
    }
    this.suspendedArenaObstacles = [];

    for (const s of this.staticLevelObstacles) {
      this.scene.remove(s);
    }
    this.staticLevelObstacles = [];
    this.staticLevelColliders = [];
  }

  public setupLevelStaticObstacles(
    difficulty: number,
    trainingMode: TrainingModeId = 1,
  ): {
    meshes: THREE.Object3D[];
    colliders: ColliderShape[];
  } {
    for (const s of this.staticLevelObstacles) {
      this.scene.remove(s);
    }
    this.staticLevelObstacles = [];
    this.staticLevelColliders = [];

    const modeCfg = TRAINING_MODES[trainingMode] || TRAINING_MODES[1];
    if (!modeCfg.allowObstacleAvoidance) {
      return { meshes: [], colliders: [] };
    }

    const cfg = DIFFICULTY_CONFIG[difficulty];
    if (!cfg.obstacle || (!cfg.obstacle.kinds.includes(5) && difficulty < 3)) {
      return { meshes: [], colliders: [] };
    }

    // Place static container clusters on outer flanks relative to player spawn leaving wide central movement corridor in Mode 3 & 4
    const spX = ARENA.startPos.x;
    const spZ = ARENA.startPos.z;
    const placements = [
      { x: spX - 5.2, z: spZ - 4.2, w: 1.5, h: 1.3, d: 1.5, color: PALETTE.primaryPurple },
      { x: spX + 5.2, z: spZ - 3.6, w: 1.5, h: 1.3, d: 1.5, color: PALETTE.cyan },
      { x: spX - 5.4, z: spZ - 8.8, w: 1.5, h: 1.3, d: 1.5, color: PALETTE.orange },
      { x: spX + 5.4, z: spZ - 8.2, w: 1.5, h: 1.3, d: 1.5, color: PALETTE.magenta },
    ];

    placements.forEach((p, idx) => {
      const grp = new THREE.Group();
      grp.position.set(p.x, p.h * 0.5, p.z);
      // reinforced cover box (same footprint and height as the collider, so it is not rotated)
      const crate = createReinforcedCoverBox(p.w, p.h, p.d, { seed: idx });
      crate.position.y = -p.h * 0.5;
      grp.add(crate);
      this.scene.add(grp);
      this.staticLevelObstacles.push(grp);
      this.staticLevelColliders.push({
        id: `static-obs-5-${idx}`,
        kind: 'aabb',
        minX: p.x - p.w * 0.5,
        maxX: p.x + p.w * 0.5,
        minZ: p.z - p.d * 0.5,
        maxZ: p.z + p.d * 0.5,
        isObstacle: false, // Treated as smooth sliding environment cover
        obstacleId: 9000 + idx,
      });
    });

    return {
      meshes: this.staticLevelObstacles,
      colliders: this.staticLevelColliders,
    };
  }

  public populateMenuDemoTargets(aimAssistMul: number) {
    this.clearAll();
    const demoSpecs: Array<{
      anchorId: string;
      typeId: TargetTypeId;
      color: string;
      diam: number;
    }> = [
      { anchorId: 'near-pedestal-0', typeId: 'A', color: PALETTE.cyan, diam: 2.3 },
      { anchorId: 'near-pedestal-1', typeId: 'C', color: PALETTE.orange, diam: 2.3 },
      { anchorId: 'balcony-L-1', typeId: 'B', color: PALETTE.magenta, diam: 2.0 },
      { anchorId: 'air-anchor-0', typeId: 'C', color: PALETTE.orange, diam: 2.1 },
      { anchorId: 'center-float-platform', typeId: 'A', color: PALETTE.cyan, diam: 1.8 },
      { anchorId: 'far-stand-1', typeId: 'A', color: PALETTE.cyan, diam: 1.5 },
      { anchorId: 'far-stand-2', typeId: 'E', color: PALETTE.lime, diam: 1.5 },
      { anchorId: 'far-stand-3', typeId: 'B', color: PALETTE.magenta, diam: 1.5 },
      { anchorId: 'far-stand-4', typeId: 'B', color: PALETTE.magenta, diam: 1.5 },
      { anchorId: 'far-stand-5', typeId: 'A', color: PALETTE.cyan, diam: 1.5 },
    ];

    const usedIds = new Set<string>();
    for (const ds of demoSpecs) {
      let anchor = this.anchors.find((a) => a.id === ds.anchorId && !usedIds.has(a.id));
      if (!anchor) {
        anchor = this.anchors.find((a) => a.sector === 'FRONT' && !usedIds.has(a.id));
      }
      if (!anchor) continue;
      usedIds.add(anchor.id);
      const instanceId = `demo-${ds.anchorId}`;
      const shapeKind = getShapeKindForType(ds.typeId);
      const visual = buildHologramTargetMesh({
        instanceId,
        typeId: ds.typeId,
        visualColor: ds.color,
        shapeKind,
        diameter: ds.diam,
        aimAssistMul,
        hasPedestal: anchor.hasPedestal,
        lowQuality: this.lowQuality,
      });
      visual.root.position.set(anchor.x, anchor.y, anchor.z);
      this.scene.add(visual.root);
      this.activeTargets.push({
        instanceId,
        groupId: null,
        typeId: ds.typeId,
        visualColor: ds.color,
        shapeKind,
        isMissionCorrect: true,
        anchorId: anchor.id,
        spawnSector: anchor.sector,
        wasRearOrOffscreenSpawn: false,
        unseenDurationSec: 0,
        hintCounted: false,
        baseX: anchor.x,
        baseY: anchor.y,
        baseZ: anchor.z,
        diameter: ds.diam,
        difficulty: 1,
        speed: 0.3,
        lifetime: 9999,
        age: 1.0,
        pattern: 0,
        moveDirX: 1,
        moveDirY: 0,
        moveAxis: 'x',
        turnTimer: 0,
        nextTurnInterval: 2,
        lissajousFreqX: 1,
        lissajousFreqY: 1.3,
        lissajousFreqZ: 0.7,
        phaseOffset: Math.random() * 6,
        isGolden: false,
        hit: false,
        dying: false,
        dyingTimer: 0,
        shakeTimer: 0,
        firstSeenTimeMs: performance.now(),
        spawnTimeMs: performance.now(),
        laserProgress: 0,
        visual,
      });
    }
  }

  public getOccupiedSlotCount(): number {
    let slots = 0;
    const countedGroups = new Set<string>();
    for (const t of this.activeTargets) {
      if (t.hit || t.dying) continue;
      if (t.groupId) {
        if (!countedGroups.has(t.groupId)) {
          countedGroups.add(t.groupId);
          slots += 1;
        }
      } else {
        slots += 1;
      }
    }
    return slots;
  }

  public spawnSingleTarget(params: {
    typeId: TargetTypeId;
    difficulty: number;
    trainingMode?: TrainingModeId;
    playerX?: number;
    playerZ?: number;
    aimAssistMul: number;
    frustum?: THREE.Frustum;
    onSpawnRecorded: (event: SpawnNotificationEvent) => void;
    overridePos?: { x: number; y: number; z: number; sector?: SpawnDirectionSector };
  }): ActiveTargetInstance | null {
    const modeId: TrainingModeId = params.trainingMode ?? 1;
    const modeCfg = TRAINING_MODES[modeId] || TRAINING_MODES[1];
    const px = params.playerX ?? ARENA.startPos.x;
    const pz = params.playerZ ?? ARENA.startPos.z;

    // Limit Type H Laser Track to max 1 active at a time
    if (
      params.typeId === 'H' &&
      !params.overridePos &&
      this.activeTargets.some((t) => t.typeId === 'H' && !t.hit && !t.dying)
    ) {
      return null;
    }

    const cfg = DIFFICULTY_CONFIG[params.difficulty];
    const spec = TARGET_TYPES[params.typeId];
    const diameter = Math.max(0.4, spec.baseDiameter * cfg.sizeMul);
    const rawSpeed = spec.baseSpeed * cfg.speedMul;
    const speed =
      (modeId === 3 || modeId === 4) && params.typeId !== 'H'
        ? Math.max(2.35, rawSpeed * 1.45)
        : params.typeId !== 'H'
          ? Math.max(1.15, rawSpeed)
          : rawSpeed;
    const lifetime =
      params.typeId === 'H' ? cfg.lifetime + 4.0 : cfg.lifetime;

    const isStationaryMode = !modeCfg.allowMovement;
    const eyeOrigin = new THREE.Vector3(px, ARENA.startPos.y, pz);

    // Section 5: MODE 1 & MODE 3 strictly front ±45° only; MODE 2 & MODE 4 spawn across 360° (front, left, right, rear, diagonal)
    const allow360 = modeCfg.allowRearTargets;
    const rearChance = allow360 ? Math.max(0.55, cfg.rearSpawnChance) : 0;
    const wantRearOrSide = allow360 && !params.overridePos && Math.random() < rearChance;

    const usedAnchors = new Set(this.activeTargets.map((t) => t.anchorId).filter(Boolean));
    let chosenAnchor: SpawnAnchor | null = null;
    if (!params.overridePos) {
      let candidates = this.anchors.filter((a) => !usedAnchors.has(a.id));
      candidates = candidates.filter((a) =>
        this.activeTargets.every(
          (t) => Math.hypot(t.visual.root.position.x - a.x, t.visual.root.position.z - a.z) >= 1.5,
        ),
      );

      if (isStationaryMode) {
        candidates = candidates.filter((a) =>
          this.hasLineOfSight(eyeOrigin, new THREE.Vector3(a.x, a.y, a.z)),
        );
      }

      if (!allow360) {
        // MODE 1 & MODE 3: Strictly FRONT sector and within ±45° cone from player
        candidates = candidates.filter(
          (a) => a.sector === 'FRONT' && isWorldTargetAllowedForMode(px, pz, a.x, a.z, modeId),
        );
      } else if (wantRearOrSide) {
        const rearOrSide = candidates.filter((a) => a.sector !== 'FRONT');
        if (rearOrSide.length > 0) {
          candidates = rearOrSide;
        }
      } else {
        const frontOnly = candidates.filter((a) => a.sector === 'FRONT');
        if (frontOnly.length > 0) {
          candidates = frontOnly;
        }
      }

      if (params.typeId === 'B') {
        const nearOrMid = candidates.filter(
          (a) => a.kind === 'near' || a.kind === 'balcony' || a.kind === 'air' || a.kind === 'rear',
        );
        if (nearOrMid.length > 0) candidates = nearOrMid;
      } else if (params.typeId === 'C' || params.typeId === 'E') {
        const airCands = candidates.filter((a) => a.kind === 'air' || a.kind === 'rear');
        if (airCands.length > 0) candidates = airCands;
      }
      if (candidates.length > 0) {
        chosenAnchor = candidates[Math.floor(Math.random() * candidates.length)];
      }
    }

    let bx = chosenAnchor ? chosenAnchor.x : px + THREE.MathUtils.randFloat(-3.5, 3.5);
    let by = chosenAnchor ? chosenAnchor.y : THREE.MathUtils.randFloat(1.8, 3.9);
    let bz = chosenAnchor ? chosenAnchor.z : pz - THREE.MathUtils.randFloat(6.5, 13.5);
    let spawnSector: SpawnDirectionSector =
      params.overridePos?.sector ??
      chosenAnchor?.sector ??
      (wantRearOrSide ? 'REAR' : 'FRONT');

    // If MODE 2 or MODE 4 and wantRearOrSide (or diagonal 360° placement with varied distance)
    if (!params.overridePos && allow360 && wantRearOrSide && !chosenAnchor) {
      // Pick omnidirectional angle (Left, Right, Rear, or Diagonal) and varied distance (6.5m ~ 13.5m)
      const angleRad = THREE.MathUtils.randFloat(-Math.PI, Math.PI);
      const dist = THREE.MathUtils.randFloat(6.5, 13.5);
      bx = px + Math.sin(angleRad) * dist;
      bz = pz - Math.cos(angleRad) * dist;
      by = THREE.MathUtils.randFloat(1.8, 3.9);
      const deg = (angleRad * 180) / Math.PI;
      if (Math.abs(deg) <= 45) spawnSector = 'FRONT';
      else if (Math.abs(deg) >= 135) spawnSector = 'REAR';
      else if (deg > 0) spawnSector = 'RIGHT';
      else spawnSector = 'LEFT';
    }

    if (params.overridePos) {
      bx = params.overridePos.x;
      by = params.overridePos.y;
      bz = params.overridePos.z;
    } else if (params.typeId === 'C') {
      const fromLeft = Math.random() < 0.5;
      by = THREE.MathUtils.randFloat(2.0, 3.8);
      if (wantRearOrSide && allow360) {
        bx = px + (fromLeft ? -5.5 : 5.5);
        bz = pz + THREE.MathUtils.randFloat(6.5, 11.5);
        spawnSector = 'REAR';
      } else {
        bz = pz - THREE.MathUtils.randFloat(7.5, 13.5);
        const maxFrontX = isStationaryMode
          ? 3.8
          : Math.min(8.5, Math.abs(bz - pz) * 0.72);
        bx = px + (fromLeft ? -maxFrontX : maxFrontX);
        spawnSector = 'FRONT';
      }
    }

    // Enforce strict ±45° front cone in MODE 1 & MODE 3
    if (!allow360 && !params.overridePos) {
      spawnSector = 'FRONT';
      if (bz >= pz - 5.5) {
        bz = pz - THREE.MathUtils.randFloat(7.0, 13.5);
      }
      const forwardDepth = Math.max(5.5, pz - bz);
      const maxAllowedOffset = Math.min(10.0, forwardDepth * Math.tan(THREE.MathUtils.degToRad(38)));
      bx = THREE.MathUtils.clamp(bx, px - maxAllowedOffset, px + maxAllowedOffset);
    }

    // Pre-generate Type H spec via Shuffle Bag and validate full-track spatial clearance & LOS
    let laserSpec: LaserTrackDifficultySpec | undefined;
    if (params.typeId === 'H') {
      const baseSpec = computeLaserTrackSpecForDifficulty(params.difficulty);
      laserSpec = baseSpec;

      if (!params.overridePos) {
        // Elevate base Y safely above floor (>= 1.0m + half height + margin)
        const minSafeCenterY = Math.max(2.1, -baseSpec.bounds.minY + 1.15);
        const maxSafeCenterY = Math.min(3.8, 5.8 - baseSpec.bounds.maxY);
        by = THREE.MathUtils.clamp(by, minSafeCenterY, Math.max(minSafeCenterY, maxSafeCenterY));

        const obstacleBoxes = this.getObstacleBoxesWithMargin(0.45);
        let placed = this.isLaserTrackPlacementValid({
          cx: bx,
          cy: by,
          cz: bz,
          px,
          pz,
          spec: baseSpec,
          eyeOrigin,
          obstacleBoxes,
        });

        if (!placed) {
          for (let attempt = 0; attempt < 24; attempt++) {
            let tryX = px + THREE.MathUtils.randFloat(-2.6, 2.6);
            let tryZ = pz - THREE.MathUtils.randFloat(6.5, 12.5);
            let trySec: SpawnDirectionSector = 'FRONT';

            if (allow360 && attempt % 3 === 1) {
              const ang = THREE.MathUtils.randFloat(-Math.PI, Math.PI);
              const d = THREE.MathUtils.randFloat(6.5, 11.5);
              tryX = px + Math.sin(ang) * d;
              tryZ = pz - Math.cos(ang) * d;
              const deg = (ang * 180) / Math.PI;
              if (Math.abs(deg) <= 45) trySec = 'FRONT';
              else if (Math.abs(deg) >= 135) trySec = 'REAR';
              else if (deg > 0) trySec = 'RIGHT';
              else trySec = 'LEFT';
            }

            if (!allow360 && !isWorldTargetAllowedForMode(px, pz, tryX, tryZ, modeId)) {
              tryX = px + THREE.MathUtils.randFloat(-2.2, 2.2);
              tryZ = pz - THREE.MathUtils.randFloat(6.5, 12.0);
              trySec = 'FRONT';
            }

            const tryY = THREE.MathUtils.randFloat(
              minSafeCenterY,
              Math.max(minSafeCenterY, maxSafeCenterY),
            );

            if (
              this.isLaserTrackPlacementValid({
                cx: tryX,
                cy: tryY,
                cz: tryZ,
                px,
                pz,
                spec: baseSpec,
                eyeOrigin,
                obstacleBoxes,
              })
            ) {
              bx = tryX;
              by = tryY;
              bz = tryZ;
              spawnSector = trySec;
              chosenAnchor = null;
              placed = true;
              break;
            }
          }
        }

        // Guaranteed open central arena fallback relative to player spawn
        if (!placed) {
          const openFallbacks = [
            { x: px, y: 2.6, z: pz - 7.5 },
            { x: px - 0.8, y: 2.8, z: pz - 6.5 },
            { x: px + 0.8, y: 2.7, z: pz - 8.5 },
            { x: px, y: 2.9, z: pz - 9.5 },
          ];
          const scales = [1.0, 0.84, 0.68];
          for (const sc of scales) {
            const scaledSpec: LaserTrackDifficultySpec =
              sc === 1.0
                ? baseSpec
                : computeLaserTrackSpecForDifficulty(params.difficulty, {
                    shapeKind: baseSpec.shapeKind,
                    mirrorX: baseSpec.mirroredX,
                    reverseDir: baseSpec.reversedDir,
                    scaleMul: sc,
                  });
            for (const fb of openFallbacks) {
              if (!allow360 && !isWorldTargetAllowedForMode(px, pz, fb.x, fb.z, modeId)) {
                continue;
              }
              const fbY = Math.max(fb.y, -scaledSpec.bounds.minY + 1.15);
              if (
                this.isLaserTrackPlacementValid({
                  cx: fb.x,
                  cy: fbY,
                  cz: fb.z,
                  px,
                  pz,
                  spec: scaledSpec,
                  eyeOrigin,
                  obstacleBoxes,
                })
              ) {
                bx = fb.x;
                by = fbY;
                bz = fb.z;
                spawnSector = fb.z > pz ? 'REAR' : 'FRONT';
                chosenAnchor = null;
                laserSpec = scaledSpec;
                placed = true;
                break;
              }
            }
            if (placed) break;
          }
          if (!placed) {
            // Ultimate open-air central coordinate in front of player spawn
            const fallbackSpec = computeLaserTrackSpecForDifficulty(params.difficulty, {
              shapeKind: baseSpec.shapeKind,
              mirrorX: baseSpec.mirroredX,
              reverseDir: baseSpec.reversedDir,
              scaleMul: 0.68,
            });
            laserSpec = fallbackSpec;
            bx = px;
            by = Math.max(2.6, -fallbackSpec.bounds.minY + 1.15);
            bz = pz - 7.0;
            spawnSector = 'FRONT';
            chosenAnchor = null;
          }
        }
      }
    }

    // Stationary Mode (MODE 1 & MODE 2): Guarantee Line-of-Sight for non-H targets too
    if (isStationaryMode && !params.overridePos && params.typeId !== 'H') {
      let losOk = this.hasLineOfSight(eyeOrigin, new THREE.Vector3(bx, by, bz));
      if (!losOk) {
        for (let attempt = 0; attempt < 16; attempt++) {
          let tx = px + THREE.MathUtils.randFloat(-3.4, 3.4);
          const ty = THREE.MathUtils.randFloat(1.8, 3.8);
          let tz = pz - THREE.MathUtils.randFloat(6.5, 13.5);
          let tSec: SpawnDirectionSector = 'FRONT';
          if (allow360 && wantRearOrSide) {
            tx = px + THREE.MathUtils.randFloat(-5.5, 5.5);
            tz = pz + THREE.MathUtils.randFloat(6.5, 11.0);
            tSec = 'REAR';
          }
          if (
            isWorldTargetAllowedForMode(px, pz, tx, tz, modeId) &&
            this.hasLineOfSight(eyeOrigin, new THREE.Vector3(tx, ty, tz))
          ) {
            bx = tx;
            by = ty;
            bz = tz;
            spawnSector = tSec;
            chosenAnchor = null;
            losOk = true;
            break;
          }
        }
        if (!losOk) {
          const visibleFallback = this.anchors.filter(
            (a) =>
              isWorldTargetAllowedForMode(px, pz, a.x, a.z, modeId) &&
              this.hasLineOfSight(eyeOrigin, new THREE.Vector3(a.x, a.y, a.z)),
          );
          if (visibleFallback.length > 0) {
            const pick = visibleFallback[Math.floor(Math.random() * visibleFallback.length)];
            chosenAnchor = pick;
            bx = pick.x;
            by = pick.y;
            bz = pick.z;
            spawnSector = pick.sector;
          } else {
            bx = px;
            by = 2.3;
            bz = pz - 7.5;
            spawnSector = 'FRONT';
            chosenAnchor = null;
          }
        }
      }
    }

    const instanceId = `tgt-${this.nextTargetCounter++}`;
    const shapeKind = getShapeKindForType(params.typeId);
    const hasPedestal =
      chosenAnchor?.hasPedestal &&
      params.typeId !== 'C' &&
      params.typeId !== 'E' &&
      params.typeId !== 'H';

    const visual = buildHologramTargetMesh({
      instanceId,
      typeId: params.typeId,
      visualColor: spec.color,
      shapeKind,
      diameter,
      aimAssistMul: params.aimAssistMul,
      hasPedestal: Boolean(hasPedestal),
      lowQuality: this.lowQuality,
      difficulty: params.difficulty,
      isMissionCorrect: true,
      laserTrackSpec: laserSpec,
    });

    visual.root.position.set(bx, by, bz);
    visual.root.scale.setScalar(params.typeId === 'H' ? 1.0 : 0.01);
    visual.root.updateMatrixWorld(true);
    this.scene.add(visual.root);

    const isOffscreen = params.frustum
      ? !params.frustum.containsPoint(new THREE.Vector3(bx, by, bz))
      : spawnSector !== 'FRONT';
    const wasRearOrOffscreenSpawn = spawnSector !== 'FRONT' || isOffscreen;

    const nowMs = performance.now();
    const targetObj: ActiveTargetInstance = {
      instanceId,
      groupId: null,
      typeId: params.typeId,
      visualColor: spec.color,
      shapeKind,
      isMissionCorrect: true,
      anchorId: chosenAnchor?.id ?? null,
      spawnSector,
      wasRearOrOffscreenSpawn,
      unseenDurationSec: 0,
      hintCounted: false,
      baseX: bx,
      baseY: by,
      baseZ: bz,
      diameter,
      difficulty: params.difficulty,
      speed,
      lifetime,
      age: params.typeId === 'H' ? 0.35 : 0,
      pattern: cfg.pattern,
      moveDirX: bx < 0 ? 1 : -1,
      moveDirY: Math.random() < 0.5 ? 1 : -1,
      moveAxis: Math.random() < 0.5 ? 'x' : 'y',
      turnTimer: 0,
      nextTurnInterval: THREE.MathUtils.randFloat(0.8, 2.0),
      lissajousFreqX: THREE.MathUtils.randFloat(1.1, 2.1),
      lissajousFreqY: THREE.MathUtils.randFloat(1.3, 2.4),
      lissajousFreqZ: THREE.MathUtils.randFloat(0.7, 1.5),
      phaseOffset: Math.random() * Math.PI * 2,
      isGolden: false,
      hit: false,
      dying: false,
      dyingTimer: 0,
      shakeTimer: 0,
      firstSeenTimeMs: isOffscreen ? null : nowMs,
      spawnTimeMs: nowMs,
      laserTrackSpec: laserSpec,
      laserProgress: 0,
      visual,
    };

    if (!isOffscreen && this.unshotEventSeenTimeMs === null) {
      this.unshotEventSeenTimeMs = nowMs;
    }

    this.activeTargets.push(targetObj);
    params.onSpawnRecorded({
      typeId: params.typeId,
      sector: spawnSector,
      isOffscreen,
      x: bx,
      y: by,
      z: bz,
    });
    return targetObj;
  }

  public spawnGGroup(params: {
    difficulty: number;
    trainingMode?: TrainingModeId;
    playerX?: number;
    playerZ?: number;
    aimAssistMul: number;
    frustum?: THREE.Frustum;
    onSpawnRecorded: (event: SpawnNotificationEvent) => void;
  }) {
    const modeId: TrainingModeId = params.trainingMode ?? 1;
    const modeCfg = TRAINING_MODES[modeId] || TRAINING_MODES[1];
    const cfg = DIFFICULTY_CONFIG[params.difficulty];
    const groupId = `ggroup-${this.nextTargetCounter++}`;
    const count = params.difficulty >= 10 ? 4 : 3;

    const pickedColor = COLOR_CHOICES[Math.floor(Math.random() * COLOR_CHOICES.length)];
    const pickedShape = SHAPE_CHOICES[Math.floor(Math.random() * SHAPE_CHOICES.length)];
    const mode: 'color' | 'shape' | 'both' =
      params.difficulty >= 10 ? 'both' : Math.random() < 0.5 ? 'color' : 'shape';

    this.currentGMission = {
      groupId,
      mode,
      targetColorHex: pickedColor.hex,
      targetColorName: pickedColor.name,
      targetShapeKind: pickedShape.kind,
      targetShapeName: pickedShape.name,
      remainingCorrect: 1,
    };

    const isStationaryMode = !modeCfg.allowMovement;
    const px = params.playerX ?? ARENA.startPos.x;
    const pz = params.playerZ ?? ARENA.startPos.z;
    const eyeOrigin = new THREE.Vector3(px, ARENA.startPos.y, pz);

    const spawnRear =
      modeCfg.allowRearTargets && Math.random() < Math.max(0.35, cfg.rearSpawnChance * 0.6);
    let centerZ = spawnRear
      ? pz + THREE.MathUtils.randFloat(6.5, 10.5)
      : pz - THREE.MathUtils.randFloat(7.5, 13.0);
    const spawnSector: SpawnDirectionSector = spawnRear ? 'REAR' : 'FRONT';
    let centerY = THREE.MathUtils.randFloat(2.0, 3.6);
    let spacing = isStationaryMode && !spawnRear ? 1.85 : 2.35;
    let centerX = px + (isStationaryMode && !spawnRear ? -0.15 : 0);

    if (isStationaryMode || this.flightBoundsMode === 'map') {
      const checkGroupLos = (cx: number, cy: number, cz: number, sp: number): boolean => {
        const sx = cx - ((count - 1) * sp) * 0.5;
        for (let idx = 0; idx < count; idx++) {
          const tx = sx + idx * sp;
          const ty = cy + (idx % 2 === 0 ? 0.28 : -0.28);
          if (!this.hasLineOfSight(eyeOrigin, new THREE.Vector3(tx, ty, cz))) {
            return false;
          }
        }
        return true;
      };
      if (!checkGroupLos(centerX, centerY, centerZ, spacing)) {
        let found = false;
        for (let attempt = 0; attempt < 12; attempt++) {
          const tryCz = spawnRear
            ? pz + THREE.MathUtils.randFloat(6.5, 10.5)
            : pz - THREE.MathUtils.randFloat(6.5, 12.5);
          const tryCy = THREE.MathUtils.randFloat(2.0, 3.6);
          const tryCx = px + (spawnRear ? THREE.MathUtils.randFloat(-2, 2) : -0.15);
          const trySp = Math.max(1.45, spacing - attempt * 0.06);
          if (checkGroupLos(tryCx, tryCy, tryCz, trySp)) {
            centerX = tryCx;
            centerY = tryCy;
            centerZ = tryCz;
            spacing = trySp;
            found = true;
            break;
          }
        }
        if (!found) {
          centerX = px;
          centerY = 2.5;
          centerZ = spawnRear ? pz + 8.0 : pz - 8.5;
          spacing = 1.55;
        }
      }
    }

    const startX = centerX - ((count - 1) * spacing) * 0.5;
    const correctIndex = Math.floor(Math.random() * count);

    let correctPos = { x: centerX, y: centerY, z: centerZ };

    for (let i = 0; i < count; i++) {
      const isCorrect = i === correctIndex;
      let vColor = pickedColor.hex;
      let vShape = pickedShape.kind;

      if (!isCorrect) {
        const otherColors = COLOR_CHOICES.filter((c) => c.hex !== pickedColor.hex);
        const otherShapes = SHAPE_CHOICES.filter((s) => s.kind !== pickedShape.kind);
        if (mode === 'color') {
          vColor = otherColors[i % otherColors.length].hex;
          vShape = SHAPE_CHOICES[(i + 1) % SHAPE_CHOICES.length].kind;
        } else if (mode === 'shape') {
          vColor = COLOR_CHOICES[(i + 1) % COLOR_CHOICES.length].hex;
          vShape = otherShapes[i % otherShapes.length].kind;
        } else {
          if (i % 2 === 0) {
            vColor = pickedColor.hex;
            vShape = otherShapes[i % otherShapes.length].kind;
          } else {
            vColor = otherColors[i % otherColors.length].hex;
            vShape = pickedShape.kind;
          }
        }
      }

      const instanceId = `tgt-g-${this.nextTargetCounter++}`;
      const diameter = Math.max(0.45, TARGET_TYPES.G.baseDiameter * cfg.sizeMul);
      const speed = TARGET_TYPES.G.baseSpeed * cfg.speedMul;
      const bx = startX + i * spacing;
      const by = centerY + (i % 2 === 0 ? 0.28 : -0.28);
      const bz = centerZ;
      if (isCorrect) {
        correctPos = { x: bx, y: by, z: bz };
      }

      const visual = buildHologramTargetMesh({
        instanceId,
        typeId: 'G',
        visualColor: vColor,
        shapeKind: vShape,
        diameter,
        aimAssistMul: params.aimAssistMul,
        hasPedestal: false,
        lowQuality: this.lowQuality,
        difficulty: params.difficulty,
        isMissionCorrect: isCorrect,
      });

      visual.root.position.set(bx, by, bz);
      visual.root.scale.setScalar(0.01);
      this.scene.add(visual.root);

      const isOffscreen = params.frustum
        ? !params.frustum.containsPoint(new THREE.Vector3(bx, by, bz))
        : spawnSector !== 'FRONT';

      this.activeTargets.push({
        instanceId,
        groupId,
        typeId: 'G',
        visualColor: vColor,
        shapeKind: vShape,
        isMissionCorrect: isCorrect,
        anchorId: null,
        spawnSector,
        wasRearOrOffscreenSpawn: spawnSector !== 'FRONT' || isOffscreen,
        unseenDurationSec: 0,
        hintCounted: false,
        baseX: bx,
        baseY: by,
        baseZ: bz,
        diameter,
        difficulty: params.difficulty,
        speed,
        lifetime: cfg.lifetime + 1.5,
        age: 0,
        pattern: 1,
        moveDirX: i % 2 === 0 ? 1 : -1,
        moveDirY: 1,
        moveAxis: 'x',
        turnTimer: 0,
        nextTurnInterval: 2.0,
        lissajousFreqX: 1.2,
        lissajousFreqY: 1.5,
        lissajousFreqZ: 0.8,
        phaseOffset: i * 1.1,
        isGolden: false,
        hit: false,
        dying: false,
        dyingTimer: 0,
        shakeTimer: 0,
        firstSeenTimeMs: isOffscreen ? null : performance.now(),
        spawnTimeMs: performance.now(),
        laserProgress: 0,
        visual,
      });
    }

    const groupOffscreen = params.frustum
      ? !params.frustum.containsPoint(
          new THREE.Vector3(correctPos.x, correctPos.y, correctPos.z),
        )
      : spawnSector !== 'FRONT';

    params.onSpawnRecorded({
      typeId: 'G',
      sector: spawnSector,
      isOffscreen: groupOffscreen,
      x: correctPos.x,
      y: correctPos.y,
      z: correctPos.z,
    });
  }

  public updateTargets(params: {
    dt: number;
    difficulty: number;
    trainingMode?: TrainingModeId;
    spawnFrequencyMul: number;
    aimAssistMul: number;
    camera: THREE.Camera;
    frustum: THREE.Frustum;
    onSpawnRecorded: (event: SpawnNotificationEvent) => void;
    onTargetTimeout: (typeId: TargetTypeId) => void;
  }) {
    const modeId: TrainingModeId = params.trainingMode ?? 1;
    const modeCfg = TRAINING_MODES[modeId] || TRAINING_MODES[1];
    const cfg = DIFFICULTY_CONFIG[params.difficulty];
    const effectiveInterval = cfg.spawnInterval / params.spawnFrequencyMul;

    this.spawnTimer -= params.dt;
    if (this.spawnTimer <= 0) {
      if (this.getOccupiedSlotCount() < cfg.maxConcurrent) {
        const hasActiveG = this.activeTargets.some((t) => t.typeId === 'G' && !t.hit && !t.dying);
        const hasActiveH = this.activeTargets.some((t) => t.typeId === 'H' && !t.hit && !t.dying);
        const pool = cfg.types.filter(
          (tp) => !(hasActiveG && tp === 'G') && !(hasActiveH && tp === 'H'),
        );
        const safePool = pool.length > 0 ? pool : ['A' as TargetTypeId];
        const chosenType = safePool[Math.floor(Math.random() * safePool.length)] || 'A';

        if (chosenType === 'G') {
          this.spawnGGroup({
            difficulty: params.difficulty,
            trainingMode: modeId,
            playerX: params.camera.position.x,
            playerZ: params.camera.position.z,
            aimAssistMul: params.aimAssistMul,
            frustum: params.frustum,
            onSpawnRecorded: params.onSpawnRecorded,
          });
        } else {
          this.spawnSingleTarget({
            typeId: chosenType,
            difficulty: params.difficulty,
            trainingMode: modeId,
            playerX: params.camera.position.x,
            playerZ: params.camera.position.z,
            aimAssistMul: params.aimAssistMul,
            frustum: params.frustum,
            onSpawnRecorded: params.onSpawnRecorded,
          });
        }
        this.spawnTimer = effectiveInterval;
      } else {
        this.spawnTimer = 0.25;
      }
    }

    const nowMs = performance.now();
    const toRemove: ActiveTargetInstance[] = [];

    for (const t of this.activeTargets) {
      if (t.dying) {
        t.dyingTimer += params.dt;
        const p = Math.min(1, t.dyingTimer / 0.25);
        t.visual.root.scale.setScalar(Math.max(0.01, 1 - p));
        if (t.dyingTimer >= 0.25) {
          toRemove.push(t);
        }
        continue;
      }

      t.age += params.dt;

      // Spawn pop-in animation (0.3s easeOutBack)
      if (t.age < 0.3) {
        const s = Math.max(0.01, easeOutBack(t.age / 0.3));
        t.visual.root.scale.setScalar(s);
      } else {
        t.visual.root.scale.setScalar(1.0);
      }

      // Check lifetime expiration
      if (t.age >= t.lifetime) {
        t.dying = true;
        t.dyingTimer = 0;
        if (t.typeId !== 'G' || t.isMissionCorrect) {
          params.onTargetTimeout(t.typeId);
        }
        if (t.groupId && this.currentGMission?.groupId === t.groupId) {
          this.currentGMission = null;
        }
        continue;
      }

      // Check frustum visibility for firstSeenTimeMs & unseenDurationSec (for Section 3 Direction Hint)
      const isVisibleNow = params.frustum.containsPoint(t.visual.root.position);
      if (isVisibleNow) {
        t.unseenDurationSec = 0;
        if (t.firstSeenTimeMs === null) {
          t.firstSeenTimeMs = nowMs;
          if (t.isMissionCorrect && this.unshotEventSeenTimeMs === null) {
            this.unshotEventSeenTimeMs = nowMs;
          }
        }
      } else {
        t.unseenDurationSec += params.dt;
      }

      // Update position by target type
      const pos = t.visual.root.position;
      const prevX = pos.x;
      const mapMode = this.flightBoundsMode === 'map' && !t.isIndoorChallengeTarget;
      if (mapMode && t.typeId !== 'H' && !t.flightLimits) {
        t.flightLimits = this.measureTargetFlightLimits(t);
        // before the player has seen it: lift a target whose flight path is mostly behind cover
        this.liftTargetIntoView(t, params.camera.position);
      }
      const lim = t.flightLimits;
      // keep a map-mode flyer between the walls on either side of where it appeared
      const bounceX = () => {
        if (!mapMode || !lim) return;
        if (pos.x > lim.maxX) {
          pos.x = lim.maxX;
          t.moveDirX = -1;
        } else if (pos.x < lim.minX) {
          pos.x = lim.minX;
          t.moveDirX = 1;
        }
      };
      const mapZ = (offset: number) =>
        lim ? t.baseZ + THREE.MathUtils.clamp(offset, -lim.zRoomNeg, lim.zRoomPos) : t.baseZ + offset;

      if (t.typeId === 'A' || t.typeId === 'B' || t.typeId === 'G') {
        const isFreeMoveMode = modeId === 3 || modeId === 4;
        const effectivePattern = isFreeMoveMode ? Math.max(2, t.pattern) : t.pattern;
        const effectiveSpeed = isFreeMoveMode ? Math.max(2.35, t.speed) : Math.max(1.15, t.speed);

        if (effectivePattern === 0) {
          pos.x += t.moveDirX * effectiveSpeed * params.dt;
          pos.y = t.baseY + Math.sin(t.age * 1.8 + t.phaseOffset) * 0.35;
          if (Math.abs(pos.x - t.baseX) > 3.2 || (!mapMode && Math.abs(pos.x) > 20)) {
            t.moveDirX *= -1;
          }
          bounceX();
        } else if (effectivePattern === 1) {
          pos.x += t.moveDirX * effectiveSpeed * params.dt;
          pos.y = t.baseY + Math.sin(t.age * 2.0 + t.phaseOffset) * 0.45;
          if (Math.abs(pos.x - t.baseX) > 3.6 || (!mapMode && Math.abs(pos.x) > 22)) {
            t.moveDirX *= -1;
          }
          bounceX();
        } else if (effectivePattern === 2) {
          t.turnTimer += params.dt;
          if (t.turnTimer >= t.nextTurnInterval) {
            t.turnTimer = 0;
            t.nextTurnInterval = THREE.MathUtils.randFloat(1.1, 2.3);
            t.moveDirX *= -1;
          }
          pos.x += t.moveDirX * effectiveSpeed * params.dt;
          if (Math.abs(pos.x - t.baseX) > 4.6 || (!mapMode && Math.abs(pos.x) > 22)) {
            t.moveDirX *= -1;
          }
          if (mapMode) bounceX();
          else pos.x = THREE.MathUtils.clamp(pos.x, -22, 22);
          pos.y = THREE.MathUtils.clamp(
            t.baseY + Math.sin(t.age * 2.1 + t.phaseOffset) * 0.72,
            1.2,
            6.6,
          );
          if (isFreeMoveMode) {
            const zOffset = Math.cos(t.age * 1.4 + t.phaseOffset) * 1.15;
            // the built-in arena keeps flyers in its front field; on a map they stay where they appeared
            pos.z = mapMode
              ? mapZ(zOffset)
              : THREE.MathUtils.clamp(t.baseZ + zOffset, ARENA.spawnMinZ, -5.5);
          }
        } else {
          const speedMod = effectivePattern === 4 ? 1 + 0.45 * Math.sin(t.age * 3.5) : 1;
          pos.x += t.moveDirX * effectiveSpeed * speedMod * params.dt;
          pos.y = THREE.MathUtils.clamp(
            t.baseY + Math.sin(t.age * 2.2 + t.phaseOffset) * 0.82,
            1.2,
            6.8,
          );
          if (isFreeMoveMode) {
            const zOffset = Math.cos(t.age * 1.6 + t.phaseOffset) * 1.35;
            pos.z = mapMode
              ? mapZ(zOffset)
              : THREE.MathUtils.clamp(t.baseZ + zOffset, ARENA.spawnMinZ, -5.5);
          }
          if (Math.abs(pos.x - t.baseX) > 4.8 || (!mapMode && Math.abs(pos.x) > 22)) {
            t.moveDirX *= -1;
          }
          bounceX();
        }
      } else if (t.typeId === 'C') {
        pos.x += t.moveDirX * t.speed * params.dt;
        pos.y = t.baseY + Math.sin(t.age * 2.4) * 0.85;
        t.isGolden = false;
        // fly-by ends at the arena edge, or on a map just before it would hit a wall
        if (mapMode && lim ? (pos.x > lim.maxX || pos.x < lim.minX) : Math.abs(pos.x) > 16.5) {
          t.age = t.lifetime;
        }
      } else if (t.typeId === 'E') {
        t.turnTimer += params.dt;
        if (t.turnTimer > 1.1) {
          t.turnTimer = 0;
          t.lissajousFreqX = THREE.MathUtils.clamp(
            t.lissajousFreqX + THREE.MathUtils.randFloat(-0.25, 0.25),
            0.9,
            2.5,
          );
        }
        pos.x = t.baseX + Math.sin(t.age * t.lissajousFreqX + t.phaseOffset) * 3.2;
        if (mapMode && lim) pos.x = THREE.MathUtils.clamp(pos.x, lim.minX, lim.maxX);
        pos.y = THREE.MathUtils.clamp(
          t.baseY + Math.cos(t.age * t.lissajousFreqY + t.phaseOffset) * 1.4,
          1.2,
          6.8,
        );
        pos.z = mapMode
          ? mapZ(Math.sin(t.age * t.lissajousFreqZ) * 1.5)
          : THREE.MathUtils.clamp(
              t.baseZ + Math.sin(t.age * t.lissajousFreqZ) * 1.5,
              ARENA.spawnMinZ,
              ARENA.spawnMaxZ,
            );
      } else if (t.typeId === 'H') {
        // Stationary target so player can smoothly hold-drag along the continuous hologram line
        pos.x = t.baseX;
        pos.y = t.baseY;
        pos.z = t.baseZ;
        if (t.visual.startRingGroup) {
          const sPulse = 1 + Math.sin(t.age * Math.PI * 2.2) * 0.14;
          t.visual.startRingGroup.scale.setScalar(sPulse);
        }
        if (t.visual.endRingGroup) {
          const ePulse = 1 + Math.cos(t.age * Math.PI * 1.8) * 0.08;
          t.visual.endRingGroup.scale.setScalar(ePulse);
        }
        if (t.visual.laserCursorGroup && t.visual.laserCursorGroup.visible) {
          const cPulse = 1 + Math.sin(t.age * Math.PI * 3.0) * 0.12;
          t.visual.laserCursorGroup.scale.setScalar(cPulse);
        }
      }

      // Update Type G 3D red Valorant corner bracket [ ] MOT visibility (Lv 1~7 always on; Lv 8~10 1.0s flash then fade-out)
      if (t.typeId === 'G' && t.isMissionCorrect && t.visual.missionBracketMesh && t.visual.missionBracketMat) {
        const bracketState = computeMissionBracketVisualState(t.difficulty, t.age);
        t.visual.missionBracketMesh.visible = bracketState.visible;
        t.visual.missionBracketMat.opacity = bracketState.opacity;
        t.visual.missionBracketMesh.scale.setScalar(bracketState.scaleMul);
      }

      // In MODE 1 & MODE 3 (front ±45° only), keep moving targets inside the forward ±45° cone
      if (!modeCfg.allowRearTargets && t.typeId !== 'H') {
        const camX = params.camera.position.x;
        const camZ = params.camera.position.z;
        const depth = Math.max(5.0, camZ - pos.z);
        const maxFrontX = Math.min(13.5, depth * Math.tan(THREE.MathUtils.degToRad(41)));
        if (pos.x < camX - maxFrontX) {
          pos.x = camX - maxFrontX;
          t.moveDirX = 1;
        } else if (pos.x > camX + maxFrontX) {
          pos.x = camX + maxFrontX;
          t.moveDirX = -1;
        }
      }

      // Map mode: a flyer that stays hidden behind map geometry from the player's eye turns around
      if (mapMode && (t.typeId === 'A' || t.typeId === 'B' || t.typeId === 'G')) {
        t.losCheckTimer = (t.losCheckTimer ?? 0) + params.dt;
        if (t.losCheckTimer >= 0.2) {
          const step = t.losCheckTimer;
          t.losCheckTimer = 0;
          const seen = this.hasLineOfSight(params.camera.position, pos);
          t.hiddenSec = seen ? 0 : (t.hiddenSec ?? 0) + step;
          t.hiddenTotalSec = seen ? 0 : (t.hiddenTotalSec ?? 0) + step;
          if ((t.hiddenSec ?? 0) >= 0.6) {
            t.moveDirX *= -1;
            t.turnTimer = 0;
            t.hiddenSec = 0;
          }
          // still hidden after turning around: rise above the cover (unseen, so the move isn't noticed)
          if ((t.hiddenTotalSec ?? 0) >= 1.8) {
            t.hiddenTotalSec = 0;
            this.liftTargetIntoView(t, params.camera.position);
          }
        }
      }

      // Clean uniform shape & color rendering without excessive golden pulse or highlight rings
      const frameMat = t.visual.frameMesh.material as THREE.MeshStandardMaterial;
      frameMat.color.set(t.visualColor);
      frameMat.emissive.set(t.visualColor);
      t.visual.frameMesh.scale.setScalar(t.diameter);

      const bobOffset =
        t.typeId === 'H' ? 0 : Math.sin(t.age * Math.PI + t.phaseOffset) * 0.08;
      let shakeX = 0;
      if (t.shakeTimer > 0) {
        t.shakeTimer = Math.max(0, t.shakeTimer - params.dt);
        shakeX = Math.sin(t.shakeTimer * 45) * 0.14;
      }
      t.visual.panelGroup.position.set(shakeX, bobOffset, 0);

      // Yaw towards player camera
      const dxToCam = params.camera.position.x - pos.x;
      const dzToCam = params.camera.position.z - pos.z;
      t.visual.root.rotation.y = Math.atan2(dxToCam, dzToCam);
      const vx = t.typeId === 'H' ? 0 : (pos.x - prevX) / Math.max(0.001, params.dt);
      const tiltZ = t.typeId === 'H' ? 0 : THREE.MathUtils.clamp(-vx * 0.035, -0.17, 0.17);
      t.visual.panelGroup.rotation.z = tiltZ;
    }

    for (const r of toRemove) {
      this.scene.remove(r.visual.root);
      const idx = this.activeTargets.indexOf(r);
      if (idx >= 0) this.activeTargets.splice(idx, 1);
    }
  }

  public setLaserTrackProgress(
    target: ActiveTargetInstance,
    progress: number,
    completed = false,
  ): {
    completed: boolean;
    progress: number;
  } {
    const clamped = Math.max(0, Math.min(1, progress));
    target.laserProgress = clamped;

    const {
      progressTubeGeo,
      progressTubeMat,
      laserTubularSegments = 80,
      laserRadialSegments = 12,
      laserCurve,
      laserCursorGroup,
    } = target.visual;

    if (progressTubeGeo) {
      const segsFilled = completed
        ? laserTubularSegments
        : Math.max(0, Math.min(laserTubularSegments, Math.round(clamped * laserTubularSegments)));
      progressTubeGeo.setDrawRange(0, segsFilled * laserRadialSegments * 6);
    }

    if (progressTubeMat) {
      if (completed) {
        progressTubeMat.color.set('#FFE484');
      } else if (clamped >= 0.78) {
        progressTubeMat.color.set('#A8FFE8');
      } else {
        progressTubeMat.color.set('#3AF9FF');
      }
    }

    if (laserCursorGroup && laserCurve) {
      if (clamped > 0 && !completed) {
        const headPt = laserCurve.getPointAt(clamped);
        laserCursorGroup.position.set(headPt.x, headPt.y, 0.12);
        laserCursorGroup.visible = true;
      } else {
        laserCursorGroup.visible = false;
      }
    }

    return {
      completed,
      progress: clamped,
    };
  }

  public resetLaserTrackTarget(target: ActiveTargetInstance) {
    target.laserProgress = 0;
    const { progressTubeGeo, progressTubeMat, laserCursorGroup, laserCurve } = target.visual;
    if (progressTubeGeo) {
      progressTubeGeo.setDrawRange(0, 0);
    }
    if (progressTubeMat) {
      progressTubeMat.color.set('#3AF9FF');
    }
    if (laserCursorGroup && laserCurve) {
      const startPt = laserCurve.getPointAt(0);
      laserCursorGroup.position.set(startPt.x, startPt.y, 0.12);
      laserCursorGroup.visible = false;
    }
  }

  public markTargetHit(target: ActiveTargetInstance) {
    target.hit = true;
    target.dying = true;
    target.dyingTimer = 0;

    if (target.groupId && this.currentGMission?.groupId === target.groupId) {
      this.currentGMission.remainingCorrect -= 1;
      if (this.currentGMission.remainingCorrect <= 0) {
        for (const other of this.activeTargets) {
          if (other.groupId === target.groupId && !other.dying) {
            other.dying = true;
            other.dyingTimer = 0;
          }
        }
        this.currentGMission = null;
      }
    }
  }

  public suspendArenaStateForIndoorChallenge() {
    this.isIndoorChallengeActive = true;
    this.suspendedArenaTargets = [...this.activeTargets];
    for (const t of this.suspendedArenaTargets) {
      t.visual.root.visible = false;
    }
    this.activeTargets = [];

    this.suspendedArenaObstacles = [...this.activeObstacles];
    for (const o of this.suspendedArenaObstacles) {
      o.mesh.visible = false;
      if (o.warningMesh) o.warningMesh.visible = false;
    }
    this.activeObstacles = [];

    for (const s of this.staticLevelObstacles) {
      s.visible = false;
    }

    this.suspendedGMission = this.currentGMission;
    this.currentGMission = null;
    this.suspendedSpawnTimer = this.spawnTimer;
  }

  public restoreArenaStateFromIndoorChallenge() {
    this.clearIndoorRangeTargets();
    this.isIndoorChallengeActive = false;

    for (const t of this.suspendedArenaTargets) {
      t.visual.root.visible = true;
    }
    this.activeTargets = [...this.suspendedArenaTargets];
    this.suspendedArenaTargets = [];

    for (const o of this.suspendedArenaObstacles) {
      o.mesh.visible = true;
      if (o.warningMesh) o.warningMesh.visible = true;
    }
    this.activeObstacles = [...this.suspendedArenaObstacles];
    this.suspendedArenaObstacles = [];

    for (const s of this.staticLevelObstacles) {
      s.visible = true;
    }

    this.currentGMission = this.suspendedGMission;
    this.suspendedGMission = null;
    this.spawnTimer = this.suspendedSpawnTimer;
    this.unshotEventSeenTimeMs = performance.now();
  }

  public spawnIndoorRangeTargets(params: {
    count: number;
    diameter: number;
    difficulty: number;
    aimAssistMul: number;
    playerPos: { x: number; y: number; z: number };
    onSpawnRecorded: (event: SpawnNotificationEvent) => void;
  }): ActiveTargetInstance[] {
    this.clearIndoorRangeTargets();
    const slots = generateIndoorRangeTargetSlots(params.count, params.diameter);
    const paletteCycle: Array<{ typeId: TargetTypeId; color: string; shape: FrameShapeKind }> = [
      { typeId: 'B', color: '#FF4655', shape: 'circle' },
      { typeId: 'A', color: '#00F5D4', shape: 'shield' },
      { typeId: 'C', color: '#FF9E2C', shape: 'diamond' },
    ];
    const nowMs = performance.now();
    const spawned: ActiveTargetInstance[] = [];

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const style = paletteCycle[i % paletteCycle.length];
      const instanceId = `indoor-${this.nextTargetCounter++}`;
      const visual = buildHologramTargetMesh({
        instanceId,
        typeId: style.typeId,
        visualColor: style.color,
        shapeKind: style.shape,
        diameter: params.diameter,
        aimAssistMul: params.aimAssistMul,
        hasPedestal: false,
        lowQuality: this.lowQuality,
        difficulty: params.difficulty,
        isMissionCorrect: true,
      });

      visual.root.position.set(slot.x, slot.y, slot.z);
      visual.root.rotation.y = Math.atan2(
        params.playerPos.x - slot.x,
        params.playerPos.z - slot.z,
      );
      visual.root.scale.setScalar(0.45);
      visual.root.updateMatrixWorld(true);
      this.scene.add(visual.root);

      const inst: ActiveTargetInstance = {
        instanceId,
        groupId: null,
        typeId: style.typeId,
        visualColor: style.color,
        shapeKind: style.shape,
        isMissionCorrect: true,
        anchorId: null,
        spawnSector: 'FRONT',
        wasRearOrOffscreenSpawn: false,
        unseenDurationSec: 0,
        hintCounted: false,
        baseX: slot.x,
        baseY: slot.y,
        baseZ: slot.z,
        diameter: params.diameter,
        difficulty: params.difficulty,
        speed: 0,
        lifetime: 999,
        age: 0,
        pattern: 0,
        moveDirX: 1,
        moveDirY: 1,
        moveAxis: 'x',
        turnTimer: 0,
        nextTurnInterval: 2,
        lissajousFreqX: 1,
        lissajousFreqY: 1,
        lissajousFreqZ: 1,
        phaseOffset: i * 0.5,
        isGolden: false,
        hit: false,
        dying: false,
        dyingTimer: 0,
        shakeTimer: 0,
        firstSeenTimeMs: nowMs,
        spawnTimeMs: nowMs,
        laserProgress: 0,
        isIndoorChallengeTarget: true,
        visual,
      };
      this.activeTargets.push(inst);
      spawned.push(inst);
      params.onSpawnRecorded({
        typeId: style.typeId,
        sector: 'FRONT',
        isOffscreen: false,
        x: slot.x,
        y: slot.y,
        z: slot.z,
      });
    }

    this.unshotEventSeenTimeMs = nowMs;
    return spawned;
  }

  public updateIndoorTargets(dt: number, camera: THREE.Camera) {
    const toRemove: ActiveTargetInstance[] = [];
    for (const t of this.activeTargets) {
      if (!t.isIndoorChallengeTarget) continue;
      if (t.dying) {
        t.dyingTimer += dt;
        const p = Math.min(1, t.dyingTimer / 0.18);
        t.visual.root.scale.setScalar(Math.max(0.01, 1 - p));
        if (t.dyingTimer >= 0.18) {
          toRemove.push(t);
        }
        continue;
      }

      t.age += dt;
      if (t.age < 0.16) {
        const s = 0.45 + 0.55 * easeOutBack(t.age / 0.16);
        t.visual.root.scale.setScalar(s);
      } else {
        t.visual.root.scale.setScalar(1.0);
      }

      const pos = t.visual.root.position;
      t.visual.root.rotation.y = Math.atan2(
        camera.position.x - pos.x,
        camera.position.z - pos.z,
      );
      t.visual.panelGroup.position.set(0, Math.sin(t.age * 2.1 + t.phaseOffset) * 0.035, 0);
    }

    for (const r of toRemove) {
      this.scene.remove(r.visual.root);
      const idx = this.activeTargets.indexOf(r);
      if (idx >= 0) this.activeTargets.splice(idx, 1);
    }
  }

  public clearIndoorRangeTargets() {
    const remaining: ActiveTargetInstance[] = [];
    for (const t of this.activeTargets) {
      if (t.isIndoorChallengeTarget) {
        this.scene.remove(t.visual.root);
      } else {
        remaining.push(t);
      }
    }
    this.activeTargets = remaining;
  }

  public getRemainingIndoorTargetCount(): number {
    return this.activeTargets.filter(
      (t) => t.isIndoorChallengeTarget && !t.hit && !t.dying,
    ).length;
  }
}

export interface ActiveObstacleInstance {
  obstacleId: number;
  kind: number;
  mesh: THREE.Group;
  warningMesh?: THREE.Mesh;
  x: number;
  y: number;
  z: number;
  dirX: number;
  speed: number;
  age: number;
  phase: 'warning' | 'active' | 'done';
  gapCenterX: number;
  gapWidth: number;
  enteredThreatZone: boolean;
  collidedWithPlayer: boolean;
}

export function spawnMovingObstacle(params: {
  scene: THREE.Scene;
  obstacleId: number;
  kind: number;
  speed: number;
  difficulty: number;
  playerX: number;
  playerZ?: number;
  lowQuality: boolean;
}): ActiveObstacleInstance {
  const { scene, obstacleId, kind, speed, difficulty, playerX, playerZ = 8, lowQuality } = params;
  const mesh = new THREE.Group();
  let warningMesh: THREE.Mesh | undefined;

  const targetX = THREE.MathUtils.clamp(
    playerX + THREE.MathUtils.randFloat(-3.5, 3.5),
    -11.5,
    11.5,
  );
  let x = targetX;
  let y = 0;
  let z = THREE.MathUtils.clamp(playerZ + THREE.MathUtils.randFloat(-4.5, 2.5), -10, 12);
  let gapCenterX = targetX;
  const gapWidth = Math.max(2.2, 3.0 - 0.1 * (difficulty - 3));
  let phase: 'warning' | 'active' | 'done' = 'active';

  if (kind === 1) {
    // Sliding Container across the 360° plaza
    const fromLeft = Math.random() < 0.5;
    x = fromLeft ? -12.5 : 12.5;
    mesh.add(buildContainerObstacle());
  } else if (kind === 2) {
    // Approaching Cushion Drone across the plaza
    x = targetX;
    z = Math.max(-14.5, playerZ - 14.0);
    mesh.add(buildDroneObstacle());
  } else if (kind === 3) {
    // Periodic Low Hazard Barrier rising from floor after 0.8s smooth floor marker
    x = targetX;
    y = -0.95;
    phase = 'warning';
    mesh.add(buildBarrierObstacle());

    warningMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 0.85),
      new THREE.MeshBasicMaterial({
        color: PALETTE.yellow,
        transparent: true,
        opacity: 0.15,
        side: THREE.DoubleSide,
      }),
    );
    warningMesh.rotation.x = -Math.PI / 2;
    warningMesh.position.set(x, 0.04, z);
    scene.add(warningMesh);
  } else {
    // Kind 4: Narrow Passage Gate spanning X -12 to +12 with gap
    x = 0;
    z = Math.max(-14.5, playerZ - 13.0);
    gapCenterX = THREE.MathUtils.clamp(playerX + THREE.MathUtils.randFloat(-3.5, 3.5), -6.5, 6.5);
    const leftMin = -12.0;
    const leftMax = gapCenterX - gapWidth * 0.5;
    const rightMin = gapCenterX + gapWidth * 0.5;
    const rightMax = 12.0;

    const wallMat = new THREE.MeshBasicMaterial({
      color: PALETTE.primaryPurple,
      transparent: true,
      opacity: 0.48,
    });
    const edgeMat = new THREE.MeshBasicMaterial({ color: PALETTE.cyan });

    if (leftMax > leftMin) {
      const lw = leftMax - leftMin;
      const lMesh = new THREE.Mesh(new THREE.BoxGeometry(lw, 1.2, 0.35), wallMat);
      lMesh.position.set(leftMin + lw * 0.5, 0.6, 0);
      mesh.add(lMesh);
    }
    if (rightMax > rightMin) {
      const rw = rightMax - rightMin;
      const rMesh = new THREE.Mesh(new THREE.BoxGeometry(rw, 1.2, 0.35), wallMat);
      rMesh.position.set(rightMin + rw * 0.5, 0.6, 0);
      mesh.add(rMesh);
    }
    const postL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.28, 0.42), edgeMat);
    postL.position.set(leftMax, 0.64, 0);
    const postR = postL.clone();
    postR.position.set(rightMin, 0.64, 0);
    mesh.add(postL, postR);
  }

  mesh.position.set(x, y, z);
  scene.add(mesh);

  return {
    obstacleId,
    kind,
    mesh,
    warningMesh,
    x,
    y,
    z,
    dirX: x < 0 ? 1 : -1,
    speed,
    age: 0,
    phase,
    gapCenterX,
    gapWidth,
    enteredThreatZone: false,
    collidedWithPlayer: false,
  };
}

export function getObstacleColliders(obs: ActiveObstacleInstance): ColliderShape[] {
  if (obs.kind === 1) {
    return [
      {
        id: `obs-${obs.obstacleId}`,
        kind: 'aabb',
        minX: obs.x - 0.8,
        maxX: obs.x + 0.8,
        minZ: obs.z - 0.8,
        maxZ: obs.z + 0.8,
        isObstacle: true,
        obstacleId: obs.obstacleId,
      },
    ];
  } else if (obs.kind === 2) {
    return [
      {
        id: `obs-${obs.obstacleId}`,
        kind: 'circle',
        x: obs.x,
        z: obs.z,
        radius: 0.6,
        isObstacle: true,
        obstacleId: obs.obstacleId,
      },
    ];
  } else if (obs.kind === 3) {
    if (obs.phase !== 'active') return [];
    return [
      {
        id: `obs-${obs.obstacleId}`,
        kind: 'aabb',
        minX: obs.x - 1.5,
        maxX: obs.x + 1.5,
        minZ: obs.z - 0.3,
        maxZ: obs.z + 0.3,
        isObstacle: true,
        obstacleId: obs.obstacleId,
      },
    ];
  } else {
    const leftMax = obs.gapCenterX - obs.gapWidth * 0.5;
    const rightMin = obs.gapCenterX + obs.gapWidth * 0.5;
    return [
      {
        id: `obs-${obs.obstacleId}-L`,
        kind: 'aabb',
        minX: -12.0,
        maxX: leftMax,
        minZ: obs.z - 0.25,
        maxZ: obs.z + 0.25,
        isObstacle: true,
        obstacleId: obs.obstacleId,
      },
      {
        id: `obs-${obs.obstacleId}-R`,
        kind: 'aabb',
        minX: rightMin,
        maxX: 12.0,
        minZ: obs.z - 0.25,
        maxZ: obs.z + 0.25,
        isObstacle: true,
        obstacleId: obs.obstacleId,
      },
    ];
  }
}
