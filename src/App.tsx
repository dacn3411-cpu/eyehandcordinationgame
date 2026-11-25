/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  unlockWeaponAudio,
  VIEWMODEL_LAYER,
  WEAPON_SPECS,
  WeaponHudState,
  WeaponId,
  WeaponRigController,
} from './game/weaponSystem';
import {
  SniperScopeOverlay,
  WeaponHudBar,
  WeaponSelectModal,
} from './components/WeaponSelectModal';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';

// GTAO only hides points/lines from its depth-normal pre-pass; also hide sprites (glows, clouds)
// and transparent surfaces (decals, holograms) so they never print dark AO squares.
{
  const proto = GTAOPass.prototype as unknown as {
    _overrideVisibility: (this: { scene: THREE.Scene; _visibilityCache: THREE.Object3D[] }) => void;
  };
  const baseOverride = proto._overrideVisibility;
  proto._overrideVisibility = function () {
    baseOverride.call(this);
    const cache = this._visibilityCache;
    this.scene.traverse((o) => {
      if (!o.visible) return;
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      const transparent = !!m && !Array.isArray(m) && m.transparent;
      if ((o as THREE.Sprite).isSprite || transparent) {
        o.visible = false;
        cache.push(o);
      }
    });
  };
}
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { createGradePass, enableComposerDepth, InkOutlinePass } from './game/stylizePass';
import {
  ARENA,
  ARENA_HEAVEN,
  checkOverlap,
  clampPlayerYawForMode,
  ColliderShape,
  computeIndoorRangeChallengeSpec,
  computeIndoorRangeTriggerTimes,
  computeJoystickMoveVector,
  computeKeyboardMoveVector,
  computeMissionBracketVisualState,
  computeTargetDirectionHint,
  DEFAULT_SETTINGS,
  DIFFICULTY_CONFIG,
  distanceToColliderSurface,
  evaluateContinuousLaserDragProgress,
  evaluateHitGrade,
  GameSettings,
  getEffectiveAimAssistMul,
  getFloorHeightAt,
  getShotFeedbackMessage,
  INDOOR_RANGE_WORLD,
  isIndoorRangeEligible,
  isInsideHeavenLoopFootprint,
  isWithinLaserStartPointRadius,
  LASER_START_MARKER_RADIUS,
  NON_TARGET_MESSAGE,
  NON_TARGET_SUBTEXT,
  OffscreenHintCalculation,
  PALETTE,
  resolvePlayerPosition,
  selectFrontmostTargetHit,
  SessionRecorder,
  SessionRecordSummary,
  shouldShowWrongTargetWarning,
  stepPlayerJumpPhysics,
  TRAINING_MODES,
  TrainingModeId,
} from './game/rules';
import { soundEngine } from './game/audio';
import { buildArenaWorld, BuiltArenaWorld } from './game/worldBuilder';
import {
  LoadedGlbMapRuntime,
  loadProjectCGlbMap,
  MAP_WALK_SPEED,
  PLAYER_EYE_HEIGHT,
} from './game/glbMapLoader';
import {
  ActiveTargetInstance,
  getObstacleColliders,
  spawnMovingObstacle,
  SpawnNotificationEvent,
  TargetAndObstacleManager,
} from './game/entities';
import { runAllSelfChecks, SelfCheckItemResult } from './game/selfCheck';
import {
  GuideAndControlsModal,
  HistoryModal,
  ResultViewModal,
  SelfCheckModal,
  SettingsModal,
} from './components/Modals';

type GamePhase = 'MENU' | 'COUNTDOWN' | 'PLAYING' | 'PAUSED' | 'RESULT';

interface ScorePopupItem {
  id: number;
  text: string;
  subText?: string;
  grade: 'PERFECT' | 'GOOD' | 'NON_TARGET' | 'WRONG';
  x: number;
  y: number;
}

interface ActiveDirectionHintUi extends OffscreenHintCalculation {
  targetColor: string;
}

const STORAGE_RESULTS_KEY = 'eyeHandMission.results.v1';
const STORAGE_SETTINGS_KEY = 'eyeHandMission.settings.v1';

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);

  // Settings & Storage State
  const [settings, setSettings] = useState<GameSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_SETTINGS_KEY);
      if (saved) return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
    } catch {
      // Fallback to defaults
    }
    return DEFAULT_SETTINGS;
  });
  const settingsRef = useRef<GameSettings>(settings);
  settingsRef.current = settings;

  const [historyRecords, setHistoryRecords] = useState<SessionRecordSummary[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_RESULTS_KEY);
      if (saved) return JSON.parse(saved);
    } catch {
      // Fallback
    }
    return [];
  });
  const [storageWarning, setStorageWarning] = useState(false);

  // State Machine
  const [phase, setPhase] = useState<GamePhase>('MENU');
  const phaseRef = useRef<GamePhase>('MENU');
  phaseRef.current = phase;

  const [countdownText, setCountdownText] = useState<string>('3');
  const [hudScore, setHudScore] = useState(0);
  const [hudCombo, setHudCombo] = useState(0);
  const [hudTimeLeft, setHudTimeLeft] = useState(120);
  const [hudEnergy, setHudEnergy] = useState(100);
  const [popups, setPopups] = useState<ScorePopupItem[]>([]);
  const [directionHintUi, setDirectionHintUi] = useState<ActiveDirectionHintUi | null>(null);
  const [bumpVignette, setBumpVignette] = useState(false);
  const [invincibleEdge, setInvincibleEdge] = useState(false);
  const [dragModeBanner, setDragModeBanner] = useState(false);
  const [threeLoadError, setThreeLoadError] = useState(false);
  const [indoorFadeOpacity, setIndoorFadeOpacity] = useState(0);
  const [indoorBannerText, setIndoorBannerText] = useState<string | null>(null);
  const [isIndoorRangeHudActive, setIsIndoorRangeHudActive] = useState(false);
  const [hudRadarState, setHudRadarState] = useState<{
    playerX: number;
    playerZ: number;
    yawRad: number;
    keepBox?: { minX: number; maxX: number; minZ: number; maxZ: number };
    staticBoxes: Array<{ id: string; x: number; z: number; w: number; d: number }>;
    targets: Array<{
      id: string;
      wx: number;
      wz: number;
      kind: 'regular' | 'laser' | 'mission';
      color: string;
    }>;
    obstacles: Array<{ id: number; wx: number; wz: number }>;
  }>({ playerX: 0, playerZ: 10, yawRad: 0, staticBoxes: [], targets: [], obstacles: [] });

  // Modals
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [guideModalTab, setGuideModalTab] = useState<'guide' | 'controls' | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [inspectRecord, setInspectRecord] = useState<SessionRecordSummary | null>(null);
  const [selfCheckItems, setSelfCheckItems] = useState<SelfCheckItemResult[] | null>(null);
  const [confirmExitMenu, setConfirmExitMenu] = useState(false);
  const [lastResult, setLastResult] = useState<SessionRecordSummary | null>(null);

  // Weapon system: HUD state, separate LMB fire & RMB Hold-to-ADS input refs, and 1st-person rig
  const [weaponHud, setWeaponHud] = useState<WeaponHudState>({
    weaponId: 'rifle',
    ammo: WEAPON_SPECS.rifle.magazineSize,
    maxAmmo: WEAPON_SPECS.rifle.magazineSize,
    isReloading: false,
    isScoped: false,
    isAds: false,
    fireMode: 'AUTO',
  });
  const weaponRigRef = useRef<WeaponRigController | null>(null);
  const isFireHeldRef = useRef(false);
  const isAdsHeldRef = useRef(false);
  const weaponMouseDeltaRef = useRef({ x: 0, y: 0 });
  const [isWeaponModalOpen, setIsWeaponModalOpen] = useState(false);
  const weaponModalOpenRef = useRef(false);
  weaponModalOpenRef.current = isWeaponModalOpen;

  // Device Detection (PC vs Tablet / Mobile) + Live Viewport Orientation State
  const [detectedTablet, setDetectedTablet] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const coarse = window.matchMedia?.('(pointer: coarse)').matches;
    return Boolean(coarse && navigator.maxTouchPoints > 0);
  });

  const [viewport, setViewport] = useState<{
    w: number;
    h: number;
    isPortrait: boolean;
    isCompactPortrait: boolean;
    isShortLandscape: boolean;
  }>(() => {
    if (typeof window === 'undefined') {
      return { w: 1280, h: 720, isPortrait: false, isCompactPortrait: false, isShortLandscape: false };
    }
    const w = window.visualViewport?.width || window.innerWidth;
    const h = window.visualViewport?.height || window.innerHeight;
    const isPortrait = h > w;
    return {
      w,
      h,
      isPortrait,
      isCompactPortrait: isPortrait && w < 540,
      isShortLandscape: !isPortrait && h < 500,
    };
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let settleTimer = 0;
    const syncViewport = () => {
      const w = Math.round(window.visualViewport?.width || window.innerWidth);
      const h = Math.round(window.visualViewport?.height || window.innerHeight);
      const isPortrait = h > w;
      setViewport((prev) =>
        prev.w === w && prev.h === h
          ? prev
          : {
              w,
              h,
              isPortrait,
              isCompactPortrait: isPortrait && w < 540,
              isShortLandscape: !isPortrait && h < 500,
            },
      );
      const coarse = window.matchMedia?.('(pointer: coarse)').matches;
      setDetectedTablet(Boolean(coarse && navigator.maxTouchPoints > 0));
    };
    const onOrient = () => {
      syncViewport();
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(syncViewport, 160);
    };
    window.addEventListener('resize', syncViewport);
    window.addEventListener('orientationchange', onOrient);
    window.visualViewport?.addEventListener('resize', syncViewport);
    return () => {
      window.clearTimeout(settleTimer);
      window.removeEventListener('resize', syncViewport);
      window.removeEventListener('orientationchange', onOrient);
      window.visualViewport?.removeEventListener('resize', syncViewport);
    };
  }, []);

  const isTabletActive =
    settings.controlMode === 'tablet' ||
    (settings.controlMode === 'auto' && detectedTablet);
  const isTabletRef = useRef(isTabletActive);
  isTabletRef.current = isTabletActive;

  // Virtual Joystick visual state
  const [joystickUi, setJoystickUi] = useState<{
    active: boolean;
    baseX: number;
    baseY: number;
    knobX: number;
    knobY: number;
  }>({ active: false, baseX: 110, baseY: 0, knobX: 0, knobY: 0 });

  // Mutable Simulation Refs
  const rendererReadyRef = useRef(false);
  const baseCollidersRef = useRef<ColliderShape[]>([]);
  const worldRef = useRef<BuiltArenaWorld | null>(null);
  const managerRef = useRef<TargetAndObstacleManager | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const recorderRef = useRef<SessionRecorder>(new SessionRecorder(1, 120));
  const glbRuntimeRef = useRef<LoadedGlbMapRuntime | null>(null);
  const mapLoadingRef = useRef<boolean>(true);
  const pendingStartRef = useRef<{
    difficultyOverride?: number;
    skipCountdown: boolean;
    modeOverride?: TrainingModeId;
  } | null>(null);
  const [mapLoadState, setMapLoadState] = useState<{
    loading: boolean;
    progress: number;
    status: string;
    error: string | null;
  }>({
    loading: true,
    progress: 0,
    status: 'Project C 맵 다운로드 준비 중...',
    error: null,
  });

  const playerStateRef = useRef({
    x: Number(ARENA.startPos.x),
    y: Number(ARENA.startPos.y),
    z: Number(ARENA.startPos.z),
    feetY: 0,
    verticalVelocity: 0,
    isGrounded: true,
    jumpQueued: false,
    vx: 0,
    vz: 0,
    yaw: 0,
    pitch: 0,
    energy: 100,
    invincibleTimer: 0,
    lastShotTimeSec: -10,
    lastShotPerfSec: -10,
    blasterRecoilTimer: 0,
    recoilZ: 0,
    recoilPitch: 0,
    muzzleFlashTimer: 0,
    tracerTimer: 0,
    aimCamX: 0,
    aimCamY: 0,
    aimCamZ: -15,
    elapsedPlaySec: 0,
    obstacleSpawnTimer: 3.5,
    nextObstacleId: 1,
  });

  type IndoorChallengePhase =
    | 'NONE'
    | 'WARNING_FADE_OUT'
    | 'TELEPORT_FADE_IN'
    | 'MISSION_BRIEF'
    | 'ACTIVE'
    | 'RETURN_FADE_OUT'
    | 'RETURN_FADE_IN';

  const indoorChallengeRef = useRef<{
    phase: IndoorChallengePhase;
    phaseTimer: number;
    triggerTimes: number[];
    nextTriggerIdx: number;
    repeatCount: number;
    challengeTimeLeft: number;
    challengeTimeTotal: number;
    targetCount: number;
    bonusScore: number;
    energyBonus: number;
    savedArenaX: number;
    savedArenaY: number;
    savedArenaZ: number;
    savedArenaYaw: number;
    savedArenaPitch: number;
  }>({
    phase: 'NONE',
    phaseTimer: 0,
    triggerTimes: [],
    nextTriggerIdx: 0,
    repeatCount: 0,
    challengeTimeLeft: 0,
    challengeTimeTotal: 0,
    targetCount: 0,
    bonusScore: 0,
    energyBonus: 20,
    savedArenaX: ARENA.startPos.x,
    savedArenaY: ARENA.startPos.y,
    savedArenaZ: ARENA.startPos.z,
    savedArenaYaw: 0,
    savedArenaPitch: 0,
  });

  const syncIndoorOverlayUi = (
    fadeOpacity: number,
    bannerText: string | null,
    hudIndoor: boolean,
  ) => {
    setIndoorFadeOpacity(fadeOpacity);
    setIndoorBannerText(bannerText);
    setIsIndoorRangeHudActive(hudIndoor);
  };

  const inputStateRef = useRef({
    keys: {} as Record<string, boolean>,
    leftMouseDown: false,
    rightMouseDown: false,
    joyPointerId: null as number | null,
    joyBaseX: 0,
    joyBaseY: 0,
    joyDx: 0,
    joyDy: 0,
    lookPointerId: null as number | null,
    lookLastX: 0,
    lookLastY: 0,
    // Tablet: the finger holding the fire button also turns the view when it slides
    fireLookPointerId: null as number | null,
    fireLookLastX: 0,
    fireLookLastY: 0,
    laserDragTargetId: null as string | null,
    laserDragPointerId: null as number | null,
    laserDragNdcX: 0,
    laserDragNdcY: 0,
    hoverNdcX: 0,
    hoverNdcY: 0,
    pointerHovered: false,
  });

  const shootFnRef = useRef<
    (opts?: {
      ndcX?: number;
      ndcY?: number;
      isDirectTouch?: boolean;
      isLaserTraceSweep?: boolean;
      fromWeaponRig?: boolean;
    }) => boolean
  >(() => false);
  const probeDirectTouchTargetRef = useRef<(ndcX: number, ndcY: number) => boolean>(
    () => false,
  );
  const handleLaserTrackDragStepRef = useRef<
    (ndcX: number, ndcY: number, isInitialDown: boolean) => boolean
  >(() => false);
  const releaseLaserTrackDragRef = useRef<() => void>(() => {});
  const startGameFnRef = useRef<
    (diffOverride?: number, skipCountdown?: boolean, modeOverride?: TrainingModeId) => void
  >(() => {});

  // Mirror phase to document.body.dataset.state for testability & Ultra Mode
  useEffect(() => {
    const stateMap: Record<GamePhase, string> = {
      MENU: 'title',
      COUNTDOWN: 'playing',
      PLAYING: 'playing',
      PAUSED: 'paused',
      RESULT: 'gameover',
    };
    document.body.dataset.state = stateMap[phase];
  }, [phase]);

  // Save settings helper (synchronously updates settingsRef.current so immediate startTrainingSession sees latest mode/difficulty)
  const updateSettings = (partial: Partial<GameSettings>) => {
    const syncNext = { ...settingsRef.current, ...partial };
    settingsRef.current = syncNext;
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      settingsRef.current = next;
      soundEngine.syncSettings({
        sfxEnabled: next.sfxEnabled,
        sfxVolume: next.sfxVolume,
        bgmEnabled: next.bgmEnabled,
      });
      try {
        localStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(next));
      } catch {
        setStorageWarning(true);
      }
      return next;
    });
  };

  // Save completed session summary
  const saveSessionSummary = (summary: SessionRecordSummary) => {
    setHistoryRecords((prev) => {
      const next = [summary, ...prev].slice(0, 20);
      try {
        localStorage.setItem(STORAGE_RESULTS_KEY, JSON.stringify(next));
      } catch {
        setStorageWarning(true);
      }
      return next;
    });
  };

  // Record target spawn sector statistics (without distracting visual/audio alert banners)
  const handleSpawnNotification = (event: SpawnNotificationEvent) => {
    const modeCfg = TRAINING_MODES[settingsRef.current.trainingMode ?? 1] || TRAINING_MODES[1];
    const isRearOrOffscreen =
      modeCfg.allowRearTargets && (event.sector !== 'FRONT' || event.isOffscreen);
    recorderRef.current.recordTargetSpawn(event.typeId, isRearOrOffscreen, event.sector);
  };

  // Main Three.js WebGL Initialization & Loop
  useEffect(() => {
    soundEngine.syncSettings({
      sfxEnabled: settingsRef.current.sfxEnabled,
      sfxVolume: settingsRef.current.sfxVolume,
      bgmEnabled: settingsRef.current.bgmEnabled,
    });
    const container = mountRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      const forceHq = new URLSearchParams(window.location.search).get('hq') === '1';
      const isSoftwareGl = !forceHq && (() => {
        const probe = document.createElement('canvas').getContext('webgl2');
        if (!probe) return true;
        const ext = probe.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
        const gpu = String(probe.getParameter(param));
        probe.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      })();

      const lowQ =
        settingsRef.current.graphicsQuality === 'low' ||
        isSoftwareGl ||
        (settingsRef.current.graphicsQuality === 'auto' && isTabletRef.current);

      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
      });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 0.88;

      // 1.5 keeps edges crisp on retina screens; 2.0 quadruples the post-processing cost
      const maxDpr = isSoftwareGl ? 1.0 : isTabletRef.current ? 1.25 : 1.5;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
      renderer.setSize(
        container.clientWidth || window.innerWidth,
        container.clientHeight || window.innerHeight,
      );
      renderer.shadowMap.enabled = !lowQ && !isSoftwareGl;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      container.innerHTML = '';
      container.appendChild(renderer.domElement);
      rendererReadyRef.current = true;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color('#8ec5eb');
      scene.environmentIntensity = 0.35;

      // Generate soft IBL environment map via PMREMGenerator + RoomEnvironment so indoor corners & shaded floors never go black
      let envRenderTarget: THREE.WebGLRenderTarget | null = null;
      if (!isSoftwareGl) {
        const pmremGenerator = new THREE.PMREMGenerator(renderer);
        pmremGenerator.compileEquirectangularShader();
        const roomEnv = new RoomEnvironment();
        envRenderTarget = pmremGenerator.fromScene(roomEnv, 0.04);
        scene.environment = envRenderTarget.texture;
        roomEnv.dispose();
        pmremGenerator.dispose();
      }

      const calcVerticalFov = (aspect: number) => {
        const hFovRad = THREE.MathUtils.degToRad(90);
        const vFovRad = 2 * Math.atan(Math.tan(hFovRad * 0.5) / Math.max(0.5, aspect));
        return THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(vFovRad), 50, 100);
      };

      const initW = container.clientWidth || window.innerWidth;
      const initH = container.clientHeight || window.innerHeight;
      const camera = new THREE.PerspectiveCamera(
        calcVerticalFov(initW / initH),
        initW / initH,
        0.1,
        600,
      );
      camera.rotation.order = 'YXZ';
      camera.position.set(ARENA.startPos.x, ARENA.startPos.y, ARENA.startPos.z);

      scene.add(camera);
      cameraRef.current = camera;

      // First-person weapon rig (replaces the old blaster view model, which is hidden in the loop)
      weaponRigRef.current?.dispose();
      weaponRigRef.current = new WeaponRigController(scene, camera, setWeaponHud);

      // Daytime lighting rig without AmbientLight blowout: HemisphereLight (0.8) + main sun DirectionalLight (1.15) + opposite fill DirectionalLight (0.3)
      const hemiLight = new THREE.HemisphereLight('#dceeff', '#b5a895', 0.8);
      hemiLight.layers.enable(VIEWMODEL_LAYER);
      scene.add(hemiLight);

      const dirLight = new THREE.DirectionalLight('#fff4e0', 1.15);
      dirLight.layers.enable(VIEWMODEL_LAYER);
      dirLight.position.set(-22, 34, 18);
      if (renderer.shadowMap.enabled) {
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.set(2048, 2048);
        dirLight.shadow.camera.near = 5;
        dirLight.shadow.camera.far = 110;
        const d = 38;
        dirLight.shadow.camera.left = -d;
        dirLight.shadow.camera.right = d;
        dirLight.shadow.camera.top = d;
        dirLight.shadow.camera.bottom = -d;
        dirLight.shadow.bias = -0.00045;
        dirLight.shadow.normalBias = 0.018;
      }
      scene.add(dirLight);

      const fillDirLight = new THREE.DirectionalLight('#fff4e0', 0.3);
      fillDirLight.layers.enable(VIEWMODEL_LAYER);
      fillDirLight.position.set(22, 26, -18);
      fillDirLight.castShadow = false;
      scene.add(fillDirLight);

      // Post-Processing Pipeline tuned so matte architecture never blooms and only emissive flashes/tracers/lasers glow
      let composer: EffectComposer | null = null;
      if (!isSoftwareGl && !lowQ) {
        // 4x MSAA render target: post-processing otherwise loses the canvas anti-aliasing
        const pr = renderer.getPixelRatio();
        composer = new EffectComposer(
          renderer,
          new THREE.WebGLRenderTarget(initW * pr, initH * pr, { type: THREE.HalfFloatType, samples: 4 }),
        );
        enableComposerDepth(composer);
        composer.addPass(new RenderPass(scene, camera));
        // Ambient occlusion: soft contact shadows in corners, under props and along wall feet (high quality only)
        const aoPass = new GTAOPass(scene, camera, initW, initH);
        aoPass.blendIntensity = 0.85;
        aoPass.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.4, thickness: 1.2, scale: 1.0 });
        // compute AO at half resolution (it re-renders the scene for normals); the blend upsamples it
        const aoSetSize = aoPass.setSize.bind(aoPass);
        aoPass.setSize = (w: number, h: number) => aoSetSize(Math.max(1, Math.floor(w / 2)), Math.max(1, Math.floor(h / 2)));
        aoPass.setSize(initW, initH);
        composer.addPass(aoPass);
        composer.addPass(new InkOutlinePass(camera, initW, initH));
        const bloomPass = new UnrealBloomPass(
          new THREE.Vector2(initW, initH),
          0.08,
          0.35,
          1.2,
        );
        composer.addPass(bloomPass);
        composer.addPass(new OutputPass());
        composer.addPass(createGradePass());
      } else if (!isSoftwareGl) {
        // tablets / low quality: no post chain, so grade with a compositor filter (nearly free)
        renderer.domElement.style.filter = 'saturate(1.06) contrast(1.04)';
      }

      // Build Arena World & Entities (all procedural terrain removed; Project C.glb is loaded below)
      const builtWorld = buildArenaWorld(scene, camera, lowQ);
      worldRef.current = builtWorld;
      baseCollidersRef.current = [...builtWorld.colliders];

      const manager = new TargetAndObstacleManager(
        scene,
        builtWorld.anchors,
        lowQ,
        builtWorld.environmentObstacles,
        builtWorld.colliders,
        builtWorld.indoorEnvironmentObstacles,
      );
      const getCurrentAimAssistMul = () =>
        getEffectiveAimAssistMul(
          settingsRef.current.aimAssistMul,
          settingsRef.current.difficulty,
          !settingsRef.current.tabletDirectTouchHit,
        );
      managerRef.current = manager;

      let isEffectDisposed = false;
      mapLoadingRef.current = true;
      setMapLoadState({
        loading: true,
        progress: 0,
        status: 'Project C 맵 로딩 중...',
        error: null,
      });

      loadProjectCGlbMap({
        lowQuality: lowQ,
        onProgress: (pct, statusText) => {
          if (isEffectDisposed) return;
          setMapLoadState({
            loading: true,
            progress: Math.max(0, Math.min(100, Math.round(pct))),
            status: statusText,
            error: null,
          });
        },
      })
        .then((runtime) => {
          if (isEffectDisposed) return;
          scene.add(runtime.mapRoot);
          glbRuntimeRef.current = runtime;

          // Tighten DirectionalLight shadow frustum & target strictly to runtime.keepBox
          // for higher shadow resolution and lower shadow-pass draw cost.
          if (runtime.keepBox && !runtime.keepBox.isEmpty()) {
            const keepCenter = new THREE.Vector3();
            const keepSize = new THREE.Vector3();
            runtime.keepBox.getCenter(keepCenter);
            runtime.keepBox.getSize(keepSize);
            dirLight.target.position.set(keepCenter.x, 0, keepCenter.z);
            if (!dirLight.target.parent) {
              scene.add(dirLight.target);
            }
            dirLight.target.updateMatrixWorld();
            dirLight.position.set(keepCenter.x - 20, 34, keepCenter.z + 16);
            if (renderer.shadowMap.enabled) {
              const shadowHalf = Math.ceil(Math.max(keepSize.x, keepSize.z) * 0.56);
              dirLight.shadow.camera.left = -shadowHalf;
              dirLight.shadow.camera.right = shadowHalf;
              dirLight.shadow.camera.top = shadowHalf;
              dirLight.shadow.camera.bottom = -shadowHalf;
              dirLight.shadow.camera.near = 6;
              dirLight.shadow.camera.far = 92;
              dirLight.shadow.camera.updateProjectionMatrix();
            }
          }

          // Update global startPos to the auto-discovered floor spawn + player eye height (1.7)
          ARENA.startPos.x = runtime.spawnPoint.x;
          ARENA.startPos.y = runtime.spawnPoint.eyeY;
          ARENA.startPos.z = runtime.spawnPoint.z;

          // Sync loaded meshes, colliders, and open-sightline target anchors into world & manager
          builtWorld.environmentObstacles.length = 0;
          builtWorld.environmentObstacles.push(...runtime.solidMeshes);
          builtWorld.colliders.length = 0;
          builtWorld.colliders.push(...runtime.colliders);
          builtWorld.anchors.length = 0;
          builtWorld.anchors.push(...runtime.anchors);

          baseCollidersRef.current = [...runtime.colliders];
          manager.anchors = runtime.anchors;
          manager.environmentObstacles = runtime.solidMeshes;
          manager.setBaseArenaColliders(runtime.colliders);
          // flying targets: keep to open space on the map instead of the built-in arena's fixed bounds
          manager.flightBoundsMode = 'map';

          const psInit = playerStateRef.current;
          psInit.x = runtime.spawnPoint.x;
          psInit.y = runtime.spawnPoint.eyeY;
          psInit.z = runtime.spawnPoint.z;
          psInit.feetY = runtime.spawnPoint.floorY;
          psInit.yaw = runtime.spawnPoint.yaw;
          psInit.pitch = 0;
          psInit.vx = 0;
          psInit.vz = 0;
          psInit.verticalVelocity = 0;
          psInit.isGrounded = true;

          camera.position.set(psInit.x, psInit.y, psInit.z);
          camera.rotation.set(0, psInit.yaw, 0);
          camera.updateMatrixWorld();

          if (phaseRef.current === 'MENU') {
            manager.populateMenuDemoTargets(getCurrentAimAssistMul());
          }

          if (!isSoftwareGl) {
            renderer.compile(scene, camera);
          }

          mapLoadingRef.current = false;
          setMapLoadState({
            loading: false,
            progress: 100,
            status: '맵 로딩 및 스폰 위치 계산 완료',
            error: null,
          });

          if (window.location.hash === '#debug') {
            setSelfCheckItems(
              runAllSelfChecks(rendererReadyRef.current, baseCollidersRef.current),
            );
          }

          if (pendingStartRef.current) {
            const pending = pendingStartRef.current;
            pendingStartRef.current = null;
            startGameFnRef.current(
              pending.difficultyOverride,
              pending.skipCountdown,
              pending.modeOverride,
            );
          }
        })
        .catch((err) => {
          if (isEffectDisposed) return;
          mapLoadingRef.current = false;
          setMapLoadState({
            loading: false,
            progress: 0,
            status: '맵 로딩 실패',
            error: err instanceof Error ? err.message : 'Project C.glb 로드 실패',
          });
        });

      // Pooled Hit Particle Burst System (<= 200 particles max)
      const MAX_PARTICLES = 160;
      const particleGeo = new THREE.OctahedronGeometry(0.11, 0);
      const particleMat = new THREE.MeshBasicMaterial({ color: '#FFFFFF' });
      const particleInst = new THREE.InstancedMesh(particleGeo, particleMat, MAX_PARTICLES);
      particleInst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      particleInst.frustumCulled = false;
      scene.add(particleInst);

      interface ParticleSlot {
        active: boolean;
        x: number;
        y: number;
        z: number;
        vx: number;
        vy: number;
        vz: number;
        age: number;
        maxAge: number;
        color: THREE.Color;
      }
      const particles: ParticleSlot[] = Array.from({ length: MAX_PARTICLES }, () => ({
        active: false,
        x: 0,
        y: -100,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        age: 0,
        maxAge: 0.6,
        color: new THREE.Color('#FFFFFF'),
      }));
      const dummyMat4 = new THREE.Matrix4();
      const dummyPos = new THREE.Vector3();
      const dummyScale = new THREE.Vector3();
      const dummyQuat = new THREE.Quaternion();

      for (let i = 0; i < MAX_PARTICLES; i++) {
        dummyMat4.makeScale(0, 0, 0);
        particleInst.setMatrixAt(i, dummyMat4);
        particleInst.setColorAt(i, particles[i].color);
      }

      const spawnHitParticles = (pos: THREE.Vector3, hexColor: string, count = 20) => {
        let spawned = 0;
        for (let i = 0; i < MAX_PARTICLES && spawned < count; i++) {
          const p = particles[i];
          if (!p.active) {
            p.active = true;
            p.x = pos.x;
            p.y = pos.y;
            p.z = pos.z;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.random() * Math.PI - Math.PI * 0.5;
            const spd = THREE.MathUtils.randFloat(2.0, 5.2);
            p.vx = Math.cos(theta) * Math.cos(phi) * spd;
            p.vy = Math.sin(phi) * spd + 1.8;
            p.vz = Math.sin(theta) * Math.cos(phi) * spd;
            p.age = 0;
            p.maxAge = 0.58;
            p.color.set(spawned % 3 === 0 ? PALETTE.yellow : hexColor);
            particleInst.setColorAt(i, p.color);
            spawned++;
          }
        }
        if (particleInst.instanceColor) particleInst.instanceColor.needsUpdate = true;
      };

      // Ring Wave Effect Pool
      const ringEffects: Array<{
        mesh: THREE.Mesh;
        age: number;
        maxAge: number;
        active: boolean;
      }> = [];
      for (let i = 0; i < 8; i++) {
        const rm = new THREE.Mesh(
          new THREE.RingGeometry(0.18, 0.28, 24),
          new THREE.MeshBasicMaterial({
            color: PALETTE.cyan,
            transparent: true,
            opacity: 0.9,
            side: THREE.DoubleSide,
          }),
        );
        rm.visible = false;
        scene.add(rm);
        ringEffects.push({ mesh: rm, age: 0, maxAge: 0.4, active: false });
      }

      const spawnRingWave = (pos: THREE.Vector3, colorHex: string) => {
        const slot = ringEffects.find((r) => !r.active) || ringEffects[0];
        slot.active = true;
        slot.age = 0;
        slot.mesh.position.copy(pos);
        slot.mesh.lookAt(camera.position);
        (slot.mesh.material as THREE.MeshBasicMaterial).color.set(colorHex);
        (slot.mesh.material as THREE.MeshBasicMaterial).opacity = 0.9;
        slot.mesh.scale.setScalar(1);
        slot.mesh.visible = true;
      };

      // Popup helper
      let popupCounter = 1;
      const addScreenPopup = (
        worldPos: THREE.Vector3,
        text: string,
        grade: 'PERFECT' | 'GOOD' | 'NON_TARGET' | 'WRONG',
        subText?: string,
      ) => {
        const proj = worldPos.clone().project(camera);
        const rect = renderer.domElement.getBoundingClientRect();
        const sx = ((proj.x + 1) * 0.5) * rect.width;
        const sy = ((-proj.y + 1) * 0.5) * rect.height;
        const id = popupCounter++;
        setPopups((prev) => [
          ...prev.slice(-8),
          {
            id,
            text,
            subText,
            grade,
            x: THREE.MathUtils.clamp(sx, 75, rect.width - 75),
            y: THREE.MathUtils.clamp(sy, 65, rect.height - 65),
          },
        ]);
        window.setTimeout(() => {
          setPopups((prev) => prev.filter((item) => item.id !== id));
        }, 850);
      };

      // Raycaster for Shooting & Tablet Direct-Touch Hit (Sections 1, 4, 7.1)
      const raycaster = new THREE.Raycaster();
      raycaster.far = 85;
      const shootNdc = new THREE.Vector2(0, 0);

      // Probe whether a screen touch at (ndcX, ndcY) directly hits an active target
      probeDirectTouchTargetRef.current = (ndcX: number, ndcY: number): boolean => {
        if (phaseRef.current !== 'PLAYING') return false;
        const activeTargets = manager.activeTargets.filter((t) => !t.hit && !t.dying);
        if (activeTargets.length === 0) return false;

        const effectiveAimAssist = getCurrentAimAssistMul();
        const touchRatio =
          settingsRef.current.tabletTouchAssistMul / Math.max(0.5, effectiveAimAssist);

        for (const t of activeTargets) {
          t.visual.colliderMesh.scale.setScalar(t.typeId === 'H' ? 1.0 : touchRatio);
          t.visual.root.updateMatrixWorld(true);
        }

        shootNdc.set(ndcX, ndcY);
        raycaster.setFromCamera(shootNdc, camera);
        const activeColliders = activeTargets.map((t) => t.visual.colliderMesh);
        const envObjects = manager.isIndoorChallengeActive
          ? builtWorld.indoorEnvironmentObstacles
          : [...builtWorld.environmentObstacles, ...manager.staticLevelObstacles];
        const targetHits = raycaster.intersectObjects(activeColliders, true);
        const envHits = raycaster.intersectObjects(envObjects, true);

        for (const t of activeTargets) {
          t.visual.colliderMesh.scale.setScalar(1.0);
          t.visual.root.updateMatrixWorld(true);
        }

        const firstEnvDist = envHits.length > 0 ? envHits[0].distance : Infinity;
        const candidates = targetHits
          .map((h) => {
            const tid = h.object.userData?.targetId as string | undefined;
            if (!tid) return null;
            const tObj = activeTargets.find((item) => item.instanceId === tid);
            if (!tObj) return null;
            // Strict occlusion check: block if environment wall is closer than target hit or center is behind wall on outer assist margin
            if (h.distance >= firstEnvDist - 1e-4) return null;
            const localPt = tObj.visual.reticleMesh.worldToLocal(h.point.clone());
            const distFromCenter = Math.hypot(localPt.x, localPt.y);
            if (
              distFromCenter > tObj.diameter * 0.5 &&
              !manager.hasLineOfSight(camera.position, tObj.visual.root.position)
            ) {
              return null;
            }
            return {
              targetId: tid,
              rayDistance: h.distance,
              cameraDistance: camera.position.distanceTo(tObj.visual.root.position),
            };
          })
          .filter((c): c is NonNullable<typeof c> => c !== null);

        const frontHit = selectFrontmostTargetHit(candidates, firstEnvDist);
        return Boolean(frontHit);
      };

      const aimBlasterAtCameraPoint = (camX: number, camY: number, camZ: number) => {
        const ps = playerStateRef.current;
        ps.aimCamX = camX;
        ps.aimCamY = camY;
        ps.aimCamZ = camZ;
        const bg = builtWorld.animated.blasterGroup;
        const beam = builtWorld.animated.blasterBeam;
        const dx = camX - bg.position.x;
        const dy = camY - bg.position.y;
        const dz = Math.min(-0.5, camZ - bg.position.z);
        const dist = Math.hypot(dx, dy, dz);
        const pitch = Math.atan2(dy, Math.hypot(dx, dz));
        const yaw = Math.atan2(-dx, -dz);
        bg.rotation.order = 'YXZ';
        bg.rotation.set(pitch + ps.recoilPitch, yaw, 0);
        const distLocal = dist / 0.38;
        const scaleY = Math.max(0.08, (distLocal - 0.38) / 32);
        beam.scale.set(1, scaleY, 1);
        beam.position.set(0, 0, -0.38 - 16 * scaleY);
      };

      const aimBlasterAtNdc = (nx: number, ny: number, depth = 15) => {
        const halfH = depth * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
        const halfW = halfH * camera.aspect;
        aimBlasterAtCameraPoint(nx * halfW, ny * halfH, -depth);
      };

      const aimBlasterAtWorldPoint = (worldPt: THREE.Vector3) => {
        camera.updateMatrixWorld(true);
        const localPt = camera.worldToLocal(worldPt.clone());
        aimBlasterAtCameraPoint(localPt.x, localPt.y, localPt.z);
      };

      shootFnRef.current = (opts?: {
        ndcX?: number;
        ndcY?: number;
        isDirectTouch?: boolean;
        isLaserTraceSweep?: boolean;
        fromWeaponRig?: boolean;
      }): boolean => {
        if (phaseRef.current !== 'PLAYING') return false;
        const icPhase = indoorChallengeRef.current.phase;
        if (
          icPhase === 'WARNING_FADE_OUT' ||
          icPhase === 'TELEPORT_FADE_IN' ||
          icPhase === 'MISSION_BRIEF' ||
          icPhase === 'RETURN_FADE_OUT' ||
          icPhase === 'RETURN_FADE_IN'
        ) {
          return false;
        }
        const ps = playerStateRef.current;
        const isDirectTouch = Boolean(opts?.isDirectTouch);
        const isLaserTraceSweep = Boolean(opts?.isLaserTraceSweep);
        // the weapon rig enforces each weapon's own fire rate, so its shots skip this cooldown
        const fromWeaponRig = Boolean(opts?.fromWeaponRig);
        const minCooldown = isLaserTraceSweep ? 0.11 : 0.16;
        const perfNowSec = performance.now() * 0.001;
        if (!isDirectTouch && !fromWeaponRig && perfNowSec - ps.lastShotPerfSec < minCooldown) return false;
        ps.lastShotTimeSec = ps.elapsedPlaySec;
        ps.lastShotPerfSec = perfNowSec;

        // First shot reaction time tracking per spawn event
        if (manager.unshotEventSeenTimeMs !== null) {
          const firstReact = performance.now() - manager.unshotEventSeenTimeMs;
          recorderRef.current.recordFirstShotReaction(firstReact);
          manager.unshotEventSeenTimeMs = null;
        }

        // Blaster snappy tactical recoil, 50ms muzzle flash & fast-fading tracer beam
        // (the weapon rig draws its own recoil, flash, tracer and sound)
        if (!fromWeaponRig) {
          ps.blasterRecoilTimer = 0.14;
          ps.recoilZ = 0.045;
          ps.recoilPitch = 0.068;
          ps.muzzleFlashTimer = 0.05;
          ps.tracerTimer = 0.085;
          builtWorld.animated.muzzleFlashGroup.visible = true;
          builtWorld.animated.muzzleFlashGroup.rotation.z = Math.random() * Math.PI * 2;
          builtWorld.animated.blasterBeamMat.opacity = 0.92;
          builtWorld.animated.blasterBeamCoreMat.opacity = 0.98;
          builtWorld.animated.blasterBeam.visible = true;
          soundEngine.playShoot();
        }

        const ndcX = opts?.ndcX ?? 0;
        const ndcY = opts?.ndcY ?? 0;
        shootNdc.set(ndcX, ndcY);

        const activeTargets = manager.activeTargets.filter((t) => !t.hit && !t.dying);
        const effectiveAimAssist = getCurrentAimAssistMul();
        const touchRatio = isDirectTouch
          ? settingsRef.current.tabletTouchAssistMul / Math.max(0.5, effectiveAimAssist)
          : 1.0;

        for (const t of activeTargets) {
          if (isDirectTouch && t.typeId !== 'H') {
            t.visual.colliderMesh.scale.setScalar(touchRatio);
          }
          t.visual.root.updateMatrixWorld(true);
        }

        raycaster.setFromCamera(shootNdc, camera);

        const activeColliders = activeTargets.map((t) => t.visual.colliderMesh);
        const envObjects = manager.isIndoorChallengeActive
          ? builtWorld.indoorEnvironmentObstacles
          : [...builtWorld.environmentObstacles, ...manager.staticLevelObstacles];

        const targetHits = raycaster.intersectObjects(activeColliders, true);
        const envHits = raycaster.intersectObjects(envObjects, true);

        if (isDirectTouch) {
          for (const t of activeTargets) {
            t.visual.colliderMesh.scale.setScalar(1.0);
            t.visual.root.updateMatrixWorld(true);
          }
        }

        const firstEnvDist = envHits.length > 0 ? envHits[0].distance : Infinity;

        // Select the front-most (closest to camera) target among overlapping targets strictly before any environment obstacle
        const targetCandidates = targetHits
          .map((h) => {
            const tid = h.object.userData?.targetId as string | undefined;
            if (!tid) return null;
            const tObj = activeTargets.find((item) => item.instanceId === tid);
            if (!tObj) return null;
            if (h.distance >= firstEnvDist - 1e-4) return null;
            const localPt = tObj.visual.reticleMesh.worldToLocal(h.point.clone());
            const distFromCenter = Math.hypot(localPt.x, localPt.y);
            if (
              distFromCenter > tObj.diameter * 0.5 &&
              !manager.hasLineOfSight(camera.position, tObj.visual.root.position)
            ) {
              return null;
            }
            return {
              targetId: tid,
              rayDistance: h.distance,
              cameraDistance: camera.position.distanceTo(tObj.visual.root.position),
              intersection: h,
            };
          })
          .filter((c): c is NonNullable<typeof c> => c !== null);

        const frontTargetWinner = selectFrontmostTargetHit(
          targetCandidates.map((c) => ({
            targetId: c.targetId,
            rayDistance: c.rayDistance,
            cameraDistance: c.cameraDistance,
          })),
          firstEnvDist,
        );

        const winningTargetHit = frontTargetWinner
          ? targetCandidates.find((c) => c.targetId === frontTargetWinner.targetId)?.intersection
          : undefined;
        const closestHit = winningTargetHit ?? envHits[0];

        if (closestHit) {
          aimBlasterAtWorldPoint(closestHit.point);
        } else {
          aimBlasterAtNdc(ndcX, ndcY, 15);
        }

        const fallbackZone: 'left' | 'center' | 'right' =
          ndcX < -0.33 ? 'left' : ndcX > 0.33 ? 'right' : 'center';

        // 1. Background / environment / empty air shot: never display warning popup
        if (!closestHit) {
          if (isLaserTraceSweep) return false;
          recorderRef.current.recordShotMiss(ps.elapsedPlaySec, fallbackZone, false);
          soundEngine.playNonTarget();
          const missDir = new THREE.Vector3(ndcX * 6, ndcY * 4, -14).applyMatrix4(
            camera.matrixWorld,
          );
          spawnRingWave(missDir, PALETTE.lightPurple);
          setHudCombo(0);
          return false;
        }

        if (!winningTargetHit || !frontTargetWinner || closestHit.object.userData?.isTarget !== true) {
          if (isLaserTraceSweep) return false;
          // Hit non-target environment structure (wall, floor, ceiling, cover obstacle, etc.) -> no warning popup
          recorderRef.current.recordShotMiss(ps.elapsedPlaySec, fallbackZone, true);
          soundEngine.playNonTarget();
          spawnRingWave(closestHit.point, PALETTE.lightPurple);
          setHudCombo(0);
          return false;
        }

        const closest = winningTargetHit;
        const hitTargetId = frontTargetWinner.targetId;
        const targetObj = manager.activeTargets.find((t) => t.instanceId === hitTargetId);
        if (!targetObj || targetObj.hit) return false;

        // Determine screen horizontal zone (left / center / right) of the target
        const screenProj = targetObj.visual.root.position.clone().project(camera);
        const screenZone: 'left' | 'center' | 'right' =
          screenProj.x < -0.33 ? 'left' : screenProj.x > 0.33 ? 'right' : 'center';

        // Warning popup ONLY when Raycast hit object has isTarget === true && isMissionTarget === false
        if (shouldShowWrongTargetWarning(closest.object.userData)) {
          recorderRef.current.recordShotWrongSelection(ps.elapsedPlaySec, screenZone);
          targetObj.shakeTimer = 0.22;
          soundEngine.playWrongSelection();
          const wrongMsg = getShotFeedbackMessage('WRONG');
          addScreenPopup(
            closest.point,
            wrongMsg.title,
            'WRONG',
            wrongMsg.subtitle,
          );
          setHudCombo(0);
          return false;
        }

        // Check Type H Standalone Stationary Laser Track Target (Requires hold-click/tap + drag to complete)
        if (targetObj.typeId === 'H') {
          return handleLaserTrackDragStepRef.current(
            ndcX,
            ndcY,
            !isLaserTraceSweep,
          );
        }

        // Calculate normalized distance from center of visible target
        const localPt = targetObj.visual.reticleMesh.worldToLocal(closest.point.clone());
        const distFromCenter = Math.hypot(localPt.x, localPt.y);
        const visibleRadius = Math.max(0.1, targetObj.diameter * 0.5);
        const normDist = distFromCenter / visibleRadius;
        const grade = evaluateHitGrade(normDist, targetObj.isGolden);

        const seenTime = targetObj.firstSeenTimeMs ?? targetObj.spawnTimeMs;
        const reactionMs = Math.max(45, performance.now() - seenTime);

        const { combo } = recorderRef.current.recordShotHit({
          type: targetObj.typeId,
          grade,
          reactionMs,
          aimErrorPct: Math.round(normDist * 100),
          screenZone,
          elapsedSec: ps.elapsedPlaySec,
          isDirectTouch,
          wasRearSpawn: targetObj.wasRearOrOffscreenSpawn,
          sector: targetObj.spawnSector,
        });

        manager.markTargetHit(targetObj);
        setHudScore(recorderRef.current.totalScore);
        setHudCombo(combo);

        if (grade === 'PERFECT') {
          soundEngine.playHitPerfect();
        } else {
          soundEngine.playHitGood();
        }

        spawnHitParticles(
          closest.point,
          targetObj.visualColor,
          20,
        );
        spawnRingWave(closest.point, grade === 'PERFECT' ? PALETTE.yellow : targetObj.visualColor);
        const hitFeedback = getShotFeedbackMessage(grade);
        addScreenPopup(closest.point, hitFeedback.title, grade);

        // Check Indoor Shooting Range Challenge completion immediately on indoor hit
        const ic = indoorChallengeRef.current;
        if (ic.phase === 'ACTIVE' && targetObj.isIndoorChallengeTarget) {
          const remainingIndoor = manager.getRemainingIndoorTargetCount();
          builtWorld.updateIndoorScoreboard(remainingIndoor, ic.challengeTimeLeft);
          if (remainingIndoor <= 0) {
            soundEngine.playIndoorRangeClear();
            recorderRef.current.totalScore += ic.bonusScore;
            setHudScore(recorderRef.current.totalScore);
            ps.energy = Math.min(100, ps.energy + ic.energyBonus);
            setHudEnergy(ps.energy);
            ic.phase = 'RETURN_FADE_OUT';
            ic.phaseTimer = 0.4;
          }
        }
        return true;
      };

      // Hold-Click / Hold-Tap & Continuous One-Stroke Drag Laser Track Handler (Type H)
      const tmpSampleWorld = new THREE.Vector3();
      const tmpSampleProj = new THREE.Vector3();
      const tmpEdgeWorld = new THREE.Vector3();
      const tmpEdgeProj = new THREE.Vector3();
      let lastLaserTickProgress = 0;

      const getProjectedLaserSamples = (t: ActiveTargetInstance) => {
        const localSamples = t.visual.laserCurveSamplesLocal ?? [];
        t.visual.root.updateMatrixWorld(true);
        t.visual.panelGroup.updateMatrixWorld(true);
        const rect = renderer.domElement.getBoundingClientRect();
        const w = rect.width || window.innerWidth;
        const h = rect.height || window.innerHeight;
        return localSamples.map((lp, idx) => {
          tmpSampleWorld.copy(lp).applyMatrix4(t.visual.panelGroup.matrixWorld);
          tmpSampleProj.copy(tmpSampleWorld).project(camera);
          const screenX = ((tmpSampleProj.x + 1) * 0.5) * w + rect.left;
          const screenY = ((-tmpSampleProj.y + 1) * 0.5) * h + rect.top;

          let markerRadiusPx = 0;
          if (idx === 0) {
            tmpEdgeWorld
              .set(lp.x + LASER_START_MARKER_RADIUS, lp.y, lp.z)
              .applyMatrix4(t.visual.panelGroup.matrixWorld);
            tmpEdgeProj.copy(tmpEdgeWorld).project(camera);
            const edgeScreenX = ((tmpEdgeProj.x + 1) * 0.5) * w + rect.left;
            const edgeScreenY = ((-tmpEdgeProj.y + 1) * 0.5) * h + rect.top;
            markerRadiusPx = Math.hypot(edgeScreenX - screenX, edgeScreenY - screenY);
          }

          return {
            index: idx,
            worldPos: tmpSampleWorld.clone(),
            x: tmpSampleProj.x,
            y: tmpSampleProj.y,
            ndcX: tmpSampleProj.x,
            ndcY: tmpSampleProj.y,
            screenX,
            screenY,
            markerRadiusPx,
          };
        });
      };

      handleLaserTrackDragStepRef.current = (
        ndcX: number,
        ndcY: number,
        isInitialDown: boolean,
      ): boolean => {
        if (phaseRef.current !== 'PLAYING') return false;
        const laserTargets = manager.activeTargets
          .filter((t) => t.typeId === 'H' && !t.hit && !t.dying)
          .sort(
            (a, b) =>
              camera.position.distanceTo(a.visual.root.position) -
              camera.position.distanceTo(b.visual.root.position),
          );
        if (laserTargets.length === 0) return false;

        const effectiveAimAssist = getCurrentAimAssistMul();

        if (isInitialDown) {
          const rect = renderer.domElement.getBoundingClientRect();
          const w = rect.width || window.innerWidth;
          const h = rect.height || window.innerHeight;
          const pointerScreenX = ((ndcX + 1) * 0.5) * w + rect.left;
          const pointerScreenY = ((-ndcY + 1) * 0.5) * h + rect.top;

          shootNdc.set(ndcX, ndcY);
          raycaster.setFromCamera(shootNdc, camera);
          const envObjects = manager.isIndoorChallengeActive
            ? builtWorld.indoorEnvironmentObstacles
            : [...builtWorld.environmentObstacles, ...manager.staticLevelObstacles];
          const envHits = raycaster.intersectObjects(envObjects, true);
          const firstEnvDist = envHits.length > 0 ? envHits[0].distance : Infinity;

          // If a non-H target overlaps at (ndcX, ndcY) and is closer to the camera, let the frontmost normal target take the shot first
          const nonHTargets = manager.activeTargets.filter(
            (t) => t.typeId !== 'H' && !t.hit && !t.dying,
          );
          let closestNonHCameraDist = Infinity;
          if (nonHTargets.length > 0) {
            for (const nt of nonHTargets) nt.visual.root.updateMatrixWorld(true);
            const nonHHits = raycaster.intersectObjects(
              nonHTargets.map((nt) => nt.visual.colliderMesh),
              true,
            );
            for (const hHit of nonHHits) {
              if (hHit.distance >= firstEnvDist - 1e-4) continue;
              const tid = hHit.object.userData?.targetId as string | undefined;
              const ntObj = nonHTargets.find((item) => item.instanceId === tid);
              if (ntObj) {
                const d = camera.position.distanceTo(ntObj.visual.root.position);
                if (d < closestNonHCameraDist) closestNonHCameraDist = d;
              }
            }
          }

          for (const t of laserTargets) {
            const laserCamDist = camera.position.distanceTo(t.visual.root.position);
            if (closestNonHCameraDist < laserCamDist - 0.05) {
              continue;
            }
            if (
              firstEnvDist < laserCamDist - 1e-4 ||
              !manager.hasLineOfSight(camera.position, t.visual.root.position)
            ) {
              continue;
            }
            const projSamples = getProjectedLaserSamples(t);
            if (projSamples.length < 2) continue;

            // Strict start point check: Euclidean distance (Math.hypot) from pointer to start point center
            // must be within the start point marker's actual radius (zero extra tolerance pixels/padding).
            const startSample = projSamples[0];
            const isInsideStartPoint = isWithinLaserStartPointRadius({
              pointerX: pointerScreenX,
              pointerY: pointerScreenY,
              startX: startSample.screenX,
              startY: startSample.screenY,
              startMarkerRadius: startSample.markerRadiusPx,
            });

            if (isInsideStartPoint) {
              inputStateRef.current.laserDragTargetId = t.instanceId;
              inputStateRef.current.laserDragNdcX = ndcX;
              inputStateRef.current.laserDragNdcY = ndcY;

              manager.resetLaserTrackTarget(t);
              const initProg = 0.02;
              manager.setLaserTrackProgress(t, initProg, false);
              lastLaserTickProgress = initProg;

              playerStateRef.current.blasterRecoilTimer = 0.14;
              playerStateRef.current.recoilZ = 0.032;
              playerStateRef.current.recoilPitch = 0.048;
              playerStateRef.current.muzzleFlashTimer = 0.05;
              playerStateRef.current.tracerTimer = 0.095;
              builtWorld.animated.muzzleFlashGroup.visible = true;
              builtWorld.animated.muzzleFlashGroup.rotation.z = Math.random() * Math.PI * 2;
              builtWorld.animated.blasterBeamMat.opacity = 0.92;
              builtWorld.animated.blasterBeamCoreMat.opacity = 0.98;
              builtWorld.animated.blasterBeam.visible = true;
              const startWorldPos = startSample.worldPos;
              aimBlasterAtWorldPoint(startWorldPos);
              soundEngine.playLaserDragStep(initProg);
              spawnHitParticles(startWorldPos, PALETTE.cyan, 8);
              spawnRingWave(startWorldPos, PALETTE.cyan);
              return true;
            }
          }
          return false;
        }

        // Continuing an active Hold-Drag session
        const activeId = inputStateRef.current.laserDragTargetId;
        if (!activeId) return false;
        const t = laserTargets.find((item) => item.instanceId === activeId);
        if (!t) {
          inputStateRef.current.laserDragTargetId = null;
          inputStateRef.current.laserDragPointerId = null;
          return false;
        }

        const prevNdcX = inputStateRef.current.laserDragNdcX;
        const prevNdcY = inputStateRef.current.laserDragNdcY;
        inputStateRef.current.laserDragNdcX = ndcX;
        inputStateRef.current.laserDragNdcY = ndcY;
        playerStateRef.current.blasterRecoilTimer = 0.12;
        playerStateRef.current.recoilZ = Math.max(playerStateRef.current.recoilZ, 0.012);
        playerStateRef.current.tracerTimer = 0.075;
        builtWorld.animated.blasterBeamMat.opacity = 0.86;
        builtWorld.animated.blasterBeamCoreMat.opacity = 0.94;
        builtWorld.animated.blasterBeam.visible = true;
        aimBlasterAtNdc(ndcX, ndcY, Math.max(3, camera.position.distanceTo(t.visual.root.position)));

        const projSamples = getProjectedLaserSamples(t);
        if (projSamples.length < 2) return true;

        const corridorTol = 0.19 * effectiveAimAssist;
        const dragDelta = Math.hypot(ndcX - prevNdcX, ndcY - prevNdcY);
        const subSteps = dragDelta > 0.06 ? 3 : 1;
        let curProg = t.laserProgress;
        let completed = false;

        for (let step = 1; step <= subSteps; step++) {
          const frac = step / subSteps;
          const sx = prevNdcX + (ndcX - prevNdcX) * frac;
          const sy = prevNdcY + (ndcY - prevNdcY) * frac;
          const stepRes = evaluateContinuousLaserDragProgress({
            samples: projSamples,
            currentProgress: curProg,
            pointer: { x: sx, y: sy },
            corridorTol,
            maxForwardStep: 0.18,
            completionThreshold: 0.95,
          });
          if (stepRes.nextProgress > curProg) {
            curProg = stepRes.nextProgress;
          }
          if (stepRes.completed) {
            completed = true;
            curProg = 1.0;
            break;
          }
        }

        if (curProg > t.laserProgress || completed) {
          manager.setLaserTrackProgress(t, curProg, completed);
          const sampleIdx = Math.min(
            projSamples.length - 1,
            Math.round(curProg * (projSamples.length - 1)),
          );
          const headWorldPos = projSamples[sampleIdx].worldPos;

          if (completed) {
            inputStateRef.current.laserDragTargetId = null;
            inputStateRef.current.laserDragPointerId = null;

            const ps = playerStateRef.current;
            const screenProj = t.visual.root.position.clone().project(camera);
            const screenZone: 'left' | 'center' | 'right' =
              screenProj.x < -0.33 ? 'left' : screenProj.x > 0.33 ? 'right' : 'center';
            const seenTime = t.firstSeenTimeMs ?? t.spawnTimeMs;
            const reactionMs = Math.max(45, performance.now() - seenTime);

            const { combo } = recorderRef.current.recordShotHit({
              type: 'H',
              grade: 'PERFECT',
              reactionMs,
              aimErrorPct: 4,
              screenZone,
              elapsedSec: ps.elapsedPlaySec,
              isDirectTouch: isTabletRef.current,
              wasRearSpawn: t.wasRearOrOffscreenSpawn,
              sector: t.spawnSector,
            });

            manager.markTargetHit(t);
            setHudScore(recorderRef.current.totalScore);
            setHudCombo(combo);
            soundEngine.playLaserTrackComplete();
            spawnHitParticles(headWorldPos, PALETTE.yellow, 28);
            spawnRingWave(headWorldPos, PALETTE.yellow);
            const hitFeedback = getShotFeedbackMessage('PERFECT');
            addScreenPopup(headWorldPos, hitFeedback.title, 'PERFECT');
            return true;
          }

          if (curProg - lastLaserTickProgress >= 0.12) {
            lastLaserTickProgress = curProg;
            soundEngine.playLaserDragStep(curProg);
            spawnHitParticles(headWorldPos, PALETTE.cyan, 5);
          }
        }
        return true;
      };

      releaseLaserTrackDragRef.current = () => {
        const activeId = inputStateRef.current.laserDragTargetId;
        inputStateRef.current.laserDragTargetId = null;
        inputStateRef.current.laserDragPointerId = null;
        lastLaserTickProgress = 0;
        if (!activeId) return;
        const t = manager.activeTargets.find(
          (item) => item.instanceId === activeId && !item.hit && !item.dying,
        );
        if (t && t.typeId === 'H' && t.laserProgress < 0.95) {
          manager.resetLaserTrackTarget(t);
          soundEngine.playWrongSelection();
          addScreenPopup(
            t.visual.root.position,
            '끝까지 드래그를 유지해요!',
            'WRONG',
            '클릭/터치를 떼지 말고 시작점부터 끝점까지 쭉 이어 주세요!',
          );
        }
      };

      // Resize & Orientation Change Handler
      let orientResizeTimer = 0;
      const handleResize = () => {
        if (!container) return;
        const w = container.clientWidth || Math.round(window.visualViewport?.width || window.innerWidth);
        const h = container.clientHeight || Math.round(window.visualViewport?.height || window.innerHeight);
        if (w <= 0 || h <= 0) return;
        camera.aspect = w / h;
        camera.fov = calcVerticalFov(w / h);
        camera.updateProjectionMatrix();
        // Sync both FOV and portrait/landscape viewmodel framing on every resize/rotation
        if (weaponRigRef.current) {
          (weaponRigRef.current as unknown as { defaultFov: number }).defaultFov = camera.fov;
          weaponRigRef.current.setViewportAspect(w / h);
        }
        renderer.setSize(w, h);
        if (composer) {
          composer.setSize(w, h);
        }
      };

      const handleOrientationChange = () => {
        handleResize();
        window.clearTimeout(orientResizeTimer);
        orientResizeTimer = window.setTimeout(handleResize, 160);
        if (phaseRef.current === 'PLAYING') {
          setPhase('PAUSED');
          soundEngine.setBgmPaused(true);
        }
      };

      window.addEventListener('resize', handleResize);
      window.addEventListener('orientationchange', handleOrientationChange);
      window.visualViewport?.addEventListener('resize', handleResize);

      // Frustum helper
      const frustum = new THREE.Frustum();
      const projScreenMatrix = new THREE.Matrix4();

      // Main Animation Loop
      let frameId = 0;
      let lastTimeMs = performance.now();

      const finishGameSession = () => {
        if (document.pointerLockElement) {
          try {
            document.exitPointerLock();
          } catch {
            // ignore
          }
        }
        builtWorld.setIndoorRangeActive(false);
        scene.background = new THREE.Color('#CEC6B8');
        scene.fog = new THREE.Fog('#CEC6B8', 46, 148);
        hemiLight.intensity = 0.52;
        dirLight.intensity = 1.92;
        indoorChallengeRef.current.phase = 'NONE';
        syncIndoorOverlayUi(0, null, false);
        soundEngine.stopBgm();
        soundEngine.playFanfare();
        setDirectionHintUi(null);
        const summary = recorderRef.current.buildSummary(playerStateRef.current.elapsedPlaySec);
        setLastResult(summary);
        saveSessionSummary(summary);
        setPhase('RESULT');
      };

      const beginIndoorChallenge = (repeatIndex: number, difficultyOverride?: number) => {
        const activeDiff = difficultyOverride ?? settingsRef.current.difficulty;
        const spec = computeIndoorRangeChallengeSpec(
          activeDiff,
          repeatIndex,
          settingsRef.current.spawnFrequencyMul,
        );
        const ic = indoorChallengeRef.current;
        const ps = playerStateRef.current;

        ic.phase = 'WARNING_FADE_OUT';
        ic.phaseTimer = 1.0;
        ic.repeatCount = repeatIndex;
        ic.challengeTimeTotal = spec.timeLimitSec;
        ic.challengeTimeLeft = spec.timeLimitSec;
        ic.targetCount = spec.targetCount;
        ic.bonusScore = spec.bonusScore;
        ic.energyBonus = spec.energyBonus;
        ic.savedArenaX = ps.x;
        ic.savedArenaY = ps.y;
        ic.savedArenaZ = ps.z;
        ic.savedArenaYaw = ps.yaw;
        ic.savedArenaPitch = ps.pitch;

        releaseLaserTrackDragRef.current();
        setDirectionHintUi(null);
        soundEngine.playIndoorRangeWarning();
        syncIndoorOverlayUi(0.05, '⚠ 돌발 훈련장 전환!', false);
      };

      (window as unknown as Record<string, unknown>).__ehmDebug = {
        getPlayerState: () => ({ ...playerStateRef.current }),
        getSettings: () => ({ ...settingsRef.current }),
        rotateYawBy: (deltaRad: number) => {
          const next = playerStateRef.current.yaw + deltaRad;
          playerStateRef.current.yaw = clampPlayerYawForMode(
            next,
            settingsRef.current.trainingMode ?? 1,
            playerStateRef.current.x,
            playerStateRef.current.z,
          );
          return playerStateRef.current.yaw;
        },
        triggerJump: () => {
          const modeCfg =
            TRAINING_MODES[settingsRef.current.trainingMode ?? 1] || TRAINING_MODES[1];
          if (
            phaseRef.current === 'PLAYING' &&
            modeCfg.allowMovement &&
            indoorChallengeRef.current.phase === 'NONE'
          ) {
            playerStateRef.current.jumpQueued = true;
            return true;
          }
          return false;
        },
        forceSpawnTargets: (count: number) => {
          for (let i = 0; i < count; i++) {
            manager.spawnSingleTarget({
              typeId: 'A',
              difficulty: settingsRef.current.difficulty,
              trainingMode: settingsRef.current.trainingMode ?? 1,
              playerX: playerStateRef.current.x,
              playerZ: playerStateRef.current.z,
              aimAssistMul: getCurrentAimAssistMul(),
              frustum,
              onSpawnRecorded: handleSpawnNotification,
            });
          }
          return manager.activeTargets.map((t) => ({
            id: t.instanceId,
            x: t.visual.root.position.x,
            y: t.visual.root.position.y,
            z: t.visual.root.position.z,
            sector: t.spawnSector,
          }));
        },
        forceSpawnGGroup: (diffOverride?: number) => {
          const activeDiff = diffOverride ?? Math.max(9, settingsRef.current.difficulty);
          if (diffOverride) {
            updateSettings({ difficulty: activeDiff });
          }
          manager.clearAll();
          manager.spawnGGroup({
            difficulty: activeDiff,
            trainingMode: settingsRef.current.trainingMode ?? 1,
            playerX: playerStateRef.current.x,
            playerZ: playerStateRef.current.z,
            aimAssistMul: getCurrentAimAssistMul(),
            frustum,
            onSpawnRecorded: handleSpawnNotification,
          });
          return manager.activeTargets.map((t) => ({
            id: t.instanceId,
            typeId: t.typeId,
            difficulty: t.difficulty,
            isMissionCorrect: t.isMissionCorrect,
            hasBracketMesh: Boolean(t.visual.missionBracketMesh),
            bracketVisible: Boolean(t.visual.missionBracketMesh?.visible),
          }));
        },
        getGGroupState: () => {
          return manager.activeTargets
            .filter((t) => t.typeId === 'G' && !t.hit && !t.dying)
            .map((t) => ({
              id: t.instanceId,
              difficulty: t.difficulty,
              age: t.age,
              isMissionCorrect: t.isMissionCorrect,
              hasBracketMesh: Boolean(t.visual.missionBracketMesh),
              bracketVisible: Boolean(t.visual.missionBracketMesh?.visible),
              bracketOpacity: t.visual.missionBracketMesh
                ? (t.visual.missionBracketMesh.material as THREE.MeshBasicMaterial).opacity
                : 0,
            }));
        },
        forceSpawnLaserTrack: (diffOverride?: number) => {
          const activeDiff = diffOverride ?? settingsRef.current.difficulty;
          if (diffOverride) {
            updateSettings({ difficulty: activeDiff });
          }
          manager.clearAll();
          const t = manager.spawnSingleTarget({
            typeId: 'H',
            difficulty: activeDiff,
            trainingMode: settingsRef.current.trainingMode ?? 1,
            playerX: playerStateRef.current.x,
            playerZ: playerStateRef.current.z,
            aimAssistMul: getEffectiveAimAssistMul(
              settingsRef.current.aimAssistMul,
              activeDiff,
              !settingsRef.current.tabletDirectTouchHit,
            ),
            frustum,
            onSpawnRecorded: handleSpawnNotification,
            overridePos: { x: 0, y: 2.35, z: -5.5, sector: 'FRONT' },
          });
          if (t) {
            t.age = 0.5;
            t.visual.root.scale.setScalar(1.0);
            t.visual.root.updateMatrixWorld(true);
          }
          return t
            ? {
                id: t.instanceId,
                typeId: t.typeId,
                difficulty: activeDiff,
                shapeKind: t.laserTrackSpec?.shapeKind,
                shapeLabel: t.laserTrackSpec?.shapeLabel,
                trackLengthMeters: t.laserTrackSpec?.trackLengthMeters,
                tubeRadius: t.laserTrackSpec?.tubeRadius,
                sampleCount: t.visual.laserCurveSamplesLocal?.length ?? 0,
                laserProgress: t.laserProgress,
                isStationary: t.speed === 0,
                frameVisible: t.visual.frameMesh.visible,
                reticleVisible: t.visual.reticleMesh.visible,
                samplesScreen: getProjectedLaserSamples(t),
              }
            : null;
        },
        getLaserTrackState: () => {
          const t = manager.activeTargets.find((item) => item.typeId === 'H' && !item.hit && !item.dying);
          if (!t) return null;
          return {
            id: t.instanceId,
            x: t.visual.root.position.x,
            y: t.visual.root.position.y,
            z: t.visual.root.position.z,
            shapeKind: t.laserTrackSpec?.shapeKind,
            laserProgress: t.laserProgress,
            isDragging: inputStateRef.current.laserDragTargetId === t.instanceId,
            samplesScreen: getProjectedLaserSamples(t),
          };
        },
        finishSessionNow: () => {
          finishGameSession();
        },
        triggerIndoorChallenge: (repeatIndex = 0, diffOverride?: number) => {
          const d = diffOverride ?? Math.max(8, settingsRef.current.difficulty);
          if (diffOverride) {
            updateSettings({ difficulty: d });
          }
          beginIndoorChallenge(repeatIndex, d);
          return { ...indoorChallengeRef.current };
        },
        getIndoorChallengeState: () => {
          const ic = indoorChallengeRef.current;
          return {
            phase: ic.phase,
            phaseTimer: Number(ic.phaseTimer.toFixed(3)),
            challengeTimeLeft: Number(ic.challengeTimeLeft.toFixed(2)),
            remainingTargets: manager.getRemainingIndoorTargetCount(),
            targetCount: ic.targetCount,
            repeatCount: ic.repeatCount,
            playerX: playerStateRef.current.x,
            playerZ: playerStateRef.current.z,
          };
        },
      };

      const stepFrame = () => {
        const nowMs = performance.now();
        const rawDt = (nowMs - lastTimeMs) / 1000;
        lastTimeMs = nowMs;
        const dt = Math.min(Math.max(0.001, rawDt), isSoftwareGl ? 0.1 : 0.05);

        const curPhase = phaseRef.current;
        const ps = playerStateRef.current;

        // 1. Animate World Sky Ring, Clouds, Drones & Banners
        builtWorld.animated.skyRing.rotation.z += 0.007 * dt;
        for (const cl of builtWorld.animated.clouds) {
          cl.sprite.position.x += cl.speed * dt;
          if (cl.sprite.position.x > 52) cl.sprite.position.x = -52;
        }
        for (const dr of builtWorld.animated.drones) {
          dr.group.position.y =
            dr.baseY + Math.sin((nowMs * 0.001 * Math.PI * 2) / dr.period + dr.phase) * 0.5;
        }
        for (const bn of builtWorld.animated.banners) {
          const posAttr = bn.geometry.attributes.position;
          for (let i = 0; i < posAttr.count; i++) {
            const py = posAttr.getY(i);
            const wave =
              Math.sin(nowMs * 0.003 + py * 1.2) * 0.08 * Math.max(0, (2.4 - py) / 4.8);
            posAttr.setZ(i, wave);
          }
          posAttr.needsUpdate = true;
        }

        // Blaster smooth idle breathing, corner placement, damped recoil kick & 50ms muzzle flash / fading tracer
        const idleBobY = Math.sin(nowMs * 0.0024) * 0.002;
        const idleSwayX = Math.cos(nowMs * 0.0016) * 0.0016;
        const recoilDecay = Math.exp(-24 * dt);
        ps.recoilZ *= recoilDecay;
        ps.recoilPitch *= recoilDecay;
        if (ps.recoilZ < 0.0005) ps.recoilZ = 0;
        if (ps.recoilPitch < 0.0005) ps.recoilPitch = 0;
        ps.blasterRecoilTimer = Math.max(0, ps.blasterRecoilTimer - dt);

        if (ps.muzzleFlashTimer > 0) {
          ps.muzzleFlashTimer = Math.max(0, ps.muzzleFlashTimer - dt);
          builtWorld.animated.muzzleFlashGroup.visible = ps.muzzleFlashTimer > 0;
        } else {
          builtWorld.animated.muzzleFlashGroup.visible = false;
        }

        if (ps.tracerTimer > 0) {
          ps.tracerTimer = Math.max(0, ps.tracerTimer - dt);
          const alpha = THREE.MathUtils.clamp(ps.tracerTimer / 0.085, 0, 1);
          builtWorld.animated.blasterBeamMat.opacity = 0.92 * alpha;
          builtWorld.animated.blasterBeamCoreMat.opacity = 0.98 * alpha;
          builtWorld.animated.blasterBeam.visible = ps.tracerTimer > 0;
        } else {
          builtWorld.animated.blasterBeam.visible = false;
        }

        builtWorld.animated.blasterGroup.position.set(
          0.41 + idleSwayX,
          -0.25 + idleBobY,
          -0.58 + ps.recoilZ,
        );
        aimBlasterAtCameraPoint(ps.aimCamX, ps.aimCamY, ps.aimCamZ);

        // Weapon rig: sway/bob/recoil every frame, fire while the trigger is held
        const weaponRig = weaponRigRef.current;
        if (weaponRig) {
          builtWorld.animated.blasterGroup.visible = false;
          const md = weaponMouseDeltaRef.current;
          const isMoving = curPhase === 'PLAYING' && Math.hypot(ps.vx, ps.vz) > 0.4;
          weaponRig.update(dt, isMoving, md.x, md.y);
          md.x = 0;
          md.y = 0;
          if (curPhase === 'PLAYING' && !weaponModalOpenRef.current && isFireHeldRef.current) {
            const liveTargets = manager.activeTargets.filter((t) => !t.hit && !t.dying);
            const shootables: THREE.Object3D[] = [
              ...liveTargets.map((t) => t.visual.colliderMesh),
              ...(manager.isIndoorChallengeActive
                ? builtWorld.indoorEnvironmentObstacles
                : [...builtWorld.environmentObstacles, ...manager.staticLevelObstacles]),
            ];
            weaponRig.tryFire(shootables, (shot) => {
              // Re-run the game's own hit pipeline (scoring, grades, occlusion, records) along
              // the exact ray the rig fired, spread included.
              const p = shot.hitPoint.clone().project(camera);
              const dragAim = !document.pointerLockElement && !isTabletRef.current;
              const offX = dragAim ? inputStateRef.current.hoverNdcX : 0;
              const offY = dragAim ? inputStateRef.current.hoverNdcY : 0;
              shootFnRef.current({ ndcX: p.x + offX, ndcY: p.y + offY, fromWeaponRig: true });
            });
          } else if (curPhase !== 'PLAYING' && (isFireHeldRef.current || isAdsHeldRef.current)) {
            isFireHeldRef.current = false;
            isAdsHeldRef.current = false;
            weaponRig.setFiring(false);
            weaponRig.setAds(false);
          }
        }

        // 2. Update Pooled Particles & Ring Waves
        let anyParticleChanged = false;
        for (let i = 0; i < MAX_PARTICLES; i++) {
          const p = particles[i];
          if (!p.active) continue;
          anyParticleChanged = true;
          p.age += dt;
          if (p.age >= p.maxAge) {
            p.active = false;
            dummyMat4.makeScale(0, 0, 0);
            particleInst.setMatrixAt(i, dummyMat4);
          } else {
            p.vy -= 4.8 * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.z += p.vz * dt;
            const sc = Math.max(0.01, 1 - p.age / p.maxAge);
            dummyPos.set(p.x, p.y, p.z);
            dummyScale.setScalar(sc);
            dummyMat4.compose(dummyPos, dummyQuat, dummyScale);
            particleInst.setMatrixAt(i, dummyMat4);
          }
        }
        if (anyParticleChanged) {
          particleInst.instanceMatrix.needsUpdate = true;
        }

        for (const rw of ringEffects) {
          if (!rw.active) continue;
          rw.age += dt;
          if (rw.age >= rw.maxAge) {
            rw.active = false;
            rw.mesh.visible = false;
          } else {
            const t = rw.age / rw.maxAge;
            rw.mesh.scale.setScalar(1 + t * 5.2);
            (rw.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.85;
          }
        }

        // 3. Phase-Specific Camera & Gameplay Update
        if (curPhase === 'MENU' || curPhase === 'RESULT') {
          const menuMode = TRAINING_MODES[settingsRef.current.trainingMode ?? 1] || TRAINING_MODES[1];
          const moveOffsetX = menuMode.allowMovement
            ? Math.sin((nowMs * 0.001 * Math.PI * 2) / 9.0) * 2.2
            : 0;
          const moveOffsetZ = menuMode.allowMovement
            ? Math.cos((nowMs * 0.001 * Math.PI * 2) / 9.0) * 1.4
            : 0;
          camera.position.set(
            ARENA.startPos.x + moveOffsetX,
            ARENA.startPos.y,
            ARENA.startPos.z + moveOffsetZ,
          );
          const sweepDeg = menuMode.yawRangeType === 'FREE_360' ? 28 : 10;
          const sweepAngle =
            Math.sin((nowMs * 0.001 * Math.PI * 2) / 16.0) * THREE.MathUtils.degToRad(sweepDeg);
          camera.rotation.set(0, sweepAngle, 0);

          for (const dtgt of manager.activeTargets) {
            dtgt.age += dt;
            dtgt.visual.panelGroup.position.y =
              Math.sin(dtgt.age * Math.PI + dtgt.phaseOffset) * 0.08;
          }
        } else if (curPhase === 'PLAYING') {
          const ic = indoorChallengeRef.current;
          if (ic.phase !== 'NONE') {
            const activeModeId: TrainingModeId = settingsRef.current.trainingMode ?? 1;
            const modeCfg = TRAINING_MODES[activeModeId] || TRAINING_MODES[1];
            const activeDiff = settingsRef.current.difficulty;
            const keys = inputStateRef.current.keys;

            if (
              ic.phase === 'TELEPORT_FADE_IN' ||
              ic.phase === 'MISSION_BRIEF' ||
              ic.phase === 'ACTIVE'
            ) {
              if (!modeCfg.allowMovement) {
                const arrowRotSpeed = THREE.MathUtils.degToRad(90);
                if (keys.ArrowLeft) ps.yaw += arrowRotSpeed * dt;
                if (keys.ArrowRight) ps.yaw -= arrowRotSpeed * dt;
                if (keys.ArrowUp) ps.pitch += arrowRotSpeed * dt;
                if (keys.ArrowDown) ps.pitch -= arrowRotSpeed * dt;
              }
              ps.yaw = THREE.MathUtils.clamp(
                ps.yaw,
                -THREE.MathUtils.degToRad(82),
                THREE.MathUtils.degToRad(82),
              );
              ps.pitch = THREE.MathUtils.clamp(
                ps.pitch,
                -THREE.MathUtils.degToRad(70),
                THREE.MathUtils.degToRad(70),
              );
            }

            if (ic.phase === 'WARNING_FADE_OUT') {
              ic.phaseTimer -= dt;
              const fadeRatio = THREE.MathUtils.clamp(1 - ic.phaseTimer / 1.0, 0.05, 1);
              setIndoorFadeOpacity(fadeRatio);
              if (ic.phaseTimer <= 0) {
                manager.suspendArenaStateForIndoorChallenge();
                builtWorld.setIndoorRangeActive(true);
                scene.background = new THREE.Color('#231C16');
                scene.fog = new THREE.Fog('#231C16', 24, 58);
                hemiLight.intensity = 0.68;
                dirLight.intensity = 0.45;

                ps.x = INDOOR_RANGE_WORLD.playerPos.x;
                ps.y = INDOOR_RANGE_WORLD.playerPos.y;
                ps.z = INDOOR_RANGE_WORLD.playerPos.z;
                ps.vx = 0;
                ps.vz = 0;
                ps.yaw = INDOOR_RANGE_WORLD.playerYaw;
                ps.pitch = INDOOR_RANGE_WORLD.playerPitch;
                camera.position.set(ps.x, ps.y, ps.z);
                camera.rotation.set(ps.pitch, ps.yaw, 0);
                camera.updateMatrixWorld();

                builtWorld.updateIndoorScoreboard(ic.targetCount, ic.challengeTimeLeft);
                ic.phase = 'TELEPORT_FADE_IN';
                ic.phaseTimer = 0.4;
                syncIndoorOverlayUi(1.0, '제한시간 안에 모두 맞혀라!', true);
              }
            } else if (ic.phase === 'TELEPORT_FADE_IN') {
              ic.phaseTimer -= dt;
              const fade = THREE.MathUtils.clamp(ic.phaseTimer / 0.4, 0, 1);
              setIndoorFadeOpacity(fade);
              camera.position.set(ps.x, ps.y, ps.z);
              camera.rotation.set(ps.pitch, ps.yaw, 0);
              camera.updateMatrixWorld();
              if (ic.phaseTimer <= 0) {
                ic.phase = 'MISSION_BRIEF';
                ic.phaseTimer = 2.0;
                syncIndoorOverlayUi(0, '제한시간 안에 모두 맞혀라!', true);
              }
            } else if (ic.phase === 'MISSION_BRIEF') {
              ic.phaseTimer -= dt;
              camera.position.set(ps.x, ps.y, ps.z);
              camera.rotation.set(ps.pitch, ps.yaw, 0);
              camera.updateMatrixWorld();
              if (ic.phaseTimer <= 0) {
                const spec = computeIndoorRangeChallengeSpec(
                  activeDiff,
                  ic.repeatCount,
                  settingsRef.current.spawnFrequencyMul,
                );
                manager.spawnIndoorRangeTargets({
                  count: ic.targetCount,
                  diameter: spec.targetDiameter,
                  difficulty: activeDiff,
                  aimAssistMul: getCurrentAimAssistMul(),
                  playerPos: { x: ps.x, y: ps.y, z: ps.z },
                  onSpawnRecorded: handleSpawnNotification,
                });
                builtWorld.updateIndoorScoreboard(
                  manager.getRemainingIndoorTargetCount(),
                  ic.challengeTimeLeft,
                );
                ic.phase = 'ACTIVE';
                ic.phaseTimer = 0;
                syncIndoorOverlayUi(0, null, true);
                soundEngine.playCountdownBeep(true);
              }
            } else if (ic.phase === 'ACTIVE') {
              if (modeCfg.allowMovement) {
                const kbVec = modeCfg.wasdEnabled
                  ? computeKeyboardMoveVector(keys)
                  : { forward: 0, right: 0 };
                const joyVec = modeCfg.joystickEnabled
                  ? computeJoystickMoveVector(
                      inputStateRef.current.joyDx,
                      inputStateRef.current.joyDy,
                      56,
                      0.1,
                    )
                  : { forward: 0, right: 0, magnitude: 0 };
                let fwd = kbVec.forward + joyVec.forward;
                let rgt = kbVec.right + joyVec.right;
                const mag = Math.hypot(fwd, rgt);
                if (mag > 1) {
                  fwd /= mag;
                  rgt /= mag;
                }
                const sinY = Math.sin(ps.yaw);
                const cosY = Math.cos(ps.yaw);
                const targetVx = (-sinY * fwd + cosY * rgt) * 5.2;
                const targetVz = (-cosY * fwd - sinY * rgt) * 5.2;
                const damp = 1 - Math.exp(-16 * dt);
                ps.vx += (targetVx - ps.vx) * damp;
                ps.vz += (targetVz - ps.vz) * damp;
                ps.x = THREE.MathUtils.clamp(ps.x + ps.vx * dt, 142.0, 158.0);
                ps.z = THREE.MathUtils.clamp(ps.z + ps.vz * dt, 5.2, 11.4);
              } else {
                ps.vx = 0;
                ps.vz = 0;
                ps.x = INDOOR_RANGE_WORLD.playerPos.x;
                ps.z = INDOOR_RANGE_WORLD.playerPos.z;
              }

              camera.position.set(ps.x, ps.y, ps.z);
              camera.rotation.set(ps.pitch, ps.yaw, 0);
              camera.updateMatrixWorld();

              manager.updateIndoorTargets(dt, camera);
              ic.challengeTimeLeft = Math.max(0, ic.challengeTimeLeft - dt);
              const remIndoor = manager.getRemainingIndoorTargetCount();
              builtWorld.updateIndoorScoreboard(remIndoor, ic.challengeTimeLeft);

              if (remIndoor <= 0) {
                soundEngine.playIndoorRangeClear();
                recorderRef.current.totalScore += ic.bonusScore;
                setHudScore(recorderRef.current.totalScore);
                ps.energy = Math.min(100, ps.energy + ic.energyBonus);
                setHudEnergy(ps.energy);
                ic.phase = 'RETURN_FADE_OUT';
                ic.phaseTimer = 0.4;
              } else if (ic.challengeTimeLeft <= 0) {
                ic.phase = 'RETURN_FADE_OUT';
                ic.phaseTimer = 0.4;
                syncIndoorOverlayUi(0.05, '시간 종료! 본 훈련장으로 복귀합니다', true);
              }
            } else if (ic.phase === 'RETURN_FADE_OUT') {
              ic.phaseTimer -= dt;
              const fade = THREE.MathUtils.clamp(1 - ic.phaseTimer / 0.4, 0, 1);
              setIndoorFadeOpacity(fade);
              manager.updateIndoorTargets(dt, camera);
              if (ic.phaseTimer <= 0) {
                manager.clearIndoorRangeTargets();
                manager.restoreArenaStateFromIndoorChallenge();
                builtWorld.setIndoorRangeActive(false);
                scene.background = new THREE.Color('#8ec5eb');
                scene.fog = new THREE.Fog('#8ec5eb', 140, 520);
                hemiLight.intensity = 0.8;
                dirLight.intensity = 1.15;
                fillDirLight.intensity = 0.3;

                ps.x = ic.savedArenaX;
                ps.y = ic.savedArenaY;
                ps.z = ic.savedArenaZ;
                ps.yaw = ic.savedArenaYaw;
                ps.pitch = ic.savedArenaPitch;
                ps.vx = 0;
                ps.vz = 0;
                camera.position.set(ps.x, ps.y, ps.z);
                camera.rotation.set(ps.pitch, ps.yaw, 0);
                camera.updateMatrixWorld();

                ic.phase = 'RETURN_FADE_IN';
                ic.phaseTimer = 0.4;
                syncIndoorOverlayUi(1.0, null, false);
              }
            } else if (ic.phase === 'RETURN_FADE_IN') {
              ic.phaseTimer -= dt;
              const fade = THREE.MathUtils.clamp(ic.phaseTimer / 0.4, 0, 1);
              setIndoorFadeOpacity(fade);
              camera.position.set(ps.x, ps.y, ps.z);
              camera.rotation.set(ps.pitch, ps.yaw, 0);
              camera.updateMatrixWorld();
              if (ic.phaseTimer <= 0) {
                ic.phase = 'NONE';
                ic.phaseTimer = 0;
                syncIndoorOverlayUi(0, null, false);
              }
            }
          } else {
          ps.elapsedPlaySec += dt;
          const remaining = Math.max(0, settingsRef.current.duration - ps.elapsedPlaySec);
          setHudTimeLeft(Math.ceil(remaining));

          if (remaining <= 0) {
            finishGameSession();
          } else {
            const activeDiff = settingsRef.current.difficulty;
            if (
              isIndoorRangeEligible(activeDiff, settingsRef.current.duration) &&
              ic.nextTriggerIdx < ic.triggerTimes.length &&
              ps.elapsedPlaySec >= ic.triggerTimes[ic.nextTriggerIdx]
            ) {
              const triggerIdx = ic.nextTriggerIdx;
              ic.nextTriggerIdx += 1;
              beginIndoorChallenge(triggerIdx, activeDiff);
            }

            const activeModeId: TrainingModeId = settingsRef.current.trainingMode ?? 1;
            const modeCfg = TRAINING_MODES[activeModeId] || TRAINING_MODES[1];

            // Auxiliary arrow key rotation ONLY in Stationary modes (MODE 1 & 2); in MODE 3 & 4 Arrow keys move the player
            const keys = inputStateRef.current.keys;
            if (!modeCfg.allowMovement) {
              const arrowRotSpeed = THREE.MathUtils.degToRad(90);
              if (keys.ArrowLeft) ps.yaw += arrowRotSpeed * dt;
              if (keys.ArrowRight) ps.yaw -= arrowRotSpeed * dt;
              if (keys.ArrowUp) ps.pitch += arrowRotSpeed * dt;
              if (keys.ArrowDown) ps.pitch -= arrowRotSpeed * dt;
            }
            ps.yaw = clampPlayerYawForMode(ps.yaw, activeModeId, ps.x, ps.z);
            ps.pitch = THREE.MathUtils.clamp(
              ps.pitch,
              -THREE.MathUtils.degToRad(70),
              THREE.MathUtils.degToRad(70),
            );

            const allEnvColliders = [
              ...baseCollidersRef.current,
              ...manager.staticLevelColliders,
            ];

            // Section 3: Player Movement & Jump Physics Rule (MODE 1 & 2 Stationary vs MODE 3 & 4 Free Movement + Jump)
            if (modeCfg.allowMovement) {
              const kbVec = modeCfg.wasdEnabled
                ? computeKeyboardMoveVector(keys)
                : { forward: 0, right: 0 };
              const joyVec = modeCfg.joystickEnabled
                ? computeJoystickMoveVector(
                    inputStateRef.current.joyDx,
                    inputStateRef.current.joyDy,
                    56,
                    0.1,
                  )
                : { forward: 0, right: 0, magnitude: 0 };
              let fwd = kbVec.forward + joyVec.forward;
              let rgt = kbVec.right + joyVec.right;
              const mag = Math.hypot(fwd, rgt);
              if (mag > 1) {
                fwd /= mag;
                rgt /= mag;
              }

              // World-space desired velocity along player yaw (6.0 m/s in the arena, MAP_WALK_SPEED on
              // the larger .glb map; snappy damping)
              const sinY = Math.sin(ps.yaw);
              const cosY = Math.cos(ps.yaw);
              const walkSpeed = glbRuntimeRef.current ? MAP_WALK_SPEED : 6.0;
              const targetVx = (-sinY * fwd + cosY * rgt) * walkSpeed;
              const targetVz = (-cosY * fwd - sinY * rgt) * walkSpeed;

              const dampFactor = 1 - Math.exp(-16 * dt);
              ps.vx += (targetVx - ps.vx) * dampFactor;
              ps.vz += (targetVz - ps.vz) * dampFactor;

              const glbRuntime = glbRuntimeRef.current;
              const resolved = glbRuntime
                ? glbRuntime.resolveHorizontalMove(
                    ps.x,
                    ps.z,
                    ps.vx * dt,
                    ps.vz * dt,
                    ps.feetY,
                    ARENA.playerRadius,
                  )
                : resolvePlayerPosition(
                    ps.x,
                    ps.z,
                    ps.vx * dt,
                    ps.vz * dt,
                    allEnvColliders,
                    ARENA.playerRadius,
                    ps.feetY,
                  );
              ps.x = resolved.x;
              ps.z = resolved.z;

              const supportY = glbRuntime
                ? glbRuntime.getFloorSupportY(ps.x, ps.z, ps.feetY)
                : getFloorHeightAt(ps.x, ps.z, ps.feetY);
              const jumpRequested = Boolean(ps.jumpQueued || keys.Space);
              ps.jumpQueued = false;

              const jumpStep = stepPlayerJumpPhysics({
                feetY: ps.feetY,
                verticalVelocity: ps.verticalVelocity,
                isGrounded: ps.isGrounded,
                supportY,
                jumpRequested,
                allowJump: true,
                dt,
              });
              ps.feetY = jumpStep.feetY;
              ps.verticalVelocity = jumpStep.verticalVelocity;
              ps.isGrounded = jumpStep.isGrounded;
              ps.y = ps.feetY + PLAYER_EYE_HEIGHT;

              // Automatic safe spawn recovery if the player falls below the map (minY - 10 or lower)
              if (
                (glbRuntime && glbRuntime.isBelowVoidThreshold(ps.feetY)) ||
                (!glbRuntime && ps.feetY < -10)
              ) {
                const safeSpawn = glbRuntime?.spawnPoint ?? {
                  x: ARENA.startPos.x,
                  floorY: 0,
                  eyeY: ARENA.startPos.y,
                  z: ARENA.startPos.z,
                  yaw: 0,
                };
                ps.x = safeSpawn.x;
                ps.z = safeSpawn.z;
                ps.feetY = safeSpawn.floorY;
                ps.y = safeSpawn.eyeY;
                ps.vx = 0;
                ps.vz = 0;
                ps.verticalVelocity = 0;
                ps.isGrounded = true;
              }
            } else {
              // Stationary Mode (MODE 1 & MODE 2): Completely fixed position and zero jump
              const safeFloorY = glbRuntimeRef.current
                ? glbRuntimeRef.current.spawnPoint.floorY
                : 0;
              ps.vx = 0;
              ps.vz = 0;
              ps.x = ARENA.startPos.x;
              ps.z = ARENA.startPos.z;
              ps.feetY = safeFloorY;
              ps.verticalVelocity = 0;
              ps.isGrounded = true;
              ps.jumpQueued = false;
              ps.y = ARENA.startPos.y;
            }

            // 360° circular boundary energy wall brightness feedback when player nears perimeter
            const distFromCenter = Math.hypot(ps.x, ps.z);
            const distToCircularWall = Math.max(0, ARENA.playRadius - distFromCenter);
            const inHeavenLoop = isInsideHeavenLoopFootprint(ps.x, ps.z, ARENA.playerRadius);
            for (const bw of builtWorld.animated.boundaryWalls) {
              (bw.material as THREE.MeshBasicMaterial).opacity =
                !inHeavenLoop && distToCircularWall < 2.2 ? 0.32 : 0.08;
            }

            camera.position.set(ps.x, ps.y, ps.z);
            camera.rotation.set(ps.pitch, ps.yaw, 0);
            camera.updateMatrixWorld();

            // Update Frustum & Targets
            projScreenMatrix.multiplyMatrices(
              camera.projectionMatrix,
              camera.matrixWorldInverse,
            );
            frustum.setFromProjectionMatrix(projScreenMatrix);

            manager.updateTargets({
              dt,
              difficulty: settingsRef.current.difficulty,
              trainingMode: activeModeId,
              spawnFrequencyMul: settingsRef.current.spawnFrequencyMul,
              aimAssistMul: getCurrentAimAssistMul(),
              camera,
              frustum,
              onSpawnRecorded: handleSpawnNotification,
              onTargetTimeout: (tId) => recorderRef.current.recordTargetTimeout(tId),
            });

            // (Type G mission targets use 3D red corner brackets only — no 2D HUD chip/banner)

            // 3. Evaluate Offscreen Target Direction Hint (Stage 0 -> Stage 1 -> Stage 5)
            if (settingsRef.current.directionHintEnabled) {
              const unseenCandidates = manager.activeTargets.filter(
                (t) => !t.hit && !t.dying && t.isMissionCorrect && t.unseenDurationSec > 0,
              );
              if (unseenCandidates.length > 0) {
                unseenCandidates.sort((a, b) => b.unseenDurationSec - a.unseenDurationSec);
                const focusTarget = unseenCandidates[0];
                const tPos = focusTarget.visual.root.position;
                const hintCalc = computeTargetDirectionHint({
                  playerX: ps.x,
                  playerY: ps.y,
                  playerZ: ps.z,
                  playerYawRad: ps.yaw,
                  playerPitchRad: ps.pitch,
                  targetX: tPos.x,
                  targetY: tPos.y,
                  targetZ: tPos.z,
                  unseenDurationSec: focusTarget.unseenDurationSec,
                  hintDelaySec: settingsRef.current.directionHintDelaySec,
                });

                if (hintCalc.stage >= 1) {
                  if (!focusTarget.hintCounted) {
                    focusTarget.hintCounted = true;
                    recorderRef.current.recordDirectionHintShown();
                  }
                  setDirectionHintUi({
                    ...hintCalc,
                    targetColor: focusTarget.visualColor,
                  });
                } else {
                  setDirectionHintUi(null);
                }
              } else {
                setDirectionHintUi(null);
              }
            } else {
              setDirectionHintUi(null);
            }

            // Update Obstacles & Threat/Dodge/Collision Logic (Active ONLY in MODE 3 & MODE 4 where allowObstacleAvoidance is true)
            if (ps.invincibleTimer > 0) {
              ps.invincibleTimer = Math.max(0, ps.invincibleTimer - dt);
              if (ps.invincibleTimer <= 0) setInvincibleEdge(false);
            }

            const diffCfg = DIFFICULTY_CONFIG[settingsRef.current.difficulty];
            const effectiveObsCfg = modeCfg.allowObstacleAvoidance
              ? (diffCfg.obstacle ?? { interval: 13, speed: 1.5, kinds: [1], maxAtOnce: 1 })
              : null;

            if (effectiveObsCfg) {
              ps.obstacleSpawnTimer -= dt;
              const movingKinds = effectiveObsCfg.kinds.filter((k) => k !== 5);
              if (
                ps.obstacleSpawnTimer <= 0 &&
                movingKinds.length > 0 &&
                manager.activeObstacles.length < effectiveObsCfg.maxAtOnce
              ) {
                const chosenKind =
                  movingKinds[Math.floor(Math.random() * movingKinds.length)];
                const obs = spawnMovingObstacle({
                  scene,
                  obstacleId: ps.nextObstacleId++,
                  kind: chosenKind,
                  speed: effectiveObsCfg.speed,
                  difficulty: settingsRef.current.difficulty,
                  playerX: ps.x,
                  playerZ: ps.z,
                  lowQuality: lowQ,
                });
                manager.activeObstacles.push(obs);
                ps.obstacleSpawnTimer = effectiveObsCfg.interval;
              }
            }

            const obsToRemove = [];
            for (const obs of manager.activeObstacles) {
              obs.age += dt;
              if (obs.kind === 1) {
                obs.x += obs.dirX * obs.speed * dt;
                obs.mesh.position.x = obs.x;
                if (Math.abs(obs.x) > 13.0) obs.phase = 'done';
              } else if (obs.kind === 2 || obs.kind === 4) {
                obs.z += obs.speed * dt;
                obs.mesh.position.z = obs.z;
                if (obs.z > 16.5) obs.phase = 'done';
              } else if (obs.kind === 3) {
                if (obs.age < 0.8) {
                  obs.phase = 'warning';
                  if (obs.warningMesh) {
                    (obs.warningMesh.material as THREE.MeshBasicMaterial).opacity =
                      0.15 + (obs.age / 0.8) * 0.55;
                  }
                } else if (obs.age < 2.6) {
                  obs.phase = 'active';
                  obs.y = Math.min(0, -0.95 + ((obs.age - 0.8) / 0.25) * 0.95);
                  obs.mesh.position.y = obs.y;
                } else if (obs.age < 3.0) {
                  obs.phase = 'warning';
                  obs.y = -((obs.age - 2.6) / 0.4) * 0.95;
                  obs.mesh.position.y = obs.y;
                } else {
                  obs.phase = 'done';
                }
              }

              const obsCols = getObstacleColliders(obs);
              for (const oc of obsCols) {
                // Moving ground obstacles only hit the player near ground level (feetY <= 1.55m)
                if (ps.feetY > 1.55) continue;
                const surfDist = distanceToColliderSurface(ps.x, ps.z, oc);
                if (surfDist <= 2.5) {
                  obs.enteredThreatZone = true;
                }
                if (checkOverlap(ps.x, ps.z, ARENA.playerRadius, oc)) {
                  obs.collidedWithPlayer = true;
                  if (ps.invincibleTimer <= 0) {
                    ps.invincibleTimer = 1.5;
                    recorderRef.current.recordObstacleCollision();
                    soundEngine.playObstacleBump();
                    // Push player back 0.3m gently within circular bounds
                    const pushed = resolvePlayerPosition(
                      ps.x,
                      ps.z,
                      0,
                      0.3,
                      allEnvColliders,
                      ARENA.playerRadius,
                      ps.feetY,
                    );
                    ps.x = pushed.x;
                    ps.z = pushed.z;
                    ps.energy = settingsRef.current.continueAtZeroEnergy
                      ? Math.max(1, ps.energy - 10)
                      : Math.max(0, ps.energy - 10);
                    setHudEnergy(ps.energy);
                    setBumpVignette(true);
                    setInvincibleEdge(true);
                    window.setTimeout(() => setBumpVignette(false), 300);

                    if (ps.energy <= 0 && !settingsRef.current.continueAtZeroEnergy) {
                      finishGameSession();
                    }
                  }
                }
              }

              if (
                (obs.kind === 2 || obs.kind === 4) &&
                obs.z > ps.z + 1.2 &&
                obs.enteredThreatZone &&
                !obs.collidedWithPlayer
              ) {
                recorderRef.current.recordObstacleDodge();
                obs.enteredThreatZone = false;
              }

              if (obs.phase === 'done') {
                if (obs.enteredThreatZone && !obs.collidedWithPlayer) {
                  recorderRef.current.recordObstacleDodge();
                }
                obsToRemove.push(obs);
              }
            }

            for (const rem of obsToRemove) {
              scene.remove(rem.mesh);
              if (rem.warningMesh) scene.remove(rem.warningMesh);
              const idx = manager.activeObstacles.indexOf(rem);
              if (idx >= 0) manager.activeObstacles.splice(idx, 1);
            }

            // Update Valorant-style rotating top-down Minimap state (filter out 2F-only colliders & outside keepBox)
            const kb = glbRuntimeRef.current?.keepBox;
            const radarKeepBox =
              kb && !kb.isEmpty()
                ? { minX: kb.min.x, maxX: kb.max.x, minZ: kb.min.z, maxZ: kb.max.z }
                : undefined;
            const staticBoxes: Array<{ id: string; x: number; z: number; w: number; d: number }> = [];
            const combinedColliders = [...baseCollidersRef.current, ...manager.staticLevelColliders];
            for (const col of combinedColliders) {
              if (col.kind === 'aabb') {
                if ((col.minY ?? 0) >= 2.5) continue;
                if (
                  radarKeepBox &&
                  (col.maxX < radarKeepBox.minX ||
                    col.minX > radarKeepBox.maxX ||
                    col.maxZ < radarKeepBox.minZ ||
                    col.minZ > radarKeepBox.maxZ)
                ) {
                  continue;
                }
                staticBoxes.push({
                  id: col.id,
                  x: col.minX,
                  z: col.minZ,
                  w: col.maxX - col.minX,
                  d: col.maxZ - col.minZ,
                });
              }
            }
            const radarTargets = manager.activeTargets
              .filter((t) => !t.hit && !t.dying)
              .map((t) => {
                let kind: 'regular' | 'laser' | 'mission' = 'regular';
                let color = '#F5B749';
                if (t.typeId === 'H') {
                  kind = 'laser';
                  color = '#22D3EE';
                } else if (t.typeId === 'G' && t.isMissionCorrect) {
                  const bracketState = computeMissionBracketVisualState(t.difficulty, t.age);
                  if (bracketState.visible && bracketState.opacity > 0.08) {
                    kind = 'mission';
                    color = '#FF3648';
                  }
                }
                return {
                  id: t.instanceId,
                  wx: t.visual.root.position.x,
                  wz: t.visual.root.position.z,
                  kind,
                  color,
                };
              })
              .sort((a, b) => {
                const order = { regular: 0, mission: 1, laser: 2 };
                return order[a.kind] - order[b.kind];
              });
            const radarObstacles = manager.activeObstacles.map((o) => ({
              id: o.obstacleId,
              wx: o.x,
              wz: o.z,
            }));
            setHudRadarState({
              playerX: ps.x,
              playerZ: ps.z,
              yawRad: ps.yaw,
              keepBox: radarKeepBox,
              staticBoxes,
              targets: radarTargets,
              obstacles: radarObstacles,
            });

            // Continuous Laser Beam hold-drag check while holding click/tap on a Type H target
            if (inputStateRef.current.laserDragTargetId) {
              const useCrosshairLock = Boolean(document.pointerLockElement);
              const dragNdcX = useCrosshairLock ? 0 : inputStateRef.current.laserDragNdcX;
              const dragNdcY = useCrosshairLock ? 0 : inputStateRef.current.laserDragNdcY;
              handleLaserTrackDragStepRef.current(dragNdcX, dragNdcY, false);
            }
            }
          }
        }

        if (composer) {
          composer.render();
        } else {
          renderer.render(scene, camera);
        }

        // First-person viewmodel overlay pass: clears depth to prevent wall clipping
        // while preserving accurate 3D self-occlusion and matching scene lighting.
        if (weaponRigRef.current) {
          const prevAutoClear = renderer.autoClear;
          const prevBg = scene.background;
          const prevFog = scene.fog;
          const prevNear = camera.near;
          renderer.autoClear = false;
          scene.background = null;
          scene.fog = null;
          camera.near = 0.03;
          camera.updateProjectionMatrix();
          camera.layers.set(VIEWMODEL_LAYER);
          renderer.clearDepth();
          renderer.render(scene, camera);
          camera.layers.set(0);
          camera.near = prevNear;
          camera.updateProjectionMatrix();
          scene.background = prevBg;
          scene.fog = prevFog;
          renderer.autoClear = prevAutoClear;
        }

        if (isSoftwareGl) {
          const gl = renderer.getContext() as WebGL2RenderingContext;
          const sync = gl.fenceSync ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
          gl.flush();
          if (sync) {
            const poll = () => {
              const st = gl.getSyncParameter(sync, gl.SYNC_STATUS);
              if (st === gl.UNSIGNALED) {
                frameId = window.setTimeout(poll, 5);
              } else {
                gl.deleteSync(sync);
                frameId = window.setTimeout(stepFrame, 80);
              }
            };
            frameId = window.setTimeout(poll, 5);
          } else {
            frameId = window.setTimeout(stepFrame, 80);
          }
        } else {
          frameId = window.requestAnimationFrame(stepFrame);
        }
      };

      frameId = window.requestAnimationFrame(stepFrame);

      return () => {
        isEffectDisposed = true;
        glbRuntimeRef.current = null;
        window.cancelAnimationFrame(frameId);
        window.clearTimeout(frameId);
        window.clearTimeout(orientResizeTimer);
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('orientationchange', handleOrientationChange);
        window.visualViewport?.removeEventListener('resize', handleResize);
        weaponRigRef.current?.dispose();
        weaponRigRef.current = null;
        if (composer) {
          composer.dispose();
        }
        if (envRenderTarget) {
          envRenderTarget.dispose();
        }
        renderer.dispose();
      };
    } catch {
      setThreeLoadError(true);
      return;
    }
  }, []);

  // Keyboard, Pointer Lock, Context Menu, Audio Unlock & Focus Listeners
  useEffect(() => {
    const resolveKeyCode = (e: KeyboardEvent): string => {
      if (e.code && e.code !== 'Unidentified' && e.code !== 'Process') return e.code;
      const k = e.key?.toLowerCase();
      if (k === 'w' || k === 'ㅈ' || k === 'ㅉ') return 'KeyW';
      if (k === 'a' || k === 'ㅁ') return 'KeyA';
      if (k === 's' || k === 'ㄴ') return 'KeyS';
      if (k === 'd' || k === 'ㅇ') return 'KeyD';
      if (k === 'r' || k === 'ㄱ') return 'KeyR';
      if (k === 'b' || k === 'ㅠ') return 'KeyB';
      if (k === 'v' || k === 'ㅍ') return 'KeyV';
      if (k === 'p' || k === 'ㅔ') return 'KeyP';
      return e.code || '';
    };

    const handleFirstUserAudioUnlock = () => {
      unlockWeaponAudio();
      soundEngine.initOrResume();
    };

    const preventContextMenu = (e: Event) => {
      e.preventDefault();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      unlockWeaponAudio();
      const code = resolveKeyCode(e);
      if (weaponModalOpenRef.current) {
        if (code === 'Escape' || code === 'KeyB' || e.key === 'ㅠ') {
          e.preventDefault();
          closeWeaponModal();
        }
        return;
      }
      if (code) inputStateRef.current.keys[code] = true;
      const k = e.key?.toLowerCase();
      if (k === 'w' || k === 'ㅈ' || k === 'ㅉ') inputStateRef.current.keys.KeyW = true;
      if (k === 'a' || k === 'ㅁ') inputStateRef.current.keys.KeyA = true;
      if (k === 's' || k === 'ㄴ') inputStateRef.current.keys.KeyS = true;
      if (k === 'd' || k === 'ㅇ') inputStateRef.current.keys.KeyD = true;

      if (phaseRef.current === 'MENU' && (code === 'Enter' || code === 'Space')) {
        if (!showSettingsModal && !guideModalTab && !showHistoryModal && !selfCheckItems) {
          e.preventDefault();
          startTrainingSession();
        }
      } else if (phaseRef.current === 'PLAYING' && (code === 'Space' || e.key === ' ')) {
        const modeCfg =
          TRAINING_MODES[settingsRef.current.trainingMode ?? 1] || TRAINING_MODES[1];
        if (modeCfg.allowMovement && indoorChallengeRef.current.phase === 'NONE') {
          e.preventDefault();
          inputStateRef.current.keys.Space = true;
          playerStateRef.current.jumpQueued = true;
        }
      } else if (phaseRef.current === 'PLAYING' && (code === 'KeyR' || e.key === 'ㄱ')) {
        isAdsHeldRef.current = false;
        weaponRigRef.current?.reload();
      } else if (phaseRef.current === 'PLAYING' && (code === 'KeyB' || e.key === 'ㅠ')) {
        e.preventDefault();
        openWeaponModal();
      } else if (phaseRef.current === 'PLAYING' && (code === 'KeyV' || e.key === 'ㅍ')) {
        e.preventDefault();
        weaponRigRef.current?.toggleRifleFireMode();
      } else if (phaseRef.current === 'PLAYING' && (code === 'KeyP' || code === 'Escape')) {
        releaseWeaponTrigger();
        releaseWeaponAds();
        setPhase('PAUSED');
        soundEngine.setBgmPaused(true);
        if (document.pointerLockElement) {
          try {
            document.exitPointerLock();
          } catch {
            // ignore
          }
        }
      } else if (phaseRef.current === 'PAUSED' && code === 'KeyP') {
        setPhase('PLAYING');
        soundEngine.setBgmPaused(false);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const code = resolveKeyCode(e);
      if (code) inputStateRef.current.keys[code] = false;
      if (code === 'Space' || e.key === ' ') inputStateRef.current.keys.Space = false;
      const k = e.key?.toLowerCase();
      if (k === 'w' || k === 'ㅈ' || k === 'ㅉ') inputStateRef.current.keys.KeyW = false;
      if (k === 'a' || k === 'ㅁ') inputStateRef.current.keys.KeyA = false;
      if (k === 's' || k === 'ㄴ') inputStateRef.current.keys.KeyS = false;
      if (k === 'd' || k === 'ㅇ') inputStateRef.current.keys.KeyD = false;
    };

    const onPointerLockChange = () => {
      if (!document.pointerLockElement && phaseRef.current === 'PLAYING' && !dragModeBanner) {
        releaseWeaponTrigger();
        releaseWeaponAds();
        setPhase('PAUSED');
        soundEngine.setBgmPaused(true);
      }
    };

    const onPointerLockError = () => {
      setDragModeBanner(true);
    };

    let lastMouseX: number | null = null;
    let lastMouseY: number | null = null;

    const onMouseMove = (e: MouseEvent) => {
      if (phaseRef.current !== 'PLAYING') {
        lastMouseX = null;
        lastMouseY = null;
        return;
      }
      const isLocked = Boolean(document.pointerLockElement);
      if (!isLocked && !inputStateRef.current.rightMouseDown) {
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        return;
      }

      const moveX =
        e.movementX !== 0
          ? e.movementX
          : lastMouseX !== null
            ? e.clientX - lastMouseX
            : 0;
      const moveY =
        e.movementY !== 0
          ? e.movementY
          : lastMouseY !== null
            ? e.clientY - lastMouseY
            : 0;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;

      if (Math.abs(moveX) > 180 || Math.abs(moveY) > 180) return;
      weaponMouseDeltaRef.current.x += moveX;
      weaponMouseDeltaRef.current.y += moveY;

      const sens = 0.0028 * settingsRef.current.mouseSensitivity;
      const nextYaw = playerStateRef.current.yaw - moveX * sens;
      playerStateRef.current.yaw = clampPlayerYawForMode(
        nextYaw,
        settingsRef.current.trainingMode ?? 1,
        playerStateRef.current.x,
        playerStateRef.current.z,
      );
      playerStateRef.current.pitch = THREE.MathUtils.clamp(
        playerStateRef.current.pitch - moveY * sens,
        -THREE.MathUtils.degToRad(70),
        THREE.MathUtils.degToRad(70),
      );
    };

    const onVisibilityChange = () => {
      inputStateRef.current.keys = {};
      inputStateRef.current.leftMouseDown = false;
      inputStateRef.current.rightMouseDown = false;
      releaseWeaponTrigger();
      releaseWeaponAds();
      if (document.hidden && phaseRef.current === 'PLAYING') {
        setPhase('PAUSED');
        soundEngine.setBgmPaused(true);
      }
    };

    // Decoupled global mouseup: releasing LMB never cancels ADS, and releasing RMB never interrupts LMB fire
    const onWindowMouseUp = (e: MouseEvent) => {
      if (e.button === 0) {
        inputStateRef.current.leftMouseDown = false;
        releaseWeaponTrigger();
      } else if (e.button === 2) {
        inputStateRef.current.rightMouseDown = false;
        releaseWeaponAds();
      }
    };

    const onWindowBlur = () => {
      inputStateRef.current.keys = {};
      inputStateRef.current.leftMouseDown = false;
      inputStateRef.current.rightMouseDown = false;
      releaseWeaponTrigger();
      releaseWeaponAds();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    document.addEventListener('pointerlockerror', onPointerLockError);
    window.addEventListener('mousemove', onMouseMove);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('mouseup', onWindowMouseUp);
    window.addEventListener('blur', onWindowBlur);
    document.addEventListener('contextmenu', preventContextMenu);
    window.addEventListener('pointerdown', handleFirstUserAudioUnlock, { passive: true });
    window.addEventListener('touchstart', handleFirstUserAudioUnlock, { passive: true });

    const preventGesture = (e: Event) => e.preventDefault();
    document.addEventListener('gesturestart', preventGesture);
    document.addEventListener('gesturechange', preventGesture);
    document.addEventListener('gestureend', preventGesture);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      document.removeEventListener('pointerlockerror', onPointerLockError);
      window.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('mouseup', onWindowMouseUp);
      window.removeEventListener('blur', onWindowBlur);
      document.removeEventListener('contextmenu', preventContextMenu);
      window.removeEventListener('pointerdown', handleFirstUserAudioUnlock);
      window.removeEventListener('touchstart', handleFirstUserAudioUnlock);
      document.removeEventListener('gesturestart', preventGesture);
      document.removeEventListener('gesturechange', preventGesture);
      document.removeEventListener('gestureend', preventGesture);
    };
  }, [dragModeBanner, guideModalTab, selfCheckItems, showHistoryModal, showSettingsModal]);

  const requestArenaPointerLock = () => {
    if (isTabletRef.current) return;
    const canvas = mountRef.current?.querySelector('canvas');
    if (!canvas || !canvas.requestPointerLock) {
      setDragModeBanner(true);
      return;
    }
    try {
      const promise = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      if (promise && typeof promise.catch === 'function') {
        promise.catch(() => {
          setDragModeBanner(true);
        });
      }
    } catch {
      setDragModeBanner(true);
    }
  };

  // ---- Weapon helpers (in-game weapon modal & decoupled fire / Hold-to-ADS) -------
  const releaseWeaponTrigger = () => {
    isFireHeldRef.current = false;
    weaponRigRef.current?.setFiring(false);
  };

  const releaseWeaponAds = () => {
    isAdsHeldRef.current = false;
    weaponRigRef.current?.setAds(false);
  };

  const openWeaponModal = () => {
    if (phaseRef.current !== 'PLAYING') return;
    unlockWeaponAudio();
    releaseWeaponTrigger();
    releaseWeaponAds();
    inputStateRef.current.keys = {};
    inputStateRef.current.leftMouseDown = false;
    inputStateRef.current.rightMouseDown = false;
    inputStateRef.current.joyPointerId = null;
    inputStateRef.current.joyDx = 0;
    inputStateRef.current.joyDy = 0;
    inputStateRef.current.lookPointerId = null;
    inputStateRef.current.fireLookPointerId = null;
    setJoystickUi((prev) => (prev.active ? { ...prev, active: false, knobX: 0, knobY: 0 } : prev));
    weaponModalOpenRef.current = true;
    setIsWeaponModalOpen(true);
    phaseRef.current = 'PAUSED';
    setPhase('PAUSED');
    soundEngine.setBgmPaused(true);
    if (document.pointerLockElement) {
      try {
        document.exitPointerLock();
      } catch {
        // ignore
      }
    }
  };

  const closeWeaponModal = () => {
    const shouldResume = weaponModalOpenRef.current && phaseRef.current === 'PAUSED';
    weaponModalOpenRef.current = false;
    setIsWeaponModalOpen(false);
    if (shouldResume) {
      phaseRef.current = 'PLAYING';
      setPhase('PLAYING');
      soundEngine.setBgmPaused(false);
      requestArenaPointerLock();
    }
  };

  const handleWeaponSelect = (id: WeaponId) => {
    unlockWeaponAudio();
    releaseWeaponAds();
    weaponRigRef.current?.equip(id, true);
    closeWeaponModal();
  };

  // Start or Restart Training Session
  const startTrainingSession = (
    difficultyOverride?: number,
    skipCountdown = false,
    modeOverride?: TrainingModeId,
  ) => {
    if (mapLoadingRef.current) {
      pendingStartRef.current = {
        difficultyOverride,
        skipCountdown,
        modeOverride,
      };
      return;
    }

    const activeDiff = difficultyOverride ?? settingsRef.current.difficulty;
    const activeMode: TrainingModeId = modeOverride ?? settingsRef.current.trainingMode ?? 1;
    if (
      (difficultyOverride && difficultyOverride !== settingsRef.current.difficulty) ||
      (modeOverride && modeOverride !== settingsRef.current.trainingMode)
    ) {
      updateSettings({ difficulty: activeDiff, trainingMode: activeMode });
    }

    soundEngine.initOrResume();
    soundEngine.syncSettings({
      sfxEnabled: settingsRef.current.sfxEnabled,
      sfxVolume: settingsRef.current.sfxVolume,
      bgmEnabled: settingsRef.current.bgmEnabled,
    });
    setShowSettingsModal(false);
    setGuideModalTab(null);
    setShowHistoryModal(false);
    setInspectRecord(null);
    setConfirmExitMenu(false);

    // Reset Indoor Shooting Range Sudden Challenge scheduler & visuals
    worldRef.current?.setIndoorRangeActive(false);
    indoorChallengeRef.current.phase = 'NONE';
    indoorChallengeRef.current.phaseTimer = 0;
    indoorChallengeRef.current.nextTriggerIdx = 0;
    indoorChallengeRef.current.repeatCount = 0;
    indoorChallengeRef.current.triggerTimes = computeIndoorRangeTriggerTimes(
      settingsRef.current.duration,
      activeDiff,
    );
    syncIndoorOverlayUi(0, null, false);

    // Reset Player & Recorder to the auto-computed .glb map spawn point
    const ps = playerStateRef.current;
    const spawnInfo = glbRuntimeRef.current?.spawnPoint;
    ps.x = spawnInfo ? spawnInfo.x : ARENA.startPos.x;
    ps.y = spawnInfo ? spawnInfo.eyeY : ARENA.startPos.y;
    ps.z = spawnInfo ? spawnInfo.z : ARENA.startPos.z;
    ps.feetY = spawnInfo ? spawnInfo.floorY : 0;
    ps.verticalVelocity = 0;
    ps.isGrounded = true;
    ps.jumpQueued = false;
    ps.vx = 0;
    ps.vz = 0;
    ps.yaw = spawnInfo ? spawnInfo.yaw : 0;
    ps.pitch = 0;
    ps.energy = 100;
    ps.invincibleTimer = 0;
    ps.lastShotTimeSec = -10;
    ps.lastShotPerfSec = -10;
    ps.elapsedPlaySec = 0;
    ps.obstacleSpawnTimer = 2.5;

    if (cameraRef.current) {
      cameraRef.current.position.set(ps.x, ps.y, ps.z);
      cameraRef.current.rotation.set(0, ps.yaw, 0);
    }

    recorderRef.current = new SessionRecorder(
      activeDiff,
      settingsRef.current.duration,
      activeMode,
    );
    setHudScore(0);
    setHudCombo(0);
    setHudEnergy(100);
    setHudTimeLeft(settingsRef.current.duration);
    setPopups([]);
    setDirectionHintUi(null);
    setInvincibleEdge(false);
    setJoystickUi({ active: false, baseX: 110, baseY: 0, knobX: 0, knobY: 0 });

    const effectiveAimAssist = getEffectiveAimAssistMul(
      settingsRef.current.aimAssistMul,
      activeDiff,
      !settingsRef.current.tabletDirectTouchHit,
    );

    if (managerRef.current) {
      managerRef.current.clearAll();
      managerRef.current.setupLevelStaticObstacles(activeDiff, activeMode);
      // Spawn initial target directly in front of the player's newly computed spawn position
      const firstTypes = DIFFICULTY_CONFIG[activeDiff].types;
      const initialType = firstTypes[0] || 'A';
      managerRef.current.spawnSingleTarget({
        typeId: initialType,
        difficulty: activeDiff,
        trainingMode: activeMode,
        playerX: ps.x,
        playerZ: ps.z,
        aimAssistMul: effectiveAimAssist,
        onSpawnRecorded: handleSpawnNotification,
        overridePos: {
          x: ps.x - Math.sin(ps.yaw) * 8.5,
          y: ps.feetY + 1.65,
          z: ps.z - Math.cos(ps.yaw) * 8.5,
          sector: 'FRONT',
        },
      });
    }

    requestArenaPointerLock();

    if (skipCountdown) {
      setPhase('PLAYING');
      soundEngine.startBgm();
      return;
    }

    setPhase('COUNTDOWN');
    setCountdownText('3');
    soundEngine.playCountdownBeep(false);

    window.setTimeout(() => {
      if (phaseRef.current !== 'COUNTDOWN') return;
      setCountdownText('2');
      soundEngine.playCountdownBeep(false);
    }, 850);

    window.setTimeout(() => {
      if (phaseRef.current !== 'COUNTDOWN') return;
      setCountdownText('1');
      soundEngine.playCountdownBeep(false);
    }, 1700);

    window.setTimeout(() => {
      if (phaseRef.current !== 'COUNTDOWN') return;
      setCountdownText('START!');
      soundEngine.playCountdownBeep(true);
    }, 2550);

    window.setTimeout(() => {
      if (phaseRef.current !== 'COUNTDOWN') return;
      setPhase('PLAYING');
      soundEngine.startBgm();
    }, 3150);
  };
  startGameFnRef.current = startTrainingSession;

  // Support ?autostart=1 and #debug on initial load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1') {
      startTrainingSession(undefined, true);
    }
    if (window.location.hash === '#debug') {
      const res = runAllSelfChecks(rendererReadyRef.current, baseCollidersRef.current);
      setSelfCheckItems(res);
    }
  }, []);

  const returnToMainMenu = () => {
    weaponModalOpenRef.current = false;
    setIsWeaponModalOpen(false);
    releaseWeaponTrigger();
    releaseWeaponAds();
    soundEngine.stopBgm();
    worldRef.current?.setIndoorRangeActive(false);
    indoorChallengeRef.current.phase = 'NONE';
    syncIndoorOverlayUi(0, null, false);
    if (document.pointerLockElement) {
      try {
        document.exitPointerLock();
      } catch {
        // ignore
      }
    }
    setConfirmExitMenu(false);
    setShowSettingsModal(false);
    setDirectionHintUi(null);
    if (managerRef.current) {
      const effectiveAimAssist = getEffectiveAimAssistMul(
        settingsRef.current.aimAssistMul,
        settingsRef.current.difficulty,
        !settingsRef.current.tabletDirectTouchHit,
      );
      managerRef.current.populateMenuDemoTargets(effectiveAimAssist);
    }
    setPhase('MENU');
  };

  // Turn the view by a touch drag (look finger or the finger holding the fire button)
  const applyTouchLookDelta = (mx: number, my: number) => {
    if (Math.abs(mx) >= 150 || Math.abs(my) >= 150) return;
    const sens = 0.0035 * settingsRef.current.touchSensitivity;
    const nextYaw = playerStateRef.current.yaw - mx * sens;
    playerStateRef.current.yaw = clampPlayerYawForMode(
      nextYaw,
      settingsRef.current.trainingMode ?? 1,
      playerStateRef.current.x,
      playerStateRef.current.z,
    );
    playerStateRef.current.pitch = THREE.MathUtils.clamp(
      playerStateRef.current.pitch - my * sens,
      -THREE.MathUtils.degToRad(70),
      THREE.MathUtils.degToRad(70),
    );
  };

  // PC: start firing with the left mouse button (decoupled from right-click ADS)
  const beginMouseFire = (ndcX: number, ndcY: number) => {
    unlockWeaponAudio();
    inputStateRef.current.leftMouseDown = true;
    isFireHeldRef.current = true;
    if (!document.pointerLockElement && !dragModeBanner) {
      requestArenaPointerLock();
    }
    if (weaponRigRef.current) {
      // hold to fire (AUTO) or single shot per press (SEMI)
      weaponRigRef.current.setFiring(true);
    } else {
      shootFnRef.current({
        ndcX: document.pointerLockElement ? 0 : ndcX,
        ndcY: document.pointerLockElement ? 0 : ndcY,
      });
    }
  };

  // PC: Hold-to-ADS with the right mouse button (decoupled from left-click fire)
  const beginMouseAds = () => {
    unlockWeaponAudio();
    inputStateRef.current.rightMouseDown = true;
    isAdsHeldRef.current = true;
    weaponRigRef.current?.setAds(true);
  };

  // PC: chorded mouse button presses with zero mouse movement (e.g. holding RMB then tapping LMB)
  const handlePlayfieldMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (phaseRef.current !== 'PLAYING' || isTabletActive) return;
    if (e.button === 0 && !isFireHeldRef.current && isAdsHeldRef.current) {
      const rect = e.currentTarget.getBoundingClientRect();
      const ndcX = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
      const ndcY = -(((e.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1);
      beginMouseFire(ndcX, ndcY);
    } else if (e.button === 2 && !isAdsHeldRef.current && isFireHeldRef.current) {
      beginMouseAds();
    }
  };

  // PC: a second mouse button pressed or released while another is held ("chord") arrives as a
  // pointermove, not pointerdown/pointerup. Keep LMB fire and RMB Hold-to-ADS completely independent.
  const syncChordedMouseButtons = (e: React.PointerEvent<HTMLDivElement>, ndcX: number, ndcY: number) => {
    if (e.pointerType !== 'mouse' || isTabletActive) return;
    const st = inputStateRef.current;
    const leftHeld = (e.buttons & 1) !== 0;
    const rightHeld = (e.buttons & 2) !== 0;
    if (leftHeld && !isFireHeldRef.current && (isAdsHeldRef.current || st.rightMouseDown) && !st.laserDragTargetId) {
      beginMouseFire(ndcX, ndcY);
    } else if (!leftHeld && (isFireHeldRef.current || st.leftMouseDown)) {
      st.leftMouseDown = false;
      releaseWeaponTrigger();
      if (st.laserDragTargetId) releaseLaserTrackDragRef.current();
    }
    if (rightHeld && !isAdsHeldRef.current && (isFireHeldRef.current || st.leftMouseDown)) {
      beginMouseAds();
    } else if (!rightHeld && (isAdsHeldRef.current || st.rightMouseDown)) {
      st.rightMouseDown = false;
      releaseWeaponAds();
    }
  };

  // Multi-Touch & Pointer Handlers on Playfield Overlay (Sections 4.1, 4.2 & Follow-up [4] Direct Touch Hit + Type H Hold-Drag)
  const handlePlayfieldPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    unlockWeaponAudio();
    if (e.pointerType === 'touch' && settings.controlMode === 'auto' && !detectedTablet) {
      setDetectedTablet(true);
    }
    if (phaseRef.current !== 'PLAYING') return;

    const rect = e.currentTarget.getBoundingClientRect();
    const ndcX = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    const ndcY = -(((e.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1);
    inputStateRef.current.hoverNdcX = ndcX;
    inputStateRef.current.hoverNdcY = ndcY;
    inputStateRef.current.pointerHovered = true;

    // Check if player pressed down on an active Type H Laser Track target (Click-Hold-Drag or Tap-Hold-Drag)
    const isPrimaryPress = e.pointerType !== 'mouse' || e.button === 0;
    if (isPrimaryPress) {
      const isLocked = Boolean(document.pointerLockElement);
      const startedLaserDrag = handleLaserTrackDragStepRef.current(
        isLocked ? 0 : ndcX,
        isLocked ? 0 : ndcY,
        true,
      );

      if (startedLaserDrag) {
        inputStateRef.current.laserDragPointerId = e.pointerId;
        if (e.pointerType === 'mouse' && e.button === 0) {
          inputStateRef.current.leftMouseDown = true;
        }
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // ignore if synthetic event
        }
        return;
      }
    }

    // PC Mouse Mode: decoupled LMB fire and RMB Hold-to-ADS
    if (e.pointerType === 'mouse' && !isTabletActive) {
      if (e.button === 0) {
        beginMouseFire(ndcX, ndcY);
      } else if (e.button === 2) {
        beginMouseAds();
      }
      return;
    }

    // 4. Tablet / Touch Mode: First check if finger tapped directly on an active 3D target!
    if (
      settingsRef.current.tabletDirectTouchHit &&
      probeDirectTouchTargetRef.current(ndcX, ndcY)
    ) {
      shootFnRef.current({ ndcX, ndcY, isDirectTouch: true });
      return;
    }

    // Otherwise: Joystick zone (left-bottom by default, or right-bottom when tabletSwapControls=true) in MODE 3 & MODE 4
    const w = window.innerWidth;
    const h = window.innerHeight;
    const modeCfg = TRAINING_MODES[settingsRef.current.trainingMode ?? 1] || TRAINING_MODES[1];
    const swapControls = Boolean(settingsRef.current.tabletSwapControls);
    const isJoystickZone =
      modeCfg.joystickEnabled &&
      e.clientY >= h * 0.35 &&
      (swapControls ? e.clientX >= w * 0.58 : e.clientX <= w * 0.42);

    if (isJoystickZone && inputStateRef.current.joyPointerId === null) {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      inputStateRef.current.joyPointerId = e.pointerId;
      const bx = settings.fixedJoystick ? (swapControls ? w - 110 : 110) : e.clientX;
      const by = settings.fixedJoystick ? h - 110 : e.clientY;
      inputStateRef.current.joyBaseX = bx;
      inputStateRef.current.joyBaseY = by;
      inputStateRef.current.joyDx = 0;
      inputStateRef.current.joyDy = 0;
      setJoystickUi({ active: true, baseX: bx, baseY: by, knobX: 0, knobY: 0 });
    } else if (inputStateRef.current.lookPointerId === null) {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      inputStateRef.current.lookPointerId = e.pointerId;
      inputStateRef.current.lookLastX = e.clientX;
      inputStateRef.current.lookLastY = e.clientY;
    }
  };

  const handlePlayfieldPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (phaseRef.current !== 'PLAYING') return;

    const rect = e.currentTarget.getBoundingClientRect();
    const ndcX = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
    const ndcY = -(((e.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1);
    inputStateRef.current.hoverNdcX = ndcX;
    inputStateRef.current.hoverNdcY = ndcY;
    inputStateRef.current.pointerHovered = true;
    const isLocked = Boolean(document.pointerLockElement);
    syncChordedMouseButtons(e, ndcX, ndcY);

    if (!isLocked && cameraRef.current) {
      const depth = 15;
      const halfH = depth * Math.tan(THREE.MathUtils.degToRad(cameraRef.current.fov * 0.5));
      const halfW = halfH * cameraRef.current.aspect;
      playerStateRef.current.aimCamX = ndcX * halfW;
      playerStateRef.current.aimCamY = ndcY * halfH;
      playerStateRef.current.aimCamZ = -depth;
    }

    // If holding click/tap and dragging a Type H Laser Track target
    if (
      inputStateRef.current.laserDragTargetId &&
      (e.pointerId === inputStateRef.current.laserDragPointerId ||
        inputStateRef.current.leftMouseDown)
    ) {
      handleLaserTrackDragStepRef.current(
        isLocked ? 0 : ndcX,
        isLocked ? 0 : ndcY,
        false,
      );
      if (!isLocked) return;
    }

    if (e.pointerId === inputStateRef.current.joyPointerId) {
      const dx = e.clientX - inputStateRef.current.joyBaseX;
      const dy = e.clientY - inputStateRef.current.joyBaseY;
      const maxR = 56;
      const dist = Math.hypot(dx, dy);
      const clampedX = dist > maxR ? (dx / dist) * maxR : dx;
      const clampedY = dist > maxR ? (dy / dist) * maxR : dy;
      inputStateRef.current.joyDx = clampedX;
      inputStateRef.current.joyDy = clampedY;
      setJoystickUi((prev) => ({ ...prev, knobX: clampedX, knobY: clampedY }));
    } else if (e.pointerId === inputStateRef.current.lookPointerId) {
      const mx = e.clientX - inputStateRef.current.lookLastX;
      const my = e.clientY - inputStateRef.current.lookLastY;
      inputStateRef.current.lookLastX = e.clientX;
      inputStateRef.current.lookLastY = e.clientY;
      applyTouchLookDelta(mx, my);
    }
  };

  const handlePlayfieldPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button === 0) {
      inputStateRef.current.leftMouseDown = false;
      // lostpointercapture can fire while the button is still held: only a real release stops fire
      if (e.type !== 'lostpointercapture') releaseWeaponTrigger();
    }
    if (e.pointerType === 'mouse' && e.button === 2) {
      inputStateRef.current.rightMouseDown = false;
      if (e.type !== 'lostpointercapture') releaseWeaponAds();
    }
    if (
      e.pointerId === inputStateRef.current.laserDragPointerId ||
      (e.pointerType === 'mouse' && e.button === 0 && inputStateRef.current.laserDragTargetId)
    ) {
      releaseLaserTrackDragRef.current();
    }
    if (e.pointerId === inputStateRef.current.joyPointerId) {
      inputStateRef.current.joyPointerId = null;
      inputStateRef.current.joyDx = 0;
      inputStateRef.current.joyDy = 0;
      setJoystickUi((prev) => ({ ...prev, active: false, knobX: 0, knobY: 0 }));
    }
    if (e.pointerId === inputStateRef.current.lookPointerId) {
      inputStateRef.current.lookPointerId = null;
    }
  };

  const formatMmSs = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  if (threeLoadError) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-purple-950 text-white p-6 text-center font-bold text-lg">
        Three.js를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.
      </div>
    );
  }

  const timeProgressRatio = Math.max(0, Math.min(1, hudTimeLeft / settings.duration));
  const uiScaleRatio = settings.uiScale / 100;
  const isCompactHud = viewport.isCompactPortrait || viewport.isShortLandscape;
  const touchJoySize = viewport.isCompactPortrait
    ? Math.round(92 * uiScaleRatio)
    : viewport.isShortLandscape
      ? Math.round(94 * uiScaleRatio)
      : Math.round(118 * uiScaleRatio);
  const touchJoyMaxR = Math.max(34, Math.round(touchJoySize * 0.44));
  const touchFireSize = viewport.isCompactPortrait
    ? Math.min(104, Math.max(76, Math.round(84 * uiScaleRatio)))
    : viewport.isShortLandscape
      ? Math.min(104, Math.max(76, Math.round(86 * uiScaleRatio)))
      : Math.min(140, Math.max(88, Math.round(108 * uiScaleRatio)));
  const touchJumpSize = viewport.isCompactPortrait
    ? Math.min(76, Math.max(54, Math.round(60 * uiScaleRatio)))
    : viewport.isShortLandscape
      ? Math.min(76, Math.max(54, Math.round(62 * uiScaleRatio)))
      : Math.min(96, Math.max(64, Math.round(76 * uiScaleRatio)));
  const touchSideEdge = viewport.isCompactPortrait ? 14 : viewport.isShortLandscape ? 16 : 24;
  const touchBottomEdge = viewport.isShortLandscape ? 14 : viewport.isCompactPortrait ? 18 : 24;
  const touchJumpSideOffset = touchSideEdge + touchFireSize + (viewport.isCompactPortrait ? 10 : 14);
  const touchAdsSize = viewport.isCompactPortrait
    ? Math.min(64, Math.max(48, Math.round(52 * uiScaleRatio)))
    : viewport.isShortLandscape
      ? Math.min(64, Math.max(48, Math.round(52 * uiScaleRatio)))
      : Math.min(78, Math.max(56, Math.round(62 * uiScaleRatio)));
  const touchAdsSideOffset = touchSideEdge + Math.round(touchFireSize * 0.86);
  const touchAdsBottomOffset = touchBottomEdge + touchJumpSize + (isCompactHud ? 12 : 16);
  const portraitHudBottomOffset = Math.max(
    touchBottomEdge + touchFireSize + 18,
    touchAdsBottomOffset + touchAdsSize + 12,
  );

  return (
    <div
      className="relative w-screen h-dvh overflow-hidden select-none"
      style={{
        touchAction: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
        overscrollBehavior: 'none',
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Isolated 3D WebGL Canvas Container */}
      <div
        ref={mountRef}
        data-testid="arena-canvas-container"
        className="fixed inset-0 z-0"
        onContextMenu={(e) => e.preventDefault()}
        onMouseDown={handlePlayfieldMouseDown}
        onPointerDown={handlePlayfieldPointerDown}
        onPointerMove={handlePlayfieldPointerMove}
        onPointerUp={handlePlayfieldPointerUp}
        onPointerCancel={handlePlayfieldPointerUp}
        onLostPointerCapture={handlePlayfieldPointerUp}
      />

      {/* Obstacle Bump Soft Cyan-White Vignette (Never Red) */}
      {(bumpVignette || invincibleEdge) && (
        <div
          className="fixed inset-0 pointer-events-none z-10 transition-opacity duration-200"
          style={{
            boxShadow: bumpVignette
              ? `inset 0 0 90px 28px ${PALETTE.cyan}, inset 0 0 40px 12px #FFFFFF`
              : `inset 0 0 45px 10px rgba(45, 226, 230, 0.45)`,
          }}
        />
      )}

      {/* (G-Mission uses 3D red corner brackets around target only — no peripheral screen border) */}

      {/* Indoor Challenge Transition Black Curtain & Centered Banner (Zero Side/Bottom Panels) */}
      {(indoorFadeOpacity > 0.005 || indoorBannerText) && (
        <div
          className="fixed inset-0 z-25 pointer-events-none flex items-center justify-center"
          style={{
            backgroundColor: `rgba(8, 10, 14, ${indoorFadeOpacity.toFixed(3)})`,
          }}
        >
          {indoorBannerText && (
            <div
              data-testid="indoor-challenge-banner"
              className="px-7 py-3.5 rounded-xl border-2 text-2xl sm:text-3xl font-black tracking-wide text-center shadow-2xl"
              style={{
                backgroundColor: 'rgba(15, 25, 35, 0.90)',
                borderColor: indoorBannerText.includes('⚠') ? '#FF4655' : '#FFA83A',
                color: '#ECE8E1',
              }}
            >
              {indoorBannerText}
            </div>
          )}
        </div>
      )}

      {/* ==================== 0. PROJECT C .GLB MAP LOADING OVERLAY (%) ==================== */}
      {mapLoadState.loading && (
        <div
          data-testid="glb-map-loading-overlay"
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/90 backdrop-blur-md px-6 select-none"
        >
          <div className="w-full max-w-md rounded-2xl border border-amber-400/40 bg-slate-900/95 p-6 shadow-2xl text-center">
            <div className="text-xs font-extrabold tracking-widest uppercase text-amber-400 mb-1">
              PROJECT C · 3D GLB MAP LOADER
            </div>
            <div
              data-testid="glb-map-loading-percent"
              className="text-4xl sm:text-5xl font-black text-white tabular-nums my-2"
            >
              {mapLoadState.progress}%
            </div>
            <div className="text-sm font-semibold text-slate-300 mb-4">
              {mapLoadState.status}
            </div>
            <div className="w-full h-3 rounded-full bg-slate-800 overflow-hidden border border-slate-700">
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-rose-500 transition-all duration-150"
                style={{ width: `${mapLoadState.progress}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ==================== 1. MAIN MENU SCREEN ==================== */}
      {phase === 'MENU' && (
        <div
          onClickCapture={(e) => {
            if ((e.target as HTMLElement).closest('button')) {
              soundEngine.playUiClick();
            }
          }}
          className="fixed inset-0 z-20 flex flex-col justify-between p-2.5 sm:p-5 overflow-y-auto ehm-scroll-y pointer-events-none"
          style={{
            paddingTop: 'max(0.625rem, env(safe-area-inset-top))',
            paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))',
            paddingLeft: 'max(0.625rem, env(safe-area-inset-left))',
            paddingRight: 'max(0.625rem, env(safe-area-inset-right))',
          }}
        >
          {/* Top Title Emblem Lockup */}
          <div className="flex flex-col items-center text-center mt-0.5 pointer-events-auto shrink-0">
            <svg
              viewBox="0 0 680 105"
              className={`w-full h-auto drop-shadow-md ${
                viewport.isShortLandscape
                  ? 'max-w-[260px]'
                  : viewport.isCompactPortrait
                    ? 'max-w-[320px]'
                    : 'max-w-lg'
              }`}
              role="img"
              aria-label="EYE HAND MISSION 눈-손 협응 훈련"
            >
              <defs>
                <linearGradient id="ehmLogoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#ECE8E1" />
                  <stop offset="52%" stopColor="#FFFFFF" />
                  <stop offset="100%" stopColor={PALETTE.yellow} />
                </linearGradient>
              </defs>
              <text
                x="340"
                y="58"
                textAnchor="middle"
                fontFamily="'Jua', 'Noto Sans KR', system-ui, sans-serif"
                fontSize="54"
                fontWeight="900"
                fill="url(#ehmLogoGrad)"
                stroke={PALETTE.darkPurple}
                strokeWidth="10"
                style={{ paintOrder: 'stroke fill' }}
              >
                EYE HAND MISSION
              </text>
              <rect
                x="145"
                y="68"
                width="390"
                height="8"
                rx="2"
                fill={PALETTE.primaryPurple}
                stroke={PALETTE.darkPurple}
                strokeWidth="2.5"
              />
              <text
                x="340"
                y="95"
                textAnchor="middle"
                fontFamily="'Noto Sans KR', system-ui, sans-serif"
                fontSize="19"
                fontWeight="800"
                fill="#ECE8E1"
                stroke={PALETTE.darkPurple}
                strokeWidth="4.5"
                style={{ paintOrder: 'stroke fill' }}
              >
                발로란트 전술 사격장 · 3D 눈-손 협응 훈련
              </text>
            </svg>
          </div>

          {/* Bottom Control Panel with 4 Training Mode Cards + Difficulty 1~10 */}
          <div className="w-full max-w-5xl mx-auto my-auto pointer-events-auto">
            <div
              className="rounded-2xl p-3.5 sm:p-5 border-2 shadow-2xl"
              style={{
                backgroundColor: 'rgba(236, 232, 225, 0.94)',
                borderColor: PALETTE.darkPurple,
                boxShadow: `0 8px 32px rgba(15, 25, 35, 0.55), inset 0 0 0 2px ${PALETTE.primaryPurple}`,
              }}
            >
              {/* Section 2: 4 Training Mode Selection Cards (MODE 1 ~ MODE 4) */}
              <div className="mb-3.5" data-testid="training-mode-selector">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <span
                    className="text-xs sm:text-sm font-extrabold"
                    style={{ color: PALETTE.darkPurple }}
                  >
                    훈련 모드 선택 (4가지 이동 및 시야 회전 모드)
                  </span>
                  <span
                    data-testid="selected-mode-summary-pill"
                    className="text-xs font-extrabold px-2.5 py-0.5 rounded-full"
                    style={{ backgroundColor: PALETTE.primaryPurple, color: '#FFFFFF' }}
                  >
                    현재 선택: {TRAINING_MODES[settings.trainingMode ?? 1].code} ·{' '}
                    {TRAINING_MODES[settings.trainingMode ?? 1].name}
                  </span>
                </div>

                <div
                  className={`grid gap-2 ${
                    viewport.isShortLandscape
                      ? 'grid-cols-4'
                      : 'grid-cols-2 lg:grid-cols-4 sm:gap-2.5'
                  }`}
                >
                  {([1, 2, 3, 4] as TrainingModeId[]).map((mId) => {
                    const mCfg = TRAINING_MODES[mId];
                    const selected = (settings.trainingMode ?? 1) === mId;
                    return (
                      <button
                        key={mId}
                        type="button"
                        data-testid={`training-mode-card-${mId}`}
                        data-selected={selected ? 'true' : 'false'}
                        aria-pressed={selected}
                        onClick={() => updateSettings({ trainingMode: mId })}
                        className="rounded-2xl p-2.5 sm:p-3 text-left transition-all flex flex-col justify-between relative"
                        style={{
                          backgroundColor: selected ? '#F2ECFF' : '#FFFFFF',
                          border: selected
                            ? `3px solid ${PALETTE.primaryPurple}`
                            : '2px solid #D8CEFF',
                          boxShadow: selected
                            ? `0 4px 0 ${PALETTE.darkPurple}, 0 0 0 2px ${PALETTE.cyan}`
                            : '0 2px 0 rgba(43,42,94,0.12)',
                        }}
                      >
                        <div>
                          {/* Header: Mode Number + Checkmark Badge */}
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <span
                              className="px-2 py-0.5 rounded-lg text-[11px] font-black tracking-wide"
                              style={{
                                backgroundColor: selected ? PALETTE.primaryPurple : '#EDE6FA',
                                color: selected ? '#FFFFFF' : PALETTE.darkPurple,
                              }}
                            >
                              {mCfg.code}
                            </span>
                            {selected ? (
                              <span
                                data-testid={`training-mode-check-${mId}`}
                                className="px-2 py-0.5 rounded-full text-[11px] font-black flex items-center gap-0.5"
                                style={{
                                  backgroundColor: PALETTE.cyan,
                                  color: PALETTE.darkPurple,
                                  border: `1.5px solid ${PALETTE.darkPurple}`,
                                }}
                              >
                                ✓ 선택됨
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold text-slate-400">선택</span>
                            )}
                          </div>

                          {/* Mode Name */}
                          <div
                            className="text-xs sm:text-sm font-black leading-snug mb-1.5"
                            style={{ color: PALETTE.darkPurple }}
                          >
                            {mCfg.name}
                          </div>

                          {/* 3D / Radar Visual Preview Schematic + Info Row */}
                          <div className="flex items-center gap-2.5 mb-2">
                            <svg
                              width="54"
                              height="54"
                              viewBox="-28 -28 56 56"
                              className="shrink-0 rounded-xl border border-purple-200"
                              style={{ backgroundColor: '#1E1D42' }}
                              aria-label={`${mCfg.code} 3D 시야 및 이동 미리보기`}
                            >
                              {/* Arena ring */}
                              <circle
                                cx="0"
                                cy="0"
                                r="23"
                                fill="none"
                                stroke="rgba(205,184,255,0.28)"
                                strokeWidth="1"
                                strokeDasharray="2 2"
                              />
                              {/* FOV Visualization: ±45° front cone vs 360° full radar */}
                              {mCfg.yawRangeType === 'FRONT_45' ? (
                                <path
                                  d="M 0 4 L -17 -15 A 22 22 0 0 1 17 -15 Z"
                                  fill="rgba(45, 226, 230, 0.34)"
                                  stroke={PALETTE.cyan}
                                  strokeWidth="1.4"
                                />
                              ) : (
                                <circle
                                  cx="0"
                                  cy="0"
                                  r="19"
                                  fill="rgba(45, 226, 230, 0.22)"
                                  stroke={PALETTE.cyan}
                                  strokeWidth="1.4"
                                />
                              )}
                              {/* Sample Target Dots */}
                              <circle cx="-7" cy="-13" r="3" fill={PALETTE.cyan} />
                              <circle cx="8" cy="-12" r="2.8" fill={PALETTE.orange} />
                              {mCfg.allowRearTargets && (
                                <>
                                  <circle cx="-14" cy="4" r="2.8" fill={PALETTE.magenta} />
                                  <circle cx="13" cy="8" r="2.8" fill={PALETTE.lime} />
                                  <circle cx="0" cy="15" r="3" fill={PALETTE.yellow} />
                                </>
                              )}
                              {/* Movement Arrows if allowMovement */}
                              {mCfg.allowMovement ? (
                                <g stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round">
                                  <line x1="0" y1="-6" x2="0" y2="6" />
                                  <line x1="-6" y1="0" x2="6" y2="0" />
                                  <circle cx="0" cy="0" r="3.2" fill={PALETTE.orange} />
                                </g>
                              ) : (
                                <circle
                                  cx="0"
                                  cy="4"
                                  r="3.8"
                                  fill="#FFFFFF"
                                  stroke={PALETTE.primaryPurple}
                                  strokeWidth="1.8"
                                />
                              )}
                            </svg>

                            <div className="text-[11px] leading-tight space-y-0.5 text-slate-700 font-bold">
                              <div>
                                이동:{' '}
                                <span
                                  style={{
                                    color: mCfg.allowMovement
                                      ? PALETTE.primaryPurple
                                      : '#64748B',
                                  }}
                                >
                                  {mCfg.allowMovement ? '자유 이동 가능' : '불가능 (제자리)'}
                                </span>
                              </div>
                              <div>
                                시야: <span className="text-purple-950">{mCfg.yawRangeLabel}</span>
                              </div>
                              <div>
                                출현: <span className="text-purple-950">{mCfg.spawnRangeLabel}</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Training Purposes Tags */}
                        <div className="pt-1.5 border-t border-purple-200/70 flex flex-wrap gap-1">
                          {mCfg.purposes.slice(0, 4).map((p) => (
                            <span
                              key={p}
                              className="px-1.5 py-0.5 rounded text-[10px] font-extrabold"
                              style={{
                                backgroundColor: selected ? '#FFFFFF' : '#F3EEFF',
                                color: PALETTE.darkPurple,
                              }}
                            >
                              {p}
                            </span>
                          ))}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Difficulty 1~10 Selector */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1">
                  <span
                    className="text-xs sm:text-sm font-extrabold"
                    style={{ color: PALETTE.darkPurple }}
                  >
                    훈련 난이도 선택 (1 ~ 10단계)
                  </span>
                  <span className="text-xs font-bold text-purple-700">
                    훈련 시간: {settings.duration}초 · {TRAINING_MODES[settings.trainingMode ?? 1].shortName}
                  </span>
                </div>

                <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((lv) => {
                    const active = settings.difficulty === lv;
                    return (
                      <button
                        key={lv}
                        type="button"
                        onClick={() => updateSettings({ difficulty: lv })}
                        className="h-9 sm:h-10 rounded-xl font-extrabold text-xs sm:text-sm transition-transform active:translate-y-0.5"
                        style={{
                          backgroundColor: active ? PALETTE.primaryPurple : '#F3EEFF',
                          color: active ? '#FFFFFF' : PALETTE.darkPurple,
                          border: `2px solid ${
                            active ? PALETTE.darkPurple : PALETTE.lightPurple
                          }`,
                          boxShadow: active
                            ? `0 3px 0 ${PALETTE.darkPurple}`
                            : '0 2px 0 rgba(43,42,94,0.18)',
                        }}
                      >
                        {lv}
                      </button>
                    );
                  })}
                </div>

                <div
                  className="mt-1.5 px-3 py-1 rounded-xl text-xs font-extrabold text-center"
                  style={{
                    backgroundColor: '#EDE6FA',
                    color: PALETTE.darkPurple,
                  }}
                >
                  {DIFFICULTY_CONFIG[settings.difficulty].summary}
                </div>
              </div>

              {/* Primary Start CTA + Secondary Menu Buttons */}
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  data-start="true"
                  onClick={() => {
                    unlockWeaponAudio();
                    startTrainingSession();
                  }}
                  className="sm:flex-1 min-h-12 py-2.5 px-5 rounded-2xl font-black text-base sm:text-lg text-white tracking-wide transition-transform active:translate-y-0.5"
                  style={{
                    backgroundColor: PALETTE.orange,
                    border: `2px solid ${PALETTE.darkPurple}`,
                    boxShadow: `0 4px 0 ${PALETTE.darkPurple}`,
                  }}
                >
                  게임 시작 ({TRAINING_MODES[settings.trainingMode ?? 1].code} · LV.{settings.difficulty})
                </button>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2 sm:w-auto">
                  <button
                    type="button"
                    onClick={() => setGuideModalTab('guide')}
                    className="min-h-11 px-3 py-2 rounded-2xl font-extrabold text-xs sm:text-sm text-white transition-transform active:translate-y-0.5"
                    style={{
                      backgroundColor: PALETTE.primaryPurple,
                      boxShadow: `0 4px 0 ${PALETTE.darkPurple}`,
                    }}
                  >
                    게임 설명
                  </button>
                  <button
                    type="button"
                    onClick={() => setGuideModalTab('controls')}
                    className="min-h-11 px-3 py-2 rounded-2xl font-extrabold text-xs sm:text-sm text-white transition-transform active:translate-y-0.5"
                    style={{
                      backgroundColor: PALETTE.primaryPurple,
                      boxShadow: `0 4px 0 ${PALETTE.darkPurple}`,
                    }}
                  >
                    조작 방법
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowHistoryModal(true)}
                    className="min-h-11 px-3 py-2 rounded-2xl font-extrabold text-xs sm:text-sm text-slate-900 transition-transform active:translate-y-0.5"
                    style={{
                      backgroundColor: PALETTE.cyan,
                      boxShadow: `0 4px 0 ${PALETTE.darkPurple}`,
                    }}
                  >
                    훈련 결과
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSettingsModal(true)}
                    className="min-h-11 px-3 py-2 rounded-2xl font-extrabold text-xs sm:text-sm text-slate-900 transition-transform active:translate-y-0.5"
                    style={{
                      backgroundColor: '#EDE6FA',
                      border: `2px solid ${PALETTE.darkPurple}`,
                      boxShadow: `0 4px 0 ${PALETTE.darkPurple}`,
                    }}
                  >
                    설정
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== 2. COUNTDOWN OVERLAY ==================== */}
      {phase === 'COUNTDOWN' && (
        <div className="fixed inset-0 z-30 flex items-center justify-center pointer-events-none">
          <div
            key={countdownText}
            className="text-7xl sm:text-8xl font-black tracking-tight animate-bounce"
            style={{
              color: PALETTE.yellow,
              WebkitTextStroke: `4px ${PALETTE.darkPurple}`,
              textShadow: `0 8px 0 ${PALETTE.darkPurple}`,
            }}
          >
            {countdownText}
          </div>
        </div>
      )}

      {/* ==================== 3. PLAYING HUD ==================== */}
      {(phase === 'PLAYING' || phase === 'PAUSED' || phase === 'COUNTDOWN') && (
        <div
          className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between"
          style={{
            paddingTop: isCompactHud
              ? 'calc(0.45rem + env(safe-area-inset-top))'
              : 'calc(0.75rem + env(safe-area-inset-top))',
            paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))',
            paddingLeft: isCompactHud
              ? 'calc(0.5rem + env(safe-area-inset-left))'
              : 'calc(0.75rem + env(safe-area-inset-left))',
            paddingRight: isCompactHud
              ? 'calc(0.5rem + env(safe-area-inset-right))'
              : 'calc(0.75rem + env(safe-area-inset-right))',
          }}
        >
          {/* Top Bar */}
          <div className="flex items-start justify-between gap-1.5 sm:gap-2">
            {/* Top-Left: Score, Combo & Energy Bar */}
            <div className={`flex flex-col ${isCompactHud ? 'gap-1' : 'gap-2'}`}>
              <div
                data-testid="hud-score-card"
                className={`ehm-hud-panel rounded-xl border-2 shadow-lg flex items-center justify-between ${
                  viewport.isCompactPortrait
                    ? 'px-2 py-1 gap-2 w-[114px]'
                    : viewport.isShortLandscape
                      ? 'px-2.5 py-1 gap-2.5 w-[138px]'
                      : 'px-4 py-2 gap-4 w-44 sm:w-56'
                }`}
                style={{
                  backgroundColor: 'rgba(15, 25, 35, 0.88)',
                  borderColor: PALETTE.cyan,
                }}
              >
                <div>
                  <div
                    className={`font-extrabold text-teal-300 tracking-wider uppercase ${
                      isCompactHud ? 'text-[8px]' : 'text-[10px]'
                    }`}
                  >
                    SCORE
                  </div>
                  <div
                    className={`font-black tabular-nums leading-none ${
                      viewport.isCompactPortrait
                        ? 'text-base'
                        : viewport.isShortLandscape
                          ? 'text-lg'
                          : 'text-2xl sm:text-3xl'
                    }`}
                    style={{ color: '#ECE8E1' }}
                  >
                    {hudScore.toLocaleString()}
                  </div>
                </div>
                <div className={`border-l border-slate-700 ${isCompactHud ? 'pl-2' : 'pl-3'}`}>
                  <div
                    className={`font-extrabold text-teal-300 tracking-wider uppercase ${
                      isCompactHud ? 'text-[8px]' : 'text-[10px]'
                    }`}
                  >
                    COMBO
                  </div>
                  <div
                    className={`font-black tabular-nums leading-none ${
                      viewport.isCompactPortrait
                        ? 'text-sm'
                        : viewport.isShortLandscape
                          ? 'text-base'
                          : 'text-xl sm:text-2xl'
                    }`}
                    style={{
                      color: hudCombo >= 5 ? PALETTE.yellow : PALETTE.cyan,
                    }}
                  >
                    {hudCombo}×
                  </div>
                </div>
              </div>

              {/* Energy Bar */}
              <div
                data-testid="hud-energy-card"
                className={`ehm-hud-panel rounded-xl border-2 shadow-md ${
                  viewport.isCompactPortrait
                    ? 'px-2 py-1 w-[114px]'
                    : viewport.isShortLandscape
                      ? 'px-2.5 py-1 w-[138px]'
                      : 'px-3.5 py-2 w-44 sm:w-56'
                }`}
                style={{
                  backgroundColor: 'rgba(15, 25, 35, 0.88)',
                  borderColor: PALETTE.cyan,
                }}
              >
                <div
                  className={`flex justify-between font-extrabold ${
                    isCompactHud ? 'text-[9px] mb-0.5' : 'text-xs mb-1'
                  }`}
                >
                  <span style={{ color: '#ECE8E1' }}>에너지</span>
                  <span className="tabular-nums" style={{ color: PALETTE.cyan }}>
                    {hudEnergy} / 100
                  </span>
                </div>
                <div
                  className={`w-full rounded-sm bg-slate-800 overflow-hidden border border-slate-600 ${
                    isCompactHud ? 'h-2' : 'h-3'
                  }`}
                >
                  <div
                    className="h-full transition-all duration-300"
                    style={{
                      width: `${hudEnergy}%`,
                      background:
                        hudEnergy > 40
                          ? `linear-gradient(90deg, ${PALETTE.cyan}, ${PALETTE.lime})`
                          : PALETTE.primaryPurple,
                    }}
                  />
                </div>
              </div>

            </div>

            {/* Top-Center: Compact Pause Button (to the left of Timer) + Timer Card + Badges */}
            <div className="flex flex-col items-center gap-1">
              <div className={`flex items-center ${isCompactHud ? 'gap-1' : 'gap-2'}`}>
                {/* Compact Pause Button placed directly to the left of the timer */}
                <button
                  type="button"
                  data-testid="hud-pause-button"
                  aria-label="일시정지"
                  title="일시정지 (P / Esc)"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    soundEngine.playUiClick();
                    setPhase('PAUSED');
                    soundEngine.setBgmPaused(true);
                    if (document.pointerLockElement) {
                      try {
                        document.exitPointerLock();
                      } catch {
                        // ignore
                      }
                    }
                  }}
                  className={`pointer-events-auto shrink-0 rounded-lg font-black text-white shadow-md flex items-center justify-center transition-transform active:scale-95 ${
                    isCompactHud ? 'w-7 h-7 text-[10px]' : 'w-8 h-8 text-[11px]'
                  }`}
                  style={{
                    backgroundColor: 'rgba(15, 25, 35, 0.92)',
                    border: `2px solid ${PALETTE.cyan}`,
                  }}
                >
                  <span>❚❚</span>
                </button>

                <div
                  data-testid="hud-timer-card"
                  className={`ehm-hud-panel rounded-xl border-2 shadow-lg flex items-center ${
                    viewport.isCompactPortrait
                      ? 'px-2 py-1 gap-1.5'
                      : viewport.isShortLandscape
                        ? 'px-2.5 py-1 gap-2'
                        : 'px-4 py-2 gap-3'
                  }`}
                  style={{
                    backgroundColor: 'rgba(15, 25, 35, 0.90)',
                    borderColor: PALETTE.cyan,
                  }}
                >
                  <svg
                    width={viewport.isCompactPortrait ? 20 : viewport.isShortLandscape ? 24 : 36}
                    height={viewport.isCompactPortrait ? 20 : viewport.isShortLandscape ? 24 : 36}
                    viewBox="0 0 40 40"
                    className="-rotate-90 shrink-0"
                  >
                    <circle
                      cx="20"
                      cy="20"
                      r="15"
                      fill="none"
                      stroke="#263342"
                      strokeWidth="5"
                    />
                    <circle
                      cx="20"
                      cy="20"
                      r="15"
                      fill="none"
                      stroke={hudTimeLeft <= 15 ? PALETTE.primaryPurple : PALETTE.cyan}
                      strokeWidth="5"
                      strokeDasharray={2 * Math.PI * 15}
                      strokeDashoffset={2 * Math.PI * 15 * (1 - timeProgressRatio)}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div
                    className={`font-black tabular-nums leading-none ${
                      viewport.isCompactPortrait
                        ? 'text-sm'
                        : viewport.isShortLandscape
                          ? 'text-base'
                          : 'text-xl sm:text-2xl'
                    }`}
                    style={{ color: '#ECE8E1' }}
                  >
                    {formatMmSs(hudTimeLeft)}
                  </div>
                </div>

                {/* Touch / Tablet Quick Weapon Select Button next to Timer in Top HUD */}
                {isTabletActive && phase === 'PLAYING' && (
                  <button
                    type="button"
                    data-testid="hud-top-weapon-button"
                    aria-label="무기 변경"
                    onClick={(e) => {
                      e.currentTarget.blur();
                      soundEngine.playUiClick();
                      openWeaponModal();
                    }}
                    className={`pointer-events-auto shrink-0 rounded-lg font-black shadow-md flex items-center justify-center transition-transform active:scale-95 ${
                      isCompactHud ? 'h-7 px-2 text-[10px]' : 'h-8 px-2.5 text-[11px]'
                    }`}
                    style={{
                      backgroundColor: 'rgba(15, 25, 35, 0.92)',
                      border: '1.5px solid #3ee0b0',
                      color: '#3ee0b0',
                    }}
                  >
                    무기
                  </button>
                )}
              </div>

              {/* Drag-Look Sandbox Notice Banner */}
              {dragModeBanner && !isTabletActive && (
                <div
                  className="px-3 py-1 rounded-xl text-[11px] font-bold text-white shadow"
                  style={{ backgroundColor: 'rgba(43, 42, 94, 0.85)' }}
                >
                  드래그 시점 모드 (우클릭 드래그로 360° 회전 · 좌클릭 발사) — 전체화면이나 새 탭에서
                  열면 더 편해요
                </div>
              )}
            </div>

            {/* Top-Right: Valorant Floating Transparent Minimap (Responsive for Mobile Portrait & Short Landscape) */}
            {!isIndoorRangeHudActive && (
              <div
                data-testid="hud-mini-radar"
                className={`shrink-0 overflow-visible relative ${
                  viewport.isCompactPortrait
                    ? 'w-[98px] h-[82px]'
                    : viewport.isShortLandscape
                      ? 'w-[116px] h-[86px]'
                      : 'w-[173px] h-[124px] sm:w-[219px] sm:h-[160px]'
                }`}
                style={{
                  backgroundColor: 'transparent',
                }}
              >
                <svg
                  viewBox={hudRadarState.keepBox ? '-64 -56 128 112' : '-74 -64 148 128'}
                  className="w-full h-full block overflow-hidden"
                  preserveAspectRatio="xMidYMid meet"
                >
                  <defs>
                    <clipPath id="valorant-arena-floor-clip">
                      {hudRadarState.keepBox ? (
                        <rect
                          x={hudRadarState.keepBox.minX * 1.85}
                          y={hudRadarState.keepBox.minZ * 1.85}
                          width={(hudRadarState.keepBox.maxX - hudRadarState.keepBox.minX) * 1.85}
                          height={(hudRadarState.keepBox.maxZ - hudRadarState.keepBox.minZ) * 1.85}
                          rx="2"
                          transform={`rotate(${(hudRadarState.yawRad * 180) / Math.PI}) translate(${-hudRadarState.playerX * 1.85}, ${-hudRadarState.playerZ * 1.85})`}
                        />
                      ) : (
                        <path
                          d={`M ${-1.95 * 1.85} ${-17.89 * 1.85} L ${-1.95 * 1.85} ${-26.2 * 1.85} L ${9.6 * 1.85} ${-26.2 * 1.85} L ${9.6 * 1.85} ${-19.8 * 1.85} L ${2.4 * 1.85} ${-19.8 * 1.85} L ${2.4 * 1.85} ${-17.84 * 1.85} A ${ARENA.playRadius * 1.85} ${ARENA.playRadius * 1.85} 0 1 1 ${-1.95 * 1.85} ${-17.89 * 1.85} Z`}
                          transform={`rotate(${(hudRadarState.yawRad * 180) / Math.PI}) translate(${-hudRadarState.playerX * 1.85}, ${-hudRadarState.playerZ * 1.85})`}
                        />
                      )}
                    </clipPath>
                    {hudRadarState.keepBox && (
                      <clipPath id="keepbox-local-clip">
                        <rect
                          x={hudRadarState.keepBox.minX * 1.85}
                          y={hudRadarState.keepBox.minZ * 1.85}
                          width={(hudRadarState.keepBox.maxX - hudRadarState.keepBox.minX) * 1.85}
                          height={(hudRadarState.keepBox.maxZ - hudRadarState.keepBox.minZ) * 1.85}
                          rx="2"
                        />
                      </clipPath>
                    )}
                    <radialGradient id="valorant-fov-grad" cx="50%" cy="100%" r="100%">
                      <stop offset="0%" stopColor="rgba(255, 255, 255, 0.34)" />
                      <stop offset="100%" stopColor="rgba(255, 255, 255, 0.03)" />
                    </radialGradient>
                  </defs>

                  {/* Rotating Top-Down Floorplan (Player Forward ALWAYS Points Up / 12 o'clock) */}
                  <g
                    clipPath={hudRadarState.keepBox ? 'url(#keepbox-local-clip)' : undefined}
                    transform={`rotate(${(hudRadarState.yawRad * 180) / Math.PI}) translate(${-hudRadarState.playerX * 1.85}, ${-hudRadarState.playerZ * 1.85})`}
                  >
                    {/* Walkable Playable Backdrop: tightened keepBox for GLB map, or circular Arena Floor */}
                    {hudRadarState.keepBox ? (
                      <rect
                        x={hudRadarState.keepBox.minX * 1.85}
                        y={hudRadarState.keepBox.minZ * 1.85}
                        width={(hudRadarState.keepBox.maxX - hudRadarState.keepBox.minX) * 1.85}
                        height={(hudRadarState.keepBox.maxZ - hudRadarState.keepBox.minZ) * 1.85}
                        rx="2"
                        fill="rgba(178, 192, 212, 0.62)"
                        stroke="#FFFFFF"
                        strokeWidth="1.4"
                      />
                    ) : (
                      <path
                        d={`M ${-1.95 * 1.85} ${-17.89 * 1.85} L ${-1.95 * 1.85} ${-26.2 * 1.85} L ${9.6 * 1.85} ${-26.2 * 1.85} L ${9.6 * 1.85} ${-19.8 * 1.85} L ${2.4 * 1.85} ${-19.8 * 1.85} L ${2.4 * 1.85} ${-17.84 * 1.85} A ${ARENA.playRadius * 1.85} ${ARENA.playRadius * 1.85} 0 1 1 ${-1.95 * 1.85} ${-17.89 * 1.85} Z`}
                        fill="rgba(178, 192, 212, 0.72)"
                        stroke="#FFFFFF"
                        strokeWidth="1.5"
                        strokeLinejoin="round"
                      />
                    )}
                    {/* Staircase Tread Lines on Minimap (X: 2.5..7.4, Z: -22.9..-20.0) & 2F Window Sill Marker */}
                    {[2.8, 3.6, 4.4, 5.2, 6.0, 6.8].map((sx) => (
                      <line
                        key={`stair-line-${sx}`}
                        x1={sx * 1.85}
                        y1={-22.85 * 1.85}
                        x2={sx * 1.85}
                        y2={-20.05 * 1.85}
                        stroke="rgba(255, 255, 255, 0.55)"
                        strokeWidth="0.65"
                      />
                    ))}
                    <line
                      x1={ARENA_HEAVEN.windowMinX * 1.85}
                      y1={ARENA_HEAVEN.windowZ * 1.85}
                      x2={ARENA_HEAVEN.windowMaxX * 1.85}
                      y2={ARENA_HEAVEN.windowZ * 1.85}
                      stroke="rgba(255, 255, 255, 0.85)"
                      strokeWidth="1.1"
                      strokeDasharray="1.6 1.2"
                    />
                    {/* Static Arena Obstacles (Walls, Crates, Pillars): Dark Charcoal/Navy Blocks */}
                    {hudRadarState.staticBoxes.map((b) => (
                      <rect
                        key={b.id}
                        x={b.x * 1.85}
                        y={b.z * 1.85}
                        width={b.w * 1.85}
                        height={b.d * 1.85}
                        rx="0.7"
                        fill="rgba(24, 32, 46, 0.88)"
                        stroke="rgba(226, 232, 240, 0.65)"
                        strokeWidth="0.7"
                      />
                    ))}
                    {/* Moving Obstacles */}
                    {hudRadarState.obstacles.map((ob) => (
                      <rect
                        key={ob.id}
                        x={ob.wx * 1.85 - 2.3}
                        y={ob.wz * 1.85 - 2.3}
                        width="4.6"
                        height="4.6"
                        rx="0.8"
                        fill="rgba(24, 32, 46, 0.90)"
                        stroke="#FF8A2B"
                        strokeWidth="0.85"
                      />
                    ))}
                  </g>

                  {/* Fixed Center Translucent White FOV Cone Clipped Strictly to Arena Floor Silhouette */}
                  <g clipPath="url(#valorant-arena-floor-clip)">
                    <path
                      d="M 0 0 L -24 -42 A 48 48 0 0 1 24 -42 Z"
                      fill="url(#valorant-fov-grad)"
                    />
                  </g>

                  {/* Active Targets Rendered Above FOV Cone */}
                  <g
                    transform={`rotate(${(hudRadarState.yawRad * 180) / Math.PI}) translate(${-hudRadarState.playerX * 1.85}, ${-hudRadarState.playerZ * 1.85})`}
                  >
                    {hudRadarState.targets.map((tg) => {
                      const tx = tg.wx * 1.85;
                      const tz = tg.wz * 1.85;
                      if (tg.kind === 'laser') {
                        return (
                          <polygon
                            key={tg.id}
                            points={`${tx},${tz - 3.0} ${tx + 3.0},${tz} ${tx},${tz + 3.0} ${tx - 3.0},${tz}`}
                            fill="#22D3EE"
                            stroke="#0F172A"
                            strokeWidth="0.9"
                          />
                        );
                      }
                      return (
                        <circle
                          key={tg.id}
                          cx={tx}
                          cy={tz}
                          r={tg.kind === 'mission' ? 3.0 : 2.5}
                          fill={tg.color}
                          stroke="#0F172A"
                          strokeWidth="0.9"
                        />
                      );
                    })}
                  </g>

                  {/* Fixed Center Player Directional Arrow (Mint / White) */}
                  <polygon
                    points="0,-5.5 4.0,4.0 0,1.8 -4.0,4.0"
                    fill="#34F5C5"
                    stroke="#0F172A"
                    strokeWidth="0.8"
                  />
                </svg>
              </div>
            )}
          </div>

          {/* Center Crosshair + 3. Staged Offscreen Direction Hint Arrow */}
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none flex items-center justify-center">
            {/* Crosshair SVG (hidden while the sniper scope is up: the scope has its own reticle) */}
            <div
              style={{
                width: isTabletActive ? 34 : settings.crosshairSize,
                height: isTabletActive ? 34 : settings.crosshairSize,
                visibility: weaponHud.isScoped ? 'hidden' : undefined,
              }}
            >
              <svg viewBox="0 0 36 36" className="w-full h-full">
                {/* Valorant Tactical Outer Crosshair Ticks */}
                <line x1="18" y1="2" x2="18" y2="10" stroke="#0F1923" strokeWidth="3.8" />
                <line x1="18" y1="26" x2="18" y2="34" stroke="#0F1923" strokeWidth="3.8" />
                <line x1="2" y1="18" x2="10" y2="18" stroke="#0F1923" strokeWidth="3.8" />
                <line x1="26" y1="18" x2="34" y2="18" stroke="#0F1923" strokeWidth="3.8" />
                <line x1="18" y1="3" x2="18" y2="10" stroke={PALETTE.cyan} strokeWidth="2" />
                <line x1="18" y1="26" x2="18" y2="33" stroke={PALETTE.cyan} strokeWidth="2" />
                <line x1="3" y1="18" x2="10" y2="18" stroke={PALETTE.cyan} strokeWidth="2" />
                <line x1="26" y1="18" x2="33" y2="18" stroke={PALETTE.cyan} strokeWidth="2" />
                {/* Center Gold Tactical Reflex Dot / Triangle */}
                <polygon
                  points="18,14.2 21.5,20.5 14.5,20.5"
                  fill={PALETTE.yellow}
                  stroke="#0F1923"
                  strokeWidth="1.2"
                />
              </svg>
            </div>

            {/* 3. Clean Single Directional Arrow for Offscreen Targets */}
            {directionHintUi && directionHintUi.stage >= 1 && (
              <div
                data-testid="direction-hint-indicator"
                data-hint-stage={directionHintUi.stage}
                className="fixed left-1/2 top-1/2 w-1 h-1 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
              >
                {(() => {
                  const orbitRadius = 68;
                  const ax = Math.cos(directionHintUi.screenAngleRad) * orbitRadius;
                  const ay = Math.sin(directionHintUi.screenAngleRad) * orbitRadius;
                  const deg = (directionHintUi.screenAngleRad * 180) / Math.PI;
                  return (
                    <div
                      className="absolute"
                      style={{
                        left: `${ax}px`,
                        top: `${ay}px`,
                        transform: `translate(-50%, -50%) rotate(${deg}deg)`,
                      }}
                    >
                      <svg
                        width="34"
                        height="34"
                        viewBox="0 0 36 36"
                        aria-label="목표물 방향 화살표"
                      >
                        <polygon
                          points="10,6 31,18 10,30 16,18"
                          fill={PALETTE.cyan}
                          stroke={PALETTE.darkPurple}
                          strokeWidth="2.5"
                        />
                      </svg>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          {/* Floating Score, Encouragement & '목표물이 아닙니다!' Popups */}
          {popups.map((p) => (
            <div
              key={p.id}
              data-testid={`shot-popup-${p.grade}`}
              className="fixed pointer-events-none -translate-x-1/2 -translate-y-1/2 text-center transition-transform duration-500"
              style={{ left: p.x, top: p.y }}
            >
              <div
                className="text-lg sm:text-xl font-black drop-shadow"
                style={{
                  color:
                    p.grade === 'PERFECT'
                      ? PALETTE.yellow
                      : p.grade === 'GOOD'
                        ? PALETTE.cyan
                        : p.grade === 'NON_TARGET'
                          ? '#FFE8A3'
                          : '#E2D9FF',
                  WebkitTextStroke: `1.5px ${PALETTE.darkPurple}`,
                }}
              >
                {p.text}
              </div>
              {p.subText && (
                <div
                  className="text-xs font-extrabold px-2.5 py-0.5 rounded-full inline-block mt-0.5"
                  style={{
                    backgroundColor: 'rgba(43, 42, 94, 0.85)',
                    color: '#FFFFFF',
                  }}
                >
                  {p.subText}
                </div>
              )}
            </div>
          ))}

          {/* Free Movement Virtual Joystick (Visible in MODE 3 & MODE 4 on both PC & Tablet) + Tablet Fire Button */}
          {phase === 'PLAYING' &&
            (TRAINING_MODES[settings.trainingMode ?? 1].joystickEnabled || isTabletActive) && (
              <div className="relative w-full h-36 pointer-events-none">
                {/* Interactive Virtual Joystick Pad in Bottom-Left for MODE 3 & MODE 4 */}
                {TRAINING_MODES[settings.trainingMode ?? 1].joystickEnabled && (
                  <div
                    data-testid="tablet-virtual-joystick"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      const rect = e.currentTarget.getBoundingClientRect();
                      const bx = rect.left + rect.width * 0.5;
                      const by = rect.top + rect.height * 0.5;
                      inputStateRef.current.joyPointerId = e.pointerId;
                      inputStateRef.current.joyBaseX = bx;
                      inputStateRef.current.joyBaseY = by;
                      const dx = e.clientX - bx;
                      const dy = e.clientY - by;
                      const maxR = touchJoyMaxR;
                      const dist = Math.hypot(dx, dy);
                      const cx = dist > maxR ? (dx / dist) * maxR : dx;
                      const cy = dist > maxR ? (dy / dist) * maxR : dy;
                      inputStateRef.current.joyDx = cx;
                      inputStateRef.current.joyDy = cy;
                      setJoystickUi({ active: true, baseX: bx, baseY: by, knobX: cx, knobY: cy });
                      try {
                        e.currentTarget.setPointerCapture(e.pointerId);
                      } catch {
                        // ignore
                      }
                    }}
                    onPointerMove={(e) => {
                      if (e.pointerId !== inputStateRef.current.joyPointerId) return;
                      e.stopPropagation();
                      const dx = e.clientX - inputStateRef.current.joyBaseX;
                      const dy = e.clientY - inputStateRef.current.joyBaseY;
                      const maxR = touchJoyMaxR;
                      const dist = Math.hypot(dx, dy);
                      const cx = dist > maxR ? (dx / dist) * maxR : dx;
                      const cy = dist > maxR ? (dy / dist) * maxR : dy;
                      inputStateRef.current.joyDx = cx;
                      inputStateRef.current.joyDy = cy;
                      setJoystickUi((prev) => ({ ...prev, knobX: cx, knobY: cy }));
                    }}
                    onPointerUp={(e) => {
                      if (e.pointerId !== inputStateRef.current.joyPointerId) return;
                      e.stopPropagation();
                      inputStateRef.current.joyPointerId = null;
                      inputStateRef.current.joyDx = 0;
                      inputStateRef.current.joyDy = 0;
                      setJoystickUi((prev) => ({ ...prev, active: false, knobX: 0, knobY: 0 }));
                    }}
                    onPointerCancel={(e) => {
                      if (e.pointerId !== inputStateRef.current.joyPointerId) return;
                      e.stopPropagation();
                      inputStateRef.current.joyPointerId = null;
                      inputStateRef.current.joyDx = 0;
                      inputStateRef.current.joyDy = 0;
                      setJoystickUi((prev) => ({ ...prev, active: false, knobX: 0, knobY: 0 }));
                    }}
                    className="pointer-events-auto fixed rounded-full border-2 flex items-center justify-center transition-opacity cursor-grab active:cursor-grabbing"
                    style={{
                      width: touchJoySize,
                      height: touchJoySize,
                      ...(settings.tabletSwapControls
                        ? { right: `calc(${touchSideEdge}px + env(safe-area-inset-right))` }
                        : { left: `calc(${touchSideEdge}px + env(safe-area-inset-left))` }),
                      bottom: `calc(${touchBottomEdge}px + env(safe-area-inset-bottom))`,
                      backgroundColor: 'rgba(15, 25, 35, 0.56)',
                      borderColor: PALETTE.cyan,
                      opacity: joystickUi.active ? 0.95 : 0.72,
                    }}
                  >
                    <div
                      className="rounded-full shadow-md pointer-events-none"
                      style={{
                        width: Math.round(touchJoySize * 0.39),
                        height: Math.round(touchJoySize * 0.39),
                        backgroundColor: PALETTE.cyan,
                        border: '2px solid #FFFFFF',
                        transform: `translate(${joystickUi.knobX}px, ${joystickUi.knobY}px)`,
                      }}
                    />
                    {!isTabletActive && (
                      <span className="absolute -bottom-5 text-[10px] font-extrabold text-cyan-200 whitespace-nowrap pointer-events-none">
                        WASD / 방향키 / 드래그 이동
                      </span>
                    )}
                  </div>
                )}

                {/* Jump Button (Tablet/Mobile Mode in Free-Movement MODE 3 & MODE 4 — placed cleanly beside Fire) */}
                {isTabletActive &&
                  TRAINING_MODES[settings.trainingMode ?? 1].allowMovement &&
                  !isIndoorRangeHudActive && (
                    <button
                      type="button"
                      data-testid="tablet-jump-button"
                      aria-label="점프"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        playerStateRef.current.jumpQueued = true;
                      }}
                      className="pointer-events-auto fixed rounded-full font-black text-slate-950 shadow-xl flex flex-col items-center justify-center active:scale-95"
                      style={{
                        width: touchJumpSize,
                        height: touchJumpSize,
                        ...(settings.tabletSwapControls
                          ? { left: `calc(${touchJumpSideOffset}px + env(safe-area-inset-left))` }
                          : { right: `calc(${touchJumpSideOffset}px + env(safe-area-inset-right))` }),
                        bottom: `calc(${touchBottomEdge + 6}px + env(safe-area-inset-bottom))`,
                        backgroundColor: PALETTE.cyan,
                        border: `3px solid ${PALETTE.darkPurple}`,
                        opacity: 0.88,
                      }}
                    >
                      <span className={isCompactHud ? 'text-sm leading-none' : 'text-base leading-none'}>▲</span>
                      <span className={isCompactHud ? 'text-[10px] font-extrabold mt-0.5' : 'text-[11px] font-extrabold mt-0.5'}>
                        점프
                      </span>
                    </button>
                  )}

                {/* Touch ADS / Scope Toggle Button (placed above-left of Fire button for AR-47 & Sniper) */}
                {isTabletActive &&
                  (weaponHud.weaponId === 'rifle' || weaponHud.weaponId === 'sniper') && (
                    <button
                      type="button"
                      data-testid="tablet-ads-button"
                      aria-label={weaponHud.weaponId === 'sniper' ? '줌' : '정조준'}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        unlockWeaponAudio();
                        weaponRigRef.current?.toggleAds();
                      }}
                      className="pointer-events-auto fixed rounded-full font-black shadow-xl flex flex-col items-center justify-center active:scale-95 transition-colors"
                      style={{
                        width: touchAdsSize,
                        height: touchAdsSize,
                        ...(settings.tabletSwapControls
                          ? { left: `calc(${touchAdsSideOffset}px + env(safe-area-inset-left))` }
                          : { right: `calc(${touchAdsSideOffset}px + env(safe-area-inset-right))` }),
                        bottom: `calc(${touchAdsBottomOffset}px + env(safe-area-inset-bottom))`,
                        backgroundColor:
                          weaponHud.isAds || weaponHud.isScoped
                            ? 'rgba(62, 224, 176, 0.92)'
                            : 'rgba(15, 25, 35, 0.84)',
                        color: weaponHud.isAds || weaponHud.isScoped ? '#07141d' : '#3ee0b0',
                        border: `2.5px solid ${
                          weaponHud.isAds || weaponHud.isScoped ? '#ffffff' : '#3ee0b0'
                        }`,
                      }}
                    >
                      <span className={isCompactHud ? 'text-xs leading-none' : 'text-sm leading-none'}>
                        ⊕
                      </span>
                      <span
                        className={
                          isCompactHud
                            ? 'text-[9px] font-extrabold mt-0.5 leading-none'
                            : 'text-[10px] font-extrabold mt-0.5 leading-none'
                        }
                      >
                        {weaponHud.weaponId === 'sniper' ? '줌' : '정조준'}
                      </span>
                    </button>
                  )}

                {/* Fire Button (Tablet/Mobile Mode — respects tabletSwapControls & safe-area insets) */}
                {isTabletActive && (
                  <button
                    type="button"
                    data-testid="tablet-fire-button"
                    aria-label="발사"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      unlockWeaponAudio();
                      if (weaponRigRef.current) {
                        isFireHeldRef.current = true;
                        weaponRigRef.current.setFiring(true);
                      } else {
                        shootFnRef.current();
                      }
                      // Like mobile shooters: slide the finger on the fire button to turn while firing
                      inputStateRef.current.fireLookPointerId = e.pointerId;
                      inputStateRef.current.fireLookLastX = e.clientX;
                      inputStateRef.current.fireLookLastY = e.clientY;
                      try {
                        e.currentTarget.setPointerCapture(e.pointerId);
                      } catch {
                        // ignore if synthetic event
                      }
                    }}
                    onPointerMove={(e) => {
                      if (e.pointerId !== inputStateRef.current.fireLookPointerId) return;
                      e.stopPropagation();
                      const mx = e.clientX - inputStateRef.current.fireLookLastX;
                      const my = e.clientY - inputStateRef.current.fireLookLastY;
                      inputStateRef.current.fireLookLastX = e.clientX;
                      inputStateRef.current.fireLookLastY = e.clientY;
                      applyTouchLookDelta(mx, my);
                    }}
                    onPointerUp={(e) => {
                      e.stopPropagation();
                      if (e.pointerId === inputStateRef.current.fireLookPointerId) {
                        inputStateRef.current.fireLookPointerId = null;
                      }
                      releaseWeaponTrigger();
                    }}
                    onPointerCancel={(e) => {
                      if (e.pointerId === inputStateRef.current.fireLookPointerId) {
                        inputStateRef.current.fireLookPointerId = null;
                      }
                      releaseWeaponTrigger();
                    }}
                    onPointerLeave={(e) => {
                      // the captured fire finger keeps firing while it slides off the button to turn
                      if (e.pointerId === inputStateRef.current.fireLookPointerId) return;
                      releaseWeaponTrigger();
                    }}
                    className="pointer-events-auto fixed rounded-full font-black text-white shadow-xl flex flex-col items-center justify-center active:scale-95"
                    style={{
                      width: touchFireSize,
                      height: touchFireSize,
                      ...(settings.tabletSwapControls
                        ? { left: `calc(${touchSideEdge}px + env(safe-area-inset-left))` }
                        : { right: `calc(${touchSideEdge}px + env(safe-area-inset-right))` }),
                      bottom: `calc(${touchBottomEdge + 2}px + env(safe-area-inset-bottom))`,
                      backgroundColor: PALETTE.orange,
                      border: `3px solid ${PALETTE.darkPurple}`,
                      opacity: 0.85,
                    }}
                  >
                    <span className={isCompactHud ? 'text-base leading-none' : 'text-lg'}>◎</span>
                    <span className={isCompactHud ? 'text-[11px] font-extrabold' : 'text-xs font-extrabold'}>발사</span>
                  </button>
                )}
              </div>
            )}
        </div>
      )}

      {/* ==================== 4. PAUSED MODAL ==================== */}
      {phase === 'PAUSED' && !isWeaponModalOpen && (
        <div
          onClickCapture={(e) => {
            if ((e.target as HTMLElement).closest('button')) {
              soundEngine.playUiClick();
            }
          }}
          className="fixed inset-0 z-30 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(43, 42, 94, 0.72)' }}
          role="dialog"
          aria-modal="true"
          aria-label="일시정지 메뉴"
        >
          <div
            className="w-full max-w-md rounded-3xl p-6 text-center shadow-2xl border-2"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.96)',
              borderColor: PALETTE.cyan,
            }}
          >
            <h2
              className="text-2xl font-black mb-1"
              style={{ color: PALETTE.darkPurple }}
            >
              훈련 일시정지
            </h2>
            <p className="text-xs font-bold text-slate-600 mb-5">
              LV.{settings.difficulty} · 현재 점수 {hudScore.toLocaleString()}점 · 남은 시간{' '}
              {formatMmSs(hudTimeLeft)}
            </p>

            {!confirmExitMenu ? (
              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setPhase('PLAYING');
                    soundEngine.setBgmPaused(false);
                    requestArenaPointerLock();
                  }}
                  className="w-full py-3 rounded-2xl font-extrabold text-base text-white"
                  style={{
                    backgroundColor: PALETTE.orange,
                    boxShadow: `0 4px 0 ${PALETTE.darkPurple}`,
                  }}
                >
                  계속하기
                </button>
                <button
                  type="button"
                  onClick={() => startTrainingSession()}
                  className="w-full py-3 rounded-2xl font-extrabold text-base text-white"
                  style={{
                    backgroundColor: PALETTE.primaryPurple,
                    boxShadow: `0 4px 0 ${PALETTE.darkPurple}`,
                  }}
                >
                  처음부터 다시 시작
                </button>
                <button
                  type="button"
                  onClick={() => setShowSettingsModal(true)}
                  className="w-full py-3 rounded-2xl font-extrabold text-base text-slate-900"
                  style={{
                    backgroundColor: PALETTE.cyan,
                    boxShadow: `0 4px 0 ${PALETTE.darkPurple}`,
                  }}
                >
                  게임 설정
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmExitMenu(true)}
                  className="w-full py-2.5 rounded-2xl font-bold text-sm bg-slate-200 text-slate-800"
                >
                  메인 메뉴로 나가기
                </button>
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-purple-50 border border-purple-200 space-y-3">
                <p className="text-sm font-extrabold text-purple-950">
                  현재 진행 중인 훈련을 마치고 메인 메뉴로 돌아갈까요?
                </p>
                <div className="flex gap-2 justify-center">
                  <button
                    type="button"
                    onClick={returnToMainMenu}
                    className="px-5 py-2.5 rounded-xl font-extrabold text-sm text-white"
                    style={{ backgroundColor: PALETTE.orange }}
                  >
                    네, 메인 메뉴로
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmExitMenu(false)}
                    className="px-5 py-2.5 rounded-xl font-bold text-sm bg-slate-200 text-slate-800"
                  >
                    취소
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================== 5. RESULT SCREEN MODAL ==================== */}
      {phase === 'RESULT' && lastResult && (
        <ResultViewModal
          summary={lastResult}
          storageWarning={storageWarning}
          onRetrySame={() => startTrainingSession()}
          onChangeDifficulty={() => {
            returnToMainMenu();
          }}
          onMainMenu={returnToMainMenu}
        />
      )}

      {/* ==================== 6. SUB-MODALS ==================== */}
      {showSettingsModal && (
        <SettingsModal
          settings={settings}
          onUpdate={updateSettings}
          onClose={() => setShowSettingsModal(false)}
          isPlayingOrPaused={phase === 'PAUSED' || phase === 'PLAYING'}
          onRestartGame={() => startTrainingSession()}
          onRunSelfCheck={() => {
            const items = runAllSelfChecks(
              rendererReadyRef.current,
              baseCollidersRef.current,
            );
            setSelfCheckItems(items);
          }}
        />
      )}

      {guideModalTab && (
        <GuideAndControlsModal
          initialTab={guideModalTab}
          onClose={() => setGuideModalTab(null)}
        />
      )}

      {showHistoryModal && (
        <HistoryModal
          records={historyRecords}
          storageWarning={storageWarning}
          onClearAll={() => {
            setHistoryRecords([]);
            try {
              localStorage.removeItem(STORAGE_RESULTS_KEY);
            } catch {
              // ignore
            }
          }}
          onSelectRecord={(rec) => {
            setShowHistoryModal(false);
            setInspectRecord(rec);
          }}
          onClose={() => setShowHistoryModal(false)}
        />
      )}

      {inspectRecord && (
        <ResultViewModal
          summary={inspectRecord}
          storageWarning={storageWarning}
          onRetrySame={() => {
            const d = inspectRecord.difficulty;
            setInspectRecord(null);
            startTrainingSession(d);
          }}
          onChangeDifficulty={() => setInspectRecord(null)}
          onMainMenu={() => setInspectRecord(null)}
        />
      )}

      {selfCheckItems && (
        <SelfCheckModal items={selfCheckItems} onClose={() => setSelfCheckItems(null)} />
      )}

      {/* Weapon system UI */}
      {phase === 'PLAYING' && !isWeaponModalOpen && (
        <>
          <SniperScopeOverlay visible={weaponHud.isScoped} />
          <WeaponHudBar
            hud={weaponHud}
            layoutMode={
              isTabletActive
                ? viewport.isShortLandscape
                  ? 'landscape'
                  : 'portrait'
                : 'desktop'
            }
            swapControls={settings.tabletSwapControls}
            portraitBottomOffset={portraitHudBottomOffset}
            onCycleWeapon={openWeaponModal}
            onToggleFireMode={() => {
              unlockWeaponAudio();
              weaponRigRef.current?.toggleRifleFireMode();
            }}
            onReload={() => {
              unlockWeaponAudio();
              isAdsHeldRef.current = false;
              weaponRigRef.current?.reload();
            }}
            onToggleAds={() => {
              unlockWeaponAudio();
              weaponRigRef.current?.toggleAds();
            }}
          />
        </>
      )}
      {isWeaponModalOpen && (
        <WeaponSelectModal
          currentWeapon={weaponHud.weaponId}
          onSelect={handleWeaponSelect}
          onClose={closeWeaponModal}
        />
      )}
    </div>
  );
}
