/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  ALL_TARGET_TYPES,
  analyzeVisualFieldBiasFeedback,
  DEFAULT_SETTINGS,
  GameSettings,
  getEffectiveAimAssistMul,
  PALETTE,
  SessionRecordSummary,
  TargetTypeId,
  TARGET_TYPES,
  TRAINING_MODES,
  TrainingModeId,
} from '../game/rules';
import { FrameShapeKind } from '../game/worldBuilder';
import { SelfCheckItemResult } from '../game/selfCheck';
import { soundEngine } from '../game/audio';

export function ShapeIconSvg({
  shape,
  color,
  size = 22,
}: {
  shape: FrameShapeKind;
  color: string;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className="inline-block shrink-0"
      aria-hidden="true"
    >
      {shape === 'shield' && (
        <polygon
          points="7,4 25,4 28,7 28,25 25,28 7,28 4,25 4,7"
          fill={color}
          stroke={PALETTE.darkPurple}
          strokeWidth="2.5"
        />
      )}
      {shape === 'circle' && (
        <circle
          cx="16"
          cy="16"
          r="12"
          fill={color}
          stroke={PALETTE.darkPurple}
          strokeWidth="2.5"
        />
      )}
      {shape === 'diamond' && (
        <polygon
          points="16,3 29,16 16,29 3,16"
          fill={color}
          stroke={PALETTE.darkPurple}
          strokeWidth="2.5"
        />
      )}
      {shape === 'hexagon' && (
        <polygon
          points="16,3 27,9.5 27,22.5 16,29 5,22.5 5,9.5"
          fill={color}
          stroke={PALETTE.darkPurple}
          strokeWidth="2.5"
        />
      )}
      {shape === 'star' && (
        <polygon
          points="16,2 20,11 29,12 22,19 24,28 16,23 8,28 10,19 3,12 12,11"
          fill={color}
          stroke={PALETTE.darkPurple}
          strokeWidth="2.2"
        />
      )}
      {shape === 'bracket' && (
        <rect
          x="5"
          y="5"
          width="22"
          height="22"
          rx="4"
          fill={color}
          stroke={PALETTE.darkPurple}
          strokeWidth="2.5"
        />
      )}
      {shape === 'laser_track' && (
        <>
          <path
            d="M 4 21 Q 11 5, 16 16 T 28 11"
            fill="none"
            stroke={PALETTE.darkPurple}
            strokeWidth="6.5"
            strokeLinecap="round"
          />
          <path
            d="M 4 21 Q 11 5, 16 16 T 28 11"
            fill="none"
            stroke={color}
            strokeWidth="3.8"
            strokeLinecap="round"
          />
          <circle cx="4" cy="21" r="3.6" fill={PALETTE.yellow} stroke={PALETTE.darkPurple} strokeWidth="1.5" />
          <circle cx="28" cy="11" r="3.6" fill={PALETTE.magenta} stroke={PALETTE.darkPurple} strokeWidth="1.5" />
        </>
      )}
      <circle cx="16" cy="16" r="4" fill="#FFFFFF" />
    </svg>
  );
}

export function SettingsModal({
  settings,
  onUpdate,
  onClose,
  onRestartGame,
  onRunSelfCheck,
  isPlayingOrPaused,
}: {
  settings: GameSettings;
  onUpdate: (partial: Partial<GameSettings>) => void;
  onClose: () => void;
  onRestartGame?: () => void;
  onRunSelfCheck: () => void;
  isPlayingOrPaused: boolean;
}) {
  return (
    <div
      onClickCapture={(e) => {
        if ((e.target as HTMLElement).closest('button')) soundEngine.playUiClick();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(43, 42, 94, 0.72)' }}
      role="dialog"
      aria-modal="true"
      aria-label="게임 설정"
    >
      <div
        className="w-full max-w-2xl max-h-[90dvh] overflow-y-auto rounded-3xl p-6 text-slate-900 shadow-2xl border-2"
        style={{
          backgroundColor: 'rgba(255, 255, 255, 0.96)',
          borderColor: PALETTE.cyan,
        }}
      >
        <div className="flex items-center justify-between pb-4 border-b border-purple-200">
          <h2
            className="text-2xl font-extrabold tracking-tight"
            style={{ color: PALETTE.darkPurple }}
          >
            게임 설정
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl font-bold text-white transition-transform active:translate-y-0.5"
            style={{
              backgroundColor: PALETTE.primaryPurple,
              boxShadow: `0 4px 0 ${PALETTE.darkPurple}`,
            }}
          >
            닫기
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          {/* Training Mode (MODE 1 ~ MODE 4) */}
          <div className="md:col-span-2 p-3.5 rounded-2xl bg-purple-50 border border-purple-200">
            <label className="block font-bold mb-2 text-purple-950">
              훈련 모드 선택 (MODE 1 ~ MODE 4)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {([1, 2, 3, 4] as TrainingModeId[]).map((mId) => {
                const mCfg = TRAINING_MODES[mId];
                const active = (settings.trainingMode ?? 1) === mId;
                return (
                  <button
                    key={mId}
                    type="button"
                    onClick={() => onUpdate({ trainingMode: mId })}
                    className="p-2.5 rounded-xl text-left transition-all flex items-start justify-between gap-2"
                    style={{
                      backgroundColor: active ? PALETTE.primaryPurple : '#FFFFFF',
                      color: active ? '#FFFFFF' : PALETTE.darkPurple,
                      border: `2px solid ${active ? PALETTE.cyan : '#D8CEFF'}`,
                    }}
                  >
                    <div>
                      <div className="text-xs font-black">
                        {mCfg.code}. {mCfg.name}
                      </div>
                      <div
                        className="text-[11px] font-semibold mt-0.5"
                        style={{ color: active ? '#E2D9FF' : '#475569' }}
                      >
                        이동: {mCfg.allowMovement ? '가능' : '불가능'} · 회전: {mCfg.yawRangeLabel}
                      </div>
                    </div>
                    {active && (
                      <span
                        className="px-2 py-0.5 rounded-full text-[10px] font-black shrink-0"
                        style={{ backgroundColor: PALETTE.yellow, color: PALETTE.darkPurple }}
                      >
                        ✓ 선택
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Difficulty */}
          <div className="p-3.5 rounded-2xl bg-purple-50 border border-purple-200">
            <label className="block font-bold mb-1.5 text-purple-950">
              난이도 단계 (Lv 1 ~ 10)
            </label>
            <div className="grid grid-cols-5 gap-1.5">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((lv) => (
                <button
                  key={lv}
                  type="button"
                  onClick={() => onUpdate({ difficulty: lv })}
                  className="py-1.5 rounded-lg font-extrabold text-xs transition-all"
                  style={{
                    backgroundColor:
                      settings.difficulty === lv ? PALETTE.primaryPurple : '#FFFFFF',
                    color: settings.difficulty === lv ? '#FFFFFF' : PALETTE.darkPurple,
                    border: `2px solid ${
                      settings.difficulty === lv ? PALETTE.darkPurple : '#D8CEFF'
                    }`,
                  }}
                >
                  Lv{lv}
                </button>
              ))}
            </div>
          </div>

          {/* Game Duration */}
          <div className="p-3.5 rounded-2xl bg-purple-50 border border-purple-200">
            <label className="block font-bold mb-1.5 text-purple-950">
              훈련 시간 (초) — 10초 모드 지원
            </label>
            <div className="flex flex-wrap gap-1.5" data-testid="settings-duration-selector">
              {([10, 30, 60, 90, 120, 180, 300] as const).map((sec) => (
                <button
                  key={sec}
                  type="button"
                  data-testid={`settings-duration-${sec}`}
                  onClick={() => onUpdate({ duration: sec })}
                  className="px-2.5 py-1.5 rounded-lg font-bold text-xs transition-all"
                  style={{
                    backgroundColor:
                      settings.duration === sec ? PALETTE.primaryPurple : '#FFFFFF',
                    color: settings.duration === sec ? '#FFFFFF' : PALETTE.darkPurple,
                    border: `2px solid ${
                      settings.duration === sec ? PALETTE.darkPurple : '#D8CEFF'
                    }`,
                  }}
                >
                  {sec}초
                </button>
              ))}
            </div>
          </div>

          {/* Spawn Frequency */}
          <div className="p-3.5 rounded-2xl bg-purple-50 border border-purple-200">
            <label className="block font-bold mb-1.5 text-purple-950">
              목표물 출현 빈도
            </label>
            <div className="flex gap-1.5">
              {([0.5, 1.0, 1.5, 2.0] as const).map((mul) => (
                <button
                  key={mul}
                  type="button"
                  onClick={() => onUpdate({ spawnFrequencyMul: mul })}
                  className="flex-1 py-1.5 rounded-lg font-bold text-xs"
                  style={{
                    backgroundColor:
                      settings.spawnFrequencyMul === mul
                        ? PALETTE.primaryPurple
                        : '#FFFFFF',
                    color:
                      settings.spawnFrequencyMul === mul ? '#FFFFFF' : PALETTE.darkPurple,
                    border: '2px solid #D8CEFF',
                  }}
                >
                  {mul}×
                </button>
              ))}
            </div>
          </div>

          {/* Control Mode */}
          <div className="p-3.5 rounded-2xl bg-purple-50 border border-purple-200">
            <label className="block font-bold mb-1.5 text-purple-950">
              조작 방식 (자동 / PC / 태블릿)
            </label>
            <div className="flex gap-1.5">
              {(
                [
                  ['auto', '자동 감지'],
                  ['pc', 'PC 모드'],
                  ['tablet', '태블릿 모드'],
                ] as const
              ).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => onUpdate({ controlMode: val })}
                  className="flex-1 py-1.5 rounded-lg font-bold text-xs"
                  style={{
                    backgroundColor:
                      settings.controlMode === val ? PALETTE.primaryPurple : '#FFFFFF',
                    color: settings.controlMode === val ? '#FFFFFF' : PALETTE.darkPurple,
                    border: '2px solid #D8CEFF',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Sound & BGM */}
          <div className="p-3.5 rounded-2xl bg-purple-50 border border-purple-200">
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-purple-950">효과음 / 배경음</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onUpdate({ sfxEnabled: !settings.sfxEnabled })}
                  className="px-2.5 py-1 rounded-lg font-bold text-xs"
                  style={{
                    backgroundColor: settings.sfxEnabled ? PALETTE.cyan : '#E2E8F0',
                    color: PALETTE.darkPurple,
                  }}
                >
                  효과음 {settings.sfxEnabled ? 'ON' : 'OFF'}
                </button>
                <button
                  type="button"
                  onClick={() => onUpdate({ bgmEnabled: !settings.bgmEnabled })}
                  className="px-2.5 py-1 rounded-lg font-bold text-xs"
                  style={{
                    backgroundColor: settings.bgmEnabled ? PALETTE.cyan : '#E2E8F0',
                    color: PALETTE.darkPurple,
                  }}
                >
                  배경음 {settings.bgmEnabled ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>
            <label className="block text-xs font-semibold text-purple-900">
              효과음 볼륨: {Math.round(settings.sfxVolume * 100)}%
              <input
                type="range"
                min="0.1"
                max="1.0"
                step="0.05"
                value={settings.sfxVolume}
                onChange={(e) => onUpdate({ sfxVolume: parseFloat(e.target.value) })}
                className="w-full mt-1 accent-purple-600"
              />
            </label>
          </div>

          {/* Mouse & Touch Sensitivity */}
          <div className="p-3.5 rounded-2xl bg-purple-50 border border-purple-200 space-y-2">
            <label className="block text-xs font-bold text-purple-950">
              PC 마우스 감도: {settings.mouseSensitivity.toFixed(1)}×
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.1"
                value={settings.mouseSensitivity}
                onChange={(e) =>
                  onUpdate({ mouseSensitivity: parseFloat(e.target.value) })
                }
                className="w-full mt-1 accent-purple-600"
              />
            </label>
            <label className="block text-xs font-bold text-purple-950">
              태블릿 터치 감도: {settings.touchSensitivity.toFixed(1)}×
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.1"
                value={settings.touchSensitivity}
                onChange={(e) =>
                  onUpdate({ touchSensitivity: parseFloat(e.target.value) })
                }
                className="w-full mt-1 accent-purple-600"
              />
            </label>
          </div>

          {/* Aim Assist & Tablet UI Scale */}
          <div className="p-3.5 rounded-2xl bg-purple-50 border border-purple-200 space-y-2">
            <label className="block text-xs font-bold text-purple-950">
              조준 보조 (기본 판정 영역 배율): {settings.aimAssistMul.toFixed(2)}×
              <input
                type="range"
                min="1.0"
                max="1.5"
                step="0.05"
                value={settings.aimAssistMul}
                onChange={(e) => onUpdate({ aimAssistMul: parseFloat(e.target.value) })}
                className="w-full mt-1 accent-purple-600"
              />
            </label>
            {!settings.tabletDirectTouchHit && (
              <div
                data-testid="precision-aim-effective-info"
                className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-white border border-purple-200 text-purple-900"
              >
                정밀 조준 모드 유효 보정 (Lv{settings.difficulty}):{' '}
                <span className="font-black text-purple-700">
                  {getEffectiveAimAssistMul(
                    settings.aimAssistMul,
                    settings.difficulty,
                    true,
                  ).toFixed(2)}
                  ×
                </span>{' '}
                (고난이도일수록 1.00×에 근접)
              </div>
            )}
            <label className="block text-xs font-bold text-purple-950">
              태블릿 조작 UI 크기: {settings.uiScale}%
              <input
                type="range"
                min="80"
                max="130"
                step="5"
                value={settings.uiScale}
                onChange={(e) => onUpdate({ uiScale: parseInt(e.target.value, 10) })}
                className="w-full mt-1 accent-purple-600"
              />
            </label>
          </div>

          {/* Energy Zero Behavior & Graphics Quality */}
          <div className="p-3.5 rounded-2xl bg-purple-50 border border-purple-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-purple-950">에너지 0일 때</span>
              <button
                type="button"
                onClick={() =>
                  onUpdate({ continueAtZeroEnergy: !settings.continueAtZeroEnergy })
                }
                className="px-3 py-1 rounded-lg font-bold text-xs"
                style={{
                  backgroundColor: settings.continueAtZeroEnergy
                    ? PALETTE.orange
                    : PALETTE.primaryPurple,
                  color: '#FFFFFF',
                }}
              >
                {settings.continueAtZeroEnergy ? '계속하기 (무한)' : '훈련 종료'}
              </button>
            </div>

            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-purple-950">그래픽 품질</span>
              <div className="flex gap-1">
                {(
                  [
                    ['auto', '자동'],
                    ['high', '높음'],
                    ['low', '낮음'],
                  ] as const
                ).map(([q, label]) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => onUpdate({ graphicsQuality: q })}
                    className="px-2.5 py-1 rounded-lg font-bold text-xs"
                    style={{
                      backgroundColor:
                        settings.graphicsQuality === q
                          ? PALETTE.primaryPurple
                          : '#FFFFFF',
                      color:
                        settings.graphicsQuality === q ? '#FFFFFF' : PALETTE.darkPurple,
                      border: '1px solid #D8CEFF',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Direction Hint Settings [3] */}
          <div className="p-3.5 rounded-2xl bg-purple-50 border border-purple-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-xs text-purple-950">
                시야 밖 과녁 방향 힌트
              </span>
              <button
                type="button"
                onClick={() =>
                  onUpdate({ directionHintEnabled: !settings.directionHintEnabled })
                }
                className="px-3 py-1 rounded-lg font-bold text-xs"
                style={{
                  backgroundColor: settings.directionHintEnabled
                    ? PALETTE.cyan
                    : '#E2E8F0',
                  color: PALETTE.darkPurple,
                }}
              >
                {settings.directionHintEnabled ? 'ON (화살표 안내)' : 'OFF'}
              </button>
            </div>
            <div>
              <span className="block text-xs font-semibold text-purple-900 mb-1">
                방향 힌트 표시 대기 시간
              </span>
              <div className="flex gap-1.5">
                {([1.0, 1.8, 2.5, 3.5] as const).map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => onUpdate({ directionHintDelaySec: sec })}
                    className="flex-1 py-1 rounded-lg font-bold text-xs"
                    style={{
                      backgroundColor:
                        settings.directionHintDelaySec === sec
                          ? PALETTE.primaryPurple
                          : '#FFFFFF',
                      color:
                        settings.directionHintDelaySec === sec
                          ? '#FFFFFF'
                          : PALETTE.darkPurple,
                      border: '1px solid #D8CEFF',
                    }}
                  >
                    {sec}초
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Tablet Aim Mode (Direct Touch vs Precision Crosshair) & Handedness Swap */}
          <div className="p-3.5 rounded-2xl bg-purple-50 border border-purple-200 space-y-2.5">
            <div>
              <span className="block font-bold text-xs text-purple-950 mb-1.5">
                태블릿 조준 모드
              </span>
              <div className="grid grid-cols-2 gap-1.5" data-testid="tablet-aim-mode-selector">
                <button
                  type="button"
                  data-testid="tablet-aim-mode-direct"
                  onClick={() => onUpdate({ tabletDirectTouchHit: true })}
                  className="py-1.5 px-2 rounded-lg font-extrabold text-xs transition-all"
                  style={{
                    backgroundColor: settings.tabletDirectTouchHit
                      ? PALETTE.primaryPurple
                      : '#FFFFFF',
                    color: settings.tabletDirectTouchHit ? '#FFFFFF' : PALETTE.darkPurple,
                    border: `2px solid ${
                      settings.tabletDirectTouchHit ? PALETTE.cyan : '#D8CEFF'
                    }`,
                  }}
                >
                  직접 터치 모드
                </button>
                <button
                  type="button"
                  data-testid="tablet-aim-mode-precision"
                  onClick={() => onUpdate({ tabletDirectTouchHit: false })}
                  className="py-1.5 px-2 rounded-lg font-extrabold text-xs transition-all"
                  style={{
                    backgroundColor: !settings.tabletDirectTouchHit
                      ? PALETTE.primaryPurple
                      : '#FFFFFF',
                    color: !settings.tabletDirectTouchHit ? '#FFFFFF' : PALETTE.darkPurple,
                    border: `2px solid ${
                      !settings.tabletDirectTouchHit ? PALETTE.cyan : '#D8CEFF'
                    }`,
                  }}
                >
                  조준선 정밀 조준 모드
                </button>
              </div>
              <p className="text-[11px] font-semibold text-slate-600 mt-1">
                {settings.tabletDirectTouchHit
                  ? '화면에 뜬 과녁을 직접 터치하면 즉시 명중합니다.'
                  : '화면 드래그로 중앙 조준선을 맞춘 뒤 발사 버튼으로 명중합니다. (고난이도 히트박스 보정 축소)'}
              </p>
            </div>

            {settings.tabletDirectTouchHit && (
              <label className="block text-xs font-bold text-purple-950">
                태블릿 터치 판정 보조 배율: {settings.tabletTouchAssistMul.toFixed(2)}×
                <input
                  type="range"
                  min="1.1"
                  max="1.6"
                  step="0.05"
                  value={settings.tabletTouchAssistMul}
                  onChange={(e) =>
                    onUpdate({ tabletTouchAssistMul: parseFloat(e.target.value) })
                  }
                  className="w-full mt-1 accent-purple-600"
                />
              </label>
            )}

            <div className="flex items-center justify-between pt-1">
              <span className="font-bold text-xs text-purple-950">
                조이스틱·발사 좌우 반전
              </span>
              <button
                type="button"
                data-testid="tablet-swap-controls-toggle"
                onClick={() =>
                  onUpdate({ tabletSwapControls: !settings.tabletSwapControls })
                }
                className="px-2.5 py-1 rounded-lg font-bold text-xs"
                style={{
                  backgroundColor: settings.tabletSwapControls
                    ? PALETTE.orange
                    : '#E2E8F0',
                  color: settings.tabletSwapControls ? '#FFFFFF' : PALETTE.darkPurple,
                }}
              >
                {settings.tabletSwapControls
                  ? '왼손잡이 (좌:발사 / 우:이동)'
                  : '기본 (좌:이동 / 우:발사)'}
              </button>
            </div>
          </div>
        </div>

        {/* Footer Actions: Self Check & Reset */}
        <div className="mt-5 pt-4 border-t border-purple-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onRunSelfCheck}
              className="px-4 py-2.5 rounded-xl font-extrabold text-xs text-slate-900"
              style={{
                backgroundColor: PALETTE.cyan,
                boxShadow: `0 4px 0 ${PALETTE.darkPurple}`,
              }}
            >
              자가 점검 실행 (10개 항목)
            </button>
            <button
              type="button"
              onClick={() => onUpdate(DEFAULT_SETTINGS)}
              className="px-3.5 py-2.5 rounded-xl font-bold text-xs bg-slate-200 text-slate-800"
            >
              기본값 복원
            </button>
          </div>

          {isPlayingOrPaused && onRestartGame && (
            <button
              type="button"
              onClick={onRestartGame}
              className="px-5 py-2.5 rounded-xl font-extrabold text-sm text-white"
              style={{
                backgroundColor: PALETTE.orange,
                boxShadow: `0 4px 0 ${PALETTE.darkPurple}`,
              }}
            >
              현재 설정으로 처음부터 다시 시작
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function GuideAndControlsModal({
  initialTab,
  onClose,
}: {
  initialTab: 'guide' | 'controls';
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'guide' | 'controls'>(initialTab);

  return (
    <div
      onClickCapture={(e) => {
        if ((e.target as HTMLElement).closest('button')) soundEngine.playUiClick();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(43, 42, 94, 0.72)' }}
      role="dialog"
      aria-modal="true"
      aria-label="게임 설명 및 조작 방법"
    >
      <div
        className="w-full max-w-3xl max-h-[90dvh] overflow-y-auto rounded-3xl p-6 text-slate-900 shadow-2xl border-2"
        style={{
          backgroundColor: 'rgba(255, 255, 255, 0.97)',
          borderColor: PALETTE.cyan,
        }}
      >
        <div className="flex items-center justify-between pb-3 border-b border-purple-200">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTab('guide')}
              className="px-4 py-2 rounded-xl font-extrabold text-sm"
              style={{
                backgroundColor: tab === 'guide' ? PALETTE.primaryPurple : '#EDE6FA',
                color: tab === 'guide' ? '#FFFFFF' : PALETTE.darkPurple,
              }}
            >
              게임 설명 & 6종 목표물
            </button>
            <button
              type="button"
              onClick={() => setTab('controls')}
              className="px-4 py-2 rounded-xl font-extrabold text-sm"
              style={{
                backgroundColor: tab === 'controls' ? PALETTE.primaryPurple : '#EDE6FA',
                color: tab === 'controls' ? '#FFFFFF' : PALETTE.darkPurple,
              }}
            >
              PC / 태블릿 조작 방법
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl font-bold text-white"
            style={{
              backgroundColor: PALETTE.orange,
              boxShadow: `0 4px 0 ${PALETTE.darkPurple}`,
            }}
          >
            닫기
          </button>
        </div>

        {tab === 'guide' ? (
          <div className="mt-4 space-y-4 text-sm">
            <div className="p-4 rounded-2xl bg-purple-50 border border-purple-200">
              <h3 className="font-extrabold text-base text-purple-950 mb-1">
                100점 만점 정규화 평가 & 6종 핵심 목표물 훈련!
              </h3>
              <p className="text-slate-700 leading-relaxed">
                플레이 시간(10초 ~ 300초)에 관계없이 명중률, 반응속도, 조준 정확도(
                <strong className="text-orange-600">PERFECT / GOOD</strong> 차등 반영)와 오조준·미명중 감점 요인을 종합해 공정한{' '}
                <strong className="text-purple-800">0 ~ 100점 만점</strong>으로 최종 점수를 계산합니다.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {ALL_TARGET_TYPES.map((id, idx) => {
                const spec = TARGET_TYPES[id];
                const shapeMap: Record<TargetTypeId, FrameShapeKind> = {
                  A: 'shield',
                  B: 'circle',
                  C: 'diamond',
                  E: 'star',
                  G: 'shield',
                  H: 'laser_track',
                };
                return (
                  <div
                    key={id}
                    className="flex items-start gap-3 p-3 rounded-2xl bg-white border-2 border-purple-100"
                  >
                    <div className="mt-0.5">
                      <ShapeIconSvg shape={shapeMap[id]} color={spec.color} size={30} />
                    </div>
                    <div>
                      <div className="font-extrabold text-purple-950">
                        {idx + 1}. {spec.name} ({id}형){' '}
                        <span className="text-xs font-bold text-purple-600">
                          ({spec.shapeName})
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5">{spec.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            {/* PC Controls Visual Card */}
            <div className="p-4 rounded-2xl bg-purple-50 border-2 border-purple-200 flex flex-col justify-between">
              <div>
                <h3 className="font-extrabold text-base text-purple-950 mb-2">
                  PC 키보드 & 마우스 조작
                </h3>
                <p className="text-xs text-slate-600 mb-4">
                  시작 버튼을 누르면 마우스가 잠기며 시점을 360° 회전합니다. (미리보기 창에서 잠금이
                  제한되면 자동으로 우클릭 드래그 시점 모드가 켜집니다.)
                </p>
                {/* CSS Keycaps */}
                <div className="flex flex-col items-center my-3">
                  <div className="w-11 h-11 rounded-xl bg-white border-2 border-purple-900 shadow font-extrabold flex items-center justify-center">
                    W
                  </div>
                  <div className="flex gap-1.5 mt-1.5">
                    {['A', 'S', 'D'].map((k) => (
                      <div
                        key={k}
                        className="w-11 h-11 rounded-xl bg-white border-2 border-purple-900 shadow font-extrabold flex items-center justify-center"
                      >
                        {k}
                      </div>
                    ))}
                  </div>
                  <span className="text-xs font-bold text-purple-900 mt-2">
                    W·A·S·D 전후좌우 이동 (벽면 슬라이딩 지원)
                  </span>
                </div>
              </div>
              <div className="space-y-1.5 text-xs bg-white p-3 rounded-xl border border-purple-200">
                <div className="flex justify-between">
                  <span className="font-bold">마우스 이동 / 방향키</span>
                  <span>360° 시점 회전 및 중앙 조준</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-bold">마우스 왼쪽 클릭</span>
                  <span>라이트 블래스터 발사 (단발)</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-bold">ESC 또는 P 키</span>
                  <span>일시정지 및 마우스 잠금 해제</span>
                </div>
              </div>
            </div>

            {/* Tablet Controls Visual Card */}
            <div className="p-4 rounded-2xl bg-cyan-50 border-2 border-cyan-200 flex flex-col justify-between">
              <div>
                <h3 className="font-extrabold text-base text-purple-950 mb-2">
                  태블릿 멀티터치 & 과녁 직접 터치 조작
                </h3>
                <p className="text-xs text-slate-600 mb-3">
                  화면에 보이는 과녁을 손가락으로 직접 터치하면 즉시 명중합니다! 왼손 조이스틱으로 이동하면서 오른손으로 시점을 드래그하거나 발사 버튼을 누를 수도 있습니다.
                </p>
                {/* SVG Tablet Diagram */}
                <svg
                  viewBox="0 0 260 140"
                  className="w-full h-36 rounded-xl bg-gradient-to-b from-sky-200 to-purple-100 border-2 border-purple-900"
                >
                  {/* Crosshair */}
                  <circle
                    cx="130"
                    cy="62"
                    r="8"
                    fill="none"
                    stroke="#2B2A5E"
                    strokeWidth="2.5"
                  />
                  <circle cx="130" cy="62" r="2.5" fill="#FFFFFF" />
                  {/* Left Joystick */}
                  <circle
                    cx="52"
                    cy="98"
                    r="26"
                    fill="rgba(124,92,255,0.28)"
                    stroke="#2B2A5E"
                    strokeWidth="2"
                  />
                  <circle cx="58" cy="92" r="11" fill="#7C5CFF" />
                  <text
                    x="52"
                    y="134"
                    textAnchor="middle"
                    fontSize="9"
                    fontWeight="bold"
                    fill="#2B2A5E"
                  >
                    왼쪽 가상 조이스틱
                  </text>
                  {/* Right Drag Area */}
                  <rect
                    x="125"
                    y="16"
                    width="120"
                    height="66"
                    rx="8"
                    fill="rgba(45,226,230,0.18)"
                    stroke="#2DE2E6"
                    strokeDasharray="4 3"
                  />
                  <text
                    x="185"
                    y="46"
                    textAnchor="middle"
                    fontSize="8.5"
                    fontWeight="bold"
                    fill="#2B2A5E"
                  >
                    과녁 직접 터치: 즉시 명중!
                  </text>
                  <text
                    x="185"
                    y="60"
                    textAnchor="middle"
                    fontSize="8.5"
                    fontWeight="bold"
                    fill="#2B2A5E"
                  >
                    빈 공간 드래그: 시점 회전
                  </text>
                  {/* Fire Button */}
                  <circle
                    cx="210"
                    cy="102"
                    r="22"
                    fill="#FF9F2E"
                    stroke="#2B2A5E"
                    strokeWidth="2.5"
                  />
                  <text
                    x="210"
                    y="105"
                    textAnchor="middle"
                    fontSize="10"
                    fontWeight="bold"
                    fill="#FFFFFF"
                  >
                    발사
                  </text>
                </svg>
              </div>
              <div className="space-y-1.5 text-xs bg-white p-3 rounded-xl border border-cyan-200 mt-3">
                <div className="flex justify-between">
                  <span className="font-bold">과녁 직접 터치</span>
                  <span>터치한 과녁 즉시 명중 (터치 보조 적용)</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-bold">왼쪽 아래 터치</span>
                  <span>터치한 위치에 조이스틱 생성</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-bold">빈 화면 드래그 / 발사 버튼</span>
                  <span>360° 시점 회전 / 중앙 조준 발사</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function SelfCheckModal({
  items,
  onClose,
}: {
  items: SelfCheckItemResult[];
  onClose: () => void;
}) {
  const allPassed = items.every((i) => i.passed);
  return (
    <div
      onClickCapture={(e) => {
        if ((e.target as HTMLElement).closest('button')) soundEngine.playUiClick();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(43, 42, 94, 0.76)' }}
      role="dialog"
      aria-modal="true"
      aria-label="자가 점검 결과"
    >
      <div
        className="w-full max-w-2xl max-h-[90dvh] overflow-y-auto rounded-3xl p-6 text-slate-900 shadow-2xl border-2"
        style={{
          backgroundColor: '#FFFFFF',
          borderColor: allPassed ? PALETTE.lime : PALETTE.orange,
        }}
      >
        <div className="flex items-center justify-between pb-3 border-b border-purple-200">
          <div>
            <h2 className="text-xl font-extrabold" style={{ color: PALETTE.darkPurple }}>
              시스템 자가 점검 리포트 (10개 항목)
            </h2>
            <p className="text-xs text-slate-600">
              실제 게임 기록에 영향을 주지 않는 자동 검증 결과입니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl font-bold text-white"
            style={{
              backgroundColor: PALETTE.primaryPurple,
              boxShadow: `0 4px 0 ${PALETTE.darkPurple}`,
            }}
          >
            닫기
          </button>
        </div>

        <div className="mt-4 space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-start justify-between gap-3 p-3 rounded-2xl border"
              style={{
                backgroundColor: item.passed ? '#F0FDF4' : '#FFF7ED',
                borderColor: item.passed ? '#86EFAC' : '#FDBA74',
              }}
            >
              <div>
                <div className="font-extrabold text-sm text-slate-900">{item.title}</div>
                <div className="text-xs text-slate-600 mt-0.5">{item.detail}</div>
              </div>
              <span
                className="px-3 py-1 rounded-lg font-extrabold text-xs shrink-0"
                style={{
                  backgroundColor: item.passed ? PALETTE.lime : PALETTE.orange,
                  color: PALETTE.darkPurple,
                }}
              >
                {item.passed ? 'PASS' : 'FAIL'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ResultViewModal({
  summary,
  storageWarning,
  onRetrySame,
  onChangeDifficulty,
  onMainMenu,
}: {
  summary: SessionRecordSummary;
  storageWarning: boolean;
  onRetrySame: () => void;
  onChangeDifficulty: () => void;
  onMainMenu: () => void;
}) {
  const [copyBoxText, setCopyBoxText] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string>('');

  const stars = summary.totalScore >= 85 ? 3 : summary.totalScore >= 60 ? 2 : 1;
  const encouragement =
    stars === 3
      ? '참 잘했어요! 눈과 손이 번개처럼 정확해요!'
      : stars === 2
        ? '좋아요! 리듬감 있게 목표물을 잘 찾았어요!'
        : '다음엔 더 잘할 수 있어요! 천천히 중앙을 노려봐요!';

  const perfectHits = summary.perfectHits ?? summary.hits;
  const goodHits = summary.goodHits ?? 0;
  const missCount =
    summary.missCount ?? summary.misses + summary.wrongSelections + summary.missedTargets;

  // Find lowest hitRatePct among 6 types with spawned >= 2
  let lowestType: TargetTypeId | null = null;
  let lowestRate = 999;
  ALL_TARGET_TYPES.forEach((id) => {
    const st = summary.typeStats[id];
    if (st && st.spawned >= 2 && st.hitRatePct < lowestRate) {
      lowestRate = st.hitRatePct;
      lowestType = id;
    }
  });

  const biasFeedback = analyzeVisualFieldBiasFeedback(summary);

  const activeModeId: TrainingModeId = (summary.trainingMode ?? 1) as TrainingModeId;
  const activeModeCfg = TRAINING_MODES[activeModeId] || TRAINING_MODES[1];
  const isStationaryMode = !activeModeCfg.allowMovement;
  const obsAvoidanceDisplay = isStationaryMode
    ? 'N/A'
    : summary.obstacleAvoidanceRatePct !== null && summary.obstacleAvoidanceRatePct !== undefined
      ? `${summary.obstacleAvoidanceRatePct.toFixed(1)}% (회피 ${summary.obstacleDodges} / 충돌 ${summary.obstacleCollisions})`
      : `${summary.obstacleDodges}회 / ${summary.obstacleCollisions}회`;

  const handleCopyText = (asCsv: boolean) => {
    let text = '';
    if (asCsv) {
      text = [
        '항목,값',
        `일시,${summary.timestamp}`,
        `훈련모드번호,${activeModeCfg.code}`,
        `훈련모드이름,${activeModeCfg.name}`,
        `이동가능여부,${activeModeCfg.allowMovement ? '가능' : '불가능(N/A)'}`,
        `시야회전범위,${activeModeCfg.yawRangeLabel}`,
        `난이도,Lv${summary.difficulty}`,
        `최종점수(100점만점),${summary.totalScore}/100`,
        `명중률(%),${summary.accuracyPct}`,
        `명중횟수,${summary.hits}`,
        `공격횟수,${summary.shotsAttempted}`,
        `오조준횟수,${summary.misses}`,
        `평균반응시간(ms),${summary.avgReactionMs}`,
        `PERFECT/GOOD/MISS,${perfectHits}/${goodHits}/${missCount}`,
        `목표물미명중(시간초과),${summary.missedTargets}`,
        `태블릿직접터치명중,${summary.directTouchHits ?? 0}`,
        `후방시야밖목표물명중,${summary.rearTargetsHit ?? 0}/${summary.rearTargetsSpawned ?? 0}`,
        `방향힌트도움횟수,${summary.directionHintShownCount ?? 0}`,
        `첫발사반응시간(ms),${summary.firstShotReactionMs}`,
        `장애물회피성공률,${isStationaryMode ? 'N/A' : `${summary.obstacleAvoidanceRatePct ?? 100}%`}`,
        `진행시간(초),${summary.durationSec}`,
      ].join('\n');
    } else {
      text = `[EYE HAND MISSION 훈련 결과]\n일시: ${summary.timestamp} | ${activeModeCfg.code}: ${activeModeCfg.name} | 난이도: Lv.${summary.difficulty} | 진행 시간: ${summary.durationSec}초\n최종 점수: ${summary.totalScore} / 100점 | 명중률: ${summary.accuracyPct}%\n명중 횟수: ${summary.hits}회 | 공격 횟수: ${summary.shotsAttempted}회 | 오조준 횟수: ${summary.misses}회\n평균 반응시간: ${summary.avgReactionMs}ms | PERFECT / GOOD / MISS: ${perfectHits} / ${goodHits} / ${missCount}\n장애물 회피 성공률: ${obsAvoidanceDisplay}`;
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          setCopyFeedback(asCsv ? 'CSV 복사 완료!' : '결과 텍스트 복사 완료!');
          setTimeout(() => setCopyFeedback(''), 2500);
        })
        .catch(() => {
          setCopyBoxText(text);
        });
    } else {
      setCopyBoxText(text);
    }
  };

  const shapeMap: Record<TargetTypeId, FrameShapeKind> = {
    A: 'shield',
    B: 'circle',
    C: 'diamond',
    E: 'star',
    G: 'shield',
    H: 'laser_track',
  };

  return (
    <div
      onClickCapture={(e) => {
        if ((e.target as HTMLElement).closest('button')) soundEngine.playUiClick();
      }}
      className="fixed inset-0 z-40 flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
      style={{ backgroundColor: 'rgba(43, 42, 94, 0.78)' }}
      role="dialog"
      aria-modal="true"
      aria-label="훈련 결과 리포트"
    >
      <div
        className="w-full max-w-4xl max-h-[92dvh] overflow-y-auto rounded-3xl p-5 sm:p-6 text-slate-900 shadow-2xl border-2"
        style={{
          backgroundColor: 'rgba(255, 255, 255, 0.97)',
          borderColor: PALETTE.cyan,
        }}
      >
        {/* Summary Banner */}
        <div
          className="rounded-2xl p-4 sm:p-5 text-white flex flex-col sm:flex-row items-center justify-between gap-4"
          style={{
            background: `linear-gradient(135deg, ${PALETTE.primaryPurple}, ${PALETTE.darkPurple})`,
          }}
        >
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                data-testid="result-mode-badge"
                className="px-2.5 py-0.5 rounded-full text-xs font-black"
                style={{ backgroundColor: PALETTE.cyan, color: PALETTE.darkPurple }}
              >
                {activeModeCfg.code} · {activeModeCfg.name}
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-cyan-300">
                LV.{summary.difficulty} 눈-손 협응 훈련 완료 ({summary.durationSec}초 모드)
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-extrabold mt-1">{encouragement}</div>
            <div className="text-xs text-purple-200 mt-1">
              이동 가능 여부: {activeModeCfg.allowMovement ? '가능' : '불가능 (제자리 고정)'} · 시야
              회전 범위: {activeModeCfg.yawRangeLabel} · 진행 시간 {summary.durationSec}초
            </div>
          </div>
          <div className="text-center sm:text-right shrink-0">
            <div className="flex justify-center sm:justify-end gap-1 mb-1">
              {[1, 2, 3].map((n) => (
                <span
                  key={n}
                  className="text-2xl"
                  style={{ color: n <= stars ? PALETTE.yellow : 'rgba(255,255,255,0.28)' }}
                >
                  ★
                </span>
              ))}
            </div>
            <div className="text-[11px] font-extrabold text-cyan-200 uppercase tracking-wider">
              최종 점수 (100점 만점)
            </div>
            <div
              data-testid="result-final-score-100"
              className="text-3xl sm:text-4xl font-black tabular-nums text-yellow-300"
            >
              {summary.totalScore}{' '}
              <span className="text-lg sm:text-xl font-extrabold text-white">/ 100점</span>
            </div>
          </div>
        </div>

        {storageWarning && (
          <div className="mt-3 px-4 py-2 rounded-xl bg-amber-100 text-amber-900 text-xs font-bold">
            이 환경에서는 새로고침하면 기록이 사라져요 (메모리 임시 저장 활성화됨)
          </div>
        )}

        {/* Section 1: 7 Required Final Score & Performance Evaluation Cards */}
        <div
          data-testid="result-core-metrics-grid"
          className="mt-3.5 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 text-xs"
        >
          <div className="p-2.5 rounded-2xl bg-purple-100 border-2 border-purple-400 flex flex-col justify-between">
            <span className="text-purple-900 font-extrabold">최종 점수</span>
            <span
              data-testid="metric-final-score"
              className="text-base sm:text-lg font-black text-purple-950 tabular-nums mt-0.5"
            >
              {summary.totalScore} / 100점
            </span>
          </div>
          <div className="p-2.5 rounded-2xl bg-purple-50 border border-purple-200 flex flex-col justify-between">
            <span className="text-slate-600 font-semibold">명중률(%)</span>
            <span
              data-testid="metric-accuracy-pct"
              className="text-base sm:text-lg font-extrabold text-purple-950 tabular-nums mt-0.5"
            >
              {summary.accuracyPct.toFixed(1)}%
            </span>
          </div>
          <div className="p-2.5 rounded-2xl bg-purple-50 border border-purple-200 flex flex-col justify-between">
            <span className="text-slate-600 font-semibold">명중 횟수</span>
            <span
              data-testid="metric-hits"
              className="text-base sm:text-lg font-extrabold text-purple-950 tabular-nums mt-0.5"
            >
              {summary.hits}회
            </span>
          </div>
          <div className="p-2.5 rounded-2xl bg-purple-50 border border-purple-200 flex flex-col justify-between">
            <span className="text-slate-600 font-semibold">공격 횟수</span>
            <span
              data-testid="metric-shots-attempted"
              className="text-base sm:text-lg font-extrabold text-purple-950 tabular-nums mt-0.5"
            >
              {summary.shotsAttempted}회
            </span>
          </div>
          <div className="p-2.5 rounded-2xl bg-purple-50 border border-purple-200 flex flex-col justify-between">
            <span className="text-slate-600 font-semibold">오조준 횟수</span>
            <span
              data-testid="metric-off-target-misses"
              className="text-base sm:text-lg font-extrabold text-purple-950 tabular-nums mt-0.5"
            >
              {summary.misses}회
            </span>
          </div>
          <div className="p-2.5 rounded-2xl bg-purple-50 border border-purple-200 flex flex-col justify-between">
            <span className="text-slate-600 font-semibold">평균 반응시간(ms)</span>
            <span
              data-testid="metric-avg-reaction-ms"
              className="text-base sm:text-lg font-extrabold text-purple-950 tabular-nums mt-0.5"
            >
              {summary.avgReactionMs} ms
            </span>
          </div>
          <div className="col-span-2 sm:col-span-2 lg:col-span-1 p-2.5 rounded-2xl bg-amber-50 border-2 border-amber-300 flex flex-col justify-between">
            <span className="text-amber-950 font-extrabold">PERFECT / GOOD / MISS</span>
            <span
              data-testid="metric-pgm-counts"
              className="text-sm sm:text-base font-black text-purple-950 tabular-nums mt-0.5"
            >
              {perfectHits} / {goodHits} / {missCount}
            </span>
          </div>
        </div>

        {/* Section 6: Selected Training Mode Specification Summary Card */}
        <div
          data-testid="result-mode-summary-card"
          className="mt-3 p-3 rounded-2xl bg-cyan-50/90 border border-cyan-300 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs"
        >
          <div>
            <span className="text-slate-600 font-semibold block">훈련 모드 번호 / 이름</span>
            <span className="font-black text-purple-950">
              {activeModeCfg.code} · {activeModeCfg.name}
            </span>
          </div>
          <div>
            <span className="text-slate-600 font-semibold block">플레이어 이동 여부</span>
            <span className="font-black text-purple-950">
              {isStationaryMode ? '불가능 (N/A · 제자리)' : '가능 (자유 이동)'}
            </span>
          </div>
          <div>
            <span className="text-slate-600 font-semibold block">시야 회전 범위</span>
            <span className="font-black text-purple-950">{activeModeCfg.yawRangeLabel}</span>
          </div>
          <div>
            <span className="text-slate-600 font-semibold block">장애물 회피 성공률</span>
            <span
              data-testid="result-obstacle-avoidance-value"
              className="font-black text-purple-950"
            >
              {obsAvoidanceDisplay}
            </span>
          </div>
        </div>

        {/* Table 1: Additional Detailed Telemetry */}
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          {[
            ['첫 발사 반응시간', `${summary.firstShotReactionMs} ms`],
            ['목표물 미명중 (놓침)', `${summary.missedTargets}개`],
            ['태블릿 직접 터치 명중', `${summary.directTouchHits ?? 0}회`],
            [
              '후방·시야밖 목표물 명중',
              activeModeCfg.allowRearTargets
                ? `${summary.rearTargetsHit ?? 0} / ${summary.rearTargetsSpawned ?? 0}개`
                : '전방 전용 모드 (0개)',
            ],
          ].map(([k, v]) => (
            <div
              key={k}
              className="p-2 rounded-xl bg-purple-50/70 border border-purple-200 flex flex-col justify-between"
            >
              <span className="text-slate-600 font-semibold">{k}</span>
              <span className="text-sm font-extrabold text-purple-950 tabular-nums mt-0.5">
                {v}
              </span>
            </div>
          ))}
        </div>

        {/* Table 2: Per-Type Breakdown (6 Target Types) */}
        <div className="mt-4">
          <h3 className="text-sm font-extrabold text-purple-950 mb-2">
            6종 목표물 유형별 결과 — 유형별 명중률 및 평균 반응시간
          </h3>
          <div className="overflow-x-auto rounded-2xl border border-purple-200">
            <table className="w-full text-xs text-left" data-testid="result-target-type-table">
              <thead className="bg-purple-100 text-purple-950 font-extrabold">
                <tr>
                  <th className="p-2.5">목표물 유형 (6종)</th>
                  <th className="p-2.5">특징</th>
                  <th className="p-2.5 text-right">출현</th>
                  <th className="p-2.5 text-right">명중</th>
                  <th className="p-2.5 text-right">미명중</th>
                  <th className="p-2.5 text-right">유형별 명중률</th>
                  <th className="p-2.5 text-right">평균 반응시간</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-purple-100">
                {ALL_TARGET_TYPES.map((id, idx) => {
                  const spec = TARGET_TYPES[id];
                  const st = summary.typeStats[id] ?? {
                    spawned: 0,
                    hits: 0,
                    missed: 0,
                    hitRatePct: 0,
                    avgReactionMs: 0,
                  };
                  const needsPractice = lowestType === id;
                  return (
                    <tr
                      key={id}
                      data-testid={`result-type-row-${id}`}
                      style={{
                        backgroundColor: needsPractice ? '#FFF3E0' : '#FFFFFF',
                      }}
                    >
                      <td className="p-2.5 font-bold flex items-center gap-2">
                        <ShapeIconSvg shape={shapeMap[id]} color={spec.color} size={20} />
                        <span>
                          {idx + 1}. {spec.name} ({id}형)
                        </span>
                        {needsPractice && (
                          <span
                            className="px-2 py-0.5 rounded-md text-[10px] font-extrabold text-white"
                            style={{ backgroundColor: PALETTE.orange }}
                          >
                            연습 추천
                          </span>
                        )}
                      </td>
                      <td className="p-2.5 text-slate-600">{spec.description}</td>
                      <td className="p-2.5 text-right tabular-nums">{st.spawned}</td>
                      <td className="p-2.5 text-right tabular-nums font-bold">{st.hits}</td>
                      <td className="p-2.5 text-right tabular-nums">{st.missed}</td>
                      <td className="p-2.5 text-right tabular-nums font-extrabold">
                        {st.spawned > 0 ? `${st.hitRatePct.toFixed(1)}%` : '-'}
                      </td>
                      <td className="p-2.5 text-right tabular-nums">
                        {st.hits > 0 ? `${st.avgReactionMs} ms` : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* SVG Charts: 1. Bar Chart by 6 Target Types, 2. 6-Segment Timeline Line Chart */}
        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Chart 1: Bar Graph */}
          <div className="p-3.5 rounded-2xl bg-purple-50 border border-purple-200">
            <h4 className="text-xs font-extrabold text-purple-950 mb-2">
              6종 목표물 유형별 명중률 막대그래프 (%)
            </h4>
            <svg viewBox="0 0 320 150" className="w-full h-36 bg-white rounded-xl p-2">
              {ALL_TARGET_TYPES.map((id, idx) => {
                const st = summary.typeStats[id] ?? {
                  spawned: 0,
                  hits: 0,
                  missed: 0,
                  hitRatePct: 0,
                  avgReactionMs: 0,
                };
                const pct = st.hitRatePct;
                const barH = Math.max(3, (pct / 100) * 92);
                const x = 20 + idx * 48;
                const y = 118 - barH;
                return (
                  <g key={id}>
                    <rect
                      x={x}
                      y={y}
                      width="28"
                      height={barH}
                      rx="5"
                      fill={TARGET_TYPES[id].color}
                      stroke={PALETTE.darkPurple}
                      strokeWidth="1.5"
                    />
                    <text
                      x={x + 14}
                      y={y - 5}
                      textAnchor="middle"
                      fontSize="8.5"
                      fontWeight="bold"
                      fill="#2B2A5E"
                    >
                      {st.spawned > 0 ? `${Math.round(pct)}%` : '-'}
                    </text>
                    <text
                      x={x + 14}
                      y={135}
                      textAnchor="middle"
                      fontSize="8.5"
                      fontWeight="bold"
                      fill="#2B2A5E"
                    >
                      {id}형
                    </text>
                  </g>
                );
              })}
              <line
                x1="10"
                y1="118"
                x2="310"
                y2="118"
                stroke="#CBD5E1"
                strokeWidth="1.5"
              />
            </svg>
          </div>

          {/* Chart 2: 6-Segment Time Accuracy Line Chart */}
          <div className="p-3.5 rounded-2xl bg-purple-50 border border-purple-200">
            <h4 className="text-xs font-extrabold text-purple-950 mb-2">
              시간 경과별 명중률 꺾은선그래프 (6등분 구간)
            </h4>
            <svg viewBox="0 0 320 150" className="w-full h-36 bg-white rounded-xl p-2">
              <line x1="24" y1="22" x2="296" y2="22" stroke="#F1F5F9" strokeWidth="1" />
              <line x1="24" y1="70" x2="296" y2="70" stroke="#F1F5F9" strokeWidth="1" />
              <line x1="24" y1="118" x2="296" y2="118" stroke="#CBD5E1" strokeWidth="1.5" />
              {(() => {
                const pts = summary.timelineBuckets.map((b, i) => {
                  const x = 34 + i * 50;
                  const y = 118 - (b.accuracyPct / 100) * 92;
                  return { x, y, pct: b.accuracyPct, idx: i + 1 };
                });
                const poly = pts.map((p) => `${p.x},${p.y}`).join(' ');
                return (
                  <>
                    <polyline
                      fill="none"
                      stroke={PALETTE.primaryPurple}
                      strokeWidth="3"
                      points={poly}
                    />
                    {pts.map((p) => (
                      <g key={p.idx}>
                        <circle
                          cx={p.x}
                          cy={p.y}
                          r="4.5"
                          fill={PALETTE.orange}
                          stroke="#2B2A5E"
                          strokeWidth="1.5"
                        />
                        <text
                          x={p.x}
                          y={p.y - 7}
                          textAnchor="middle"
                          fontSize="8.5"
                          fontWeight="bold"
                          fill="#2B2A5E"
                        >
                          {Math.round(p.pct)}%
                        </text>
                        <text
                          x={p.x}
                          y={135}
                          textAnchor="middle"
                          fontSize="9.5"
                          fontWeight="bold"
                          fill="#64748B"
                        >
                          {p.idx}구간
                        </text>
                      </g>
                    ))}
                  </>
                );
              })()}
            </svg>
          </div>
        </div>

        {/* Visual Search Balance Analysis: Screen Zones (Left/Center/Right) & 360° Arena Sectors */}
        <div
          data-testid="visual-search-zone-card"
          className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3"
        >
          {/* Screen Horizontal Zone Stats */}
          <div className="p-3 rounded-2xl bg-purple-50/80 border border-purple-200">
            <h4 className="text-xs font-extrabold text-purple-950 mb-2">
              시야 구역별 발사·명중 균형 (좌 / 중앙 / 우)
            </h4>
            <div className="grid grid-cols-3 gap-2 text-center">
              {(
                [
                  { key: 'left', label: '좌측 시야' },
                  { key: 'center', label: '중앙 시야' },
                  { key: 'right', label: '우측 시야' },
                ] as const
              ).map(({ key, label }) => {
                const z = summary.screenZoneStats?.[key] ?? { shots: 0, hits: 0 };
                const rate = z.shots > 0 ? Math.round((z.hits / z.shots) * 100) : 0;
                return (
                  <div
                    key={key}
                    className="p-2 rounded-xl bg-white border border-purple-100"
                  >
                    <div className="text-[10px] font-bold text-slate-600">{label}</div>
                    <div className="text-sm font-black text-purple-950 mt-0.5">
                      {z.shots > 0 ? `${rate}%` : '-'}
                    </div>
                    <div className="text-[10px] font-semibold text-purple-700">
                      {z.hits}/{z.shots}회
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 360° Arena Sector Stats (Distinguishing Front ±45° vs 360° Free Rotation Mode) */}
          <div className="p-3 rounded-2xl bg-purple-50/80 border border-purple-200">
            <h4 className="text-xs font-extrabold text-purple-950 mb-2">
              {activeModeCfg.allowRearTargets
                ? '360° 자유 회전 모드 — 방위별 목표물 명중률'
                : '전방 시야(±45°) 모드 — 전방 집중 탐색 명중률'}
            </h4>
            <div className="grid grid-cols-4 gap-1.5 text-center">
              {(
                [
                  { key: 'FRONT', label: '정면(N)' },
                  { key: 'LEFT', label: '좌측(W)' },
                  { key: 'RIGHT', label: '우측(E)' },
                  { key: 'REAR', label: '후방(S)' },
                ] as const
              ).map(({ key, label }) => {
                const sec = summary.sectorStats?.[key] ?? { spawned: 0, hits: 0 };
                const rate = sec.spawned > 0 ? Math.round((sec.hits / sec.spawned) * 100) : 0;
                const disabledInFrontMode = !activeModeCfg.allowRearTargets && key !== 'FRONT';
                return (
                  <div
                    key={key}
                    className="p-1.5 rounded-xl bg-white border border-purple-100"
                  >
                    <div className="text-[10px] font-bold text-slate-600">{label}</div>
                    <div className="text-sm font-black text-purple-950 mt-0.5">
                      {disabledInFrontMode
                        ? 'N/A'
                        : sec.spawned > 0
                          ? `${rate}%`
                          : '-'}
                    </div>
                    <div className="text-[10px] font-semibold text-purple-700">
                      {disabledInFrontMode ? '출현 제외' : `${sec.hits}/${sec.spawned}개`}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Visual-Field Bias Feedback */}
          <div
            data-testid="visual-bias-feedback"
            className="sm:col-span-2 px-3.5 py-2.5 rounded-xl border text-xs font-bold flex items-center gap-2"
            style={{
              backgroundColor: biasFeedback.hasWeakDirection ? '#FFF7ED' : '#F0FDF4',
              borderColor: biasFeedback.hasWeakDirection ? '#FB923C' : '#86EFAC',
              color: biasFeedback.hasWeakDirection ? '#9A3412' : '#166534',
            }}
          >
            <span className="font-black shrink-0">
              {biasFeedback.hasWeakDirection ? '시야 편향 피드백' : '시야 균형 분석'}
            </span>
            <span>{biasFeedback.message}</span>
          </div>
        </div>

        {/* Copy Fallback Box if needed */}
        {copyBoxText && (
          <div className="mt-3 p-3 rounded-xl bg-slate-100 border border-slate-300">
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs font-bold">아래 텍스트를 선택해 복사하세요:</span>
              <button
                type="button"
                onClick={() => setCopyBoxText(null)}
                className="text-xs font-bold text-purple-700"
              >
                닫기
              </button>
            </div>
            <textarea
              readOnly
              value={copyBoxText}
              className="w-full h-24 p-2 text-xs font-mono bg-white rounded border"
              onFocus={(e) => e.currentTarget.select()}
            />
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-5 pt-4 border-t border-purple-200 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap gap-2 items-center">
            <button
              type="button"
              onClick={() => handleCopyText(false)}
              className="px-3.5 py-2.5 rounded-xl font-bold text-xs bg-purple-100 text-purple-950 hover:bg-purple-200"
            >
              결과 텍스트 복사
            </button>
            <button
              type="button"
              onClick={() => handleCopyText(true)}
              className="px-3.5 py-2.5 rounded-xl font-bold text-xs bg-cyan-100 text-slate-900 hover:bg-cyan-200"
            >
              CSV 복사
            </button>
            {copyFeedback && (
              <span className="text-xs font-extrabold text-emerald-700">{copyFeedback}</span>
            )}
          </div>

          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              data-start="true"
              onClick={onRetrySame}
              className="px-5 py-2.5 rounded-xl font-extrabold text-sm text-white"
              style={{
                backgroundColor: PALETTE.orange,
                boxShadow: `0 4px 0 ${PALETTE.darkPurple}`,
              }}
            >
              다시 하기
            </button>
            <button
              type="button"
              onClick={onChangeDifficulty}
              className="px-4 py-2.5 rounded-xl font-extrabold text-sm text-white"
              style={{
                backgroundColor: PALETTE.primaryPurple,
                boxShadow: `0 4px 0 ${PALETTE.darkPurple}`,
              }}
            >
              난이도 바꾸기
            </button>
            <button
              type="button"
              onClick={onMainMenu}
              className="px-4 py-2.5 rounded-xl font-bold text-sm bg-slate-200 text-slate-800"
            >
              메인 메뉴
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function HistoryModal({
  records,
  storageWarning,
  onClearAll,
  onSelectRecord,
  onClose,
}: {
  records: SessionRecordSummary[];
  storageWarning: boolean;
  onClearAll: () => void;
  onSelectRecord: (rec: SessionRecordSummary) => void;
  onClose: () => void;
}) {
  const [confirmClear, setConfirmClear] = useState(false);

  return (
    <div
      onClickCapture={(e) => {
        if ((e.target as HTMLElement).closest('button')) soundEngine.playUiClick();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(43, 42, 94, 0.75)' }}
      role="dialog"
      aria-modal="true"
      aria-label="훈련 결과 기록"
    >
      <div
        className="w-full max-w-3xl max-h-[90dvh] overflow-y-auto rounded-3xl p-6 text-slate-900 shadow-2xl border-2"
        style={{
          backgroundColor: 'rgba(255, 255, 255, 0.97)',
          borderColor: PALETTE.cyan,
        }}
      >
        <div className="flex items-center justify-between pb-3 border-b border-purple-200">
          <div>
            <h2 className="text-xl font-extrabold" style={{ color: PALETTE.darkPurple }}>
              최근 훈련 결과 기록 (최대 20회)
            </h2>
            {storageWarning && (
              <p className="text-xs font-bold text-amber-700">
                이 환경에서는 새로고침하면 기록이 사라져요.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl font-bold text-white"
            style={{
              backgroundColor: PALETTE.primaryPurple,
              boxShadow: `0 4px 0 ${PALETTE.darkPurple}`,
            }}
          >
            닫기
          </button>
        </div>

        {records.length === 0 ? (
          <div className="py-12 text-center text-slate-500 font-bold">
            아직 저장된 훈련 기록이 없어요. 첫 미션을 시작해 보세요!
          </div>
        ) : (
          <>
            {/* Trend Line Chart across sessions */}
            <div className="mt-4 p-3.5 rounded-2xl bg-purple-50 border border-purple-200">
              <h3 className="text-xs font-extrabold text-purple-950 mb-2">
                회차별 명중률 변화 추이 (%)
              </h3>
              <svg viewBox="0 0 420 110" className="w-full h-28 bg-white rounded-xl p-2">
                <line x1="20" y1="90" x2="400" y2="90" stroke="#CBD5E1" strokeWidth="1.5" />
                {(() => {
                  const chron = [...records].reverse();
                  const step = chron.length > 1 ? 360 / (chron.length - 1) : 0;
                  const pts = chron.map((r, i) => ({
                    x: 30 + i * step,
                    y: 90 - (r.accuracyPct / 100) * 70,
                    pct: r.accuracyPct,
                  }));
                  const poly = pts.map((p) => `${p.x},${p.y}`).join(' ');
                  return (
                    <>
                      {pts.length > 1 && (
                        <polyline
                          fill="none"
                          stroke={PALETTE.primaryPurple}
                          strokeWidth="2.5"
                          points={poly}
                        />
                      )}
                      {pts.map((p, idx) => (
                        <circle
                          key={idx}
                          cx={p.x}
                          cy={p.y}
                          r="4"
                          fill={PALETTE.orange}
                          stroke="#2B2A5E"
                          strokeWidth="1.2"
                        />
                      ))}
                    </>
                  );
                })()}
              </svg>
            </div>

            {/* Session List */}
            <div className="mt-4 space-y-2 max-h-64 overflow-y-auto">
              {records.map((rec, idx) => (
                <div
                  key={rec.id}
                  className="flex items-center justify-between p-3 rounded-2xl bg-white border border-purple-200 hover:border-purple-400"
                >
                  <div className="text-xs">
                    <span className="font-extrabold text-purple-950">
                      #{records.length - idx} · {rec.trainingModeCode ?? 'MODE 1'} (
                      {rec.trainingModeName ?? '제자리 고정 + 전방 시야'}) · Lv.{rec.difficulty}
                    </span>
                    <span className="text-slate-500 ml-2">{rec.timestamp}</span>
                    <div className="mt-0.5 text-slate-700 font-semibold tabular-nums">
                      최종 점수 {rec.totalScore}/100점 · 명중률 {rec.accuracyPct}% · 평균 반응{' '}
                      {rec.avgReactionMs}ms · 장애물 회피{' '}
                      {rec.movementAllowed === false
                        ? 'N/A'
                        : `${rec.obstacleAvoidanceRatePct ?? 100}%`}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onSelectRecord(rec)}
                    className="px-3.5 py-1.5 rounded-xl font-bold text-xs text-white"
                    style={{ backgroundColor: PALETTE.primaryPurple }}
                  >
                    상세 보기
                  </button>
                </div>
              ))}
            </div>

            {/* Clear History Custom Confirmation */}
            <div className="mt-4 pt-3 border-t border-purple-200 flex items-center justify-between">
              {!confirmClear ? (
                <button
                  type="button"
                  onClick={() => setConfirmClear(true)}
                  className="px-3.5 py-2 rounded-xl font-bold text-xs bg-rose-100 text-rose-800"
                >
                  기록 모두 지우기
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-rose-800">
                    모든 훈련 기록을 지울까요?
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      onClearAll();
                      setConfirmClear(false);
                    }}
                    className="px-3 py-1.5 rounded-lg font-extrabold text-xs bg-rose-600 text-white"
                  >
                    네, 지울게요
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClear(false)}
                    className="px-3 py-1.5 rounded-lg font-bold text-xs bg-slate-200 text-slate-800"
                  >
                    취소
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
