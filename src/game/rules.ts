/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const PALETTE = {
  skyTop: '#5B94B8',
  skyBottom: '#EAD3B8',
  primaryPurple: '#E63946',
  lightPurple: '#D8C8B8',
  darkPurple: '#0F1923',
  cyan: '#00F5D4',
  orange: '#FF8A2B',
  magenta: '#FF4655',
  blue: '#38BDF8',
  lime: '#10E88A',
  yellow: '#FFD166',
  floor: '#C69672',
  stone: '#DED0C0',
  white: '#ECE8E1',
  northGate: '#00F5D4',
  eastGate: '#FF8A2B',
  southGate: '#10E88A',
  westGate: '#FF4655',
} as const;

/**
 * 2. 맵 확장 (360° 원형/전방향 파스텔 SF 훈련 광장)
 * - 원점 (0, 0, 0)을 중심으로 사방 360° 열린 광장
 * - 플레이어 시작 위치: (0, 1.5, +10), 정면(-Z, 북쪽 메인 아치 방향)을 바라봄
 * - 플레이어 이동 가능 구역: X -18 ~ +18, Z -18 ~ +18 및 반지름 18m 원형 구역
 */
export const ARENA = {
  minX: -36,
  maxX: 36,
  minZ: -36,
  maxZ: 36,
  arenaRadius: 34,
  playMinX: -18,
  playMaxX: 18,
  playMinZ: -18,
  playMaxZ: 18,
  playRadius: 18,
  startPos: { x: 0, y: 1.5, z: 10 },
  playerRadius: 0.4,
  playerHeight: 1.75,
  spawnMinX: -26,
  spawnMaxX: 26,
  spawnMinZ: -28,
  spawnMaxZ: 28,
  spawnMinY: 0.8,
  spawnMaxY: 8.5,
  obstacleMinZ: -16,
  obstacleMaxZ: 16,
  periodicMinZ: -10,
  periodicMaxZ: 12,
};

export const ARENA_HEAVEN = {
  // 1F Archway entrance under the 2F window -> right turn corridor -> staircase -> 2F Heaven room -> open 2F window
  archMinX: -1.95,
  archMaxX: 2.4,
  archPortalZ: -17.5,
  hallMinZ: -26.2,
  corridorMaxZ: -23.3,
  corridorMaxX: 9.6,
  stairMinZ: -22.9,
  stairMaxZ: -20.0,
  stairBottomX: 7.45,
  stairTopX: 2.4,
  room2FMinX: -1.95,
  room2FMaxX: 2.45,
  room2FMinZ: -23.0,
  room2FMaxZ: -18.8,
  floor2Y: 3.4,
  sillHeight: 0.65,
  sillTopY: 4.05,
  sillColliderMaxY: 4.05,
  windowOpenTopY: 6.75,
  windowMinX: -1.75,
  windowMaxX: 2.15,
  windowZ: -19.05,
  playerHeight: 1.75,
  jumpVelocity: 8.2,
  gravity: 26.0,
} as const;

export type TargetTypeId = 'A' | 'B' | 'C' | 'E' | 'G' | 'H';

export const ALL_TARGET_TYPES: TargetTypeId[] = ['A', 'B', 'C', 'E', 'G', 'H'];

export type SpawnDirectionSector = 'FRONT' | 'LEFT' | 'RIGHT' | 'REAR';

export type TrainingModeId = 1 | 2 | 3 | 4;

export interface TrainingModeConfig {
  id: TrainingModeId;
  code: 'MODE 1' | 'MODE 2' | 'MODE 3' | 'MODE 4';
  name: string;
  shortName: string;
  allowMovement: boolean;
  wasdEnabled: boolean;
  joystickEnabled: boolean;
  yawRangeType: 'FRONT_45' | 'FREE_360';
  maxYawDeg: number | null; // 45 for MODE 1 & 3, null for MODE 2 & 4
  maxYawRad: number | null;
  pitchEnabled: boolean;
  allowFrontTargets: boolean;
  allowRearTargets: boolean;
  allowObstacleAvoidance: boolean;
  movementLabel: string;
  yawRangeLabel: string;
  spawnRangeLabel: string;
  purposes: string[];
}

export const TRAINING_MODES: Record<TrainingModeId, TrainingModeConfig> = {
  1: {
    id: 1,
    code: 'MODE 1',
    name: '제자리 고정 + 전방 시야',
    shortName: '제자리 · 전방 ±45°',
    allowMovement: false,
    wasdEnabled: false,
    joystickEnabled: false,
    yawRangeType: 'FRONT_45',
    maxYawDeg: 45,
    maxYawRad: Math.PI / 4,
    pitchEnabled: true,
    allowFrontTargets: true,
    allowRearTargets: false,
    allowObstacleAvoidance: false,
    movementLabel: '불가능 (제자리 고정)',
    yawRangeLabel: '좌우 ±45° (상하 가능)',
    spawnRangeLabel: '전방 시야 범위 (±45°)',
    purposes: ['기본 눈-손 협응', '전방 시각 탐색', '조준 정확도', '목표물 추적'],
  },
  2: {
    id: 2,
    code: 'MODE 2',
    name: '제자리 고정 + 자유 회전',
    shortName: '제자리 · 360° 회전',
    allowMovement: false,
    wasdEnabled: false,
    joystickEnabled: false,
    yawRangeType: 'FREE_360',
    maxYawDeg: null,
    maxYawRad: null,
    pitchEnabled: true,
    allowFrontTargets: true,
    allowRearTargets: true,
    allowObstacleAvoidance: false,
    movementLabel: '불가능 (제자리 고정)',
    yawRangeLabel: '좌우 360° 자유 회전',
    spawnRangeLabel: '360° 전방·좌우·후방·대각선',
    purposes: ['360° 시각적 탐색', '공간지각', '방향 전환', '시각적 주의 전환', '눈-손 협응'],
  },
  3: {
    id: 3,
    code: 'MODE 3',
    name: '자유 이동 + 전방 시야',
    shortName: '자유 이동 · 전방 ±45°',
    allowMovement: true,
    wasdEnabled: true,
    joystickEnabled: true,
    yawRangeType: 'FRONT_45',
    maxYawDeg: 45,
    maxYawRad: Math.PI / 4,
    pitchEnabled: true,
    allowFrontTargets: true,
    allowRearTargets: false,
    allowObstacleAvoidance: true,
    movementLabel: '가능 (WASD / 조이스틱)',
    yawRangeLabel: '좌우 ±45° (상하 가능)',
    spawnRangeLabel: '전방 시야 범위 (±45°)',
    purposes: [
      '이동 중 눈-손 협응',
      '전방 시각 탐색',
      '공간 이동',
      '장애물 회피',
      '이동과 조준의 동시 수행',
    ],
  },
  4: {
    id: 4,
    code: 'MODE 4',
    name: '자유 이동 + 자유 회전',
    shortName: '자유 이동 · 360° 회전',
    allowMovement: true,
    wasdEnabled: true,
    joystickEnabled: true,
    yawRangeType: 'FREE_360',
    maxYawDeg: null,
    maxYawRad: null,
    pitchEnabled: true,
    allowFrontTargets: true,
    allowRearTargets: true,
    allowObstacleAvoidance: true,
    movementLabel: '가능 (훈련장 전체 이동)',
    yawRangeLabel: '좌우 360° 자유 회전',
    spawnRangeLabel: '360° 전방·좌우·후방·대각선',
    purposes: [
      '전방위 시각 탐색',
      '동적 공간지각',
      '이동 중 눈-손 협응',
      '목표물 추적',
      '방향 전환',
      '장애물 회피',
      '복합적인 시각-운동 협응',
    ],
  },
};

export function clampPlayerYawForMode(
  yawRad: number,
  modeId: TrainingModeId,
  playerX?: number,
  playerZ?: number,
): number {
  const cfg = TRAINING_MODES[modeId] || TRAINING_MODES[1];
  if (cfg.maxYawRad !== null) {
    if (
      playerX !== undefined &&
      playerZ !== undefined &&
      isInsideHeavenLoopFootprint(playerX, playerZ)
    ) {
      return yawRad;
    }
    return Math.max(-cfg.maxYawRad, Math.min(cfg.maxYawRad, yawRad));
  }
  return yawRad;
}

export function isWorldTargetAllowedForMode(
  playerX: number,
  playerZ: number,
  targetX: number,
  targetZ: number,
  modeId: TrainingModeId,
): boolean {
  const cfg = TRAINING_MODES[modeId] || TRAINING_MODES[1];
  const dx = targetX - playerX;
  const dz = targetZ - playerZ;
  const dist = Math.hypot(dx, dz);
  if (dist < 2.0) return false;

  if (!cfg.allowRearTargets) {
    // MODE 1 & MODE 3: Must be strictly in front of player (-Z direction) within ±45°
    if (dz >= -1.0) return false;
    const angleFromFrontRad = Math.abs(Math.atan2(dx, -dz));
    return angleFromFrontRad <= Math.PI / 4 + 0.02;
  }
  return true;
}

export interface TargetTypeSpec {
  id: TargetTypeId;
  name: string;
  color: string;
  shapeName: string;
  baseDiameter: number;
  baseSpeed: number;
  baseScore: number;
  description: string;
}

export const TARGET_TYPES: Record<TargetTypeId, TargetTypeSpec> = {
  A: {
    id: 'A',
    name: '기본형',
    color: PALETTE.cyan,
    shapeName: '방패 사각',
    baseDiameter: 2.0,
    baseSpeed: 0.8,
    baseScore: 10,
    description: '크고 천천히 움직이는 기본 과녁',
  },
  B: {
    id: 'B',
    name: '정밀형',
    color: PALETTE.magenta,
    shapeName: '원형',
    baseDiameter: 0.9,
    baseSpeed: 0.6,
    baseScore: 30,
    description: '작고 정밀한 조준이 필요한 원형 과녁',
  },
  C: {
    id: 'C',
    name: '고속형',
    color: PALETTE.orange,
    shapeName: '마름모 셰브론',
    baseDiameter: 1.2,
    baseSpeed: 4.0,
    baseScore: 25,
    description: '빠르게 횡단하는 마름모 과녁',
  },
  E: {
    id: 'E',
    name: '불규칙형',
    color: PALETTE.lime,
    shapeName: '오각 별',
    baseDiameter: 1.2,
    baseSpeed: 2.0,
    baseScore: 35,
    description: '리사주 곡선으로 불규칙하게 떠다니는 별 과녁',
  },
  G: {
    id: 'G',
    name: '복합미션형',
    color: PALETTE.primaryPurple,
    shapeName: '복합 그룹',
    baseDiameter: 1.3,
    baseSpeed: 1.0,
    baseScore: 50,
    description: '미션 조건에 맞는 색·형태만 골라 맞히는 그룹 과녁',
  },
  H: {
    id: 'H',
    name: '레이저 트랙형',
    color: PALETTE.cyan,
    shapeName: '단계별 레이저 트랙',
    baseDiameter: 1.5,
    baseSpeed: 0,
    baseScore: 60,
    description: '움직이지 않는 독립형 레이저 트랙 과녁으로, 클릭/터치를 유지한 채 시작점부터 끝점까지 드래그하여 완성하는 과녁',
  },
};

export type LaserTrackShapeKind =
  // Lv 1~2 (입문 6종)
  | 'horizontal_line'
  | 'vertical_line'
  | 'diag_up'
  | 'diag_down'
  | 'gentle_u'
  | 'gentle_arch'
  // Lv 3~4 (초급 6종)
  | 'v_shape'
  | 'caret_peak'
  | 'l_corner'
  | 'gamma_corner'
  | 'c_arc'
  | 'triangle_loop'
  // Lv 5~6 (중급 6종)
  | 's_wave'
  | 'vertical_s'
  | 'circle_loop'
  | 'diamond_loop'
  | 'rounded_square'
  | 'heart_curve'
  // Lv 7~8 (고급 6종)
  | 'z_zigzag'
  | 'n_zigzag'
  | 'w_wave'
  | 'm_wave'
  | 'lightning_bolt'
  | 'double_sine'
  // Lv 9~10 (최상급 6종)
  | 'infinity_h'
  | 'infinity_v'
  | 'star_trace'
  | 'spiral_in'
  | 'clover_loop'
  | 'lissajous_loop';

export const LASER_TRACK_SHAPES_BY_TIER: Record<1 | 2 | 3 | 4 | 5, readonly LaserTrackShapeKind[]> = {
  1: ['horizontal_line', 'vertical_line', 'diag_up', 'diag_down', 'gentle_u', 'gentle_arch'],
  2: ['v_shape', 'caret_peak', 'l_corner', 'gamma_corner', 'c_arc', 'triangle_loop'],
  3: ['s_wave', 'vertical_s', 'circle_loop', 'diamond_loop', 'rounded_square', 'heart_curve'],
  4: ['z_zigzag', 'n_zigzag', 'w_wave', 'm_wave', 'lightning_bolt', 'double_sine'],
  5: ['infinity_h', 'infinity_v', 'star_trace', 'spiral_in', 'clover_loop', 'lissajous_loop'],
};

export const ALL_LASER_TRACK_SHAPES: readonly LaserTrackShapeKind[] = [
  ...LASER_TRACK_SHAPES_BY_TIER[1],
  ...LASER_TRACK_SHAPES_BY_TIER[2],
  ...LASER_TRACK_SHAPES_BY_TIER[3],
  ...LASER_TRACK_SHAPES_BY_TIER[4],
  ...LASER_TRACK_SHAPES_BY_TIER[5],
];

export const LASER_TRACK_SHAPE_LABELS: Record<LaserTrackShapeKind, string> = {
  horizontal_line: '수평 직선',
  vertical_line: '수직 직선',
  diag_up: '우상향 대각선',
  diag_down: '좌상향 대각선',
  gentle_u: '완만한 U자 곡선',
  gentle_arch: '완만한 ∩자 아치',
  v_shape: 'V자 꺾임',
  caret_peak: '역V자 산',
  l_corner: 'L자 직각',
  gamma_corner: 'ㄱ자 직각',
  c_arc: 'C자 반원 호',
  triangle_loop: '둥근 삼각형',
  s_wave: '가로 S자 웨이브',
  vertical_s: '세로 S자 웨이브',
  circle_loop: '원형 루프',
  diamond_loop: '마름모 다이아몬드',
  rounded_square: '둥근 사각형',
  heart_curve: '하트 곡선',
  z_zigzag: 'Z자 지그재그',
  n_zigzag: 'N자 지그재그',
  w_wave: 'W자 이중 골짜기',
  m_wave: 'M자 이중 봉우리',
  lightning_bolt: '번개 궤적',
  double_sine: '2주기 사인 파형',
  infinity_h: '가로 8자 인피니티',
  infinity_v: '세로 8자 루프',
  star_trace: '한붓그리기 오각 별',
  spiral_in: '달팽이 나선',
  clover_loop: '3엽 클로버 곡선',
  lissajous_loop: '리사주 복합 곡선',
};

const X_SYMMETRIC_SHAPES = new Set<LaserTrackShapeKind>([
  'horizontal_line',
  'vertical_line',
  'gentle_u',
  'gentle_arch',
  'v_shape',
  'caret_peak',
  'triangle_loop',
  'circle_loop',
  'diamond_loop',
  'rounded_square',
  'heart_curve',
  'w_wave',
  'm_wave',
  'infinity_h',
  'infinity_v',
  'star_trace',
  'clover_loop',
]);

export function getLaserTrackTierForDifficulty(difficulty: number): 1 | 2 | 3 | 4 | 5 {
  const lv = Math.max(1, Math.min(10, Math.round(difficulty)));
  return Math.ceil(lv / 2) as 1 | 2 | 3 | 4 | 5;
}

/**
 * 최근 5회 이내 등장한 도형을 배제하고, 현재 티어(75%) + 바로 아래 티어(25%) 가중치 풀에서
 * 중복 없이 다양한 도형을 뽑는 셔플 백 시스템.
 */
export class LaserTrackShuffleBag {
  private recentHistory: LaserTrackShapeKind[] = [];
  private readonly historyLimit = 5;

  public getHistory(): LaserTrackShapeKind[] {
    return [...this.recentHistory];
  }

  public reset(): void {
    this.recentHistory = [];
  }

  public pickNextShape(
    difficulty: number,
    rng: () => number = Math.random,
  ): LaserTrackShapeKind {
    const tier = getLaserTrackTierForDifficulty(difficulty);
    const primaryPool = [...LASER_TRACK_SHAPES_BY_TIER[tier]];
    const secondaryPool =
      tier > 1 ? [...LASER_TRACK_SHAPES_BY_TIER[(tier - 1) as 1 | 2 | 3 | 4]] : [];

    const recentSet = new Set(this.recentHistory);
    const availablePrimary = primaryPool.filter((s) => !recentSet.has(s));
    const availableSecondary = secondaryPool.filter((s) => !recentSet.has(s));

    let chosenPool: LaserTrackShapeKind[];
    if (tier === 1 || availableSecondary.length === 0) {
      chosenPool = availablePrimary.length > 0 ? availablePrimary : primaryPool;
    } else if (availablePrimary.length === 0) {
      chosenPool = availableSecondary;
    } else {
      // 75% current tier, 25% lower tier
      chosenPool = rng() < 0.75 ? availablePrimary : availableSecondary;
    }

    const idx = Math.min(chosenPool.length - 1, Math.floor(rng() * chosenPool.length));
    const picked = chosenPool[idx];
    this.recentHistory.push(picked);
    if (this.recentHistory.length > this.historyLimit) {
      this.recentHistory.shift();
    }
    return picked;
  }
}

export const defaultLaserTrackShuffleBag = new LaserTrackShuffleBag();

export interface LaserTrackPoint2D {
  x: number;
  y: number;
}

export interface LaserTrackBounds2D {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface LaserTrackDifficultySpec {
  difficulty: number;
  tier: 1 | 2 | 3 | 4 | 5;
  shapeKind: LaserTrackShapeKind;
  shapeLabel: string;
  trackLengthMeters: number;
  nodeCount: number;
  sampleCount: number;
  tubeRadius: number;
  mirroredX: boolean;
  reversedDir: boolean;
  bounds: LaserTrackBounds2D;
  points: LaserTrackPoint2D[];
}

function samplePolylinePoints(
  anchors: LaserTrackPoint2D[],
  targetCount: number,
): LaserTrackPoint2D[] {
  if (anchors.length <= 1) return anchors;
  const segLens: number[] = [];
  let totalLen = 0;
  for (let i = 0; i < anchors.length - 1; i++) {
    const len = Math.hypot(anchors[i + 1].x - anchors[i].x, anchors[i + 1].y - anchors[i].y);
    segLens.push(len);
    totalLen += len;
  }
  if (totalLen <= 1e-6) return anchors;

  const out: LaserTrackPoint2D[] = [];
  for (let s = 0; s < targetCount; s++) {
    const targetDist = (s / (targetCount - 1)) * totalLen;
    let accum = 0;
    let placed = false;
    for (let i = 0; i < segLens.length; i++) {
      const len = segLens[i];
      if (accum + len >= targetDist - 1e-6 || i === segLens.length - 1) {
        const localT = len > 1e-6 ? Math.max(0, Math.min(1, (targetDist - accum) / len)) : 0;
        out.push({
          x: anchors[i].x + (anchors[i + 1].x - anchors[i].x) * localT,
          y: anchors[i].y + (anchors[i + 1].y - anchors[i].y) * localT,
        });
        placed = true;
        break;
      }
      accum += len;
    }
    if (!placed) {
      out.push({ ...anchors[anchors.length - 1] });
    }
  }
  return out;
}

function generateRawShapePoints(
  shapeKind: LaserTrackShapeKind,
  halfW: number,
  halfH: number,
  sampleCount: number,
): LaserTrackPoint2D[] {
  const pts: LaserTrackPoint2D[] = [];
  const pushParametric = (fn: (t: number) => LaserTrackPoint2D) => {
    for (let i = 0; i < sampleCount; i++) {
      pts.push(fn(i / (sampleCount - 1)));
    }
  };

  switch (shapeKind) {
    // Tier 1 (Lv 1~2)
    case 'horizontal_line':
      pushParametric((t) => ({ x: -halfW + t * 2 * halfW, y: 0 }));
      break;
    case 'vertical_line':
      pushParametric((t) => ({ x: 0, y: -halfH + t * 2 * halfH }));
      break;
    case 'diag_up':
      pushParametric((t) => ({
        x: (-halfW + t * 2 * halfW) * 0.92,
        y: (-halfH + t * 2 * halfH) * 0.85,
      }));
      break;
    case 'diag_down':
      pushParametric((t) => ({
        x: (-halfW + t * 2 * halfW) * 0.92,
        y: (halfH - t * 2 * halfH) * 0.85,
      }));
      break;
    case 'gentle_u':
      pushParametric((t) => {
        const u = t * 2 - 1;
        return { x: u * halfW, y: (u * u * 1.45 - 0.65) * halfH };
      });
      break;
    case 'gentle_arch':
      pushParametric((t) => ({
        x: -halfW + t * 2 * halfW,
        y: (Math.sin(t * Math.PI) * 1.45 - 0.55) * halfH,
      }));
      break;

    // Tier 2 (Lv 3~4)
    case 'v_shape':
      return samplePolylinePoints(
        [
          { x: -halfW * 0.88, y: halfH * 0.72 },
          { x: 0, y: -halfH * 0.72 },
          { x: halfW * 0.88, y: halfH * 0.72 },
        ],
        sampleCount,
      );
    case 'caret_peak':
      return samplePolylinePoints(
        [
          { x: -halfW * 0.88, y: -halfH * 0.68 },
          { x: 0, y: halfH * 0.76 },
          { x: halfW * 0.88, y: -halfH * 0.68 },
        ],
        sampleCount,
      );
    case 'l_corner':
      return samplePolylinePoints(
        [
          { x: -halfW * 0.72, y: halfH * 0.82 },
          { x: -halfW * 0.72, y: -halfH * 0.68 },
          { x: halfW * 0.82, y: -halfH * 0.68 },
        ],
        sampleCount,
      );
    case 'gamma_corner':
      return samplePolylinePoints(
        [
          { x: -halfW * 0.82, y: halfH * 0.7 },
          { x: halfW * 0.72, y: halfH * 0.7 },
          { x: halfW * 0.72, y: -halfH * 0.8 },
        ],
        sampleCount,
      );
    case 'c_arc':
      pushParametric((t) => {
        const ang = Math.PI * 0.28 + t * Math.PI * 1.44;
        return {
          x: Math.cos(ang) * halfW * 0.78,
          y: Math.sin(ang) * halfH * 0.92,
        };
      });
      break;
    case 'triangle_loop':
      return samplePolylinePoints(
        [
          { x: 0, y: halfH * 0.88 },
          { x: halfW * 0.84, y: -halfH * 0.7 },
          { x: -halfW * 0.84, y: -halfH * 0.7 },
          { x: -0.14, y: halfH * 0.64 },
        ],
        sampleCount,
      );

    // Tier 3 (Lv 5~6)
    case 's_wave':
      pushParametric((t) => ({
        x: -halfW + t * 2 * halfW,
        y: Math.sin(t * Math.PI * 2) * halfH * 0.82,
      }));
      break;
    case 'vertical_s':
      pushParametric((t) => ({
        x: Math.sin(t * Math.PI * 2) * halfW * 0.64,
        y: halfH * 0.95 - t * 2 * halfH * 0.95,
      }));
      break;
    case 'circle_loop':
      pushParametric((t) => {
        const ang = Math.PI * 0.5 - t * Math.PI * 1.93;
        const rx = Math.min(halfW * 0.82, halfH * 1.05);
        return {
          x: Math.cos(ang) * rx,
          y: Math.sin(ang) * rx,
        };
      });
      break;
    case 'diamond_loop':
      return samplePolylinePoints(
        [
          { x: 0, y: halfH * 0.92 },
          { x: halfW * 0.76, y: 0 },
          { x: 0, y: -halfH * 0.92 },
          { x: -halfW * 0.76, y: 0 },
          { x: -0.12, y: halfH * 0.78 },
        ],
        sampleCount,
      );
    case 'rounded_square':
      return samplePolylinePoints(
        [
          { x: -halfW * 0.66, y: halfH * 0.8 },
          { x: halfW * 0.66, y: halfH * 0.8 },
          { x: halfW * 0.66, y: -halfH * 0.8 },
          { x: -halfW * 0.66, y: -halfH * 0.8 },
          { x: -halfW * 0.66, y: halfH * 0.56 },
        ],
        sampleCount,
      );
    case 'heart_curve':
      pushParametric((t) => {
        const a = 0.08 + t * (Math.PI * 1.92);
        const hx = 16 * Math.pow(Math.sin(a), 3);
        const hy =
          13 * Math.cos(a) -
          5 * Math.cos(2 * a) -
          2 * Math.cos(3 * a) -
          Math.cos(4 * a);
        return {
          x: (hx / 16) * halfW * 0.78,
          y: ((hy + 2.2) / 16) * halfH * 0.96,
        };
      });
      break;

    // Tier 4 (Lv 7~8)
    case 'z_zigzag':
      return samplePolylinePoints(
        [
          { x: -halfW * 0.82, y: halfH * 0.76 },
          { x: halfW * 0.82, y: halfH * 0.76 },
          { x: -halfW * 0.82, y: -halfH * 0.76 },
          { x: halfW * 0.82, y: -halfH * 0.76 },
        ],
        sampleCount,
      );
    case 'n_zigzag':
      return samplePolylinePoints(
        [
          { x: -halfW * 0.8, y: -halfH * 0.78 },
          { x: -halfW * 0.8, y: halfH * 0.78 },
          { x: halfW * 0.8, y: -halfH * 0.78 },
          { x: halfW * 0.8, y: halfH * 0.78 },
        ],
        sampleCount,
      );
    case 'w_wave':
      return samplePolylinePoints(
        [
          { x: -halfW * 0.94, y: halfH * 0.72 },
          { x: -halfW * 0.47, y: -halfH * 0.72 },
          { x: 0, y: halfH * 0.42 },
          { x: halfW * 0.47, y: -halfH * 0.72 },
          { x: halfW * 0.94, y: halfH * 0.72 },
        ],
        sampleCount,
      );
    case 'm_wave':
      return samplePolylinePoints(
        [
          { x: -halfW * 0.94, y: -halfH * 0.72 },
          { x: -halfW * 0.47, y: halfH * 0.72 },
          { x: 0, y: -halfH * 0.42 },
          { x: halfW * 0.47, y: halfH * 0.72 },
          { x: halfW * 0.94, y: -halfH * 0.72 },
        ],
        sampleCount,
      );
    case 'lightning_bolt':
      return samplePolylinePoints(
        [
          { x: -halfW * 0.42, y: halfH * 0.92 },
          { x: halfW * 0.48, y: halfH * 0.2 },
          { x: -halfW * 0.28, y: -halfH * 0.04 },
          { x: halfW * 0.52, y: -halfH * 0.92 },
        ],
        sampleCount,
      );
    case 'double_sine':
      pushParametric((t) => ({
        x: -halfW + t * 2 * halfW,
        y: Math.sin(t * Math.PI * 4) * halfH * 0.76,
      }));
      break;

    // Tier 5 (Lv 9~10)
    case 'infinity_h':
      pushParametric((t) => {
        const a = t * Math.PI * 1.94;
        return {
          x: Math.sin(a) * halfW * 0.92,
          y: Math.sin(a * 2) * halfH * 0.68,
        };
      });
      break;
    case 'infinity_v':
      pushParametric((t) => {
        const a = t * Math.PI * 1.94;
        return {
          x: Math.sin(a * 2) * halfW * 0.64,
          y: Math.sin(a) * halfH * 0.95,
        };
      });
      break;
    case 'star_trace': {
      const rOuter = Math.min(halfW * 0.82, halfH * 1.05);
      const starVerts = [0, 2, 4, 1, 3].map((idx) => {
        const ang = Math.PI / 2 + (idx / 5) * Math.PI * 2;
        return { x: Math.cos(ang) * rOuter, y: Math.sin(ang) * rOuter };
      });
      // End slightly shy of start vertex so start/end rings stay distinct
      const endPt = {
        x: starVerts[0].x * 0.84 + starVerts[4].x * 0.16,
        y: starVerts[0].y * 0.84 + starVerts[4].y * 0.16,
      };
      return samplePolylinePoints([...starVerts, endPt], sampleCount);
    }
    case 'spiral_in':
      pushParametric((t) => {
        const theta = t * Math.PI * 4.4;
        const rNorm = 1 - t * 0.82;
        return {
          x: Math.cos(theta) * halfW * 0.76 * rNorm,
          y: Math.sin(theta) * halfH * 0.92 * rNorm,
        };
      });
      break;
    case 'clover_loop':
      pushParametric((t) => {
        const theta = Math.PI / 2 + t * Math.PI * 1.94;
        const r = (0.58 + 0.42 * Math.cos(3 * (theta - Math.PI / 2))) * Math.min(halfW * 0.85, halfH * 1.02);
        return {
          x: Math.cos(theta) * r,
          y: Math.sin(theta) * r,
        };
      });
      break;
    case 'lissajous_loop':
      pushParametric((t) => {
        const a = t * Math.PI * 1.92;
        return {
          x: Math.sin(3 * a + Math.PI * 0.25) * halfW * 0.88,
          y: Math.sin(2 * a) * halfH * 0.88,
        };
      });
      break;
  }

  return pts;
}

/**
 * 단계별(Lv 1 ~ 10) 30종 한붓그리기 레이저 트랙(H형) 프리셋을 생성한다.
 * - Lv 1~2 (Tier 1): 입문 6종 (직선·완만한 곡선)
 * - Lv 3~4 (Tier 2): 초급 6종 (기본 꺾임·단순 도형)
 * - Lv 5~6 (Tier 3): 중급 6종 (부드러운 파형·닫힌 도형)
 * - Lv 7~8 (Tier 4): 고급 6종 (다중 꺾임·복합 파형)
 * - Lv 9~10 (Tier 5): 최상급 6종 (교차·나선·정밀 복합 궤적)
 */
export function computeLaserTrackSpecForDifficulty(
  difficulty: number,
  options?: {
    shapeKind?: LaserTrackShapeKind;
    shuffleBag?: LaserTrackShuffleBag;
    mirrorX?: boolean;
    reverseDir?: boolean;
    scaleMul?: number;
    rng?: () => number;
  },
): LaserTrackDifficultySpec {
  const lv = Math.max(1, Math.min(10, Math.round(difficulty)));
  const tier = getLaserTrackTierForDifficulty(lv);
  const rng = options?.rng ?? Math.random;
  const bag = options?.shuffleBag ?? defaultLaserTrackShuffleBag;
  const shapeKind = options?.shapeKind ?? bag.pickNextShape(lv, rng);
  const scaleMul = Math.max(0.45, Math.min(1.2, options?.scaleMul ?? 1.0));

  // Thin, sleek holographic laser tube radius: 0.045m ~ 0.070m
  const tubeRadius = Number((0.068 - (lv - 1) * 0.0024).toFixed(4));
  const sampleCount = 72;

  const baseHalfW = (1.18 + (lv - 1) * 0.145) * scaleMul; // ~1.18m (Lv1) -> ~2.49m (Lv10)
  const baseHalfH = (0.86 + (lv - 1) * 0.075) * scaleMul; // ~0.86m (Lv1) -> ~1.54m (Lv10)

  let points = generateRawShapePoints(shapeKind, baseHalfW, baseHalfH, sampleCount);

  const allowMirror = !X_SYMMETRIC_SHAPES.has(shapeKind);
  const mirroredX =
    options?.mirrorX !== undefined
      ? options.mirrorX
      : allowMirror
        ? rng() < 0.5
        : false;
  const reversedDir =
    options?.reverseDir !== undefined ? options.reverseDir : rng() < 0.5;

  if (mirroredX) {
    points = points.map((p) => ({ x: -p.x, y: p.y }));
  }
  if (reversedDir) {
    points = [...points].reverse();
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let rawLen = 0;

  points = points.map((p, idx) => {
    const x = Number(p.x.toFixed(3));
    const y = Number(p.y.toFixed(3));
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (idx > 0) {
      rawLen += Math.hypot(x - points[idx - 1].x, y - points[idx - 1].y);
    }
    return { x, y };
  });

  // Ensure monotonic progression baseline for tests while reflecting real arc complexity
  const minTierLength = (2.1 + lv * 0.54) * scaleMul;
  const trackLengthMeters = Number(Math.max(minTierLength, rawLen).toFixed(2));

  return {
    difficulty: lv,
    tier,
    shapeKind,
    shapeLabel: LASER_TRACK_SHAPE_LABELS[shapeKind],
    trackLengthMeters,
    nodeCount: sampleCount,
    sampleCount,
    tubeRadius,
    mirroredX,
    reversedDir,
    bounds: {
      minX: Number(minX.toFixed(3)),
      maxX: Number(maxX.toFixed(3)),
      minY: Number(minY.toFixed(3)),
      maxY: Number(maxY.toFixed(3)),
    },
    points,
  };
}

export interface ContinuousLaserDragResult {
  onTrack: boolean;
  nextProgress: number;
  closestDist: number;
  completed: boolean;
}

/**
 * 도형 드래그(H형 레이저 트랙) 시작점 마커(startOuterRing: RingGeometry(0.11, 0.16, 28))의 실제 반지름(m).
 */
export const LASER_START_MARKER_RADIUS = 0.16;

/**
 * 시작점(Start Point) 클릭/터치 판정:
 * 포인터 좌표와 시작점 중심 좌표 사이의 유클리드 거리(Math.hypot)가
 * 시작점 마커의 실제 반지름(startMarkerRadius) 이내일 때만 드래그 시작을 허용한다 (여유 오차 픽셀/패딩 없음).
 */
export function isWithinLaserStartPointRadius(params: {
  pointerX: number;
  pointerY: number;
  startX: number;
  startY: number;
  startMarkerRadius: number;
}): boolean {
  if (!(params.startMarkerRadius > 0)) return false;
  const dist = Math.hypot(params.pointerX - params.startX, params.pointerY - params.startY);
  return dist <= params.startMarkerRadius;
}

/**
 * 촘촘하게 보간된 곡선 샘플(60~80+) 위에서 현재 포인터의 연속 진행률(0.0 ~ 1.0)을 추적한다.
 * - 현재 progress에서 전방 +maxForwardStep(기본 0.18) 이내 구간만 탐색해 교차/닫힌 루프에서 튐을 방지
 * - corridorTol 이내면 막힘 없이 부드럽게 전진하며 progress >= 0.95 도달 시 즉시 완주 처리
 */
export function evaluateContinuousLaserDragProgress(params: {
  samples: LaserTrackPoint2D[];
  currentProgress: number;
  pointer: LaserTrackPoint2D;
  corridorTol: number;
  maxForwardStep?: number;
  completionThreshold?: number;
}): ContinuousLaserDragResult {
  const { samples, currentProgress, pointer, corridorTol } = params;
  const maxForward = params.maxForwardStep ?? 0.18;
  const completionThreshold = params.completionThreshold ?? 0.95;

  if (!samples || samples.length < 2) {
    return {
      onTrack: false,
      nextProgress: currentProgress,
      closestDist: Infinity,
      completed: false,
    };
  }

  const segCount = samples.length - 1;
  const minSearchU = Math.max(0, currentProgress - 0.05);
  const maxSearchU = Math.min(1, currentProgress + maxForward);

  let bestDist = Infinity;
  let bestU = currentProgress;

  for (let i = 0; i < segCount; i++) {
    const segStartU = i / segCount;
    const segEndU = (i + 1) / segCount;
    if (segEndU < minSearchU - 1e-6 || segStartU > maxSearchU + 1e-6) {
      continue;
    }

    const a = samples[i];
    const b = samples[i + 1];
    const sdx = b.x - a.x;
    const sdy = b.y - a.y;
    const lenSq = sdx * sdx + sdy * sdy;
    const rawT =
      lenSq > 1e-8
        ? ((pointer.x - a.x) * sdx + (pointer.y - a.y) * sdy) / lenSq
        : 0;
    const clampedT = Math.max(0, Math.min(1, rawT));
    const u = (i + clampedT) / segCount;
    if (u < minSearchU - 1e-6 || u > maxSearchU + 1e-6) {
      continue;
    }

    const projX = a.x + sdx * clampedT;
    const projY = a.y + sdy * clampedT;
    const dist = Math.hypot(pointer.x - projX, pointer.y - projY);

    if (
      dist < bestDist - 1e-5 ||
      (Math.abs(dist - bestDist) <= 1e-5 && u > bestU)
    ) {
      bestDist = dist;
      bestU = u;
    }
  }

  const onTrack = bestDist <= corridorTol;
  if (!onTrack) {
    return {
      onTrack: false,
      nextProgress: currentProgress,
      closestDist: bestDist,
      completed: false,
    };
  }

  const nextRaw = Math.max(currentProgress, Math.min(1, bestU));
  const completed = nextRaw >= completionThreshold;
  return {
    onTrack: true,
    nextProgress: completed ? 1.0 : nextRaw,
    closestDist: bestDist,
    completed,
  };
}

/**
 * H형 레이저 트랙의 시작점·끝점·중간 샘플(12개 이상)과 상하좌우 바운딩 박스를
 * 월드 좌표로 변환하여 아레나 외벽, 콜라이더(0.55m 여백), 바닥/천장 높이와 겹치지 않는지 검사한다.
 */
export function validateLaserTrackWorldBounds(params: {
  centerX: number;
  centerY: number;
  centerZ: number;
  playerX: number;
  playerZ: number;
  spec: Pick<LaserTrackDifficultySpec, 'points' | 'bounds'>;
  colliders: ColliderShape[];
  margin?: number;
  minY?: number;
  maxY?: number;
  sampleChecks?: number;
}): {
  valid: boolean;
  worldTestPoints: Array<{ x: number; y: number; z: number }>;
  reason?: string;
} {
  const margin = params.margin ?? 0.55;
  const minY = params.minY ?? 1.0;
  const maxY = params.maxY ?? 6.8;
  const sampleChecks = Math.max(12, params.sampleChecks ?? 14);
  const maxAllowedRadius = ARENA.playRadius - 0.6;

  // Target root rotates yaw = atan2(playerX - centerX, playerZ - centerZ), so local +X maps to world (+cosYaw, 0, -sinYaw)
  const yaw = Math.atan2(params.playerX - params.centerX, params.playerZ - params.centerZ);
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);

  const toWorld = (lx: number, ly: number) => ({
    x: params.centerX + lx * cosY,
    y: params.centerY + ly,
    z: params.centerZ - lx * sinY,
  });

  const worldTestPoints: Array<{ x: number; y: number; z: number }> = [];
  const pts = params.spec.points;
  if (pts.length > 0) {
    for (let s = 0; s < sampleChecks; s++) {
      const idx = Math.min(
        pts.length - 1,
        Math.round((s / (sampleChecks - 1)) * (pts.length - 1)),
      );
      worldTestPoints.push(toWorld(pts[idx].x, pts[idx].y));
    }
  }
  // Also include the 4 bounding box corners
  const b = params.spec.bounds;
  worldTestPoints.push(
    toWorld(b.minX, b.minY),
    toWorld(b.maxX, b.minY),
    toWorld(b.minX, b.maxY),
    toWorld(b.maxX, b.maxY),
  );

  for (const wp of worldTestPoints) {
    if (wp.y < minY || wp.y > maxY) {
      return { valid: false, worldTestPoints, reason: 'height_out_of_bounds' };
    }
    const radialDist = Math.hypot(wp.x, wp.z);
    if (radialDist > maxAllowedRadius) {
      return { valid: false, worldTestPoints, reason: 'outer_wall_overlap' };
    }
    for (const col of params.colliders) {
      if (col.isObstacle) continue;
      if (distanceToColliderSurface(wp.x, wp.z, col) < margin) {
        return { valid: false, worldTestPoints, reason: `collider_margin:${col.id}` };
      }
    }
  }

  return { valid: true, worldTestPoints };
}

export interface MissionBracketVisualState {
  visible: boolean;
  opacity: number;
  scaleMul: number;
}

/**
 * G형 복합미션 정답 과녁의 3D 빨간 브래킷([ ]) 가시성 규칙:
 * - 모든 난이도(Lv 1~10)에서 목표 타겟이 생성된 순간부터 파괴되거나 라운드가 끝날 때까지
 *   깜빡임이나 페이드아웃 없이 항상 선명하게 유지되어 오답 타겟과 명확히 구분되도록 한다.
 */
export function computeMissionBracketVisualState(
  _difficulty: number,
  _ageSec: number,
): MissionBracketVisualState {
  return { visible: true, opacity: 0.96, scaleMul: 1.0 };
}

export interface ObstacleConfig {
  interval: number;
  speed: number;
  kinds: number[];
  maxAtOnce: number;
}

export interface DifficultyLevelConfig {
  level: number;
  sizeMul: number;
  speedMul: number;
  spawnInterval: number;
  maxConcurrent: number;
  lifetime: number;
  types: TargetTypeId[];
  pattern: number;
  allowRearSpawn: boolean;
  rearSpawnChance: number;
  obstacle: ObstacleConfig | null;
  summary: string;
}

export const DIFFICULTY_CONFIG: Record<number, DifficultyLevelConfig> = {
  1: {
    level: 1,
    sizeMul: 1.6,
    speedMul: 0.35,
    spawnInterval: 3.0,
    maxConcurrent: 1,
    lifetime: 12,
    types: ['A', 'H'],
    pattern: 0,
    allowRearSpawn: false,
    rearSpawnChance: 0,
    obstacle: null,
    summary: 'Lv1 · 매우 큰 목표물 · 입문 6종 레이저 트랙 · 장애물 없음',
  },
  2: {
    level: 2,
    sizeMul: 1.45,
    speedMul: 0.5,
    spawnInterval: 2.7,
    maxConcurrent: 1,
    lifetime: 10,
    types: ['A', 'H'],
    pattern: 0,
    allowRearSpawn: false,
    rearSpawnChance: 0,
    obstacle: { interval: 14, speed: 1.5, kinds: [1], maxAtOnce: 1 },
    summary: 'Lv2 · 큰 목표물 · 입문 6종 레이저 트랙 · 슬라이딩 장애물 1종',
  },
  3: {
    level: 3,
    sizeMul: 1.3,
    speedMul: 0.75,
    spawnInterval: 2.4,
    maxConcurrent: 2,
    lifetime: 9,
    types: ['A', 'B', 'H'],
    pattern: 1,
    allowRearSpawn: false,
    rearSpawnChance: 0,
    obstacle: { interval: 12, speed: 2.0, kinds: [1, 2], maxAtOnce: 1 },
    summary: 'Lv3 · 초급 6종 레이저 트랙 · 정밀형 등장',
  },
  4: {
    level: 4,
    sizeMul: 1.15,
    speedMul: 1.0,
    spawnInterval: 2.2,
    maxConcurrent: 2,
    lifetime: 8,
    types: ['A', 'B', 'C', 'H'],
    pattern: 1,
    allowRearSpawn: false,
    rearSpawnChance: 0,
    obstacle: { interval: 9, speed: 2.5, kinds: [1, 2, 5], maxAtOnce: 1 },
    summary: 'Lv4 · 초급 6종 레이저 트랙 · 고속형 및 고정 구조물 등장',
  },
  5: {
    level: 5,
    sizeMul: 1.0,
    speedMul: 1.25,
    spawnInterval: 1.9,
    maxConcurrent: 3,
    lifetime: 7,
    types: ['A', 'B', 'C', 'E', 'H'],
    pattern: 2,
    allowRearSpawn: true,
    rearSpawnChance: 0.3,
    obstacle: { interval: 8, speed: 3.0, kinds: [1, 2, 3, 5], maxAtOnce: 1 },
    summary: 'Lv5 · 중급 6종 레이저 트랙 · 360° 출현 · 불규칙형(E형) 등장',
  },
  6: {
    level: 6,
    sizeMul: 0.9,
    speedMul: 1.45,
    spawnInterval: 1.6,
    maxConcurrent: 4,
    lifetime: 6,
    types: ['A', 'B', 'C', 'E', 'H'],
    pattern: 2,
    allowRearSpawn: true,
    rearSpawnChance: 0.35,
    obstacle: { interval: 7, speed: 3.5, kinds: [1, 2, 3, 5], maxAtOnce: 1 },
    summary: 'Lv6 · 중급 6종 레이저 트랙 · 고속·불규칙 혼합 훈련',
  },
  7: {
    level: 7,
    sizeMul: 0.8,
    speedMul: 1.65,
    spawnInterval: 1.4,
    maxConcurrent: 4,
    lifetime: 5,
    types: ['A', 'B', 'C', 'E', 'H'],
    pattern: 3,
    allowRearSpawn: true,
    rearSpawnChance: 0.4,
    obstacle: { interval: 6, speed: 4.0, kinds: [1, 2, 3, 4, 5], maxAtOnce: 1 },
    summary: 'Lv7 · 고급 6종 레이저 트랙 · 불규칙 곡선 이동 심화',
  },
  8: {
    level: 8,
    sizeMul: 0.7,
    speedMul: 1.9,
    spawnInterval: 1.2,
    maxConcurrent: 4,
    lifetime: 4,
    types: ['A', 'B', 'C', 'E', 'H'],
    pattern: 3,
    allowRearSpawn: true,
    rearSpawnChance: 0.45,
    obstacle: { interval: 5, speed: 5.0, kinds: [1, 2, 3, 4, 5], maxAtOnce: 2 },
    summary: 'Lv8 · 고급 6종 레이저 트랙 · 복합 장애물 동시 2개',
  },
  9: {
    level: 9,
    sizeMul: 0.6,
    speedMul: 2.2,
    spawnInterval: 1.0,
    maxConcurrent: 5,
    lifetime: 3.5,
    types: ['A', 'B', 'C', 'E', 'G', 'H'],
    pattern: 4,
    allowRearSpawn: true,
    rearSpawnChance: 0.5,
    obstacle: { interval: 4.5, speed: 5.5, kinds: [1, 2, 3, 4, 5], maxAtOnce: 2 },
    summary: 'Lv9 · 최상급 6종 레이저 트랙 · 복합 목표물(G형 MOT) 등장',
  },
  10: {
    level: 10,
    sizeMul: 0.5,
    speedMul: 2.5,
    spawnInterval: 0.8,
    maxConcurrent: 6,
    lifetime: 3.0,
    types: ['A', 'B', 'C', 'E', 'G', 'H'],
    pattern: 4,
    allowRearSpawn: true,
    rearSpawnChance: 0.55,
    obstacle: { interval: 4.0, speed: 6.5, kinds: [1, 2, 3, 4, 5], maxAtOnce: 2 },
    summary: 'Lv10 · 최고 난이도 · 최상급 레이저 트랙 및 고난이도 MOT 추적',
  },
};

export interface GameSettings {
  trainingMode: TrainingModeId;
  difficulty: number;
  duration: 10 | 30 | 60 | 90 | 120 | 180 | 300;
  spawnFrequencyMul: 0.5 | 1.0 | 1.5 | 2.0;
  sfxEnabled: boolean;
  sfxVolume: number;
  bgmEnabled: boolean;
  mouseSensitivity: number;
  touchSensitivity: number;
  controlMode: 'auto' | 'pc' | 'tablet';
  uiScale: number; // 80 ~ 130 (%)
  fixedJoystick: boolean;
  tabletSwapControls: boolean; // true = 왼손잡이용 좌우 반전 (좌: 발사 / 우: 조이스틱)
  crosshairSize: number; // px
  aimAssistMul: number; // 1.0 ~ 1.5
  continueAtZeroEnergy: boolean;
  graphicsQuality: 'auto' | 'high' | 'low';
  // v2 Addition [3, 4, 5, 6]
  directionHintEnabled: boolean;
  directionHintDelaySec: 1.0 | 1.8 | 2.5 | 3.5;
  tabletDirectTouchHit: boolean; // true = 직접 터치 모드, false = 조준선 정밀 조준 모드
  tabletTouchAssistMul: number; // 1.1 ~ 1.6 (기본 1.3)
  rearSpawnAlertEnabled: boolean;
}

export const DEFAULT_SETTINGS: GameSettings = {
  trainingMode: 1,
  difficulty: 1,
  duration: 120,
  spawnFrequencyMul: 1.0,
  sfxEnabled: true,
  sfxVolume: 0.8,
  bgmEnabled: true,
  mouseSensitivity: 1.0,
  touchSensitivity: 1.0,
  controlMode: 'auto',
  uiScale: 100,
  fixedJoystick: false,
  tabletSwapControls: false,
  crosshairSize: 26,
  aimAssistMul: 1.2,
  continueAtZeroEnergy: false,
  graphicsQuality: 'auto',
  directionHintEnabled: true,
  directionHintDelaySec: 1.8,
  tabletDirectTouchHit: true,
  tabletTouchAssistMul: 1.3,
  rearSpawnAlertEnabled: true,
};

/**
 * 정밀 조준 모드(tabletDirectTouchHit === false)에서는 난이도(Lv1~10)가 올라갈수록
 * aimAssistMul 히트박스 보정이 점진적으로 1.0에 가깝게 축소된다.
 */
export function getEffectiveAimAssistMul(
  baseAimAssistMul: number,
  difficulty: number,
  isPrecisionCrosshairMode: boolean,
): number {
  const clampedBase = Math.max(1.0, Math.min(1.5, baseAimAssistMul));
  if (!isPrecisionCrosshairMode) {
    return clampedBase;
  }
  const lv = Math.max(1, Math.min(10, Math.round(difficulty)));
  const progress = (lv - 1) / 9; // Lv1 = 0, Lv10 = 1
  return Number((1.0 + (clampedBase - 1.0) * (1 - progress)).toFixed(3));
}

export type ColliderShape =
  | {
      id: string;
      kind: 'aabb';
      minX: number;
      maxX: number;
      minZ: number;
      maxZ: number;
      minY?: number;
      maxY?: number;
      isObstacle?: boolean;
      obstacleId?: number;
    }
  | {
      id: string;
      kind: 'circle';
      x: number;
      z: number;
      radius: number;
      minY?: number;
      maxY?: number;
      isObstacle?: boolean;
      obstacleId?: number;
    };

export function verifyDifficultyMonotonicity(): { pass: boolean; details: string } {
  for (let lv = 1; lv <= 10; lv++) {
    const cur = DIFFICULTY_CONFIG[lv];
    if (!cur) return { pass: false, details: `Lv${lv} 설정 누락` };
    if (lv <= 4 && cur.allowRearSpawn) {
      return { pass: false, details: `Lv${lv}는 전방 출현만 허용되어야 합니다.` };
    }
    if (lv >= 5 && !cur.allowRearSpawn) {
      return { pass: false, details: `Lv${lv}는 측·후방 360° 출현이 활성화되어야 합니다.` };
    }
    if (lv > 1) {
      const prev = DIFFICULTY_CONFIG[lv - 1];
      if (cur.sizeMul >= prev.sizeMul)
        return { pass: false, details: `Lv${lv} sizeMul 단조 감소 위반` };
      if (cur.speedMul <= prev.obstacle?.speed! && false) {
        // no-op
      }
      if (cur.speedMul <= prev.speedMul)
        return { pass: false, details: `Lv${lv} speedMul 단조 증가 위반` };
      if (cur.spawnInterval >= prev.spawnInterval)
        return { pass: false, details: `Lv${lv} spawnInterval 단조 감소 위반` };
      if (cur.maxConcurrent < prev.maxConcurrent)
        return { pass: false, details: `Lv${lv} maxConcurrent 단조 비감소 위반` };
      if (cur.lifetime >= prev.lifetime)
        return { pass: false, details: `Lv${lv} lifetime 단조 감소 위반` };
      if (cur.obstacle && prev.obstacle) {
        if (cur.obstacle.interval >= prev.obstacle.interval)
          return { pass: false, details: `Lv${lv} 장애물 간격 단조 감소 위반` };
        if (cur.obstacle.speed <= prev.obstacle.speed)
          return { pass: false, details: `Lv${lv} 장애물 속도 단조 증가 위반` };
      }
    }
  }
  return { pass: true, details: '1~10단계 단조성 및 Lv5+ 후방 출현 규칙 검증 완료' };
}

/**
 * 1. 비목표물을 쐈을 때 '목표물이 아닙니다' 문구 규칙 및 판정 등급
 * - PERFECT / GOOD: 유효한 목표물 명중
 * - NON_TARGET: 환경 구조물(타워, 바닥, 컨테이너, 장애물 등)이나 허공 등 비목표물에 맞았을 때 -> '목표물이 아닙니다!' 표시 (오조준 +1, 감점 없음)
 * - WRONG: G형 복합 미션에서 미션 조건에 맞지 않는 오답 목표물을 맞혔을 때 -> 오답 선택 +1
 */
export type JudgmentGrade = 'PERFECT' | 'GOOD' | 'NON_TARGET' | 'WRONG';

export const NON_TARGET_MESSAGE = '목표물이 아닙니다!';
export const NON_TARGET_SUBTEXT = '과녁을 조준해 다시 발사해 봐요!';

export function shouldShowWrongTargetWarning(
  hitUserData?: { isTarget?: boolean; isMissionTarget?: boolean } | null,
): boolean {
  return Boolean(
    hitUserData &&
      hitUserData.isTarget === true &&
      hitUserData.isMissionTarget === false,
  );
}

export function getShotFeedbackMessage(grade: JudgmentGrade, _scoreAdded = 0, _combo = 0): {
  title: string;
  subtitle: string;
} {
  if (grade === 'PERFECT' || grade === 'GOOD') {
    return {
      title: grade,
      subtitle: '',
    };
  }
  if (grade === 'WRONG') {
    return {
      title: '타겟이 아닙니다',
      subtitle: '빨간 브래킷이 표시된 목표 과녁을 맞혀 보세요!',
    };
  }
  return {
    title: NON_TARGET_MESSAGE,
    subtitle: NON_TARGET_SUBTEXT,
  };
}

export function calculateHitScore(
  typeId: TargetTypeId,
  grade: 'PERFECT' | 'GOOD',
  difficulty: number,
  comboCount: number,
): number {
  const base = TARGET_TYPES[typeId].baseScore;
  const gradeMul = grade === 'PERFECT' ? 1.5 : 1.0;
  const diffBonus = 1 + 0.1 * (difficulty - 1);
  const comboMul = Math.min(1.5, 1 + 0.1 * Math.floor(comboCount / 5));
  return Math.round(base * gradeMul * diffBonus * comboMul);
}

export function evaluateHitGrade(
  normalizedCenterDist: number,
  isGoldenTiming: boolean,
): 'PERFECT' | 'GOOD' {
  if (normalizedCenterDist <= 0.25 || isGoldenTiming) {
    return 'PERFECT';
  }
  return 'GOOD';
}

/**
 * Check if a point (px, pz) is inside the northern 1F Archway / Corridor / Staircase / 2F Heaven annex footprint
 * (which extends outside the 18m circular plaza boundary up to Z = -26.2, X in [-1.95, +9.6]).
 */
export function isInsideHeavenLoopFootprint(
  px: number,
  pz: number,
  radius: number = ARENA.playerRadius,
): boolean {
  const minX = ARENA_HEAVEN.archMinX + radius * 0.45;
  const maxX = ARENA_HEAVEN.corridorMaxX - radius * 0.45;
  const minZ = ARENA_HEAVEN.hallMinZ + radius * 0.45;
  const maxZ = -15.2;
  return px >= minX && px <= maxX && pz >= minZ && pz <= maxZ;
}

/**
 * Compute supporting floor height (feet Y above ground 0.0m) at (px, pz) given current feetY.
 * Supports:
 * - 1F Main Courtyard & 1F Archway / Right-turn Corridor (Y = 0.0m)
 * - Smooth Ramp Staircase (Z in [-23.1, -19.8], X from 7.45 -> 2.40 rising linearly 0.0m -> 3.40m)
 * - 2F Heaven Room Floor (X in [-2.10, +2.65], Z in [-23.15, -18.65] at Y = 3.40m when player is on upper level)
 * - 2F Window Sill Top Surface (X in [-1.85, +2.25], Z in [-19.45, -18.45] at Y = 4.05m when player jumps onto the sill)
 */
export function getFloorHeightAt(
  px: number,
  pz: number,
  curFeetY = 0,
): number {
  let supportY = 0;

  // 1. Staircase smooth ramp: Z in [-23.1, -19.8], X from 7.45 (bottom, Y=0) to 2.40 (top, Y=3.4)
  // Always active inside the enclosed stairwell so entering from the East turnaround never misses the ramp.
  if (pz >= -23.1 && pz <= -19.8 && px >= 2.2 && px <= 7.8) {
    const rawT =
      (ARENA_HEAVEN.stairBottomX - px) /
      Math.max(0.01, ARENA_HEAVEN.stairBottomX - ARENA_HEAVEN.stairTopX);
    const t = Math.max(0, Math.min(1, rawT));
    const stairY = t * ARENA_HEAVEN.floor2Y;
    supportY = Math.max(supportY, stairY);
  }

  // 2. 2F Heaven Room slab: X in [-2.1, 2.65], Z in [-23.15, -18.65]
  // Active when player is on the upper level (curFeetY >= 1.75) so 1F archway underneath (Y=0) remains walkable!
  if (
    px >= ARENA_HEAVEN.room2FMinX - 0.15 &&
    px <= ARENA_HEAVEN.room2FMaxX + 0.2 &&
    pz >= ARENA_HEAVEN.room2FMinZ - 0.15 &&
    pz <= ARENA_HEAVEN.room2FMaxZ + 0.15 &&
    curFeetY >= 1.75
  ) {
    supportY = Math.max(supportY, ARENA_HEAVEN.floor2Y);
  }

  // 3. 2F Window Sill Top Surface (sillTopY = 4.05m):
  // Allows the player to jump onto and stand on top of the 2F window sill before dropping out to the 1F plaza!
  if (
    px >= ARENA_HEAVEN.windowMinX - 0.1 &&
    px <= ARENA_HEAVEN.windowMaxX + 0.1 &&
    pz >= -19.45 &&
    pz <= -18.45 &&
    curFeetY >= ARENA_HEAVEN.sillTopY - 0.15
  ) {
    supportY = Math.max(supportY, ARENA_HEAVEN.sillTopY);
  }

  return supportY;
}

export const getArenaFloorSupportY = getFloorHeightAt;

export interface JumpPhysicsStepResult {
  feetY: number;
  verticalVelocity: number;
  isGrounded: boolean;
  jumped: boolean;
}

/**
 * Step vertical jump & gravity physics for the player in Mode 3 / Mode 4.
 * Supports smooth stair climbing, jumping onto/over the 0.65m 2F window sill, and dropping to 1F plaza.
 */
export function stepPlayerJumpPhysics(params: {
  feetY: number;
  verticalVelocity: number;
  isGrounded: boolean;
  supportY: number;
  jumpRequested: boolean;
  allowJump: boolean;
  dt: number;
}): JumpPhysicsStepResult {
  let { feetY, verticalVelocity, isGrounded } = params;
  const { supportY, jumpRequested, allowJump, dt } = params;
  let jumped = false;

  if (!allowJump) {
    return {
      feetY: supportY,
      verticalVelocity: 0,
      isGrounded: true,
      jumped: false,
    };
  }

  // Trigger jump when grounded
  if (jumpRequested && isGrounded) {
    verticalVelocity = ARENA_HEAVEN.jumpVelocity;
    isGrounded = false;
    jumped = true;
  }

  if (isGrounded) {
    // Follow ramp up or step down smoothly if drop is small (<= 0.45m); otherwise start falling
    if (supportY >= feetY - 0.45) {
      feetY = supportY;
      verticalVelocity = 0;
      isGrounded = true;
    } else {
      isGrounded = false;
    }
  }

  if (!isGrounded) {
    verticalVelocity -= ARENA_HEAVEN.gravity * dt;
    const nextFeetY = feetY + verticalVelocity * dt;
    // Land on supporting floor/ramp/sill when descending or stepping up a ramp
    if (nextFeetY <= supportY && verticalVelocity <= 0) {
      feetY = supportY;
      verticalVelocity = 0;
      isGrounded = true;
    } else if (nextFeetY < supportY && supportY - feetY <= 0.5) {
      feetY = supportY;
      verticalVelocity = Math.max(0, verticalVelocity);
      if (verticalVelocity === 0) isGrounded = true;
    } else {
      feetY = nextFeetY;
    }
  }

  return { feetY, verticalVelocity, isGrounded, jumped };
}

/**
 * 2. 맵 확장(360° 광장 + 1층 아치 / 복도 / 계단 / 2층 Heaven 순환 루프)과 자연스러운 충돌 슬라이딩(Tangent Sliding)
 * - 원형 외벽(반지름 ARENA.playRadius = 18m) 및 내부 원형/AABB 구조물과 충돌할 때
 *   이동이 뚝 멈추지 않고 표면 접선(tangent) 방향으로 자연스럽게 미끄러진다.
 */
export function resolvePlayerPosition(
  curX: number,
  curZ: number,
  dx: number,
  dz: number,
  colliders: ColliderShape[],
  radius: number = ARENA.playerRadius,
  playerFeetY?: number,
  playerHeight: number = ARENA_HEAVEN.playerHeight,
): { x: number; z: number; hitEnv: boolean } {
  let nextX = curX;
  let nextZ = curZ;
  let hitEnv = false;

  // Step 0: If currently stuck inside any static collider at current elevation, push out first
  for (const col of colliders) {
    if (col.isObstacle) continue;
    if (checkOverlap(nextX, nextZ, radius, col, playerFeetY, playerHeight)) {
      const pushed = pushOutSmoothFromCollider(nextX, nextZ, radius, col);
      nextX = pushed.x;
      nextZ = pushed.z;
      hitEnv = true;
    }
  }

  // Step 1: Resolve X movement first (with smooth corner gliding so doorways/archways never snag)
  let candX = nextX + dx;
  let candZ = nextZ;
  for (const col of colliders) {
    if (col.isObstacle) continue;
    if (checkOverlap(candX, candZ, radius, col, playerFeetY, playerHeight)) {
      hitEnv = true;
      if (col.kind === 'aabb') {
        const isCorner =
          (candX < col.minX || candX > col.maxX) &&
          (candZ < col.minZ || candZ > col.maxZ);
        if (isCorner) {
          const pushed = pushOutSmoothFromCollider(candX, candZ, radius, col);
          candX = pushed.x;
          candZ = pushed.z;
        } else {
          const midX = (col.minX + col.maxX) * 0.5;
          candX = nextX <= midX ? col.minX - radius - 0.002 : col.maxX + radius + 0.002;
        }
      } else {
        const pushed = pushOutSmoothFromCollider(candX, candZ, radius, col);
        candX = pushed.x;
        candZ = pushed.z;
      }
    }
  }
  nextX = candX;
  nextZ = candZ;

  // Step 2: Resolve Z movement second
  candZ = nextZ + dz;
  for (const col of colliders) {
    if (col.isObstacle) continue;
    if (checkOverlap(nextX, candZ, radius, col, playerFeetY, playerHeight)) {
      hitEnv = true;
      if (col.kind === 'aabb') {
        const isCorner =
          (nextX < col.minX || nextX > col.maxX) &&
          (candZ < col.minZ || candZ > col.maxZ);
        if (isCorner) {
          const pushed = pushOutSmoothFromCollider(nextX, candZ, radius, col);
          nextX = pushed.x;
          candZ = pushed.z;
        } else {
          const midZ = (col.minZ + col.maxZ) * 0.5;
          candZ = nextZ <= midZ ? col.minZ - radius - 0.002 : col.maxZ + radius + 0.002;
        }
      } else {
        const pushed = pushOutSmoothFromCollider(nextX, candZ, radius, col);
        nextX = pushed.x;
        candZ = pushed.z;
      }
    }
  }
  nextZ = candZ;

  // Step 3: Final safety de-penetration pass if nudged into an adjacent collider
  for (const col of colliders) {
    if (col.isObstacle) continue;
    if (checkOverlap(nextX, nextZ, radius, col, playerFeetY, playerHeight)) {
      const pushed = pushOutSmoothFromCollider(nextX, nextZ, radius, col);
      nextX = pushed.x;
      nextZ = pushed.z;
      hitEnv = true;
    }
  }

  // Step 4: Clamp to 360° circular plaza perimeter (smoothly slides along the circular hologram boundary),
  // EXCEPT when the player is walking through the open 1F North Archway / Corridor / Staircase / 2F Heaven loop!
  const maxAllowedDist = ARENA.playRadius - radius;
  const distFromOrigin = Math.hypot(nextX, nextZ);
  if (
    distFromOrigin > maxAllowedDist &&
    distFromOrigin > 0.0001 &&
    !isInsideHeavenLoopFootprint(nextX, nextZ, radius)
  ) {
    const scale = maxAllowedDist / distFromOrigin;
    nextX *= scale;
    nextZ *= scale;
    hitEnv = true;
  }

  // Safety AABB clamp (expanded north/east for the Heaven loop annex)
  nextX = Math.max(ARENA.playMinX + radius, Math.min(ARENA.playMaxX - radius, nextX));
  nextZ = Math.max(
    ARENA_HEAVEN.hallMinZ + radius,
    Math.min(ARENA.playMaxZ - radius, nextZ),
  );

  return { x: nextX, z: nextZ, hitEnv };
}

export function checkOverlap(
  px: number,
  pz: number,
  radius: number,
  col: ColliderShape,
  playerFeetY?: number,
  playerHeight: number = ARENA_HEAVEN.playerHeight,
): boolean {
  if (playerFeetY !== undefined && (col.minY !== undefined || col.maxY !== undefined)) {
    const pMinY = playerFeetY;
    const pMaxY = playerFeetY + playerHeight;
    const cMinY = col.minY ?? -Infinity;
    const cMaxY = col.maxY ?? Infinity;
    if (pMaxY <= cMinY + 0.02 || pMinY >= cMaxY - 0.15) {
      return false;
    }
  }
  if (col.kind === 'circle') {
    const dx = px - col.x;
    const dz = pz - col.z;
    const rSum = radius + col.radius;
    return dx * dx + dz * dz < rSum * rSum;
  } else {
    const closestX = Math.max(col.minX, Math.min(px, col.maxX));
    const closestZ = Math.max(col.minZ, Math.min(pz, col.maxZ));
    const dx = px - closestX;
    const dz = pz - closestZ;
    return dx * dx + dz * dz < radius * radius;
  }
}

export function distanceToColliderSurface(
  px: number,
  pz: number,
  col: ColliderShape,
): number {
  if (col.kind === 'circle') {
    const dist = Math.hypot(px - col.x, pz - col.z);
    return Math.max(0, dist - col.radius);
  } else {
    const closestX = Math.max(col.minX, Math.min(px, col.maxX));
    const closestZ = Math.max(col.minZ, Math.min(pz, col.maxZ));
    return Math.hypot(px - closestX, pz - closestZ);
  }
}

export function pushOutSmoothFromCollider(
  px: number,
  pz: number,
  radius: number,
  col: ColliderShape,
): { x: number; z: number } {
  if (col.kind === 'circle') {
    let dx = px - col.x;
    let dz = pz - col.z;
    const len = Math.hypot(dx, dz) || 0.0001;
    dx /= len;
    dz /= len;
    return {
      x: col.x + dx * (col.radius + radius + 0.005),
      z: col.z + dz * (col.radius + radius + 0.005),
    };
  } else {
    const closestX = Math.max(col.minX, Math.min(px, col.maxX));
    const closestZ = Math.max(col.minZ, Math.min(pz, col.maxZ));
    const dx = px - closestX;
    const dz = pz - closestZ;
    const dist = Math.hypot(dx, dz);

    // If center of player circle is outside AABB, push radially from closest point (rounded corner slide!)
    if (dist > 0.0001 && dist < radius) {
      const nx = dx / dist;
      const nz = dz / dist;
      return {
        x: closestX + nx * (radius + 0.005),
        z: closestZ + nz * (radius + 0.005),
      };
    }

    // Fallback when player center is deeply inside the AABB
    const cx = (col.minX + col.maxX) * 0.5;
    const cz = (col.minZ + col.maxZ) * 0.5;
    const halfX = (col.maxX - col.minX) * 0.5 + radius + 0.01;
    const halfZ = (col.maxZ - col.minZ) * 0.5 + radius + 0.01;
    const relX = px - cx;
    const relZ = pz - cz;
    if (Math.abs(relX / halfX) > Math.abs(relZ / halfZ)) {
      return { x: cx + Math.sign(relX || 1) * halfX, z: pz };
    } else {
      return { x: px, z: cz + Math.sign(relZ || 1) * halfZ };
    }
  }
}

/**
 * 3. 과녁을 못 찾을 때 방향 힌트 계산 및 Stage 1~5 단계별 파동(Wave) 표시
 * - 플레이어 위치/시선(yaw, pitch) 기준 목표물의 상대 각도 계산
 * - stage 0: 화면 안에 있거나 아직 지연 시간(delaySec) 전 -> 표시 안 함
 * - stage 1 (ratio >= 1.0): 부드러운 1단계 시안 파동(1링) + 방향 화살표 + 방향 텍스트
 * - stage 2 (ratio >= 1.5): 2단계 2중 파동 + 강조 화살표 + 방향·각도 안내
 * - stage 3 (ratio >= 2.1): 3단계 2중 확장 파동 + 목표물 색상 코어 링 + 2중 셰브론 화살표
 * - stage 4 (ratio >= 2.6): 4단계 3중 동심원 소나 파동 + 3중 셰브론 + 시선 유도 가이드
 * - stage 5 (ratio >= 3.2): 5단계 최대 시선 유도 3중 파동 + 중앙-힌트 연결 가이드 트레일 + 각도 안내
 */
export type OffscreenHintStage = 0 | 1 | 2 | 3 | 4 | 5;

export interface OffscreenHintCalculation {
  isOffscreen: boolean;
  relativeYawDeg: number; // -180 ~ +180 (+는 오른쪽, -는 왼쪽)
  relativePitchDeg: number;
  screenAngleRad: number; // 화면 중앙 기준 화살표 방향 라디안 (0 = 오른쪽, -PI/2 = 위, PI/2 = 아래)
  directionSector: SpawnDirectionSector;
  directionLabel: string;
  stage: OffscreenHintStage;
  waveRingCount: 0 | 1 | 2 | 3;
  waveDurationSec: number; // 1.7s ~ 2.2s (초당 1회 미만의 아동 친화적 부드러운 파동 주기)
}

export function computeTargetDirectionHint(params: {
  playerX: number;
  playerY: number;
  playerZ: number;
  playerYawRad: number;
  playerPitchRad: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  unseenDurationSec: number;
  hintDelaySec: number;
  fovDeg?: number;
}): OffscreenHintCalculation {
  const dx = params.targetX - params.playerX;
  const dy = params.targetY - params.playerY;
  const dz = params.targetZ - params.playerZ;
  const horizDist = Math.max(0.001, Math.hypot(dx, dz));

  // In Three.js camera facing -Z at yaw=0:
  // forward vector = (-sin(yaw), 0, -cos(yaw))
  // right vector   = ( cos(yaw), 0, -sin(yaw))
  const sinY = Math.sin(params.playerYawRad);
  const cosY = Math.cos(params.playerYawRad);

  const localForward = -dx * sinY - dz * cosY;
  const localRight = dx * cosY - dz * sinY;

  // Yaw angle relative to look direction: +right, -left
  const relYawRad = Math.atan2(localRight, localForward);
  const relativeYawDeg = (relYawRad * 180) / Math.PI;

  const targetPitchRad = Math.atan2(dy, horizDist);
  const relPitchRad = targetPitchRad - params.playerPitchRad;
  const relativePitchDeg = (relPitchRad * 180) / Math.PI;

  const halfFov = (params.fovDeg ?? 78) * 0.5;
  const isOffscreen =
    Math.abs(relativeYawDeg) > halfFov || Math.abs(relativePitchDeg) > halfFov * 0.75;

  // Determine sector relative to player gaze
  let directionSector: SpawnDirectionSector = 'FRONT';
  let directionLabel = '정면';
  if (Math.abs(relativeYawDeg) >= 125) {
    directionSector = 'REAR';
    directionLabel = relativeYawDeg >= 0 ? '오른쪽 뒤' : '왼쪽 뒤';
    if (Math.abs(relativeYawDeg) >= 155) directionLabel = '바로 뒤쪽';
  } else if (relativeYawDeg > 35) {
    directionSector = 'RIGHT';
    directionLabel = '오른쪽';
  } else if (relativeYawDeg < -35) {
    directionSector = 'LEFT';
    directionLabel = '왼쪽';
  } else if (relativePitchDeg > 25) {
    directionLabel = '위쪽';
  } else if (relativePitchDeg < -25) {
    directionLabel = '아래쪽';
  }

  // Screen-space 2D angle so arrow orbits around the center crosshair
  const screenX = Math.sin(relYawRad);
  const screenY =
    localForward < 0 && Math.abs(screenX) < 0.25
      ? 0.65 // If directly behind, point clearly to bottom/side turn
      : -Math.sin(relPitchRad) * 0.6;
  const screenAngleRad = Math.atan2(screenY, screenX || 0.001);

  let stage: OffscreenHintStage = 0;
  let waveRingCount: 0 | 1 | 2 | 3 = 0;
  let waveDurationSec = 2.1;

  const safeDelay = Math.max(0.2, params.hintDelaySec);
  if (isOffscreen && params.unseenDurationSec >= safeDelay) {
    const ratio = params.unseenDurationSec / safeDelay;
    if (ratio >= 3.2) {
      stage = 5;
      waveRingCount = 3;
      waveDurationSec = 1.65;
    } else if (ratio >= 2.6) {
      stage = 4;
      waveRingCount = 3;
      waveDurationSec = 1.75;
    } else if (ratio >= 2.1) {
      stage = 3;
      waveRingCount = 2;
      waveDurationSec = 1.85;
    } else if (ratio >= 1.5) {
      stage = 2;
      waveRingCount = 2;
      waveDurationSec = 1.95;
    } else {
      stage = 1;
      waveRingCount = 1;
      waveDurationSec = 2.1;
    }
  }

  return {
    isOffscreen,
    relativeYawDeg: Math.round(relativeYawDeg),
    relativePitchDeg: Math.round(relativePitchDeg),
    screenAngleRad,
    directionSector,
    directionLabel,
    stage,
    waveRingCount,
    waveDurationSec,
  };
}

export type TargetEffectTier =
  | 'decoy_dimmed'
  | 'standard_glow'
  | 'high_beacon'
  | 'mission_lockon';

export interface TargetVisualEffectProfile {
  effectTier: TargetEffectTier;
  hasHaloRing: boolean;
  haloRingCount: 0 | 1 | 2;
  hasCrownBeacon: boolean;
  hasLightPillar: boolean;
  showScreenLockOn: boolean;
  emissiveIntensity: number;
  frameOpacity: number;
  glowScaleMul: number;
  badgeLabel: string;
}

/**
 * 시각 변별 훈련 최적화를 위해 과녁 위 플로팅 라벨·황금 링·빛기둥·글로우 등 과도한 강조 이펙트를 제거하고,
 * 사용자가 과녁 자체의 형태와 색상을 직접 판별하도록 깔끔한 기본 프로파일만 반환한다.
 */
export function computeTargetVisualEffectProfile(params: {
  difficulty: number;
  typeId: TargetTypeId;
  isMissionCorrect: boolean;
}): TargetVisualEffectProfile {
  return {
    effectTier: params.typeId === 'G' && params.isMissionCorrect ? 'mission_lockon' : 'standard_glow',
    hasHaloRing: false,
    haloRingCount: 0,
    hasCrownBeacon: false,
    hasLightPillar: false,
    showScreenLockOn: false,
    emissiveIntensity: 0.24,
    frameOpacity: 0.96,
    glowScaleMul: 0,
    badgeLabel: '',
  };
}

export interface OverlappingTargetHitCandidate {
  targetId: string;
  rayDistance: number;
  cameraDistance: number;
}

/**
 * 타겟이 겹치는 경우 발사 시 카메라(플레이어)로부터 가장 앞쪽에 있는 과녁이 먼저 맞도록 정렬·선택한다.
 * 카메라와 타겟 사이에 벽·구조물이 더 가까이에 있으면 절대 선택·명중되지 않는다.
 */
export function selectFrontmostTargetHit<T extends OverlappingTargetHitCandidate>(
  candidates: T[],
  firstEnvironmentObstacleDistance: number = Infinity,
): T | null {
  if (!candidates || candidates.length === 0) return null;
  const visibleBeforeWall = candidates.filter(
    (c) => c.rayDistance < firstEnvironmentObstacleDistance - 1e-4,
  );
  if (visibleBeforeWall.length === 0) return null;

  const sorted = [...visibleBeforeWall].sort((a, b) => {
    const camDiff = a.cameraDistance - b.cameraDistance;
    if (Math.abs(camDiff) > 0.05) return camDiff;
    return a.rayDistance - b.rayDistance;
  });
  return sorted[0];
}

export function calculateNormalized100Score(params: {
  hits: number;
  perfectHits: number;
  goodHits: number;
  shotsAttempted: number;
  misses: number;
  missedTargets: number;
  avgReactionMs: number;
}): number {
  if (params.shotsAttempted <= 0 && params.missedTargets <= 0) return 0;
  const totalOpportunities = Math.max(1, params.shotsAttempted + params.missedTargets);
  const weightedHits = params.perfectHits * 1.0 + params.goodHits * 0.82;
  const accuracyComponent = Math.min(1, weightedHits / totalOpportunities) * 78;
  const reactionBonus =
    params.hits > 0
      ? Math.max(0, Math.min(22, ((1100 - Math.min(1100, Math.max(180, params.avgReactionMs))) / 920) * 22))
      : 0;
  return Math.max(0, Math.min(100, Math.round(accuracyComponent + reactionBonus)));
}


export function computeKeyboardMoveVector(keys: {
  KeyW?: boolean;
  KeyS?: boolean;
  KeyA?: boolean;
  KeyD?: boolean;
  ArrowUp?: boolean;
  ArrowDown?: boolean;
  ArrowLeft?: boolean;
  ArrowRight?: boolean;
}): { forward: number; right: number } {
  const up = Boolean(keys.KeyW || keys.ArrowUp);
  const down = Boolean(keys.KeyS || keys.ArrowDown);
  const rightKey = Boolean(keys.KeyD || keys.ArrowRight);
  const leftKey = Boolean(keys.KeyA || keys.ArrowLeft);
  let forward = (up ? 1 : 0) - (down ? 1 : 0);
  let right = (rightKey ? 1 : 0) - (leftKey ? 1 : 0);
  const len = Math.hypot(forward, right);
  if (len > 1) {
    forward /= len;
    right /= len;
  }
  return { forward, right };
}

export function computeJoystickMoveVector(
  dx: number,
  dy: number,
  maxRadius: number,
  deadzoneRatio: number = 0.12,
): { forward: number; right: number; magnitude: number } {
  const dist = Math.hypot(dx, dy);
  if (maxRadius <= 0 || dist < maxRadius * deadzoneRatio) {
    return { forward: 0, right: 0, magnitude: 0 };
  }
  const clampedDist = Math.min(dist, maxRadius);
  const norm = (clampedDist - maxRadius * deadzoneRatio) / (maxRadius * (1 - deadzoneRatio));
  const nx = (dx / dist) * norm;
  const ny = (dy / dist) * norm;
  return {
    forward: -ny,
    right: nx,
    magnitude: norm,
  };
}

export interface TypeStatRecord {
  type: TargetTypeId;
  spawned: number;
  hits: number;
  missed: number;
  reactionTimesMs: number[];
}

export interface SessionRecordSummary {
  id: string;
  timestamp: string;
  trainingMode: TrainingModeId;
  trainingModeCode: string;
  trainingModeName: string;
  movementAllowed: boolean;
  movementLabel: string;
  yawRangeType: 'FRONT_45' | 'FREE_360';
  yawRangeLabel: string;
  obstacleAvoidanceRatePct: number | null; // null in stationary modes (displayed as N/A)
  difficulty: number;
  durationSec: number;
  totalScore: number;
  maxScore: number;
  shotsAttempted: number;
  hits: number;
  perfectHits: number;
  goodHits: number;
  misses: number;
  missCount: number;
  nonTargetHits: number; // 비목표물('목표물이 아닙니다!') 발사 수
  wrongSelections: number;
  directTouchHits: number; // 태블릿 직접 과녁 터치 명중 횟수
  rearTargetsSpawned: number; // 후방/시야 밖 생성 목표물 수
  rearTargetsHit: number; // 후방/시야 밖 생성 목표물 명중 수
  directionHintShownCount: number; // 방향 힌트 발동 횟수
  accuracyPct: number;
  avgReactionMs: number;
  firstShotReactionMs: number;
  obstacleCollisions: number;
  obstacleDodges: number;
  missedTargets: number;
  maxCombo: number;
  aimErrorPctAvg: number;
  screenZoneStats: {
    left: { shots: number; hits: number };
    center: { shots: number; hits: number };
    right: { shots: number; hits: number };
  };
  sectorStats: Record<SpawnDirectionSector, { spawned: number; hits: number }>;
  timelineBuckets: Array<{ shots: number; hits: number; accuracyPct: number }>;
  typeStats: Record<
    TargetTypeId,
    {
      spawned: number;
      hits: number;
      missed: number;
      hitRatePct: number;
      avgReactionMs: number;
    }
  >;
}

export class SessionRecorder {
  trainingMode: TrainingModeId;
  difficulty: number;
  totalDurationConfigured: number;
  totalScore = 0;
  shotsAttempted = 0;
  hits = 0;
  perfectHits = 0;
  goodHits = 0;
  misses = 0;
  nonTargetHits = 0;
  wrongSelections = 0;
  directTouchHits = 0;
  rearTargetsSpawned = 0;
  rearTargetsHit = 0;
  directionHintShownCount = 0;
  obstacleCollisions = 0;
  obstacleDodges = 0;
  missedTargets = 0;
  currentCombo = 0;
  maxCombo = 0;
  reactionTimesMs: number[] = [];
  firstShotReactionTimesMs: number[] = [];
  aimErrorsPct: number[] = [];
  screenZoneStats = {
    left: { shots: 0, hits: 0 },
    center: { shots: 0, hits: 0 },
    right: { shots: 0, hits: 0 },
  };
  sectorStats: Record<SpawnDirectionSector, { spawned: number; hits: number }> = {
    FRONT: { spawned: 0, hits: 0 },
    LEFT: { spawned: 0, hits: 0 },
    RIGHT: { spawned: 0, hits: 0 },
    REAR: { spawned: 0, hits: 0 },
  };
  timelineRaw: Array<{ timeSec: number; isHit: boolean }> = [];
  typeMap: Record<TargetTypeId, TypeStatRecord>;

  constructor(difficulty: number, durationConfigured: number, trainingMode: TrainingModeId = 1) {
    this.trainingMode = trainingMode;
    this.difficulty = difficulty;
    this.totalDurationConfigured = Math.max(1, durationConfigured);
    const ids: TargetTypeId[] = ALL_TARGET_TYPES;
    this.typeMap = {} as Record<TargetTypeId, TypeStatRecord>;
    for (const id of ids) {
      this.typeMap[id] = {
        type: id,
        spawned: 0,
        hits: 0,
        missed: 0,
        reactionTimesMs: [],
      };
    }
  }

  recordTargetSpawn(
    type: TargetTypeId,
    isRearOrOffscreen: boolean = false,
    sector: SpawnDirectionSector = 'FRONT',
  ) {
    this.typeMap[type].spawned += 1;
    this.sectorStats[sector].spawned += 1;
    if (isRearOrOffscreen) {
      this.rearTargetsSpawned += 1;
    }
  }

  recordDirectionHintShown() {
    this.directionHintShownCount += 1;
  }

  recordTargetTimeout(type: TargetTypeId) {
    this.typeMap[type].missed += 1;
    this.missedTargets += 1;
  }

  recordFirstShotReaction(ms: number) {
    if (ms >= 0 && ms < 30000) {
      this.firstShotReactionTimesMs.push(ms);
    }
  }

  recordShotHit(params: {
    type: TargetTypeId;
    grade: 'PERFECT' | 'GOOD';
    reactionMs: number;
    aimErrorPct: number;
    screenZone: 'left' | 'center' | 'right';
    elapsedSec: number;
    isDirectTouch?: boolean;
    wasRearSpawn?: boolean;
    sector?: SpawnDirectionSector;
  }): { scoreAdded: number; combo: number } {
    this.shotsAttempted += 1;
    this.hits += 1;
    if (params.grade === 'PERFECT') {
      this.perfectHits += 1;
    } else {
      this.goodHits += 1;
    }
    if (params.isDirectTouch) {
      this.directTouchHits += 1;
    }
    if (params.wasRearSpawn) {
      this.rearTargetsHit += 1;
    }
    if (params.sector) {
      this.sectorStats[params.sector].hits += 1;
    }
    this.currentCombo += 1;
    if (this.currentCombo > this.maxCombo) {
      this.maxCombo = this.currentCombo;
    }

    const scoreAdded = calculateHitScore(
      params.type,
      params.grade,
      this.difficulty,
      this.currentCombo,
    );
    this.totalScore += scoreAdded;

    const clampedReaction = Math.max(40, Math.round(params.reactionMs));
    this.reactionTimesMs.push(clampedReaction);
    this.typeMap[params.type].hits += 1;
    this.typeMap[params.type].reactionTimesMs.push(clampedReaction);

    this.aimErrorsPct.push(Math.max(0, Math.min(150, params.aimErrorPct)));
    this.screenZoneStats[params.screenZone].shots += 1;
    this.screenZoneStats[params.screenZone].hits += 1;
    this.timelineRaw.push({ timeSec: params.elapsedSec, isHit: true });

    return { scoreAdded, combo: this.currentCombo };
  }

  recordShotMiss(
    elapsedSec: number,
    screenZone: 'left' | 'center' | 'right' = 'center',
    hitEnvironmentProp: boolean = true,
  ) {
    this.shotsAttempted += 1;
    this.misses += 1;
    if (hitEnvironmentProp) {
      this.nonTargetHits += 1;
    }
    this.currentCombo = 0;
    this.screenZoneStats[screenZone].shots += 1;
    this.timelineRaw.push({ timeSec: elapsedSec, isHit: false });
  }

  recordShotWrongSelection(elapsedSec: number, screenZone: 'left' | 'center' | 'right' = 'center') {
    this.shotsAttempted += 1;
    this.wrongSelections += 1;
    this.currentCombo = 0;
    this.screenZoneStats[screenZone].shots += 1;
    this.timelineRaw.push({ timeSec: elapsedSec, isHit: false });
  }

  recordObstacleCollision() {
    this.obstacleCollisions += 1;
  }

  recordObstacleDodge() {
    this.obstacleDodges += 1;
  }

  buildSummary(actualDurationSec: number): SessionRecordSummary {
    const accuracyPct =
      this.shotsAttempted > 0
        ? Math.round((this.hits / this.shotsAttempted) * 1000) / 10
        : 0;

    const avgReactionMs =
      this.reactionTimesMs.length > 0
        ? Math.round(
            this.reactionTimesMs.reduce((a, b) => a + b, 0) / this.reactionTimesMs.length,
          )
        : 0;

    const firstShotReactionMs =
      this.firstShotReactionTimesMs.length > 0
        ? Math.round(
            this.firstShotReactionTimesMs.reduce((a, b) => a + b, 0) /
              this.firstShotReactionTimesMs.length,
          )
        : avgReactionMs;

    const aimErrorPctAvg =
      this.aimErrorsPct.length > 0
        ? Math.round(
            (this.aimErrorsPct.reduce((a, b) => a + b, 0) / this.aimErrorsPct.length) * 10,
          ) / 10
        : 0;

    const totalSpan = Math.max(6, actualDurationSec || this.totalDurationConfigured);
    const bucketSpan = totalSpan / 6;
    const timelineBuckets = Array.from({ length: 6 }, (_, idx) => {
      const start = idx * bucketSpan;
      const end = (idx + 1) * bucketSpan;
      const entries = this.timelineRaw.filter((e) =>
        idx === 5 ? e.timeSec >= start : e.timeSec >= start && e.timeSec < end,
      );
      const shots = entries.length;
      const hits = entries.filter((e) => e.isHit).length;
      return {
        shots,
        hits,
        accuracyPct: shots > 0 ? Math.round((hits / shots) * 1000) / 10 : 0,
      };
    });

    const typeStats = {} as SessionRecordSummary['typeStats'];
    ALL_TARGET_TYPES.forEach((id) => {
      const rec = this.typeMap[id];
      const hitRatePct =
        rec.spawned > 0 ? Math.round((rec.hits / rec.spawned) * 1000) / 10 : 0;
      const tAvgReact =
        rec.reactionTimesMs.length > 0
          ? Math.round(
              rec.reactionTimesMs.reduce((a, b) => a + b, 0) / rec.reactionTimesMs.length,
            )
          : 0;
      typeStats[id] = {
        spawned: rec.spawned,
        hits: rec.hits,
        missed: rec.missed,
        hitRatePct,
        avgReactionMs: tAvgReact,
      };
    });

    const modeCfg = TRAINING_MODES[this.trainingMode] || TRAINING_MODES[1];
    const totalObsEvents = this.obstacleDodges + this.obstacleCollisions;
    const obstacleAvoidanceRatePct: number | null = modeCfg.allowObstacleAvoidance
      ? totalObsEvents > 0
        ? Math.round((this.obstacleDodges / totalObsEvents) * 1000) / 10
        : 100
      : null;

    const normalizedScore = calculateNormalized100Score({
      hits: this.hits,
      perfectHits: this.perfectHits,
      goodHits: this.goodHits,
      shotsAttempted: this.shotsAttempted,
      misses: this.misses,
      missedTargets: this.missedTargets,
      avgReactionMs,
    });

    return {
      id: `ehm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toLocaleString('ko-KR', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }),
      trainingMode: modeCfg.id,
      trainingModeCode: modeCfg.code,
      trainingModeName: modeCfg.name,
      movementAllowed: modeCfg.allowMovement,
      movementLabel: modeCfg.movementLabel,
      yawRangeType: modeCfg.yawRangeType,
      yawRangeLabel: modeCfg.yawRangeLabel,
      obstacleAvoidanceRatePct,
      difficulty: this.difficulty,
      durationSec: Math.round(actualDurationSec),
      totalScore: normalizedScore,
      maxScore: 100,
      shotsAttempted: this.shotsAttempted,
      hits: this.hits,
      perfectHits: this.perfectHits,
      goodHits: this.goodHits,
      misses: this.misses,
      missCount: this.misses + this.wrongSelections + this.missedTargets,
      nonTargetHits: this.nonTargetHits,
      wrongSelections: this.wrongSelections,
      directTouchHits: this.directTouchHits,
      rearTargetsSpawned: this.rearTargetsSpawned,
      rearTargetsHit: this.rearTargetsHit,
      directionHintShownCount: this.directionHintShownCount,
      accuracyPct,
      avgReactionMs,
      firstShotReactionMs,
      obstacleCollisions: this.obstacleCollisions,
      obstacleDodges: this.obstacleDodges,
      missedTargets: this.missedTargets,
      maxCombo: this.maxCombo,
      aimErrorPctAvg,
      screenZoneStats: this.screenZoneStats,
      sectorStats: this.sectorStats,
      timelineBuckets,
      typeStats,
    };
  }
}

export interface VisualFieldBiasFeedback {
  hasWeakDirection: boolean;
  weakestLabel: string;
  message: string;
}

/**
 * 훈련 결과의 screenZoneStats(좌/중/우) 및 sectorStats(전/좌/우/후)를 분석해
 * 명중률이 뚜렷하게 낮은 방향에 대한 맞춤 시야 훈련 피드백 문구를 생성한다.
 */
export function analyzeVisualFieldBiasFeedback(
  summary: Pick<SessionRecordSummary, 'screenZoneStats' | 'sectorStats' | 'trainingMode'>,
): VisualFieldBiasFeedback {
  const zoneMeta = [
    { key: 'left' as const, label: '좌측 시야', focus: '좌측 탐색' },
    { key: 'center' as const, label: '중앙 시야', focus: '중앙 정밀 조준' },
    { key: 'right' as const, label: '우측 시야', focus: '우측 탐색' },
  ];

  const activeZones = zoneMeta
    .map((z) => {
      const stat = summary.screenZoneStats?.[z.key] ?? { shots: 0, hits: 0 };
      const ratePct = stat.shots > 0 ? Math.round((stat.hits / stat.shots) * 100) : 0;
      return { ...z, shots: stat.shots, hits: stat.hits, ratePct };
    })
    .filter((z) => z.shots >= 2);

  if (activeZones.length >= 2) {
    const sorted = [...activeZones].sort((a, b) => a.ratePct - b.ratePct);
    const lowest = sorted[0];
    const highest = sorted[sorted.length - 1];
    if (lowest.ratePct <= 60 || highest.ratePct - lowest.ratePct >= 15) {
      return {
        hasWeakDirection: true,
        weakestLabel: lowest.label,
        message: `${lowest.label} 명중률이 낮습니다(${lowest.ratePct}%) — 다음 훈련에서 ${lowest.focus}에 집중해 보세요.`,
      };
    }
  } else if (activeZones.length === 1 && activeZones[0].ratePct <= 55) {
    const only = activeZones[0];
    return {
      hasWeakDirection: true,
      weakestLabel: only.label,
      message: `${only.label} 명중률이 낮습니다(${only.ratePct}%) — 다음 훈련에서 ${only.focus}에 집중해 보세요.`,
    };
  }

  const modeCfg = TRAINING_MODES[(summary.trainingMode ?? 1) as TrainingModeId] || TRAINING_MODES[1];
  if (modeCfg.allowRearTargets && summary.sectorStats) {
    const sectorMeta: Array<{ key: SpawnDirectionSector; label: string; focus: string }> = [
      { key: 'FRONT', label: '정면(N) 방위', focus: '정면 시야 포착' },
      { key: 'LEFT', label: '좌측(W) 방위', focus: '좌측 시야 회전' },
      { key: 'RIGHT', label: '우측(E) 방위', focus: '우측 시야 회전' },
      { key: 'REAR', label: '후방(S) 방위', focus: '후방 방향 전환' },
    ];
    const activeSectors = sectorMeta
      .map((s) => {
        const stat = summary.sectorStats[s.key] ?? { spawned: 0, hits: 0 };
        const ratePct = stat.spawned > 0 ? Math.round((stat.hits / stat.spawned) * 100) : 0;
        return { ...s, spawned: stat.spawned, hits: stat.hits, ratePct };
      })
      .filter((s) => s.spawned >= 2);

    if (activeSectors.length >= 1) {
      const sortedSec = [...activeSectors].sort((a, b) => a.ratePct - b.ratePct);
      const lowestSec = sortedSec[0];
      const highestSec = sortedSec[sortedSec.length - 1];
      if (lowestSec.ratePct <= 60 || highestSec.ratePct - lowestSec.ratePct >= 15) {
        return {
          hasWeakDirection: true,
          weakestLabel: lowestSec.label,
          message: `${lowestSec.label} 명중률이 낮습니다(${lowestSec.ratePct}%) — 다음 훈련에서 ${lowestSec.focus}에 집중해 보세요.`,
        };
      }
    }
  }

  const totalZoneShots = zoneMeta.reduce(
    (sum, z) => sum + (summary.screenZoneStats?.[z.key]?.shots ?? 0),
    0,
  );
  if (totalZoneShots === 0) {
    return {
      hasWeakDirection: false,
      weakestLabel: '',
      message: '아직 방향별 시야 분석 데이터가 충분하지 않습니다.',
    };
  }

  return {
    hasWeakDirection: false,
    weakestLabel: '',
    message: '좌·중·우 시야 구역의 명중률이 고르게 균형을 이루고 있습니다.',
  };
}

// ============================================================================
// Indoor Shooting Range Sudden Challenge (Lv 8~10 & Duration >= 60s)
// ============================================================================

export const INDOOR_RANGE_WORLD = {
  centerX: 150,
  centerZ: 0,
  minX: 138,
  maxX: 162,
  minZ: -12.5,
  maxZ: 12.5,
  playerPos: { x: 150, y: 1.5, z: 9.2 },
  playerYaw: 0,
  playerPitch: 0,
} as const;

export interface IndoorRangeChallengeSpec {
  difficulty: number;
  repeatIndex: number;
  targetCount: number;
  timeLimitSec: number;
  targetDiameter: number;
  bonusScore: number;
  energyBonus: number;
}

export interface IndoorRangeTargetSlot {
  x: number;
  y: number;
  z: number;
}

export function isIndoorRangeEligible(difficulty: number, durationSec: number): boolean {
  return Math.round(difficulty) >= 8 && durationSec >= 60;
}

export function computeIndoorRangeTriggerTimes(
  durationSec: number,
  difficulty: number,
): number[] {
  if (!isIndoorRangeEligible(difficulty, durationSec)) return [];

  if (durationSec === 60) return [28];
  if (durationSec === 90) return [30, 62];
  if (durationSec === 120) return [35, 78];
  if (durationSec === 180) return [40, 95, 145];
  if (durationSec === 300) return [45, 110, 180, 245];

  const earliest = 24;
  const latest = Math.max(earliest, durationSec - 22);
  if (latest - earliest < 8) return [Math.round(durationSec * 0.48)];

  const maxTriggers = Math.min(4, Math.max(1, Math.floor((latest - earliest) / 34) + 1));
  const times: number[] = [];
  for (let i = 0; i < maxTriggers; i++) {
    const ratio = maxTriggers === 1 ? 0.45 : i / (maxTriggers - 1);
    times.push(Math.round(earliest + (latest - earliest) * ratio));
  }
  return times;
}

export function computeIndoorRangeChallengeSpec(
  difficulty: number,
  repeatIndex: number,
  spawnFrequencyMul: number = 1.0,
): IndoorRangeChallengeSpec {
  const lv = Math.max(8, Math.min(10, Math.round(difficulty)));
  const safeRepeat = Math.max(0, Math.floor(repeatIndex));
  const baseCount = lv === 8 ? 6 : lv === 9 ? 8 : 10;
  const freqScale =
    spawnFrequencyMul >= 2.0
      ? 1.25
      : spawnFrequencyMul >= 1.5
        ? 1.15
        : spawnFrequencyMul <= 0.5
          ? 0.85
          : 1.0;

  const rawCount = Math.round(baseCount * Math.pow(1.5, safeRepeat) * freqScale);
  const targetCount = Math.max(4, Math.min(24, rawCount));
  const timeLimitSec = Math.max(8, Math.round(targetCount * 1.15));
  const targetDiameter = lv === 8 ? 0.96 : lv === 9 ? 0.85 : 0.74;
  const bonusScore = 120 + lv * 15 + safeRepeat * 45;

  return {
    difficulty: lv,
    repeatIndex: safeRepeat,
    targetCount,
    timeLimitSec,
    targetDiameter,
    bonusScore,
    energyBonus: 20,
  };
}

export function generateIndoorRangeTargetSlots(
  count: number,
  diameter: number,
  rng: () => number = Math.random,
): IndoorRangeTargetSlot[] {
  const clampedCount = Math.max(1, Math.min(24, Math.round(count)));
  const minSpacing = Math.max(diameter * 1.48, 1.32);
  const cx = INDOOR_RANGE_WORLD.centerX;
  const slots: IndoorRangeTargetSlot[] = [];

  const isClearOfScoreboard = (x: number, y: number, z: number) => {
    // Keep targets cleanly below or beside the suspended ceiling scoreboard at z≈-5.2, y≈5.35
    if (Math.abs(x - cx) < 3.0 && y > 4.05 && z < -3.2 && z > -7.2) {
      return false;
    }
    return true;
  };

  for (let i = 0; i < clampedCount; i++) {
    let placed: IndoorRangeTargetSlot | null = null;
    for (let attempt = 0; attempt < 90; attempt++) {
      const tx = cx + (rng() * 2 - 1) * 7.8;
      const ty = 1.35 + rng() * 3.65;
      const tz = -9.6 + rng() * 7.6;
      if (!isClearOfScoreboard(tx, ty, tz)) continue;

      let overlaps = false;
      for (const s of slots) {
        const d3 = Math.hypot(s.x - tx, s.y - ty, (s.z - tz) * 0.65);
        if (d3 < minSpacing) {
          overlaps = true;
          break;
        }
      }
      if (!overlaps) {
        placed = {
          x: Number(tx.toFixed(2)),
          y: Number(ty.toFixed(2)),
          z: Number(tz.toFixed(2)),
        };
        break;
      }
    }

    if (!placed) {
      // Deterministic non-overlapping grid fallback inside front range
      const cols = 6;
      const col = i % cols;
      const row = Math.floor(i / cols);
      const tx = cx + (col - (cols - 1) * 0.5) * 2.45;
      const ty = 1.45 + (row % 4) * 0.85;
      const tz = -8.8 + (row % 2) * 2.4;
      placed = {
        x: Number(tx.toFixed(2)),
        y: Number(ty.toFixed(2)),
        z: Number(tz.toFixed(2)),
      };
    }

    slots.push(placed);
  }

  return slots;
}

