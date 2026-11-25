/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  ALL_TARGET_TYPES,
  ARENA,
  DIFFICULTY_CONFIG,
  TARGET_TYPES,
  verifyDifficultyMonotonicity,
  calculateHitScore,
  evaluateHitGrade,
  resolvePlayerPosition,
  computeKeyboardMoveVector,
  computeJoystickMoveVector,
  computeTargetDirectionHint,
  getEffectiveAimAssistMul,
  getShotFeedbackMessage,
  analyzeVisualFieldBiasFeedback,
  NON_TARGET_MESSAGE,
  SessionRecorder,
  ColliderShape,
} from './rules';
import { TargetAndObstacleManager } from './entities';
import { runAllSelfChecks } from './selfCheck';

test('Difficulty 1-10 monotonicity, 6 target types (no D/F), and Lv5+ rear spawn rule', () => {
  const res = verifyDifficultyMonotonicity();
  assert.equal(res.pass, true, res.details);
  assert.equal(Object.keys(DIFFICULTY_CONFIG).length, 10);
  assert.equal(Object.keys(TARGET_TYPES).length, 6);
  assert.deepEqual(ALL_TARGET_TYPES, ['A', 'B', 'C', 'E', 'G', 'H']);
  assert.equal('D' in TARGET_TYPES, false);
  assert.equal('F' in TARGET_TYPES, false);

  for (let lv = 1; lv <= 4; lv++) {
    assert.equal(DIFFICULTY_CONFIG[lv].allowRearSpawn, false);
  }
  for (let lv = 5; lv <= 10; lv++) {
    assert.equal(DIFFICULTY_CONFIG[lv].allowRearSpawn, true);
    assert.ok(DIFFICULTY_CONFIG[lv].rearSpawnChance > 0);
  }
});

test('Non-target shot returns exact "목표물이 아닙니다!" message without score penalty', () => {
  const msg = getShotFeedbackMessage('NON_TARGET');
  assert.equal(msg.title, NON_TARGET_MESSAGE);
  assert.equal(msg.title, '목표물이 아닙니다!');

  const rec = new SessionRecorder(3, 120);
  rec.recordShotHit({
    type: 'A',
    grade: 'GOOD',
    reactionMs: 300,
    aimErrorPct: 20,
    screenZone: 'center',
    elapsedSec: 2,
  });
  const scoreBeforeMiss = rec.totalScore;
  assert.ok(scoreBeforeMiss > 0);

  rec.recordShotMiss(4, 'center', true);
  assert.equal(rec.totalScore, scoreBeforeMiss, 'Score must not decrease on non-target miss');
  assert.equal(rec.nonTargetHits, 1);
  assert.equal(rec.misses, 1);
  assert.equal(rec.currentCombo, 0);
});

test('Hit grade and score calculation formula', () => {
  assert.equal(evaluateHitGrade(0.18, false), 'PERFECT');
  assert.equal(evaluateHitGrade(0.5, true), 'PERFECT');
  assert.equal(evaluateHitGrade(0.5, false), 'GOOD');

  assert.equal(calculateHitScore('A', 'PERFECT', 1, 1), 15);
  assert.equal(calculateHitScore('B', 'GOOD', 5, 10), 50);
});

test('360° circular plaza collision clamps to playRadius and slides tangentially along surfaces', () => {
  const colliders: ColliderShape[] = [
    { id: 'box1', kind: 'aabb', minX: -2, maxX: 2, minZ: 4, maxZ: 6 },
  ];

  // 1) Clamp to 18m circular plaza radius
  const outFar = resolvePlayerPosition(16, 16, 4.0, 4.0, colliders, ARENA.playerRadius);
  const distFromCenter = Math.hypot(outFar.x, outFar.z);
  assert.ok(distFromCenter <= ARENA.playRadius - ARENA.playerRadius + 1e-4);

  // 2) Diagonal movement into box face slides along X while blocked on Z
  const intoBoxDiag = resolvePlayerPosition(0, 6.4, 1.0, -1.0, colliders, ARENA.playerRadius);
  assert.ok(intoBoxDiag.x > 0.8, 'Player should slide smoothly along X axis');
  assert.ok(intoBoxDiag.z >= 6.4, 'Player should be prevented from penetrating Z<=6');
  assert.equal(intoBoxDiag.hitEnv, true);

  // 3) Push out if stuck inside container
  const stuck = resolvePlayerPosition(0, 5.0, 0, 0, colliders, ARENA.playerRadius);
  assert.ok(stuck.z > 6.0 || stuck.z < 4.0 || stuck.x > 2.0 || stuck.x < -2.0);
});

test('Offscreen target direction hint calculates Stage 0 through Stage 5 and smooth wave parameters', () => {
  // Visible in front -> isOffscreen = false, stage = 0
  const frontHint = computeTargetDirectionHint({
    playerX: 0,
    playerY: 1.5,
    playerZ: 10,
    playerYawRad: 0,
    playerPitchRad: 0,
    targetX: 0,
    targetY: 2.0,
    targetZ: -10,
    unseenDurationSec: 5.0,
    hintDelaySec: 1.8,
  });
  assert.equal(frontHint.isOffscreen, false);
  assert.equal(frontHint.stage, 0);
  assert.equal(frontHint.waveRingCount, 0);

  // Rear target (+Z) after 2.0s (ratio 1.11) -> Stage 1, 1 wave ring
  const rearHint1 = computeTargetDirectionHint({
    playerX: 0,
    playerY: 1.5,
    playerZ: 10,
    playerYawRad: 0,
    playerPitchRad: 0,
    targetX: 0,
    targetY: 2.0,
    targetZ: 22,
    unseenDurationSec: 2.0,
    hintDelaySec: 1.8,
  });
  assert.equal(rearHint1.isOffscreen, true);
  assert.equal(rearHint1.directionSector, 'REAR');
  assert.equal(rearHint1.stage, 1);
  assert.equal(rearHint1.waveRingCount, 1);

  // Left target (-X) after 3.0s (ratio 1.67) -> Stage 2, 2 wave rings
  const leftHint2 = computeTargetDirectionHint({
    playerX: 0,
    playerY: 1.5,
    playerZ: 10,
    playerYawRad: 0,
    playerPitchRad: 0,
    targetX: -15,
    targetY: 2.0,
    targetZ: 10,
    unseenDurationSec: 3.0,
    hintDelaySec: 1.8,
  });
  assert.equal(leftHint2.isOffscreen, true);
  assert.equal(leftHint2.directionSector, 'LEFT');
  assert.equal(leftHint2.stage, 2);
  assert.equal(leftHint2.waveRingCount, 2);
  assert.ok(leftHint2.relativeYawDeg < -80);

  // Stage 3, 4, 5 progression check
  const stg3 = computeTargetDirectionHint({
    playerX: 0,
    playerY: 1.5,
    playerZ: 10,
    playerYawRad: 0,
    playerPitchRad: 0,
    targetX: 15,
    targetY: 2.0,
    targetZ: 10,
    unseenDurationSec: 3.9,
    hintDelaySec: 1.8,
  });
  assert.equal(stg3.stage, 3);
  assert.equal(stg3.waveRingCount, 2);

  const stg4 = computeTargetDirectionHint({
    playerX: 0,
    playerY: 1.5,
    playerZ: 10,
    playerYawRad: 0,
    playerPitchRad: 0,
    targetX: 15,
    targetY: 2.0,
    targetZ: 10,
    unseenDurationSec: 4.8,
    hintDelaySec: 1.8,
  });
  assert.equal(stg4.stage, 4);
  assert.equal(stg4.waveRingCount, 3);

  const stg5 = computeTargetDirectionHint({
    playerX: 0,
    playerY: 1.5,
    playerZ: 10,
    playerYawRad: 0,
    playerPitchRad: 0,
    targetX: 15,
    targetY: 2.0,
    targetZ: 10,
    unseenDurationSec: 6.0,
    hintDelaySec: 1.8,
  });
  assert.equal(stg5.stage, 5);
  assert.equal(stg5.waveRingCount, 3);
  assert.ok(stg5.waveDurationSec >= 1.5);
});

test('Keyboard and Joystick movement vectors normalize properly', () => {
  const diag = computeKeyboardMoveVector({ KeyW: true, KeyD: true });
  const len = Math.hypot(diag.forward, diag.right);
  assert.ok(Math.abs(len - 1.0) < 1e-5);

  const dead = computeJoystickMoveVector(3, 3, 60, 0.12);
  assert.equal(dead.magnitude, 0);

  const fullUp = computeJoystickMoveVector(0, -60, 60, 0.12);
  assert.ok(Math.abs(fullUp.forward - 1.0) < 1e-5);
  assert.equal(fullUp.right, 0);
});

test('SessionRecorder enforces shotsAttempted = hits + misses + wrongSelections and tracks v2 metrics', () => {
  const rec = new SessionRecorder(5, 120);
  rec.recordTargetSpawn('A', false);
  rec.recordTargetSpawn('A', true);
  rec.recordTargetSpawn('G', false);
  rec.recordDirectionHintShown();

  rec.recordShotHit({
    type: 'A',
    grade: 'PERFECT',
    reactionMs: 420,
    aimErrorPct: 14,
    screenZone: 'center',
    elapsedSec: 10,
    isDirectTouch: true,
    wasRearSpawn: true,
  });
  rec.recordTargetTimeout('A');
  rec.recordShotMiss(22, 'left', true);
  rec.recordShotWrongSelection(35, 'right');

  const summary = rec.buildSummary(60);
  assert.equal(
    summary.shotsAttempted,
    summary.hits + summary.misses + summary.wrongSelections,
  );
  assert.equal(summary.shotsAttempted, 3);
  assert.equal(summary.hits, 1);
  assert.equal(summary.misses, 1);
  assert.equal(summary.nonTargetHits, 1);
  assert.equal(summary.directTouchHits, 1);
  assert.equal(summary.rearTargetsSpawned, 1);
  assert.equal(summary.rearTargetsHit, 1);
  assert.equal(summary.directionHintShownCount, 1);
  assert.equal(summary.wrongSelections, 1);
  assert.equal(summary.accuracyPct, 33.3);
  assert.equal(summary.typeStats.A.spawned, 2);
  assert.equal(summary.typeStats.A.hits, 1);
  assert.equal(summary.typeStats.A.missed, 1);
  assert.equal(summary.typeStats.A.hitRatePct, 50.0);
});

test('4 Training Modes (MODE 1~4) enforce movement, ±45° vs 360° yaw, spawn range, and N/A stationary metrics', async () => {
  const {
    TRAINING_MODES,
    DEFAULT_SETTINGS,
    clampPlayerYawForMode,
    isWorldTargetAllowedForMode,
  } = await import('./rules');

  // Default mode is MODE 1
  assert.equal(DEFAULT_SETTINGS.trainingMode, 1);

  // MODE 1: Stationary + Front ±45°
  assert.equal(TRAINING_MODES[1].allowMovement, false);
  assert.equal(TRAINING_MODES[1].wasdEnabled, false);
  assert.equal(TRAINING_MODES[1].joystickEnabled, false);
  assert.equal(TRAINING_MODES[1].maxYawDeg, 45);
  assert.equal(TRAINING_MODES[1].allowRearTargets, false);
  assert.equal(TRAINING_MODES[1].allowObstacleAvoidance, false);
  assert.ok(Math.abs(clampPlayerYawForMode(Math.PI, 1) - Math.PI / 4) < 1e-6);
  assert.ok(Math.abs(clampPlayerYawForMode(-Math.PI, 1) - -Math.PI / 4) < 1e-6);
  assert.equal(isWorldTargetAllowedForMode(0, 10, 0, -10, 1), true);
  assert.equal(isWorldTargetAllowedForMode(0, 10, 15, 10, 1), false); // 90 deg side forbidden
  assert.equal(isWorldTargetAllowedForMode(0, 10, 0, 20, 1), false); // rear forbidden

  // MODE 2: Stationary + 360° Free Rotation
  assert.equal(TRAINING_MODES[2].allowMovement, false);
  assert.equal(TRAINING_MODES[2].wasdEnabled, false);
  assert.equal(TRAINING_MODES[2].joystickEnabled, false);
  assert.equal(TRAINING_MODES[2].maxYawDeg, null);
  assert.equal(TRAINING_MODES[2].allowRearTargets, true);
  assert.equal(TRAINING_MODES[2].allowObstacleAvoidance, false);
  assert.equal(clampPlayerYawForMode(Math.PI * 1.2, 2), Math.PI * 1.2);
  assert.equal(isWorldTargetAllowedForMode(0, 10, 0, 20, 2), true); // rear allowed
  assert.equal(isWorldTargetAllowedForMode(0, 10, 15, 10, 2), true); // side allowed

  // MODE 3: Free Movement + Front ±45°
  assert.equal(TRAINING_MODES[3].allowMovement, true);
  assert.equal(TRAINING_MODES[3].wasdEnabled, true);
  assert.equal(TRAINING_MODES[3].joystickEnabled, true);
  assert.equal(TRAINING_MODES[3].maxYawDeg, 45);
  assert.equal(TRAINING_MODES[3].allowRearTargets, false);
  assert.equal(TRAINING_MODES[3].allowObstacleAvoidance, true);
  assert.ok(Math.abs(clampPlayerYawForMode(2.0, 3) - Math.PI / 4) < 1e-6);
  assert.equal(isWorldTargetAllowedForMode(0, 10, 0, 20, 3), false);

  // MODE 4: Free Movement + 360° Free Rotation
  assert.equal(TRAINING_MODES[4].allowMovement, true);
  assert.equal(TRAINING_MODES[4].wasdEnabled, true);
  assert.equal(TRAINING_MODES[4].joystickEnabled, true);
  assert.equal(TRAINING_MODES[4].maxYawDeg, null);
  assert.equal(TRAINING_MODES[4].allowRearTargets, true);
  assert.equal(TRAINING_MODES[4].allowObstacleAvoidance, true);
  assert.equal(clampPlayerYawForMode(-2.5, 4), -2.5);
  assert.equal(isWorldTargetAllowedForMode(0, 10, -14, 18, 4), true);

  // Stationary modes (MODE 1 & 2) record obstacleAvoidanceRatePct as null (N/A)
  const recMode1 = new SessionRecorder(2, 120, 1).buildSummary(60);
  assert.equal(recMode1.trainingMode, 1);
  assert.equal(recMode1.trainingModeCode, 'MODE 1');
  assert.equal(recMode1.movementAllowed, false);
  assert.equal(recMode1.obstacleAvoidanceRatePct, null);

  // Movement modes (MODE 3 & 4) compute obstacleAvoidanceRatePct
  const recMode3 = new SessionRecorder(3, 120, 3);
  recMode3.recordObstacleDodge();
  recMode3.recordObstacleDodge();
  recMode3.recordObstacleDodge();
  recMode3.recordObstacleCollision();
  const sumMode3 = recMode3.buildSummary(60);
  assert.equal(sumMode3.trainingMode, 3);
  assert.equal(sumMode3.movementAllowed, true);
  assert.equal(sumMode3.obstacleAvoidanceRatePct, 75.0);
});

test('Self-check diagnostic suite passes all 10 items', () => {
  const items = runAllSelfChecks(true, []);
  assert.equal(items.length, 10);
  for (const item of items) {
    assert.equal(item.passed, true, `${item.title} failed: ${item.detail}`);
  }
});

test('Target visual effect profile strips floating badges, halo rings, beacons, pillars, and glows', async () => {
  const { computeTargetVisualEffectProfile } = await import('./rules');

  const profiles = [
    computeTargetVisualEffectProfile({ difficulty: 2, typeId: 'A', isMissionCorrect: true }),
    computeTargetVisualEffectProfile({ difficulty: 8, typeId: 'E', isMissionCorrect: true }),
    computeTargetVisualEffectProfile({ difficulty: 10, typeId: 'G', isMissionCorrect: true }),
    computeTargetVisualEffectProfile({ difficulty: 10, typeId: 'G', isMissionCorrect: false }),
  ];

  for (const prof of profiles) {
    assert.equal(prof.hasHaloRing, false);
    assert.equal(prof.haloRingCount, 0);
    assert.equal(prof.hasCrownBeacon, false);
    assert.equal(prof.hasLightPillar, false);
    assert.equal(prof.showScreenLockOn, false);
    assert.equal(prof.badgeLabel, '');
    assert.equal(prof.glowScaleMul, 0);
    assert.equal(prof.frameOpacity, 0.96);
  }
});

test('Laser Track target (Type H) supports 30 preset shapes across 5 tiers, sleek hologram tube radius, and stationary standalone behavior', async () => {
  const {
    computeLaserTrackSpecForDifficulty,
    computeTargetVisualEffectProfile,
    ALL_LASER_TRACK_SHAPES,
    LASER_TRACK_SHAPES_BY_TIER,
    LASER_TRACK_SHAPE_LABELS,
    ALL_TARGET_TYPES,
    TARGET_TYPES,
  } = await import('./rules');
  assert.equal(ALL_TARGET_TYPES.includes('H'), true);
  assert.equal(TARGET_TYPES.H.baseSpeed, 0, 'Type H must be stationary (baseSpeed = 0)');
  assert.equal(ALL_LASER_TRACK_SHAPES.length, 30);

  for (let tier = 1 as 1 | 2 | 3 | 4 | 5; tier <= 5; tier = (tier + 1) as 1 | 2 | 3 | 4 | 5) {
    assert.equal(LASER_TRACK_SHAPES_BY_TIER[tier].length, 6);
  }

  for (const shapeKind of ALL_LASER_TRACK_SHAPES) {
    assert.ok(LASER_TRACK_SHAPE_LABELS[shapeKind].length > 0);
    const spec = computeLaserTrackSpecForDifficulty(5, {
      shapeKind,
      mirrorX: false,
      reverseDir: false,
    });
    assert.equal(spec.sampleCount, 72);
    assert.equal(spec.points.length, 72);
    assert.ok(spec.tubeRadius >= 0.045 && spec.tubeRadius <= 0.07);
    assert.ok(spec.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));
  }

  const hProfile = computeTargetVisualEffectProfile({
    difficulty: 6,
    typeId: 'H',
    isMissionCorrect: true,
  });
  assert.equal(hProfile.hasHaloRing, false, 'Type H must not have circular bullseye halo rings');
  assert.equal(hProfile.hasCrownBeacon, false);
  assert.equal(hProfile.hasLightPillar, false);
  assert.equal(hProfile.showScreenLockOn, false);
  assert.equal(hProfile.badgeLabel, '');

  const lv1 = computeLaserTrackSpecForDifficulty(1, { shapeKind: 'horizontal_line' });
  const lv3 = computeLaserTrackSpecForDifficulty(3, { shapeKind: 'v_shape' });
  const lv5 = computeLaserTrackSpecForDifficulty(5, { shapeKind: 's_wave' });
  const lv7 = computeLaserTrackSpecForDifficulty(7, { shapeKind: 'z_zigzag' });
  const lv10 = computeLaserTrackSpecForDifficulty(10, { shapeKind: 'infinity_h' });

  assert.equal(lv1.tier, 1);
  assert.equal(lv3.tier, 2);
  assert.equal(lv5.tier, 3);
  assert.equal(lv7.tier, 4);
  assert.equal(lv10.tier, 5);
  assert.ok(lv1.trackLengthMeters < lv3.trackLengthMeters);
  assert.ok(lv3.trackLengthMeters < lv5.trackLengthMeters);
  assert.ok(lv5.trackLengthMeters < lv7.trackLengthMeters);
  assert.ok(lv7.trackLengthMeters < lv10.trackLengthMeters);
});

test('selectFrontmostTargetHit always picks the front-most overlapping target and respects wall occlusion', async () => {
  const { selectFrontmostTargetHit } = await import('./rules');

  // Overlapping targets: back target listed first, front target listed second
  const winner = selectFrontmostTargetHit(
    [
      { targetId: 'back-target', rayDistance: 14.2, cameraDistance: 14.0 },
      { targetId: 'front-target', rayDistance: 7.4, cameraDistance: 7.2 },
    ],
    22.0,
  );
  assert.ok(winner);
  assert.equal(winner?.targetId, 'front-target');

  // When an environment wall is closer than all targets, return null
  const blocked = selectFrontmostTargetHit(
    [
      { targetId: 'far-target', rayDistance: 12.0, cameraDistance: 12.0 },
    ],
    5.5,
  );
  assert.equal(blocked, null);
});

test('computeKeyboardMoveVector supports both WASD and Arrow keys', () => {
  const arrowDiag = computeKeyboardMoveVector({ ArrowUp: true, ArrowRight: true });
  const len = Math.hypot(arrowDiag.forward, arrowDiag.right);
  assert.ok(Math.abs(len - 1.0) < 1e-5);
  assert.ok(arrowDiag.forward > 0);
  assert.ok(arrowDiag.right > 0);
});

test('Hit feedback shows only PERFECT or GOOD without score numbers', () => {
  const p = getShotFeedbackMessage('PERFECT', 45, 5);
  assert.equal(p.title, 'PERFECT');
  assert.equal(p.subtitle, '');

  const g = getShotFeedbackMessage('GOOD', 20, 2);
  assert.equal(g.title, 'GOOD');
  assert.equal(g.subtitle, '');
});

test('getEffectiveAimAssistMul reduces hitbox assist toward 1.0 in precision crosshair mode at higher difficulty', () => {
  // Direct Touch Mode preserves base aimAssistMul
  assert.equal(getEffectiveAimAssistMul(1.4, 1, false), 1.4);
  assert.equal(getEffectiveAimAssistMul(1.4, 10, false), 1.4);

  // Precision Crosshair Mode tapers from 1.4 at Lv1 down to 1.0 at Lv10
  const lv1 = getEffectiveAimAssistMul(1.4, 1, true);
  const lv5 = getEffectiveAimAssistMul(1.4, 5, true);
  const lv10 = getEffectiveAimAssistMul(1.4, 10, true);
  assert.equal(lv1, 1.4);
  assert.ok(lv5 < lv1 && lv5 > lv10);
  assert.equal(lv10, 1.0);
});

test('analyzeVisualFieldBiasFeedback detects weak visual field direction and balanced performance', () => {
  const weakLeft = analyzeVisualFieldBiasFeedback({
    trainingMode: 1,
    screenZoneStats: {
      left: { shots: 6, hits: 2 }, // 33%
      center: { shots: 8, hits: 7 }, // 88%
      right: { shots: 6, hits: 5 }, // 83%
    },
    sectorStats: {
      FRONT: { spawned: 15, hits: 14 },
      LEFT: { spawned: 0, hits: 0 },
      RIGHT: { spawned: 0, hits: 0 },
      REAR: { spawned: 0, hits: 0 },
    },
  });
  assert.equal(weakLeft.hasWeakDirection, true);
  assert.equal(weakLeft.weakestLabel, '좌측 시야');
  assert.ok(weakLeft.message.includes('좌측'));

  const balanced = analyzeVisualFieldBiasFeedback({
    trainingMode: 1,
    screenZoneStats: {
      left: { shots: 5, hits: 4 }, // 80%
      center: { shots: 5, hits: 4 }, // 80%
      right: { shots: 5, hits: 4 }, // 80%
    },
    sectorStats: {
      FRONT: { spawned: 15, hits: 12 },
      LEFT: { spawned: 0, hits: 0 },
      RIGHT: { spawned: 0, hits: 0 },
      REAR: { spawned: 0, hits: 0 },
    },
  });
  assert.equal(balanced.hasWeakDirection, false);
});

test('TargetAndObstacleManager.hasLineOfSight blocks target coordinates hidden behind walls', () => {
  const scene = new THREE.Scene();
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(6, 4, 0.5),
    new THREE.MeshBasicMaterial(),
  );
  wall.position.set(0, 1.5, 0);
  scene.add(wall);

  const mgr = new TargetAndObstacleManager(scene, [], true, [wall]);
  const eye = new THREE.Vector3(0, 1.5, 10);

  // Target directly behind the wall is occluded
  assert.equal(mgr.hasLineOfSight(eye, new THREE.Vector3(0, 1.5, -5)), false);
  // Target to the side with clear line of sight is visible
  assert.equal(mgr.hasLineOfSight(eye, new THREE.Vector3(6, 1.5, -5)), true);
});

test('LaserTrackShuffleBag avoids repeats within last 5 picks and weights current tier ~75% vs lower tier ~25%', async () => {
  const { LaserTrackShuffleBag, LASER_TRACK_SHAPES_BY_TIER } = await import('./rules');
  const bag = new LaserTrackShuffleBag();

  // Deterministic PRNG (LCG)
  let seed = 1234567;
  const rng = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };

  // Last-5 non-repetition check at Lv1 (6 shapes in tier 1)
  const lv1Picks: string[] = [];
  for (let i = 0; i < 30; i++) {
    const pick = bag.pickNextShape(1, rng);
    assert.ok(LASER_TRACK_SHAPES_BY_TIER[1].includes(pick));
    const last5 = lv1Picks.slice(-5);
    assert.equal(last5.includes(pick), false, `Repeated shape ${pick} within last 5 picks`);
    lv1Picks.push(pick);
  }

  // Tier 3 (Lv5) weighting check (~75% tier 3, ~25% tier 2)
  bag.reset();
  let tier3Count = 0;
  let tier2Count = 0;
  const tier3Set = new Set(LASER_TRACK_SHAPES_BY_TIER[3]);
  const tier2Set = new Set(LASER_TRACK_SHAPES_BY_TIER[2]);
  for (let i = 0; i < 200; i++) {
    const p = bag.pickNextShape(5, rng);
    if (tier3Set.has(p)) tier3Count++;
    else if (tier2Set.has(p)) tier2Count++;
  }
  assert.equal(tier3Count + tier2Count, 200);
  assert.ok(tier3Count > 125 && tier3Count < 175, `Expected ~75% tier3, got ${tier3Count}/200`);
  assert.ok(tier2Count > 25 && tier2Count < 75, `Expected ~25% tier2, got ${tier2Count}/200`);
});

test('evaluateContinuousLaserDragProgress traces smoothly, clamps closed-loop skips, and completes at >= 0.95', async () => {
  const { computeLaserTrackSpecForDifficulty, evaluateContinuousLaserDragProgress } = await import('./rules');

  const circleSpec = computeLaserTrackSpecForDifficulty(6, {
    shapeKind: 'circle_loop',
    mirrorX: false,
    reverseDir: false,
  });
  const samples = circleSpec.points;

  // At progress=0.0, touching near the end of the closed circle loop must NOT jump directly to completion
  const nearEnd = samples[samples.length - 1];
  const antiSkip = evaluateContinuousLaserDragProgress({
    samples,
    currentProgress: 0.0,
    pointer: nearEnd,
    corridorTol: 0.35,
    maxForwardStep: 0.18,
    completionThreshold: 0.95,
  });
  assert.equal(antiSkip.completed, false);
  assert.ok(antiSkip.nextProgress <= 0.18 + 1e-6);

  // Sequential sweep along the curve advances monotonically and completes smoothly at >= 0.95
  let prog = 0;
  for (let idx = 0; idx < samples.length; idx += 3) {
    const res = evaluateContinuousLaserDragProgress({
      samples,
      currentProgress: prog,
      pointer: samples[idx],
      corridorTol: 0.35,
      maxForwardStep: 0.18,
      completionThreshold: 0.95,
    });
    assert.equal(res.onTrack, true);
    assert.ok(res.nextProgress >= prog);
    prog = res.nextProgress;
  }
  const finishRes = evaluateContinuousLaserDragProgress({
    samples,
    currentProgress: 0.88,
    pointer: samples[samples.length - 2],
    corridorTol: 0.35,
    maxForwardStep: 0.18,
    completionThreshold: 0.95,
  });
  assert.equal(finishRes.completed, true);
  assert.equal(finishRes.nextProgress, 1.0);

  // Strict start point check: only pointer coordinates within Euclidean distance <= startMarkerRadius start drag
  const { isWithinLaserStartPointRadius, LASER_START_MARKER_RADIUS } = await import('./rules');
  const { buildHologramTargetMesh } = await import('./worldBuilder');

  assert.equal(
    isWithinLaserStartPointRadius({
      pointerX: 400,
      pointerY: 300,
      startX: 400,
      startY: 300,
      startMarkerRadius: 24,
    }),
    true,
  );
  // Diagonal point right inside marker radius (Math.hypot(14, 14) = 19.798 <= 24)
  assert.equal(
    isWithinLaserStartPointRadius({
      pointerX: 414,
      pointerY: 314,
      startX: 400,
      startY: 300,
      startMarkerRadius: 24,
    }),
    true,
  );
  // Point just outside marker radius (Math.hypot(18, 18) = 25.455 > 24) must NOT start drag (zero padding)
  assert.equal(
    isWithinLaserStartPointRadius({
      pointerX: 418,
      pointerY: 318,
      startX: 400,
      startY: 300,
      startMarkerRadius: 24,
    }),
    false,
  );

  // Type H colliderMesh is strictly centered on the start point with exact radius LASER_START_MARKER_RADIUS
  const hTarget = buildHologramTargetMesh({
    instanceId: 'h-strict-start',
    typeId: 'H',
    visualColor: '#2DE2E6',
    shapeKind: 'circle',
    diameter: 1.5,
    aimAssistMul: 1.5,
    hasPedestal: false,
    lowQuality: true,
    difficulty: 6,
    laserTrackSpec: circleSpec,
  });
  const startPt = hTarget.laserCurve!.getPointAt(0);
  assert.ok(Math.abs(hTarget.colliderMesh.position.x - startPt.x) < 1e-5);
  assert.ok(Math.abs(hTarget.colliderMesh.position.y - startPt.y) < 1e-5);
  assert.equal(hTarget.colliderMesh.userData.startMarkerRadius, LASER_START_MARKER_RADIUS);
});

test('validateLaserTrackWorldBounds rejects outer wall, collider margin < 0.55m, and low Y while accepting open plaza space', async () => {
  const { computeLaserTrackSpecForDifficulty, validateLaserTrackWorldBounds } = await import('./rules');
  const spec = computeLaserTrackSpecForDifficulty(10, {
    shapeKind: 'horizontal_line',
    mirrorX: false,
    reverseDir: false,
  });

  const wallCollider: ColliderShape = {
    id: 'test-wall',
    kind: 'aabb',
    minX: -2,
    maxX: 2,
    minZ: -6,
    maxZ: -5,
  };

  // Clear central open position
  const ok = validateLaserTrackWorldBounds({
    centerX: 0,
    centerY: 2.6,
    centerZ: -1.5,
    playerX: 0,
    playerZ: 10,
    spec,
    colliders: [wallCollider],
  });
  assert.equal(ok.valid, true);
  assert.ok(ok.worldTestPoints.length >= 16);

  // Overlapping collider or within 0.55m margin fails
  const nearWall = validateLaserTrackWorldBounds({
    centerX: 0,
    centerY: 2.6,
    centerZ: -4.7,
    playerX: 0,
    playerZ: 10,
    spec,
    colliders: [wallCollider],
  });
  assert.equal(nearWall.valid, false);

  // Too close to outer circular boundary fails
  const outWall = validateLaserTrackWorldBounds({
    centerX: 16.5,
    centerY: 2.6,
    centerZ: 0,
    playerX: 0,
    playerZ: 10,
    spec,
    colliders: [],
  });
  assert.equal(outWall.valid, false);

  // Vertical track dipping below minY=1.0 fails
  const tallSpec = computeLaserTrackSpecForDifficulty(10, { shapeKind: 'vertical_line' });
  const tooLow = validateLaserTrackWorldBounds({
    centerX: 0,
    centerY: 1.1,
    centerZ: 0,
    playerX: 0,
    playerZ: 10,
    spec: tallSpec,
    colliders: [],
  });
  assert.equal(tooLow.valid, false);
});

test('computeMissionBracketVisualState stays permanently visible across Lv1~10 and wrong-target warning only fires on isTarget===true && isMissionTarget===false', async () => {
  const {
    computeMissionBracketVisualState,
    shouldShowWrongTargetWarning,
    getShotFeedbackMessage,
  } = await import('./rules');
  const { buildHologramTargetMesh } = await import('./worldBuilder');

  // Lv 1~10 mission targets keep red frame permanently visible from spawn until destroyed/round end
  for (const lv of [1, 5, 8, 9, 10]) {
    for (const age of [0, 0.25, 1.0, 1.18, 1.5, 4.5, 10.0]) {
      const state = computeMissionBracketVisualState(lv, age);
      assert.equal(state.visible, true);
      assert.equal(state.opacity, 0.96);
      assert.equal(state.scaleMul, 1.0);
    }
  }

  // Mission target meshes have isTarget === true and isMissionTarget === true
  const missionTarget = buildHologramTargetMesh({
    instanceId: 'g-correct',
    typeId: 'G',
    visualColor: '#2DE2E6',
    shapeKind: 'shield',
    diameter: 1.3,
    aimAssistMul: 1.2,
    hasPedestal: false,
    lowQuality: true,
    difficulty: 9,
    isMissionCorrect: true,
  });
  assert.equal(missionTarget.colliderMesh.userData.isTarget, true);
  assert.equal(missionTarget.colliderMesh.userData.isMissionTarget, true);
  assert.equal(shouldShowWrongTargetWarning(missionTarget.colliderMesh.userData), false);

  // Wrong target meshes have isTarget === true and isMissionTarget === false
  const wrongTarget = buildHologramTargetMesh({
    instanceId: 'g-wrong',
    typeId: 'G',
    visualColor: '#FF2A85',
    shapeKind: 'circle',
    diameter: 1.3,
    aimAssistMul: 1.2,
    hasPedestal: false,
    lowQuality: true,
    difficulty: 9,
    isMissionCorrect: false,
  });
  assert.equal(wrongTarget.colliderMesh.userData.isTarget, true);
  assert.equal(wrongTarget.colliderMesh.userData.isMissionTarget, false);
  assert.equal(shouldShowWrongTargetWarning(wrongTarget.colliderMesh.userData), true);
  assert.equal(getShotFeedbackMessage('WRONG').title, '타겟이 아닙니다');

  // Background / environment objects (walls, floor, ceiling, cover, empty air) never trigger warning
  assert.equal(shouldShowWrongTargetWarning(undefined), false);
  assert.equal(shouldShowWrongTargetWarning(null), false);
  assert.equal(shouldShowWrongTargetWarning({}), false);
  assert.equal(shouldShowWrongTargetWarning({ isTarget: false, isMissionTarget: false }), false);
});

test('Indoor shooting range eligibility, trigger schedule, 1.5x scaling (cap 24), and scoreboard-clear slots', async () => {
  const {
    INDOOR_RANGE_WORLD,
    isIndoorRangeEligible,
    computeIndoorRangeTriggerTimes,
    computeIndoorRangeChallengeSpec,
    generateIndoorRangeTargetSlots,
  } = await import('./rules');

  // Eligibility: Lv8~10 and duration >= 60s only
  assert.equal(isIndoorRangeEligible(7, 60), false);
  assert.equal(isIndoorRangeEligible(8, 30), false);
  assert.equal(isIndoorRangeEligible(8, 60), true);
  assert.equal(isIndoorRangeEligible(10, 120), true);

  // Trigger schedule
  assert.deepEqual(computeIndoorRangeTriggerTimes(60, 7), []);
  assert.deepEqual(computeIndoorRangeTriggerTimes(30, 9), []);
  assert.deepEqual(computeIndoorRangeTriggerTimes(60, 8), [28]);
  assert.deepEqual(computeIndoorRangeTriggerTimes(120, 9), [35, 78]);
  assert.deepEqual(computeIndoorRangeTriggerTimes(300, 10), [45, 110, 180, 245]);

  // 1.5x scaling per repeat & cap at 24
  const lv8First = computeIndoorRangeChallengeSpec(8, 0, 1.0);
  const lv8Repeat1 = computeIndoorRangeChallengeSpec(8, 1, 1.0);
  const lv10Capped = computeIndoorRangeChallengeSpec(10, 5, 2.0);
  assert.equal(lv8First.targetCount, 6);
  assert.equal(lv8Repeat1.targetCount, 9);
  assert.equal(lv8First.timeLimitSec, Math.max(8, Math.round(6 * 1.15)));
  assert.equal(lv10Capped.targetCount, 24);
  assert.equal(lv10Capped.timeLimitSec, Math.max(8, Math.round(24 * 1.15)));

  // Target slots: non-overlapping, inside indoor room, and clear of hanging ceiling scoreboard
  const slots = generateIndoorRangeTargetSlots(24, 0.74);
  assert.equal(slots.length, 24);
  for (const s of slots) {
    assert.ok(s.x > INDOOR_RANGE_WORLD.minX && s.x < INDOOR_RANGE_WORLD.maxX);
    assert.ok(s.y >= 1.2 && s.y <= 5.5);
    assert.ok(s.z < -1.0 && s.z > INDOOR_RANGE_WORLD.minZ);
    const inScoreboardBox =
      Math.abs(s.x - INDOOR_RANGE_WORLD.centerX) < 3.0 &&
      s.y > 4.05 &&
      s.z < -3.2 &&
      s.z > -7.2;
    assert.equal(inScoreboardBox, false, 'Target slot must stay clear of ceiling scoreboard');
  }
});

test('Valorant tactical soundEngine exposes all required SFX methods cleanly in headless environment', async () => {
  const { soundEngine } = await import('./audio');
  assert.equal(typeof soundEngine.playShoot, 'function');
  assert.equal(typeof soundEngine.playHitGood, 'function');
  assert.equal(typeof soundEngine.playHitPerfect, 'function');
  assert.equal(typeof soundEngine.playLaserDragStep, 'function');
  assert.equal(typeof soundEngine.playLaserTrackComplete, 'function');
  assert.equal(typeof soundEngine.playIndoorRangeWarning, 'function');
  assert.equal(typeof soundEngine.playIndoorRangeClear, 'function');
  assert.equal(typeof soundEngine.playUiClick, 'function');
  soundEngine.syncSettings({ sfxEnabled: true, sfxVolume: 0.75, bgmEnabled: true });
  assert.equal(soundEngine.sfxEnabled, true);
  assert.equal(soundEngine.sfxVolume, 0.75);
  assert.equal(soundEngine.bgmEnabled, true);
});

test('Valorant 2F Heaven Loop (1F Arch -> Right Corridor -> Smooth Stairs -> 2F Heaven -> Window Sill Standing & Vault Jump to 1F)', async () => {
  const {
    ARENA,
    ARENA_HEAVEN,
    getFloorHeightAt,
    getArenaFloorSupportY,
    isInsideHeavenLoopFootprint,
    resolvePlayerPosition,
    stepPlayerJumpPhysics,
  } = await import('./rules');

  assert.equal(getFloorHeightAt, getArenaFloorSupportY);

  const heavenColliders = [
    {
      id: 'heaven-pier-left',
      kind: 'aabb' as const,
      minX: -4.2,
      maxX: -1.95,
      minZ: -19.9,
      maxZ: -18.4,
    },
    {
      id: 'heaven-pier-right',
      kind: 'aabb' as const,
      minX: 2.4,
      maxX: 5.8,
      minZ: -19.9,
      maxZ: -18.4,
    },
    {
      id: 'heaven-west-wall',
      kind: 'aabb' as const,
      minX: -2.4,
      maxX: -1.95,
      minZ: -26.5,
      maxZ: -18.8,
    },
    {
      id: 'heaven-north-back-wall',
      kind: 'aabb' as const,
      minX: -2.4,
      maxX: 10.0,
      minZ: -26.6,
      maxZ: -26.2,
    },
    {
      id: 'heaven-east-end-wall',
      kind: 'aabb' as const,
      minX: 9.6,
      maxX: 10.1,
      minZ: -26.5,
      maxZ: -19.6,
    },
    {
      id: 'heaven-stair-front-wall',
      kind: 'aabb' as const,
      minX: 2.4,
      maxX: 10.0,
      minZ: -20.0,
      maxZ: -19.1,
    },
    {
      id: 'heaven-corridor-divider-wall',
      kind: 'aabb' as const,
      minX: 2.22,
      maxX: 7.25,
      minZ: -23.3,
      maxZ: -22.9,
    },
    {
      id: 'heaven-1f-stair-divider',
      kind: 'aabb' as const,
      minX: 2.22,
      maxX: 2.52,
      minZ: -23.1,
      maxZ: -19.2,
      minY: 0,
      maxY: 2.4,
    },
    {
      id: 'heaven-2f-back-wall',
      kind: 'aabb' as const,
      minX: -2.0,
      maxX: 2.45,
      minZ: -23.35,
      maxZ: -22.95,
      minY: 3.35,
      maxY: 7.4,
    },
    {
      id: 'heaven-2f-window-sill',
      kind: 'aabb' as const,
      minX: -1.85,
      maxX: 2.25,
      minZ: -19.18,
      maxZ: -18.58,
      minY: 3.35,
      maxY: 4.05,
    },
  ];

  // 1. Walk through 1F Archway beyond the 18m circular plaza boundary (Z: -16.5 -> -24.6)
  let px = 0.2;
  let pz = -16.5;
  let feetY = 0;
  let vy = 0;
  let grounded = true;

  for (let i = 0; i < 40; i++) {
    const res = resolvePlayerPosition(px, pz, 0, -0.22, heavenColliders, ARENA.playerRadius, feetY);
    px = res.x;
    pz = res.z;
  }
  assert.ok(pz < -24.2, `Expected player to enter 1F archway beyond circular wall, got Z=${pz}`);
  assert.equal(isInsideHeavenLoopFootprint(px, pz, ARENA.playerRadius), true);
  assert.equal(getFloorHeightAt(px, pz, feetY), 0);

  // 2. Turn right (+X) into the 1F corridor (X: 0.2 -> 8.3 at Z = -24.6)
  for (let i = 0; i < 40; i++) {
    const res = resolvePlayerPosition(px, pz, 0.21, 0, heavenColliders, ARENA.playerRadius, feetY);
    px = res.x;
    pz = res.z;
  }
  assert.ok(px > 8.1, `Expected player to reach East turnaround landing, got X=${px}`);

  // 3. Move South (+Z) around the divider wall into the staircase entry (Z: -24.6 -> -21.5)
  for (let i = 0; i < 20; i++) {
    const res = resolvePlayerPosition(px, pz, 0, 0.16, heavenColliders, ARENA.playerRadius, feetY);
    px = res.x;
    pz = res.z;
  }
  assert.ok(pz > -22.2 && pz < -20.6, `Expected player at stair entry Z, got Z=${pz}`);

  // 4. Walk West (-X) up the smooth staircase ramp (X: 8.3 -> 1.0) into the 2F Heaven room (Y = 3.40m)
  // Also press lightly against the divider wall (dz = -0.04) to verify wall-sliding never ejects or blocks climbing
  for (let i = 0; i < 65; i++) {
    const res = resolvePlayerPosition(px, pz, -0.12, -0.04, heavenColliders, ARENA.playerRadius, feetY);
    px = res.x;
    pz = res.z;
    const supportY = getFloorHeightAt(px, pz, feetY);
    const step = stepPlayerJumpPhysics({
      feetY,
      verticalVelocity: vy,
      isGrounded: grounded,
      supportY,
      jumpRequested: false,
      allowJump: true,
      dt: 0.016,
    });
    feetY = step.feetY;
    vy = step.verticalVelocity;
    grounded = step.isGrounded;
  }
  assert.ok(px < 1.5, `Expected player to enter 2F Heaven room past 1F divider, got X=${px}`);
  assert.equal(feetY, ARENA_HEAVEN.floor2Y);
  assert.equal(grounded, true);

  // 5. On 2F (feetY = 3.40m), walking into the 2F window sill (maxY = 4.05m) without jumping is blocked
  pz = -20.2;
  for (let i = 0; i < 20; i++) {
    const res = resolvePlayerPosition(px, pz, 0, 0.15, heavenColliders, ARENA.playerRadius, feetY);
    px = res.x;
    pz = res.z;
  }
  assert.ok(pz <= -19.18 - ARENA.playerRadius + 0.02, `Expected 2F window sill to block non-jumping walk, got Z=${pz}`);

  // 6. Press Space / Tablet Jump and move forward onto the 2F window sill top surface (sillTopY = 4.05m)
  let jumpTriggered = false;
  let stoodOnWindowSill = false;
  for (let i = 0; i < 45; i++) {
    const supportY = getFloorHeightAt(px, pz, feetY);
    const step = stepPlayerJumpPhysics({
      feetY,
      verticalVelocity: vy,
      isGrounded: grounded,
      supportY,
      jumpRequested: i === 0,
      allowJump: true,
      dt: 0.016,
    });
    if (step.jumped) jumpTriggered = true;
    feetY = step.feetY;
    vy = step.verticalVelocity;
    grounded = step.isGrounded;

    // Move onto the window sill (stop around Z = -18.88 to verify standing on top of the sill at Y = 4.05m!)
    const dzStep = pz < -18.88 ? 0.055 : 0;
    const res = resolvePlayerPosition(px, pz, 0, dzStep, heavenColliders, ARENA.playerRadius, feetY);
    px = res.x;
    pz = res.z;
    if (grounded && Math.abs(feetY - ARENA_HEAVEN.sillTopY) < 0.02) {
      stoodOnWindowSill = true;
    }
  }
  assert.equal(jumpTriggered, true);
  assert.equal(stoodOnWindowSill, true, `Expected player to land and stand on the 2F window sill at Y=${ARENA_HEAVEN.sillTopY}, got feetY=${feetY}, Z=${pz}`);

  // 7. Walk forward off the window sill out into the main courtyard and land smoothly at 1F (feetY = 0.0m)
  for (let i = 0; i < 60; i++) {
    const res = resolvePlayerPosition(px, pz, 0, 0.09, heavenColliders, ARENA.playerRadius, feetY);
    px = res.x;
    pz = res.z;
    const supportY = getFloorHeightAt(px, pz, feetY);
    const step = stepPlayerJumpPhysics({
      feetY,
      verticalVelocity: vy,
      isGrounded: grounded,
      supportY,
      jumpRequested: false,
      allowJump: true,
      dt: 0.016,
    });
    feetY = step.feetY;
    vy = step.verticalVelocity;
    grounded = step.isGrounded;
  }
  assert.ok(pz > -16.5, `Expected player to exit out the 2F window into main plaza, got Z=${pz}`);
  assert.equal(feetY, 0);
  assert.equal(grounded, true);

  // 8. Stationary mode (allowJump = false) ignores jump requests
  const stationaryStep = stepPlayerJumpPhysics({
    feetY: 0,
    verticalVelocity: 0,
    isGrounded: true,
    supportY: 0,
    jumpRequested: true,
    allowJump: false,
    dt: 0.016,
  });
  assert.equal(stationaryStep.jumped, false);
  assert.equal(stationaryStep.feetY, 0);
});

test('measureFlightRoom stops a flying target short of walls and keeps open space unchanged', async () => {
  const THREE = await import('three');
  const { measureFlightRoom } = await import('./entities');
  // a wall 3 m to the right of the target (x = 3), 6 m tall
  const wall = new THREE.Mesh(new THREE.BoxGeometry(0.4, 6, 6), new THREE.MeshBasicMaterial());
  wall.position.set(3.2, 3, 0);
  wall.updateMatrixWorld(true);
  const origin = new THREE.Vector3(0, 2.5, 0);
  const right = measureFlightRoom({ origin, dir: new THREE.Vector3(1, 0, 0), maxDist: 5, margin: 0.8, obstacles: [wall], heights: [0, 0.6, -0.6] });
  const left = measureFlightRoom({ origin, dir: new THREE.Vector3(-1, 0, 0), maxDist: 5, margin: 0.8, obstacles: [wall], heights: [0, 0.6, -0.6] });
  assert.ok(Math.abs(right - (3.0 - 0.8)) < 1e-3, `right room ${right}`);
  assert.equal(left, 5);
  // no obstacles at all: full range
  assert.equal(measureFlightRoom({ origin, dir: new THREE.Vector3(1, 0, 0), maxDist: 5, margin: 0.8, obstacles: [] }), 5);
  // a wall closer than the margin leaves no room, never negative
  wall.position.set(0.5, 3, 0);
  wall.updateMatrixWorld(true);
  assert.equal(measureFlightRoom({ origin, dir: new THREE.Vector3(1, 0, 0), maxDist: 5, margin: 0.8, obstacles: [wall] }), 0);
});

test('clipBoxOutOfMesh cuts an exact rectangular hole out of large wall triangles', async () => {
  const THREE = await import('three');
  const { clipBoxOutOfMesh } = await import('./glbMapLoader');
  // A 4 x 4 m wall made of just two triangles, facing -Z, centred at (0, 2, 0)
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  wall.position.set(0, 2, 0);
  wall.updateMatrixWorld(true);
  const toLocal = (p: { x: number; y: number; z: number }) => ({ r: p.x, u: p.y, f: -p.z });
  const touched = clipBoxOutOfMesh(wall, toLocal, { r: [-0.5, 0.5], u: [1.5, 3.0], f: [-0.1, 0.1] });
  assert.ok(touched > 0);
  const geo = wall.geometry;
  const p = geo.attributes.position;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  let area = 0;
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    c.fromBufferAttribute(p, i + 2);
    area += b.clone().sub(a).cross(c.clone().sub(a)).length() / 2;
  }
  assert.ok(Math.abs(area - (16 - 1.5)) < 1e-3, `expected 14.5 m2 left, got ${area}`);
  assert.ok(geo.attributes.uv && geo.attributes.normal, 'uv and normal are kept');
  const ray = new THREE.Raycaster();
  const hitAt = (x: number, y: number) => {
    ray.set(new THREE.Vector3(x, y, -2), new THREE.Vector3(0, 0, 1));
    return ray.intersectObject(wall).length > 0;
  };
  assert.equal(hitAt(0, 2.2), false, 'inside the hole is open');
  assert.equal(hitAt(0.7, 2.2), true, 'beside the hole is still wall');
  assert.equal(hitAt(0, 3.3), true, 'above the hole is still wall');
  assert.equal(hitAt(0, 1.2), true, 'below the hole is still wall');
  // A box that misses the wall changes nothing
  assert.equal(clipBoxOutOfMesh(wall, toLocal, { r: [5, 6], u: [0, 1], f: [-0.1, 0.1] }), 0);
});

test('Project C .glb loader auto-scales map (60~100 core width), aligns dense center to (0,0,0), finds stable floor spawn via 15m grid raycast, and enforces colliders & void recovery', async () => {
  const THREE = await import('three');
  const { computeAutoMapScale, processLoadedGlbScene, PLAYER_EYE_HEIGHT } = await import(
    './glbMapLoader'
  );

  // 1. Scale correction: Unreal cm map (>= 500) or miniature map (< 10) scales to ~60-100 core width
  const unrealScale = computeAutoMapScale({
    fullSize: { x: 8000, y: 1200, z: 8000 },
    coreHorizontalSpan: 4200,
  });
  assert.ok(
    4200 * unrealScale >= 60 && 4200 * unrealScale <= 100,
    `Expected Unreal cm core span to scale into 60..100, got ${4200 * unrealScale}`,
  );
  const tinyScale = computeAutoMapScale({
    fullSize: { x: 4, y: 0.8, z: 4 },
    coreHorizontalSpan: 2.5,
  });
  assert.ok(
    2.5 * tinyScale >= 60 && 2.5 * tinyScale <= 100,
    `Expected tiny map core span to scale into 60..100, got ${2.5 * tinyScale}`,
  );

  // 2. Build a synthetic off-center scene with a huge outer floor plate + a dense core building zone at (240, 50, -180)
  const mockScene = new THREE.Group();

  // Giant outer plate shifted far away so overall bbox center differs from dense mesh center
  const outerPlate = new THREE.Mesh(
    new THREE.BoxGeometry(260, 1, 260),
    new THREE.MeshStandardMaterial(),
  );
  outerPlate.position.set(420, 49.5, -350);
  mockScene.add(outerPlate);

  // Core floor slab and surrounding building walls centered around (240, 50, -180)
  const coreFloor = new THREE.Mesh(
    new THREE.BoxGeometry(64, 1.0, 64),
    new THREE.MeshStandardMaterial(),
  );
  coreFloor.position.set(240, 49.5, -180);
  mockScene.add(coreFloor);

  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const pillar = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 5.0, 3.2),
      new THREE.MeshStandardMaterial(),
    );
    pillar.position.set(
      240 + Math.cos(angle) * 18,
      52.5,
      -180 + Math.sin(angle) * 18,
    );
    mockScene.add(pillar);
  }

  // Add a low-ceiling obstacle right at (240, 51.2, -180) so the raycast must pick an adjacent grid cell with >= 2.5m vertical headroom
  const lowRoof = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 0.5, 2.4),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      roughness: 0.2,
      metalness: 1.0,
    }),
  );
  lowRoof.position.set(240, 51.4, -180);
  mockScene.add(lowRoof);

  // Add helper / decal / shadow meshes and a thin untextured white plane floating on the floor that must be hidden & excluded
  const shadowHelperMesh = new THREE.Mesh(
    new THREE.BoxGeometry(8, 2, 8),
    new THREE.MeshStandardMaterial({ color: 0xffffff }),
  );
  shadowHelperMesh.name = 'LightLeak_Shadow_Blocker_01';
  shadowHelperMesh.position.set(240, 51, -180);
  mockScene.add(shadowHelperMesh);

  const floatingWhitePlane = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 12),
    new THREE.MeshStandardMaterial({ color: 0xffffff }),
  );
  floatingWhitePlane.name = 'UnnamedFloatingPlate';
  floatingWhitePlane.rotation.x = -Math.PI / 2;
  floatingWhitePlane.position.set(240, 50.05, -180);
  mockScene.add(floatingWhitePlane);

  // Textured material with high metalness and NoColorSpace must have map.colorSpace = SRGBColorSpace and metalness clamped <= 0.2
  const dummyTex = new THREE.DataTexture(new Uint8Array([200, 180, 160, 255]), 1, 1);
  dummyTex.colorSpace = THREE.NoColorSpace;
  const texturedMesh = new THREE.Mesh(
    new THREE.BoxGeometry(2, 2, 2),
    new THREE.MeshStandardMaterial({
      map: dummyTex,
      metalness: 0.95,
      roughness: 0.3,
    }),
  );
  texturedMesh.position.set(252, 51.5, -168);
  mockScene.add(texturedMesh);

  const runtime = processLoadedGlbScene(mockScene, true);

  // Helper mesh & untextured white floating plane must be hidden and excluded from solidMeshes
  assert.equal(shadowHelperMesh.visible, false);
  assert.equal(floatingWhitePlane.visible, false);
  assert.equal(runtime.solidMeshes.includes(shadowHelperMesh), false);
  assert.equal(runtime.solidMeshes.includes(floatingWhitePlane), false);

  // Near-white material (with or without texture) must be corrected to emissive=0x000000, color=#d4d0c7, roughness>=0.85, envMapIntensity=0.35, side=DoubleSide
  const { PROJECT_C_GLB_PRIMARY_URL, PROJECT_C_GLB_COMPRESSED_URL } = await import('./glbMapLoader');
  // the compressed copy of the same map is tried first, from the same asset repo
  assert.ok(PROJECT_C_GLB_COMPRESSED_URL.startsWith('https://raw.githubusercontent.com/dacn3411-cpu/dddd/main/'));
  assert.ok(PROJECT_C_GLB_COMPRESSED_URL.endsWith('.meshopt.glb'));
  assert.equal(
    PROJECT_C_GLB_PRIMARY_URL,
    'https://raw.githubusercontent.com/dacn3411-cpu/dddd/main/project%20C123.glb',
  );
  const correctedMat = lowRoof.material as THREE.MeshStandardMaterial;
  assert.equal(correctedMat.side, THREE.DoubleSide);
  assert.equal(correctedMat.emissive.getHex(), 0x000000);
  assert.equal(correctedMat.emissiveIntensity, 0);
  assert.equal(correctedMat.color.getHexString(), 'd4d0c7');
  assert.ok(correctedMat.roughness >= 0.85);
  assert.equal(correctedMat.metalness, 0);
  assert.equal(correctedMat.envMapIntensity, 0.35);

  const correctedTexturedMat = texturedMesh.material as THREE.MeshStandardMaterial;
  assert.equal(correctedTexturedMat.map?.colorSpace, THREE.SRGBColorSpace);
  assert.equal(correctedTexturedMat.color.getHexString(), 'd4d0c7');
  assert.ok(correctedTexturedMat.roughness >= 0.85);
  assert.ok(correctedTexturedMat.metalness <= 0.2);
  assert.equal(correctedTexturedMat.envMapIntensity, 0.35);

  // Spawn must be fixed at pos(-1.2, 0, -8.5) facing +F (yaw = 0) at floorY + PLAYER_EYE_HEIGHT (1.7)
  const expectedSpawn = runtime.pos(-1.2, 0, -8.5);
  assert.ok(Math.abs(runtime.spawnPoint.x - expectedSpawn.x) < 0.05);
  assert.ok(Math.abs(runtime.spawnPoint.z - expectedSpawn.z) < 0.05);
  assert.equal(runtime.spawnPoint.yaw, 0);
  assert.ok(
    Math.abs(runtime.spawnPoint.eyeY - (runtime.spawnPoint.floorY + PLAYER_EYE_HEIGHT)) < 1e-5,
  );

  // Floor support raycast at spawn point returns spawnPoint.floorY
  const floorAtSpawn = runtime.getFloorSupportY(
    runtime.spawnPoint.x,
    runtime.spawnPoint.z,
    runtime.spawnPoint.floorY,
  );
  assert.ok(
    Math.abs(floorAtSpawn - runtime.spawnPoint.floorY) < 0.08,
    `Expected floorAtSpawn ~ ${runtime.spawnPoint.floorY}, got ${floorAtSpawn}`,
  );

  // The A Tower keeps its own .glb layout (left stairs to 2F); only the 2F front window gets
  // an invisible sill + two jambs so a jump (not a walk) takes the player out through it,
  // plus a visible finish (raised sill, reveals, trim, lintel) for the taller opening.
  assert.ok(runtime.aTowerRouteGroup);
  assert.equal(runtime.aTowerRouteGroup.name, 'aTowerWindowVaultGroup');
  const colliderNames: string[] = [];
  const finishNames: string[] = [];
  runtime.aTowerRouteGroup.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (mesh.userData.isCustomCollider) {
      colliderNames.push(mesh.name);
      assert.equal((mesh.material as THREE.Material).visible, false);
    } else {
      finishNames.push(mesh.name);
      assert.equal(mesh.userData.excludeFromCollision, true);
      assert.equal(runtime.solidMeshes.includes(mesh), false);
    }
  });
  assert.deepEqual(colliderNames.sort(), [
    'ATowerWindow_Jamb_L_Collider',
    'ATowerWindow_Jamb_R_Collider',
    'ATowerWindow_Sill_Collider',
  ]);
  assert.deepEqual(finishNames.sort(), [
    'ATowerWindow_Lintel',
    'ATowerWindow_Reveal_L',
    'ATowerWindow_Reveal_R',
    'ATowerWindow_SillCap',
    'ATowerWindow_SillInfill',
    'ATowerWindow_Trim_L',
    'ATowerWindow_Trim_R',
  ]);

  const { WINDOW_SILL_HEIGHT, WINDOW_VAULT_CLEAR_HEIGHT, WINDOW_OPENING_HEIGHT } = await import('./glbMapLoader');
  const { ARENA_HEAVEN } = await import('./rules');
  const win = runtime.aTowerWindow;
  const maxJump = (ARENA_HEAVEN.jumpVelocity * ARENA_HEAVEN.jumpVelocity) / (2 * ARENA_HEAVEN.gravity);
  assert.ok(WINDOW_SILL_HEIGHT > 0.65, 'sill must be taller than the 0.65 step-over ray');
  assert.ok(WINDOW_VAULT_CLEAR_HEIGHT < maxJump, 'a normal jump must clear the sill');
  assert.ok(
    WINDOW_OPENING_HEIGHT >= PLAYER_EYE_HEIGHT + maxJump + 0.1,
    'the opening must be taller than the eye at the top of a jump, so the camera never enters the wall',
  );
  // The lintel sits at the top of the opening, above the highest eye position
  const lintel = runtime.aTowerRouteGroup.getObjectByName('ATowerWindow_Lintel') as THREE.Mesh;
  const lintelBottomY = new THREE.Box3().setFromObject(lintel).min.y;
  const highestEyeY = runtime.pos(0, win.floorU + maxJump, 0).y + PLAYER_EYE_HEIGHT * runtime.unitScale;
  assert.ok(lintelBottomY > highestEyeY + 0.1, `lintel ${lintelBottomY} vs eye ${highestEyeY}`);

  // Walking at 2F floor height toward the front window (-F, i.e. +Z) is stopped by the sill
  const winStart = runtime.pos(0, win.floorU, 1.6);
  let wx = winStart.x;
  let wz = winStart.z;
  const floorWorldY = runtime.pos(0, win.floorU, 0).y;
  for (let i = 0; i < 40; i++) {
    const moved = runtime.resolveHorizontalMove(wx, wz, 0, 0.12, floorWorldY);
    wx = moved.x;
    wz = moved.z;
  }
  const sillInnerZ = runtime.pos(0, win.floorU, win.fInner).z;
  assert.ok(
    wz <= sillInnerZ - 0.3,
    `Expected the window sill to block walking out, got z=${wz} vs sill=${sillInnerZ}`,
  );

  // Mid-jump (feet above the sill clearance) the same move goes out through the window
  const airborneY = runtime.pos(0, win.floorU + WINDOW_VAULT_CLEAR_HEIGHT + 0.15, 0).y;
  for (let i = 0; i < 25; i++) {
    const moved = runtime.resolveHorizontalMove(wx, wz, 0, 0.12, airborneY);
    wx = moved.x;
    wz = moved.z;
  }
  const outsideZ = runtime.pos(0, win.floorU, win.fOuter - 0.5).z;
  assert.ok(wz > outsideZ, `Expected a jump to carry the player out of the window, got z=${wz}`);

  // The sill is never treated as a floor to stand on
  const onSill = runtime.pos(0, win.floorU, (win.fOuter + win.fInner) * 0.5);
  const sillTopY = runtime.pos(0, win.floorU + WINDOW_SILL_HEIGHT, 0).y;
  assert.ok(runtime.getFloorSupportY(onSill.x, onSill.z, floorWorldY) < sillTopY - 0.05);

  // Void fall threshold triggers at minY - 10 or below
  assert.equal(runtime.isBelowVoidThreshold(runtime.spawnPoint.floorY), false);
  assert.equal(runtime.isBelowVoidThreshold(runtime.mapBounds.min.y - 10.5), true);
  assert.ok(runtime.anchors.length >= 16);
  assert.ok(runtime.colliders.length >= 8);
});




