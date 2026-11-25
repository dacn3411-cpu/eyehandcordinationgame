/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ARENA,
  ARENA_HEAVEN,
  checkOverlap,
  ColliderShape,
  JumpPhysicsStepResult,
  pushOutSmoothFromCollider,
  stepPlayerJumpPhysics,
} from './rules';

export interface HavenWalkableRect {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  isStair?: boolean;
  stairDir?: 'X_UP' | 'Z_UP';
}

export interface HavenZoneDef {
  id: string;
  name: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  minY?: number;
  maxY?: number;
  priority: number;
}

export const HAVEN_PHYSICS = {
  playerRadius: ARENA.playerRadius,
  playerHeight: ARENA_HEAVEN.playerHeight,
  eyeHeight: ARENA.startPos.y,
  tower2FY: 3.5,
  towerSillHeight: 0.7,
  towerSillTopY: 4.2,
  towerOpenTopY: 6.75,
  rampTopY: 0.85,
  cPlatformY: 1.05,
  cCubbyStepY: 0.52,
  windowSillHeight: 0.68,
  startPos: {
    x: 29.5,
    feetY: 0.45,
    z: 9.0,
    yaw: 0,
    pitch: 0.04,
  },
} as const;

export const HAVEN_SITE_LABELS: Array<{ label: string; x: number; z: number }> = [
  { label: 'A', x: 29.5, z: -5.5 },
  { label: 'B', x: -1.0, z: -6.0 },
  { label: 'C', x: -35.5, z: -7.0 },
];

/**
 * Unified walkable floorplan rectangles (1:1 shared by physics containment + rotating Valorant minimap).
 */
export const HAVEN_WALKABLE_RECTS: HavenWalkableRect[] = [
  // East: A Side
  { id: 'floor-a-tower-hell', minX: 24.0, maxX: 33.0, minZ: -25.0, maxZ: -14.0 },
  { id: 'floor-a-tower-east-stairs', minX: 33.0, maxX: 37.2, minZ: -25.0, maxZ: -14.0, isStair: true, stairDir: 'Z_UP' },
  { id: 'floor-a-heaven-stairs', minX: 16.5, maxX: 24.0, minZ: -25.0, maxZ: -21.0, isStair: true, stairDir: 'X_UP' },
  { id: 'floor-a-link-north', minX: 8.0, maxX: 16.5, minZ: -28.0, maxZ: -21.0 },
  { id: 'floor-a-link-south', minX: 8.0, maxX: 24.0, minZ: -21.0, maxZ: -14.0 },
  { id: 'floor-a-graffiti', minX: 14.0, maxX: 21.5, minZ: -15.0, maxZ: -4.0 },
  { id: 'floor-a-site', minX: 21.5, maxX: 38.0, minZ: -14.0, maxZ: 4.0 },
  { id: 'floor-a-ramp', minX: 25.0, maxX: 35.0, minZ: 4.0, maxZ: 14.0 },
  { id: 'floor-a-long-steps', minX: 24.0, maxX: 37.0, minZ: 14.0, maxZ: 23.0, isStair: true, stairDir: 'Z_UP' },
  { id: 'floor-a-long-turn', minX: 17.0, maxX: 37.0, minZ: 23.0, maxZ: 32.0 },
  { id: 'floor-a-short', minX: 11.0, maxX: 25.0, minZ: 0.2, maxZ: 3.7 },
  { id: 'floor-a-sewer', minX: 5.0, maxX: 11.0, minZ: 0.2, maxZ: 21.0 },
  { id: 'floor-a-main', minX: 4.0, maxX: 17.0, minZ: 21.0, maxZ: 34.0 },
  { id: 'floor-a-garden', minX: 1.5, maxX: 14.0, minZ: 34.0, maxZ: 44.0 },

  // Center: Defender Spawn, B Site, Mid, Attacker Spawn
  { id: 'floor-defender-spawn', minX: -18.0, maxX: 16.0, minZ: -43.0, maxZ: -28.0 },
  { id: 'floor-b-back', minX: -10.0, maxX: 8.0, minZ: -20.5, maxZ: -14.0 },
  { id: 'floor-b-site', minX: -10.0, maxX: 8.0, minZ: -14.0, maxZ: 2.0 },
  { id: 'floor-mid-courtyard', minX: -11.0, maxX: 4.0, minZ: 2.0, maxZ: 20.0 },
  { id: 'floor-mid-doors', minX: -15.0, maxX: -11.0, minZ: 5.0, maxZ: 11.0 },
  { id: 'floor-mid-window', minX: -9.5, maxX: 1.5, minZ: 20.0, maxZ: 33.5 },
  { id: 'floor-mid-to-attacker', minX: -8.5, maxX: -2.0, minZ: 33.5, maxZ: 40.0 },
  { id: 'floor-mid-to-garden', minX: -1.5, maxX: 4.0, minZ: 33.5, maxZ: 38.5 },
  { id: 'floor-attacker-spawn', minX: -20.0, maxX: 10.0, minZ: 40.0, maxZ: 55.0 },

  // West: C Site, Garage, Connector, C Long, C Lobby
  { id: 'floor-c-link-north', minX: -18.0, maxX: -10.0, minZ: -28.0, maxZ: -20.0 },
  { id: 'floor-c-link-main', minX: -27.0, maxX: -10.0, minZ: -20.0, maxZ: -10.5 },
  { id: 'floor-c-window-corridor', minX: -22.5, maxX: -15.0, minZ: -10.5, maxZ: 2.0 },
  { id: 'floor-c-garage', minX: -24.5, maxX: -15.0, minZ: 2.0, maxZ: 16.0 },
  { id: 'floor-c-connector', minX: -32.0, maxX: -24.5, minZ: -2.0, maxZ: 10.5 },
  { id: 'floor-c-site', minX: -44.0, maxX: -27.0, minZ: -16.0, maxZ: 2.0 },
  { id: 'floor-c-long', minX: -43.0, maxX: -36.0, minZ: 2.0, maxZ: 30.0 },
  { id: 'floor-c-cubby', minX: -36.0, maxX: -30.0, minZ: 20.0, maxZ: 28.0 },
  { id: 'floor-c-lobby', minX: -43.0, maxX: -18.0, minZ: 30.0, maxZ: 40.0 },
  { id: 'floor-c-lobby-to-spawn', minX: -22.0, maxX: -14.0, minZ: 38.5, maxZ: 41.5 },
];

/**
 * Detailed Haven Zone definitions for real-time HUD location badge.
 */
export const HAVEN_ZONES: HavenZoneDef[] = [
  // Elevated / Special priority zones first
  { id: 'a-tower', name: 'A Tower', minX: 23.8, maxX: 33.2, minZ: -25.2, maxZ: -13.9, minY: 2.2, priority: 100 },
  { id: 'a-heaven-stairs', name: 'A Heaven Stairs', minX: 16.4, maxX: 24.1, minZ: -25.1, maxZ: -20.9, priority: 95 },
  { id: 'a-east-stairs', name: 'A Heaven Stairs', minX: 33.0, maxX: 37.3, minZ: -25.1, maxZ: -14.0, priority: 94 },
  { id: 'a-hell', name: 'A Hell', minX: 23.9, maxX: 33.2, minZ: -21.1, maxZ: -13.9, maxY: 2.19, priority: 90 },
  { id: 'a-box', name: 'A Box', minX: 25.0, maxX: 32.5, minZ: -9.5, maxZ: -2.0, priority: 85 },
  { id: 'a-graffiti', name: 'A Graffiti', minX: 13.8, maxX: 21.6, minZ: -15.2, maxZ: -3.8, priority: 80 },
  { id: 'a-link', name: 'A Link', minX: 7.9, maxX: 24.1, minZ: -28.2, maxZ: -14.8, priority: 75 },
  { id: 'a-site', name: 'A Site', minX: 21.4, maxX: 38.2, minZ: -14.2, maxZ: 4.1, priority: 70 },
  { id: 'a-ramp', name: 'A Ramp', minX: 24.8, maxX: 35.2, minZ: 4.0, maxZ: 14.2, priority: 75 },
  { id: 'a-short', name: 'A Short', minX: 10.9, maxX: 25.2, minZ: 0.0, maxZ: 4.8, priority: 78 },
  { id: 'a-sewer', name: 'A Sewer', minX: 4.8, maxX: 11.2, minZ: 0.0, maxZ: 21.2, priority: 76 },
  { id: 'a-long', name: 'A Long', minX: 17.0, maxX: 37.2, minZ: 14.1, maxZ: 32.2, priority: 72 },
  { id: 'a-main', name: 'A Main', minX: 3.9, maxX: 17.2, minZ: 20.8, maxZ: 34.2, priority: 74 },
  { id: 'a-garden', name: 'A Garden', minX: 1.4, maxX: 14.2, minZ: 33.9, maxZ: 44.2, priority: 76 },

  // B, Mid & Spawns
  { id: 'defender-spawn', name: 'Defender Side Spawn', minX: -18.2, maxX: 16.2, minZ: -43.5, maxZ: -27.9, priority: 82 },
  { id: 'attacker-spawn', name: 'Attacker Side Spawn', minX: -20.2, maxX: 10.2, minZ: 39.8, maxZ: 55.5, priority: 82 },
  { id: 'b-back', name: 'B Back', minX: -10.2, maxX: 8.2, minZ: -20.6, maxZ: -13.8, priority: 84 },
  { id: 'b-site', name: 'B Site', minX: -10.2, maxX: 8.2, minZ: -14.2, maxZ: 2.1, priority: 75 },
  { id: 'mid-doors', name: 'Mid Doors', minX: -15.2, maxX: -10.8, minZ: 4.8, maxZ: 11.2, priority: 86 },
  { id: 'mid-window', name: 'Mid Window', minX: -9.8, maxX: 2.2, minZ: 19.6, maxZ: 40.0, priority: 80 },
  { id: 'mid-courtyard', name: 'Mid Courtyard', minX: -11.2, maxX: 4.2, minZ: 2.0, maxZ: 20.2, priority: 72 },

  // C Side
  { id: 'c-platform', name: 'C Platform', minX: -44.2, maxX: -37.2, minZ: -15.2, maxZ: -4.2, priority: 88 },
  { id: 'c-logs', name: 'C Logs', minX: -34.2, maxX: -27.2, minZ: -16.0, maxZ: -9.0, priority: 86 },
  { id: 'c-window', name: 'C Window', minX: -22.6, maxX: -14.8, minZ: -10.6, maxZ: 2.2, priority: 82 },
  { id: 'c-door', name: 'C Door', minX: -26.2, maxX: -23.4, minZ: 4.6, maxZ: 10.8, priority: 87 },
  { id: 'c-connector', name: 'C Connector', minX: -32.2, maxX: -24.4, minZ: -2.2, maxZ: 10.8, priority: 80 },
  { id: 'c-garage', name: 'C Garage', minX: -24.6, maxX: -14.8, minZ: 1.9, maxZ: 16.2, priority: 78 },
  { id: 'c-link', name: 'C Link', minX: -27.2, maxX: -9.8, minZ: -28.0, maxZ: -10.2, priority: 76 },
  { id: 'c-site', name: 'C Site', minX: -44.2, maxX: -26.8, minZ: -16.2, maxZ: 2.2, priority: 70 },
  { id: 'c-cubby', name: 'C Cubby', minX: -36.2, maxX: -29.8, minZ: 19.8, maxZ: 28.2, priority: 85 },
  { id: 'c-long', name: 'C Long', minX: -43.2, maxX: -35.8, minZ: 2.0, maxZ: 30.2, priority: 75 },
  { id: 'c-lobby', name: 'C Lobby', minX: -43.2, maxX: -14.0, minZ: 29.8, maxZ: 41.6, priority: 74 },
];

export function getHavenZoneAt(x: number, z: number, feetY: number = 0): string {
  let best: HavenZoneDef | null = null;
  for (const zone of HAVEN_ZONES) {
    if (x < zone.minX || x > zone.maxX || z < zone.minZ || z > zone.maxZ) continue;
    if (zone.minY !== undefined && feetY < zone.minY) continue;
    if (zone.maxY !== undefined && feetY > zone.maxY) continue;
    if (!best || zone.priority > best.priority) {
      best = zone;
    }
  }
  return best ? best.name : 'Haven';
}

/**
 * Height-layered wall, sill, crate & cover colliders for the complete Haven world.
 */
export function buildHavenColliders(): ColliderShape[] {
  return [
    // ---- A TOWER & A HELL HEIGHT-LAYERED PORTALS ----
    // 1F dividers & pillars at Z = -14 around A Hell doorway (X: 25.0 .. 31.5 open on 1F)
    { id: 'haven-a-tower-south-l', kind: 'aabb', minX: 23.8, maxX: 25.1, minZ: -14.4, maxZ: -13.6 },
    { id: 'haven-a-tower-south-r', kind: 'aabb', minX: 31.5, maxX: 37.5, minZ: -14.4, maxZ: -13.6 },
    // 2F A Tower Open Window Sill (X: 25.0..31.8, Y: 3.45..4.18 -> 0.70m above 3.5m floor, jumpable!)
    { id: 'haven-a-tower-window-sill', kind: 'aabb', minX: 25.0, maxX: 31.8, minZ: -14.35, maxZ: -13.65, minY: 3.45, maxY: 4.18 },
    // 2F A Tower West back wall over A Hell entrance (open underneath on 1F Y<3.35!)
    { id: 'haven-a-tower-west-2f', kind: 'aabb', minX: 23.75, maxX: 24.25, minZ: -21.1, maxZ: -13.8, minY: 3.4, maxY: 7.5 },
    // Wall separating West A Heaven Stairs (Z <= -21, X: 16.5..24.0) from A Link (Z >= -21)
    { id: 'haven-a-stair-south-wall', kind: 'aabb', minX: 16.5, maxX: 24.0, minZ: -21.25, maxZ: -20.75 },
    // 1F-ONLY north back wall of A Hell (Y: 0..3.35 -> completely OPEN on 2F so 2F A Tower is one continuous room Z: -25..-14!)
    { id: 'haven-a-hell-north-1f', kind: 'aabb', minX: 24.0, maxX: 33.0, minZ: -21.25, maxZ: -20.75, minY: 0, maxY: 3.35 },
    // East Stairwell divider wall at X = 33.0 (1F open at Z: -17.6..-14.0 to enter from A Hell; 2F open at Z: -25.0..-21.5 to enter 2F A Tower!)
    { id: 'haven-a-east-stair-div', kind: 'aabb', minX: 32.75, maxX: 33.25, minZ: -21.5, maxZ: -17.6 },
    { id: 'haven-a-east-door-2f-wall', kind: 'aabb', minX: 32.75, maxX: 33.25, minZ: -17.6, maxZ: -14.0, minY: 3.4, maxY: 7.5 },
    // Solid block behind West A Heaven Stairs (Z: -28..-25, X: 16.5..24.2)
    { id: 'haven-a-stair-north-block', kind: 'aabb', minX: 16.5, maxX: 24.2, minZ: -28.2, maxZ: -25.0 },
    // 1F block under West stairs entrance at X=24 so 1F players don't walk under the ramp lip into A Tower floor
    { id: 'haven-a-stair-1f-lip', kind: 'aabb', minX: 23.75, maxX: 24.25, minZ: -25.0, maxZ: -21.0, minY: 0, maxY: 2.35 },

    // ---- A SITE & A APPROACHES DIVIDER WALLS ----
    // Wall separating A Link (Z <= -15) & A Graffiti (Z >= -15) except portal X: 14.5..21.0
    { id: 'haven-a-link-graffiti-l', kind: 'aabb', minX: 8.0, maxX: 14.5, minZ: -15.4, maxZ: -14.6 },
    { id: 'haven-a-link-graffiti-r', kind: 'aabb', minX: 21.0, maxX: 24.2, minZ: -15.4, maxZ: -14.6 },
    // Wall between A Link/Defender Spawn & B Back (X=8, Z: -28..-21)
    { id: 'haven-def-blink-divider', kind: 'aabb', minX: 7.7, maxX: 8.3, minZ: -28.2, maxZ: -20.5 },
    // Wall between B Site East & A Graffiti/A Short (X: 8..14, Z: -14.6..0.2)
    { id: 'haven-b-a-solid-block', kind: 'aabb', minX: 8.0, maxX: 14.0, minZ: -14.8, maxZ: 0.2 },
    // Wall West of A Site between A Short & A Graffiti (X: 21.1..21.8, Z: -4.0..0.2)
    { id: 'haven-a-short-north-jamb', kind: 'aabb', minX: 21.1, maxX: 21.8, minZ: -4.1, maxZ: 0.2 },
    // Solid block South of A Short & East of A Sewer (X: 11.0..25.0, Z: 3.7..21.0)
    { id: 'haven-a-short-south-block', kind: 'aabb', minX: 11.0, maxX: 25.0, minZ: 3.7, maxZ: 14.0 },
    { id: 'haven-a-long-inner-block', kind: 'aabb', minX: 11.0, maxX: 24.0, minZ: 14.0, maxZ: 21.0 },
    // Wall between A Site South & A Ramp (X: 21.5..25.0 and X: 35.0..38.5 at Z=4.0)
    { id: 'haven-a-site-south-l', kind: 'aabb', minX: 21.5, maxX: 25.0, minZ: 3.7, maxZ: 4.4 },
    { id: 'haven-a-site-south-r', kind: 'aabb', minX: 35.0, maxX: 38.5, minZ: 3.7, maxZ: 4.4 },
    // Solid pillar between A Sewer & Mid Courtyard / A Main (X: 1.5..5.0, Z: 2.0..33.5)
    { id: 'haven-mid-sewer-divider', kind: 'aabb', minX: 1.5, maxX: 5.0, minZ: 2.0, maxZ: 20.0 },
    { id: 'haven-mid-amain-divider', kind: 'aabb', minX: 1.5, maxX: 4.0, minZ: 20.0, maxZ: 33.5 },
    // Solid pillar South of A Long between A Main & A Garden (X: 14.0..17.5, Z: 32.0..44.0)
    { id: 'haven-a-garden-east-block', kind: 'aabb', minX: 14.0, maxX: 17.5, minZ: 32.0, maxZ: 44.5 },
    // Pillar between Mid-to-Attacker & A Garden (X: -2.0..1.5, Z: 38.5..44.0)
    { id: 'haven-attacker-garden-pillar', kind: 'aabb', minX: -2.0, maxX: 1.5, minZ: 38.5, maxZ: 44.0 },

    // ---- A SITE COVER PROPS ----
    // Central Emerald Radianite Crate (A Box)
    { id: 'haven-a-box-radianite', kind: 'aabb', minX: 26.8, maxX: 28.9, minZ: -6.8, maxZ: -4.7 },
    // 2-Tier Olive Metal Container on A Site
    { id: 'haven-a-site-container', kind: 'aabb', minX: 32.4, maxX: 35.6, minZ: -4.5, maxZ: -1.4 },

    // ---- B SITE, MID, DEFENDER & ATTACKER SPAWN ----
    // Wall between Defender Spawn & B Back (X: -10.0..+8.0, Z: -28.0..-20.5)
    { id: 'haven-def-bback-block', kind: 'aabb', minX: -10.0, maxX: 8.0, minZ: -28.0, maxZ: -20.5 },
    // B Back Circular Wood Screen Partition (centered at X=-1, Z=-16.5 -> plenty of space around both sides)
    { id: 'haven-b-back-screen', kind: 'aabb', minX: -3.4, maxX: 1.4, minZ: -17.0, maxZ: -16.1 },
    // B Site Centerpiece Monument (Grey metal & Radianite core)
    { id: 'haven-b-centerpiece', kind: 'aabb', minX: -2.8, maxX: 0.8, minZ: -8.0, maxZ: -4.2 },
    // B Site South doorway jambs at Z = 2.0 (X: -5.0..+1.5 open)
    { id: 'haven-b-south-l', kind: 'aabb', minX: -10.5, maxX: -5.0, minZ: 1.6, maxZ: 2.4 },
    { id: 'haven-b-south-r', kind: 'aabb', minX: 1.5, maxX: 8.5, minZ: 1.6, maxZ: 2.4 },
    // Mid Window Wall at Z = 20.0 (X: -6.5..-1.5 is jumpable 0.68m sill!)
    { id: 'haven-mid-window-l', kind: 'aabb', minX: -11.2, maxX: -6.5, minZ: 19.6, maxZ: 20.4 },
    { id: 'haven-mid-window-r', kind: 'aabb', minX: -1.5, maxX: 4.2, minZ: 19.6, maxZ: 20.4 },
    { id: 'haven-mid-window-sill', kind: 'aabb', minX: -6.5, maxX: -1.5, minZ: 19.65, maxZ: 20.35, minY: 0, maxY: HAVEN_PHYSICS.windowSillHeight },

    // ---- C SIDE: GARAGE, CONNECTOR, C SITE, C LONG ----
    // Wall between C Link (Z <= -10.5) & C Window Corridor (X: -27..-22.5 & -15..-10)
    { id: 'haven-c-link-south-l', kind: 'aabb', minX: -27.2, maxX: -22.5, minZ: -10.8, maxZ: -10.2 },
    { id: 'haven-c-link-south-r', kind: 'aabb', minX: -15.0, maxX: -10.0, minZ: -10.8, maxZ: -10.2 },
    // Solid block between C Garage/Window & Mid Courtyard (X: -15.0..-11.0, Z: -10.2..5.0 & Z: 11.0..33.5)
    { id: 'haven-c-mid-north-block', kind: 'aabb', minX: -15.0, maxX: -11.0, minZ: -10.2, maxZ: 5.0 },
    { id: 'haven-c-mid-south-block', kind: 'aabb', minX: -15.0, maxX: -11.0, minZ: 11.0, maxZ: 38.5 },
    // C Window Wall at Z = 2.0 (X: -21.0..-16.0 is jumpable 0.68m sill!)
    { id: 'haven-c-window-l', kind: 'aabb', minX: -24.7, maxX: -21.0, minZ: 1.65, maxZ: 2.35 },
    { id: 'haven-c-window-r', kind: 'aabb', minX: -16.0, maxX: -14.8, minZ: 1.65, maxZ: 2.35 },
    { id: 'haven-c-window-sill', kind: 'aabb', minX: -21.0, maxX: -16.0, minZ: 1.7, maxZ: 2.3, minY: 0, maxY: HAVEN_PHYSICS.windowSillHeight },
    // C Door West Wall of C Garage at X = -24.5 (Z: 5.0..10.5 open double doors!)
    { id: 'haven-c-door-n', kind: 'aabb', minX: -24.8, maxX: -24.2, minZ: 2.0, maxZ: 5.0 },
    { id: 'haven-c-door-s', kind: 'aabb', minX: -24.8, maxX: -24.2, minZ: 10.5, maxZ: 16.0 },
    // Solid pillar East of C Connector / North of C Site exit (X: -27.5..-22.5, Z: -10.5..-2.0)
    { id: 'haven-c-connector-pillar', kind: 'aabb', minX: -27.2, maxX: -22.5, minZ: -10.5, maxZ: -2.0 },
    // Solid wall between C Site & C Connector except X: -32.0..-27.5 at Z = -2.0
    { id: 'haven-c-site-south-mid', kind: 'aabb', minX: -36.0, maxX: -32.0, minZ: -2.2, maxZ: 2.2 },
    // Solid block between C Long (X <= -36) & C Connector/Garage/Lobby (X: -36..-15, Z: 10.5..30) except C Cubby (Z: 20..28, X: -36..-30)
    { id: 'haven-c-long-east-n', kind: 'aabb', minX: -36.0, maxX: -24.5, minZ: 10.5, maxZ: 20.0 },
    { id: 'haven-c-long-east-cubby', kind: 'aabb', minX: -30.0, maxX: -15.0, minZ: 16.0, maxZ: 30.0 },
    { id: 'haven-c-long-east-s', kind: 'aabb', minX: -36.0, maxX: -30.0, minZ: 28.0, maxZ: 30.0 },
    // Pillar between C Lobby & Attacker Spawn (X: -18..-15, Z: 30..38.5)
    { id: 'haven-c-lobby-east-wall', kind: 'aabb', minX: -18.0, maxX: -14.8, minZ: 30.0, maxZ: 38.5 },

    // ---- C SITE COVER PROPS ----
    // 2-Tier Emerald Radianite Crate Stack on C Site
    { id: 'haven-c-site-radianite', kind: 'aabb', minX: -34.6, maxX: -32.4, minZ: -7.2, maxZ: -5.0 },
    // C Logs Stacked Timber Cover
    { id: 'haven-c-site-logs', kind: 'aabb', minX: -32.4, maxX: -29.0, minZ: -13.4, maxZ: -11.4 },
    // C Platform West/North ledge (only prevent walking directly through sheer face from South/East unless stepped up)
    { id: 'haven-c-platform-face-s', kind: 'aabb', minX: -44.0, maxX: -37.6, minZ: -4.6, maxZ: -4.1, minY: 0, maxY: HAVEN_PHYSICS.cPlatformY - 0.12 },
    { id: 'haven-c-platform-face-e', kind: 'aabb', minX: -38.0, maxX: -37.5, minZ: -14.5, maxZ: -11.5, minY: 0, maxY: HAVEN_PHYSICS.cPlatformY - 0.12 },
  ];
}

/**
 * Computes exact walkable floor/ramp/stair/platform Y support height for Haven.
 */
export function getHavenFloorSupportY(
  px: number,
  pz: number,
  curFeetY: number = 0,
): number {
  let supportY = 0;

  // 1A. West A Heaven Stairs: X[16.5 -> 24.0] rises smoothly 0.0 -> 3.5m inside Z[-25.0, -21.0]
  if (pz >= -25.15 && pz <= -20.85 && px >= 16.3 && px <= 24.25) {
    const t = Math.max(0, Math.min(1, (px - 16.5) / (24.0 - 16.5)));
    const stairY = t * HAVEN_PHYSICS.tower2FY;
    supportY = Math.max(supportY, stairY);
  }

  // 1B. East A Tower Stairwell (1F A Hell -> turn right East X[33..37.2] -> walk North Z[-16.8 -> -22.2] up to 2F A Tower 3.5m)
  if (px >= 32.95 && px <= 37.3 && pz >= -25.15 && pz <= -16.4) {
    const t = Math.max(0, Math.min(1, (-16.8 - pz) / (-16.8 - -22.2)));
    const stairY = t * HAVEN_PHYSICS.tower2FY;
    supportY = Math.max(supportY, stairY);
  }

  // 2. 2F A Tower Floor Slab (X[24.0..33.0], Z[-25.0..-14.0])
  if (px >= 23.85 && px <= 33.2 && pz >= -25.15 && pz <= -13.85 && curFeetY >= 1.75) {
    supportY = Math.max(supportY, HAVEN_PHYSICS.tower2FY);
  }

  // 3. A Ramp (Z: +4.0 [0.0m] -> +12.0 [0.85m], flat 0.85m across Z: +12.0..+14.0)
  if (px >= 24.8 && px <= 35.2 && pz >= 4.0 && pz <= 14.0) {
    const t = Math.max(0, Math.min(1, (pz - 4.0) / (12.0 - 4.0)));
    supportY = Math.max(supportY, t * HAVEN_PHYSICS.rampTopY);
  }

  // 4. A Long Stone Steps + Central Smooth Ramp (Z: +14.0 [0.85m] -> +23.0 [0.0m])
  if (px >= 23.8 && px <= 37.2 && pz > 14.0 && pz <= 23.0) {
    const t = Math.max(0, Math.min(1, (23.0 - pz) / (23.0 - 14.0)));
    supportY = Math.max(supportY, t * HAVEN_PHYSICS.rampTopY);
  }

  // 5. C Platform (X[-44..-37.5], Z[-14.5..-4.5], Y=1.05m) + East ramp X[-35.0 -> -37.5], Z[-11.6..-5.4]
  if (px >= -44.1 && px <= -37.5 && pz >= -14.6 && pz <= -4.4) {
    if (curFeetY >= 0.38 || (pz >= -11.6 && pz <= -5.4)) {
      supportY = Math.max(supportY, HAVEN_PHYSICS.cPlatformY);
    }
  }
  if (px >= -37.6 && px <= -35.0 && pz >= -11.6 && pz <= -5.4) {
    const t = Math.max(0, Math.min(1, (-35.0 - px) / (-35.0 - -37.5)));
    const rampY = t * HAVEN_PHYSICS.cPlatformY;
    supportY = Math.max(supportY, rampY);
  }

  // 6. C Cubby Raised Stone Ledge (X[-34.2..-30.0], Z[20..28], Y=0.52m) + mini ramp X[-35.4 -> -34.2]
  if (px >= -35.4 && px <= -30.0 && pz >= 20.0 && pz <= 28.0) {
    const t = Math.max(0, Math.min(1, (px - -35.4) / (-34.2 - -35.4)));
    const stepY = t * HAVEN_PHYSICS.cCubbyStepY;
    supportY = Math.max(supportY, stepY);
  }

  return Number(supportY.toFixed(4));
}

function isInRawHavenFloorUnion(px: number, pz: number): boolean {
  for (const r of HAVEN_WALKABLE_RECTS) {
    if (px >= r.minX && px <= r.maxX && pz >= r.minZ && pz <= r.maxZ) {
      return true;
    }
  }
  return false;
}

export function isPointInsideHavenFloor(
  px: number,
  pz: number,
  margin: number = 0.28,
): boolean {
  if (!isInRawHavenFloorUnion(px, pz)) return false;
  const r = Math.min(0.28, Math.max(0.05, margin * 0.7));
  return (
    isInRawHavenFloorUnion(px + r, pz) &&
    isInRawHavenFloorUnion(px - r, pz) &&
    isInRawHavenFloorUnion(px, pz + r) &&
    isInRawHavenFloorUnion(px, pz - r)
  );
}

function clampToNearestHavenFloor(
  px: number,
  pz: number,
  margin: number = 0.35,
): { x: number; z: number } {
  let bestX = px;
  let bestZ = pz;
  let bestDistSq = Infinity;
  for (const r of HAVEN_WALKABLE_RECTS) {
    const cx = Math.max(r.minX + margin, Math.min(r.maxX - margin, px));
    const cz = Math.max(r.minZ + margin, Math.min(r.maxZ - margin, pz));
    const dSq = (px - cx) * (px - cx) + (pz - cz) * (pz - cz);
    if (dSq < bestDistSq) {
      bestDistSq = dSq;
      bestX = cx;
      bestZ = cz;
    }
  }
  return { x: bestX, z: bestZ };
}

/**
 * Resolves 2D horizontal movement inside Haven Explore World with height-layered colliders
 * and floor-polygon boundary clamping (preventing any void fall-offs or wall snags).
 */
export function resolveHavenPosition(
  curX: number,
  curZ: number,
  dx: number,
  dz: number,
  colliders: ColliderShape[],
  radius: number = HAVEN_PHYSICS.playerRadius,
  playerFeetY?: number,
  playerHeight: number = HAVEN_PHYSICS.playerHeight,
): { x: number; z: number; hitEnv: boolean } {
  let nextX = curX;
  let nextZ = curZ;
  let hitEnv = false;

  // Step 0: Resolve if slightly overlapping any height-active collider
  for (const col of colliders) {
    if (col.kind !== 'aabb') continue;
    if (checkOverlap(nextX, nextZ, radius, col, playerFeetY, playerHeight)) {
      const pushed = pushOutSmoothFromCollider(nextX, nextZ, radius, col);
      nextX = pushed.x;
      nextZ = pushed.z;
      hitEnv = true;
    }
  }

  if (!isInRawHavenFloorUnion(nextX, nextZ)) {
    const clamped = clampToNearestHavenFloor(nextX, nextZ, radius);
    nextX = clamped.x;
    nextZ = clamped.z;
    hitEnv = true;
  }

  // Step 1A: Resolve X movement with smooth corner glide + side-aware AABB face clamp
  let candX = nextX + dx;
  let candZ = nextZ;
  for (const col of colliders) {
    if (col.kind !== 'aabb') continue;
    if (checkOverlap(candX, candZ, radius, col, playerFeetY, playerHeight)) {
      hitEnv = true;
      const isCorner =
        (candX < col.minX || candX > col.maxX) &&
        (candZ < col.minZ || candZ > col.maxZ);
      if (isCorner) {
        const pushed = pushOutSmoothFromCollider(candX, candZ, radius, col);
        candX = pushed.x;
        candZ = pushed.z;
      } else {
        const centerX = (col.minX + col.maxX) * 0.5;
        candX =
          nextX <= centerX
            ? col.minX - radius - 0.002
            : col.maxX + radius + 0.002;
      }
    }
  }
  if (!isPointInsideHavenFloor(candX, candZ, radius) && isPointInsideHavenFloor(nextX, candZ, radius)) {
    candX = nextX;
    hitEnv = true;
  }

  // Step 1B: Resolve Z movement with smooth corner glide + side-aware AABB face clamp
  candZ += dz;
  for (const col of colliders) {
    if (col.kind !== 'aabb') continue;
    if (checkOverlap(candX, candZ, radius, col, playerFeetY, playerHeight)) {
      hitEnv = true;
      const isCorner =
        (candX < col.minX || candX > col.maxX) &&
        (candZ < col.minZ || candZ > col.maxZ);
      if (isCorner) {
        const pushed = pushOutSmoothFromCollider(candX, candZ, radius, col);
        candX = pushed.x;
        candZ = pushed.z;
      } else {
        const centerZ = (col.minZ + col.maxZ) * 0.5;
        candZ =
          nextZ <= centerZ
            ? col.minZ - radius - 0.002
            : col.maxZ + radius + 0.002;
      }
    }
  }
  if (!isPointInsideHavenFloor(candX, candZ, radius) && isPointInsideHavenFloor(candX, nextZ, radius)) {
    candZ = nextZ;
    hitEnv = true;
  }

  // Step 1C: Final verification pass for multi-wall corners
  for (const col of colliders) {
    if (col.kind !== 'aabb') continue;
    if (checkOverlap(candX, candZ, radius, col, playerFeetY, playerHeight)) {
      const pushed = pushOutSmoothFromCollider(candX, candZ, radius, col);
      candX = pushed.x;
      candZ = pushed.z;
      hitEnv = true;
    }
  }

  if (!isPointInsideHavenFloor(candX, candZ, radius)) {
    const clamped = clampToNearestHavenFloor(candX, candZ, radius);
    candX = clamped.x;
    candZ = clamped.z;
    hitEnv = true;
  }

  return { x: candX, z: candZ, hitEnv };
}

export function stepHavenJumpPhysics(params: {
  feetY: number;
  verticalVelocity: number;
  isGrounded: boolean;
  jumpPressed: boolean;
  supportY: number;
  dt: number;
}): JumpPhysicsStepResult {
  return stepPlayerJumpPhysics({
    feetY: params.feetY,
    verticalVelocity: params.verticalVelocity,
    isGrounded: params.isGrounded,
    supportY: params.supportY,
    jumpRequested: params.jumpPressed,
    allowJump: true,
    dt: params.dt,
  });
}
