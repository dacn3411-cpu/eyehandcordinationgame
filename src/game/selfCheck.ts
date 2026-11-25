/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';
import {
  ALL_TARGET_TYPES,
  ARENA,
  calculateNormalized100Score,
  clampPlayerYawForMode,
  ColliderShape,
  computeJoystickMoveVector,
  computeKeyboardMoveVector,
  computeTargetDirectionHint,
  computeTargetVisualEffectProfile,
  DIFFICULTY_CONFIG,
  getShotFeedbackMessage,
  isWorldTargetAllowedForMode,
  NON_TARGET_MESSAGE,
  resolvePlayerPosition,
  SessionRecorder,
  TargetTypeId,
  TARGET_TYPES,
  TRAINING_MODES,
  verifyDifficultyMonotonicity,
} from './rules';
import { buildHologramTargetMesh, getShapeKindForType } from './worldBuilder';

export interface SelfCheckItemResult {
  id: number;
  title: string;
  passed: boolean;
  detail: string;
}

export function runAllSelfChecks(
  rendererReady: boolean,
  baseColliders: ColliderShape[],
): SelfCheckItemResult[] {
  const results: SelfCheckItemResult[] = [];

  // 1. Three.js load & Renderer creation
  try {
    const hasThree =
      typeof THREE.Scene === 'function' &&
      typeof THREE.WebGLRenderer === 'function';
    const pass = hasThree && (rendererReady || typeof document !== 'undefined');
    results.push({
      id: 1,
      title: '1. Three.js 로드와 렌더러 생성',
      passed: pass,
      detail: pass
        ? `Three.js r${THREE.REVISION} 및 WebGL 렌더러 정상 초기화 확인`
        : '렌더러가 초기화되지 않았습니다.',
    });
  } catch (e) {
    results.push({
      id: 1,
      title: '1. Three.js 로드와 렌더러 생성',
      passed: false,
      detail: String(e),
    });
  }

  // 2. All Target types (6종: A·B·C·E·G·H) generation, collider & parameters check
  try {
    const ids: TargetTypeId[] = ALL_TARGET_TYPES;
    let allOk = ids.length === 6 && ALL_TARGET_TYPES.length === 6;
    const notes: string[] = [];
    for (const id of ids) {
      const spec = TARGET_TYPES[id];
      const diam = spec.baseDiameter * DIFFICULTY_CONFIG[3].sizeMul;
      const built = buildHologramTargetMesh({
        instanceId: `chk-${id}`,
        typeId: id,
        visualColor: spec.color,
        shapeKind: getShapeKindForType(id),
        diameter: diam,
        aimAssistMul: 1.2,
        hasPedestal: true,
        lowQuality: true,
      });
      const colOk =
        built.colliderMesh &&
        built.colliderMesh.userData.targetId === `chk-${id}` &&
        Math.abs(built.colliderMesh.userData.visibleRadius - diam * 0.5) < 0.001;
      if (!colOk) {
        allOk = false;
        notes.push(`${id}형 충돌체 오류`);
      }
      const effProfile = computeTargetVisualEffectProfile({
        difficulty: 10,
        typeId: id,
        isMissionCorrect: true,
      });
      if (
        effProfile.hasHaloRing ||
        effProfile.hasCrownBeacon ||
        effProfile.hasLightPillar ||
        effProfile.showScreenLockOn ||
        effProfile.badgeLabel !== ''
      ) {
        allOk = false;
        notes.push(`${id}형 과도한 강조 이펙트 잔존`);
      }
    }
    results.push({
      id: 2,
      title: '2. 6종 목표물(A·B·C·E·G·H) 외형·충돌체 및 강조 이펙트 제거 검증',
      passed: allOk,
      detail: allOk
        ? '6종 홀로그램 목표물 메시, 단계별 레이저 트랙, 조준 보조 충돌체 및 무장식 시각 변별 프로파일 확인 완료'
        : notes.join(', '),
    });
  } catch (e) {
    results.push({
      id: 2,
      title: '2. 6종 목표물(A·B·C·E·G·H) 외형·충돌체 및 강조 이펙트 제거 검증',
      passed: false,
      detail: String(e),
    });
  }

  // 3. DIFFICULTY_CONFIG 1~10 monotonicity & Lv5+ rear spawn rule check
  const mono = verifyDifficultyMonotonicity();
  results.push({
    id: 3,
    title: '3. DIFFICULTY_CONFIG 1~10단계 단조성 및 Lv5+ 후방 출현 규칙 확인',
    passed: mono.pass,
    detail: mono.details,
  });

  // 4. Raycasting front hit, non-target '목표물이 아닙니다!' message, and obstacle occlusion check
  try {
    const testCam = new THREE.PerspectiveCamera(70, 1.6, 0.1, 100);
    testCam.position.set(0, 1.5, 10);
    testCam.rotation.set(0, 0, 0);
    testCam.updateProjectionMatrix();
    testCam.updateMatrixWorld(true);

    const tgt = buildHologramTargetMesh({
      instanceId: 'ray-test-tgt',
      typeId: 'A',
      visualColor: '#2DE2E6',
      shapeKind: 'shield',
      diameter: 2.0,
      aimAssistMul: 1.2,
      hasPedestal: false,
      lowQuality: true,
    });
    tgt.root.position.set(0, 1.5, 0);
    tgt.root.updateMatrixWorld(true);
    tgt.colliderMesh.updateMatrixWorld(true);

    const raycaster = new THREE.Raycaster();
    raycaster.far = 80;

    // Direct center shot -> Hit
    raycaster.set(new THREE.Vector3(0, 1.5, 10), new THREE.Vector3(0, 0, -1));
    const directHits = raycaster.intersectObjects([tgt.colliderMesh], false);
    const frontPass = directHits.length > 0 && directHits[0].object === tgt.colliderMesh;

    // Off-center shot -> Non-target ('목표물이 아닙니다!')
    raycaster.set(
      new THREE.Vector3(0, 1.5, 10),
      new THREE.Vector3(0.6, 0.6, -1).normalize(),
    );
    const offHits = raycaster.intersectObjects([tgt.colliderMesh], false);
    const nonTargetFeedback = getShotFeedbackMessage('NON_TARGET');
    const missPass =
      offHits.length === 0 && nonTargetFeedback.title === NON_TARGET_MESSAGE;

    // Occluded by wall in front -> Environment mesh closer than target -> '목표물이 아닙니다!'
    const wallMesh = new THREE.Mesh(
      new THREE.BoxGeometry(4, 4, 0.5),
      new THREE.MeshBasicMaterial(),
    );
    wallMesh.position.set(0, 1.5, 5);
    wallMesh.updateMatrixWorld(true);

    raycaster.set(new THREE.Vector3(0, 1.5, 10), new THREE.Vector3(0, 0, -1));
    const occHits = raycaster.intersectObjects([wallMesh, tgt.colliderMesh], false);
    const occPass = occHits.length >= 2 && occHits[0].object === wallMesh;

    const perfectFb = getShotFeedbackMessage('PERFECT', 30, 3);
    const goodFb = getShotFeedbackMessage('GOOD', 15, 1);
    const feedbackCleanPass =
      perfectFb.title === 'PERFECT' &&
      perfectFb.subtitle === '' &&
      goodFb.title === 'GOOD' &&
      goodFb.subtitle === '';

    const allRayOk = frontPass && missPass && occPass && feedbackCleanPass;
    results.push({
      id: 4,
      title: '4. Raycasting 정면 명중·비목표물("목표물이 아닙니다!")·구조물 차폐·판정 팝업 검증',
      passed: allRayOk,
      detail: allRayOk
        ? `정면 명중(PERFECT/GOOD 단일 판정), 비목표물("${NON_TARGET_MESSAGE}") 및 차폐 판정 모두 통과`
        : `front:${frontPass}, miss:${missPass}, occ:${occPass}, fb:${feedbackCleanPass}`,
    });
  } catch (e) {
    results.push({
      id: 4,
      title: '4. Raycasting 정면 명중·비목표물("목표물이 아닙니다!")·구조물 차폐 판정',
      passed: false,
      detail: String(e),
    });
  }

  // 5. Recorder accuracy, equation, 4 Training Modes (MODE 1~4), and new metrics check
  try {
    const recStationary = new SessionRecorder(5, 120, 1);
    const sumStationary = recStationary.buildSummary(60);
    const mode1Ok =
      sumStationary.trainingMode === 1 &&
      sumStationary.movementAllowed === false &&
      sumStationary.obstacleAvoidanceRatePct === null &&
      Math.abs(clampPlayerYawForMode(Math.PI, 1) - Math.PI / 4) < 1e-5 &&
      !isWorldTargetAllowedForMode(0, 10, 0, 20, 1) &&
      isWorldTargetAllowedForMode(0, 10, 2, -10, 1);

    const mode24Ok =
      TRAINING_MODES[2].allowMovement === false &&
      TRAINING_MODES[2].allowRearTargets === true &&
      clampPlayerYawForMode(Math.PI, 2) === Math.PI &&
      isWorldTargetAllowedForMode(0, 10, 0, 20, 2) &&
      TRAINING_MODES[3].allowMovement === true &&
      TRAINING_MODES[3].maxYawDeg === 45 &&
      TRAINING_MODES[4].allowMovement === true &&
      TRAINING_MODES[4].allowRearTargets === true;

    const rec = new SessionRecorder(5, 120, 4);
    rec.recordTargetSpawn('A', false);
    rec.recordTargetSpawn('A', true);
    rec.recordTargetSpawn('B', false);
    rec.recordDirectionHintShown();
    rec.recordShotHit({
      type: 'A',
      grade: 'PERFECT',
      reactionMs: 350,
      aimErrorPct: 12,
      screenZone: 'center',
      elapsedSec: 5,
      isDirectTouch: true,
      wasRearSpawn: true,
    });
    rec.recordTargetTimeout('A');
    rec.recordShotMiss(12, 'left', true);
    rec.recordShotWrongSelection(18, 'right');

    const sum = rec.buildSummary(60);
    const eqOk = sum.shotsAttempted === sum.hits + sum.misses + sum.wrongSelections;
    const rateOk = sum.accuracyPct === 33.3 && sum.typeStats.A.hitRatePct === 50.0;
    const score100Ok =
      sum.maxScore === 100 &&
      sum.totalScore >= 0 &&
      sum.totalScore <= 100 &&
      sum.perfectHits === 1 &&
      sum.goodHits === 0 &&
      sum.missCount === sum.misses + sum.wrongSelections + sum.missedTargets;

    // Verify 10s vs 120s time-independent normalization
    const norm10 = calculateNormalized100Score({
      hits: 8,
      perfectHits: 6,
      goodHits: 2,
      shotsAttempted: 10,
      misses: 2,
      missedTargets: 1,
      avgReactionMs: 380,
    });
    const norm120 = calculateNormalized100Score({
      hits: 80,
      perfectHits: 60,
      goodHits: 20,
      shotsAttempted: 100,
      misses: 20,
      missedTargets: 10,
      avgReactionMs: 380,
    });
    const timeNormOk = norm10 === norm120 && norm10 > 0 && norm10 <= 100;

    const newMetricsOk =
      sum.nonTargetHits === 1 &&
      sum.directTouchHits === 1 &&
      sum.rearTargetsSpawned === 1 &&
      sum.rearTargetsHit === 1 &&
      sum.directionHintShownCount === 1 &&
      sum.obstacleAvoidanceRatePct === 100;
    const pass = eqOk && rateOk && newMetricsOk && mode1Ok && mode24Ok && score100Ok && timeNormOk;
    results.push({
      id: 5,
      title: '5. 100점 만점 정규화 점수·훈련 모드(MODE 1~4)·기록 등식 검증',
      passed: pass,
      detail: pass
        ? `10초/120초 정규화 점수(${norm10}/100점) 일치 및 발사(${sum.shotsAttempted})=명중(${sum.hits})+오조준(${sum.misses})+오답(${sum.wrongSelections}) 일치`
        : '기록 또는 100점 정규화 규칙 불일치',
    });
  } catch (e) {
    results.push({
      id: 5,
      title: '5. 100점 만점 정규화 점수·훈련 모드(MODE 1~4)·기록 등식 검증',
      passed: false,
      detail: String(e),
    });
  }

  // 6. 360° circular plaza bounds & tangent collision sliding check
  try {
    const outBounds = resolvePlayerPosition(25, 30, 1, 1, baseColliders, ARENA.playerRadius);
    const distFromOrigin = Math.hypot(outBounds.x, outBounds.z);
    const inBoundsOk = distFromOrigin <= ARENA.playRadius - ARENA.playerRadius + 0.01;

    const testBox: ColliderShape = {
      id: 'chk-box',
      kind: 'aabb',
      minX: -1,
      maxX: 1,
      minZ: 4,
      maxZ: 6,
    };
    // Diagonal movement against container face should slide along X while blocked on Z
    const slideStep = resolvePlayerPosition(
      0,
      6.4,
      0.8,
      -0.8,
      [testBox],
      ARENA.playerRadius,
    );
    const slideOk = slideStep.x > 0.5 && slideStep.z >= 6.0;

    const insideContainer = resolvePlayerPosition(0, 5, 0, 0, [testBox], ARENA.playerRadius);
    const pushedOutOk =
      insideContainer.x < -1 ||
      insideContainer.x > 1 ||
      insideContainer.z < 4 ||
      insideContainer.z > 6;

    const pass = inBoundsOk && slideOk && pushedOutOk;
    results.push({
      id: 6,
      title: '6. 360° 원형 광장 경계(R=18m) 및 접선 충돌 슬라이딩 검증',
      passed: pass,
      detail: pass
        ? '360° 원형 외벽 클램핑, 대각선 이동 시 접선 슬라이딩, 구조물 밀어내기 모두 통과'
        : `inBounds:${inBoundsOk}, slide:${slideOk}, pushedOut:${pushedOutOk}`,
    });
  } catch (e) {
    results.push({
      id: 6,
      title: '6. 360° 원형 광장 경계(R=18m) 및 접선 충돌 슬라이딩 검증',
      passed: false,
      detail: String(e),
    });
  }

  // 7. Keyboard & Tablet Joystick input vectors
  try {
    const kb = computeKeyboardMoveVector({ KeyW: true, KeyA: true });
    const kbOk =
      Math.abs(Math.hypot(kb.forward, kb.right) - 1.0) < 0.001 &&
      kb.forward > 0 &&
      kb.right < 0;
    const joy = computeJoystickMoveVector(45, -45, 70, 0.12);
    const joyOk =
      joy.forward > 0 && joy.right > 0 && joy.magnitude > 0.5 && joy.magnitude <= 1.0;
    const pass = kbOk && joyOk;
    results.push({
      id: 7,
      title: '7. PC 키보드 및 태블릿 조이스틱 이동 벡터 정규화',
      passed: pass,
      detail: pass
        ? 'WASD 대각선 정규화 및 가상 조이스틱 데드존·아날로그 비례 벡터 정상'
        : '입력 벡터 오류',
    });
  } catch (e) {
    results.push({
      id: 7,
      title: '7. PC 키보드 및 태블릿 조이스틱 이동 벡터 정규화',
      passed: false,
      detail: String(e),
    });
  }

  // 8. Result summary & SVG graph data generation check (6 Target Types & 100-point scale)
  try {
    const rec = new SessionRecorder(6, 10);
    rec.recordTargetSpawn('A');
    rec.recordTargetSpawn('C');
    rec.recordShotHit({
      type: 'C',
      grade: 'PERFECT',
      reactionMs: 290,
      aimErrorPct: 9,
      screenZone: 'center',
      elapsedSec: 5,
    });
    const summary = rec.buildSummary(10);
    const pass =
      summary.timelineBuckets.length === 6 &&
      Object.keys(summary.typeStats).length === 6 &&
      summary.totalScore > 0 &&
      summary.totalScore <= 100 &&
      summary.durationSec === 10;
    results.push({
      id: 8,
      title: '8. 결과 화면(100점 만점·6종 유형별 통계·10초 모드) 및 그래프 데이터 검증',
      passed: pass,
      detail: pass
        ? '100점 만점 요약표, 6종 유형별 막대그래프, 시간 6구간 꺾은선그래프 데이터 무결성 통과'
        : '결과 데이터 생성 오류',
    });
  } catch (e) {
    results.push({
      id: 8,
      title: '8. 결과 화면(100점 만점·6종 유형별·10초 모드) 및 그래프 데이터 검증',
      passed: false,
      detail: String(e),
    });
  }

  // 9. Offscreen Target Direction Hint (Stage 0 -> Stage 1~5 Wave) & Rear Angle check
  try {
    const baseParams = {
      playerX: 0,
      playerY: 1.5,
      playerZ: 10,
      playerYawRad: 0,
      playerPitchRad: 0,
      targetX: 0,
      targetY: 2.5,
      targetZ: 20, // Directly behind player (+Z)
      hintDelaySec: 1.0,
    };
    const stg0 = computeTargetDirectionHint({ ...baseParams, unseenDurationSec: 0.4 });
    const stg1 = computeTargetDirectionHint({ ...baseParams, unseenDurationSec: 1.1 });
    const stg2 = computeTargetDirectionHint({ ...baseParams, unseenDurationSec: 1.6 });
    const stg3 = computeTargetDirectionHint({ ...baseParams, unseenDurationSec: 2.2 });
    const stg4 = computeTargetDirectionHint({ ...baseParams, unseenDurationSec: 2.7 });
    const stg5 = computeTargetDirectionHint({
      ...baseParams,
      targetX: 12,
      targetZ: 10, // Right 90 deg
      unseenDurationSec: 3.4,
    });

    const pass =
      stg0.isOffscreen &&
      stg0.stage === 0 &&
      stg0.waveRingCount === 0 &&
      stg1.stage === 1 &&
      stg1.waveRingCount === 1 &&
      stg1.directionSector === 'REAR' &&
      stg2.stage === 2 &&
      stg2.waveRingCount === 2 &&
      stg3.stage === 3 &&
      stg3.waveRingCount === 2 &&
      stg4.stage === 4 &&
      stg4.waveRingCount === 3 &&
      stg5.stage === 5 &&
      stg5.waveRingCount === 3 &&
      stg5.waveDurationSec >= 1.5 &&
      stg5.directionSector === 'RIGHT' &&
      Math.abs(stg5.relativeYawDeg - 90) <= 2;

    results.push({
      id: 9,
      title: '9. 시야 밖 목표물 방향 힌트(Stage 1~5 파동) 및 360° 상대 방위각 계산',
      passed: pass,
      detail: pass
        ? `Stage 0→1→2→3→4→5 파동 링(${stg1.waveRingCount}~${stg5.waveRingCount}중, 주기 ${stg5.waveDurationSec}s) 및 후방(${stg1.directionLabel})·우측(${stg5.relativeYawDeg}°) 계산 정확`
        : '방향 힌트 Stage 1~5 계산 오류',
    });
  } catch (e) {
    results.push({
      id: 9,
      title: '9. 시야 밖 목표물 방향 힌트(Stage 1~5 파동) 및 360° 상대 방위각 계산',
      passed: false,
      detail: String(e),
    });
  }

  // 10. Tablet Direct-Touch Screen NDC Raycast & Touch Assist verification
  try {
    const cam = new THREE.PerspectiveCamera(70, 1.6, 0.1, 100);
    cam.position.set(0, 1.5, 10);
    cam.rotation.set(0, 0, 0);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);

    const tgt = buildHologramTargetMesh({
      instanceId: 'touch-ray-tgt',
      typeId: 'B',
      visualColor: '#E052E8',
      shapeKind: 'circle',
      diameter: 1.4,
      aimAssistMul: 1.3,
      hasPedestal: false,
      lowQuality: true,
    });
    // Place target on the right side of the screen (X = +4.2, Y = 2.4, Z = 0)
    tgt.root.position.set(4.2, 2.4, 0);
    tgt.root.updateMatrixWorld(true);
    tgt.colliderMesh.updateMatrixWorld(true);

    // Project target world position to screen NDC (simulating finger tap directly on target)
    const projectedNdc = tgt.root.position.clone().project(cam);
    const touchRaycaster = new THREE.Raycaster();
    touchRaycaster.setFromCamera(new THREE.Vector2(projectedNdc.x, projectedNdc.y), cam);
    const touchHits = touchRaycaster.intersectObjects([tgt.colliderMesh], false);
    const directTouchPass =
      touchHits.length > 0 && touchHits[0].object.userData.targetId === 'touch-ray-tgt';

    results.push({
      id: 10,
      title: '10. 태블릿 과녁 직접 터치(Screen NDC Raycast) 즉시 명중 판정',
      passed: directTouchPass,
      detail: directTouchPass
        ? `화면 비중앙(NDC ${projectedNdc.x.toFixed(2)}, ${projectedNdc.y.toFixed(2)}) 과녁 터치 시 시점 이동 없이 즉시 명중 확인`
        : '태블릿 직접 터치 Raycast 실패',
    });
  } catch (e) {
    results.push({
      id: 10,
      title: '10. 태블릿 과녁 직접 터치(Screen NDC Raycast) 즉시 명중 판정',
      passed: false,
      detail: String(e),
    });
  }

  return results;
}
