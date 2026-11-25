import React from 'react';
import { WEAPON_SPECS, WeaponHudState, WeaponId } from '../game/weaponSystem';

interface WeaponCardMeta {
  id: WeaponId;
  title: string;
  category: string;
  subtitle: string;
  stats: string;
}

const IN_GAME_WEAPON_CARDS: WeaponCardMeta[] = [
  {
    id: 'rifle',
    title: 'AR-47 스트라이커',
    category: '돌격소총',
    subtitle: '연사 / 단발(V) · 우클릭 정조준',
    stats: '25발 · 중·장거리 밸런스',
  },
  {
    id: 'pistol',
    title: '권총',
    category: '보조무기',
    subtitle: '빠른 조준 · 높은 기동성',
    stats: '12발 · 정밀 단발 사격',
  },
  {
    id: 'sniper',
    title: '저격총',
    category: '스나이퍼',
    subtitle: '고배율 스코프 · 강력한 단발',
    stats: '5발 · 원거리 정밀 타격',
  },
];

function WeaponSilhouette({ id }: { id: WeaponId }) {
  if (id === 'pistol') {
    return (
      <svg viewBox="0 0 180 76" className="h-14 w-full max-w-[150px] text-white/95" fill="currentColor">
        <path d="M26 20h98c4 0 7 3 7 7v11c0 3-2 5-5 5H94l-7 25c-1 3-4 5-7 5H63c-3 0-5-3-4-6l6-24H42l-5-7H26c-3 0-5-2-5-5v-6c0-3 2-5 5-5zm108 4h14v7h-14v-7zm-56 19h14l-2 8H76l2-8z" />
      </svg>
    );
  }
  if (id === 'sniper') {
    return (
      <svg viewBox="0 0 240 76" className="h-14 w-full max-w-[205px] text-white/95" fill="currentColor">
        <path d="M12 31h40l8-5h58l8 4h82v6h-82l-6 5h-14l-5 15h-14l4-15H70l-8 14H46l5-14H28l-10 8H8V35c0-2 2-4 4-4zm64-15h46c3 0 5 2 5 5v4H71v-4c0-3 2-5 5-5zm-8 3h6v5h-6v-5zm60 0h8v5h-8v-5zm78 10h24v4h-24v-4z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 220 76" className="h-14 w-full max-w-[190px] text-white/95" fill="currentColor">
      <path d="M14 29h36l10-5h76l10 4h46v7h-46l-7 5h-22l-4 20c-1 3-3 4-6 4H95c-2 0-4-2-3-5l4-19H76l-7 15H55l5-15H36l-12 9H12V33c0-2 1-4 2-4zm62-11h34v5H76v-5zm116 9h16v5h-16v-5z" />
    </svg>
  );
}

interface WeaponSelectModalProps {
  currentWeapon: WeaponId;
  onSelect: (id: WeaponId) => void;
  onClose: () => void;
}

export function WeaponSelectModal({
  currentWeapon,
  onSelect,
  onClose,
}: WeaponSelectModalProps) {
  return (
    <div
      data-testid="weapon-select-modal"
      role="dialog"
      aria-modal="true"
      aria-label="인게임 무기 선택"
      onClick={onClose}
      onContextMenu={(e) => e.preventDefault()}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 select-none"
      style={{
        backgroundColor: 'rgba(15, 23, 32, 0.78)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-3xl max-h-[92dvh] overflow-y-auto rounded-2xl border border-slate-600/70 bg-[#101923]/95 p-5 sm:p-6 shadow-2xl"
      >
        {/* Header */}
        <div className="mb-5 flex items-center justify-between border-b border-slate-700/80 pb-3.5">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[#3ee0b0] shadow-[0_0_8px_#3ee0b0]" />
              <h2 className="text-lg sm:text-xl font-black tracking-wide text-white">
                무기 선택
              </h2>
            </div>
            <p className="mt-1 text-xs font-medium text-slate-400">
              장착할 무기를 선택하면 즉시 교체되고 전투로 복귀합니다. (B / ESC 닫기)
            </p>
          </div>
          <button
            type="button"
            data-testid="weapon-modal-close-button"
            aria-label="닫기"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-600/80 bg-slate-900/90 text-base font-black text-slate-200 transition hover:border-[#3ee0b0] hover:text-[#3ee0b0] active:scale-95"
          >
            ✕
          </button>
        </div>

        {/* 3 Weapon Cards Only (No Game Mode UI) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          {IN_GAME_WEAPON_CARDS.map((card) => {
            const isEquipped = currentWeapon === card.id;
            const spec = WEAPON_SPECS[card.id];
            return (
              <button
                key={card.id}
                type="button"
                data-testid={`weapon-card-${card.id}`}
                onClick={() => onSelect(card.id)}
                className={`group relative flex flex-col justify-between rounded-xl border p-4 text-left transition-all active:scale-[0.98] ${
                  isEquipped
                    ? 'border-[#3ee0b0] bg-[#3ee0b0]/15 shadow-[0_0_24px_rgba(62,224,176,0.2)]'
                    : 'border-slate-700/90 bg-slate-900/75 hover:border-[#3ee0b0] hover:bg-slate-800/85'
                }`}
              >
                {/* Top mint category bar */}
                <div>
                  <div className="mb-3 flex items-center justify-between gap-2 border-t-2 border-[#3ee0b0]/80 pt-2">
                    <span className="text-[11px] font-extrabold tracking-widest text-[#3ee0b0]">
                      {card.category}
                    </span>
                    {isEquipped && (
                      <span className="rounded bg-[#3ee0b0] px-2 py-0.5 text-[10px] font-black text-slate-950">
                        장착 중
                      </span>
                    )}
                  </div>

                  {/* Silhouette preview */}
                  <div className="my-3 flex h-20 items-center justify-center rounded-lg bg-slate-950/60 px-3 border border-slate-800/80 group-hover:border-[#3ee0b0]/40 transition-colors">
                    <WeaponSilhouette id={card.id} />
                  </div>
                </div>

                {/* Weapon title & summary */}
                <div className="mt-1">
                  <div className="text-base font-black text-white group-hover:text-[#3ee0b0] transition-colors">
                    {card.title}
                  </div>
                  <div className="mt-1 text-xs font-semibold text-slate-300">
                    {card.subtitle}
                  </div>
                  <div className="mt-2 flex items-center justify-between border-t border-slate-700/60 pt-2 text-[11px] font-bold text-slate-400">
                    <span>{card.stats}</span>
                    <span className="font-mono text-slate-300">DMG {spec.damage}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function SniperScopeOverlay({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center">
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at center, transparent 34%, rgba(5, 8, 12, 0.96) 36%)',
        }}
      />
      <div className="absolute h-[1px] w-full bg-black/80" />
      <div className="absolute h-full w-[1px] bg-black/80" />
      <div className="h-1.5 w-1.5 rounded-full bg-rose-500 shadow-[0_0_8px_#ff4655]" />
    </div>
  );
}

interface WeaponHudBarProps {
  hud: WeaponHudState;
  layoutMode?: 'desktop' | 'portrait' | 'landscape';
  swapControls?: boolean;
  portraitBottomOffset?: number;
  onCycleWeapon: () => void;
  onToggleFireMode: () => void;
  onReload: () => void;
  onToggleAds: () => void;
}

export function WeaponHudBar({
  hud,
  layoutMode = 'desktop',
  swapControls = false,
  portraitBottomOffset = 166,
  onCycleWeapon,
  onToggleFireMode,
  onReload,
  onToggleAds,
}: WeaponHudBarProps) {
  const spec = WEAPON_SPECS[hud.weaponId];
  const isRifle = hud.weaponId === 'rifle';
  const isAimActive = hud.isScoped || hud.isAds;
  const fireModeLabel = hud.fireMode === 'AUTO' ? '연사' : '단발';

  // Mobile short landscape: single sleek horizontal bar centered at bottom between Joystick & Fire/Jump
  if (layoutMode === 'landscape') {
    return (
      <div
        className="pointer-events-auto fixed left-1/2 -translate-x-1/2 z-40 flex items-center gap-1.5 select-none"
        style={{ bottom: 'calc(10px + env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-center gap-1">
          {isRifle && (
            <button
              type="button"
              data-testid="hud-fire-mode-button"
              onClick={onToggleFireMode}
              className={`rounded border px-2 py-1 text-[11px] font-bold transition active:scale-95 ${
                hud.fireMode === 'SEMI'
                  ? 'border-amber-400 bg-amber-500/25 text-amber-200'
                  : 'border-cyan-400/60 bg-slate-900/85 text-cyan-200'
              }`}
            >
              {fireModeLabel}
            </button>
          )}
          <button
            type="button"
            onClick={onReload}
            className="rounded border border-slate-600 bg-slate-900/85 px-2 py-1 text-[11px] font-bold text-slate-200 active:scale-95"
          >
            재장전
          </button>
          <button
            type="button"
            data-testid="hud-cycle-weapon-button"
            onClick={onCycleWeapon}
            className="rounded border border-[#3ee0b0]/60 bg-slate-900/85 px-2 py-1 text-[11px] font-bold text-[#3ee0b0] active:scale-95"
          >
            무기
          </button>
        </div>

        <div className="flex items-baseline gap-1.5 rounded-lg border border-slate-700/80 bg-slate-950/85 px-2.5 py-1 backdrop-blur-sm">
          <span className="hidden min-[640px]:inline text-[10px] font-bold tracking-wider text-slate-400">
            {spec.name}
          </span>
          {isRifle && (
            <span
              data-testid="hud-fire-mode-badge"
              className={`rounded px-1 py-0.5 text-[9px] font-black tracking-wider ${
                hud.fireMode === 'SEMI'
                  ? 'bg-amber-500/25 text-amber-300'
                  : 'bg-cyan-500/20 text-cyan-300'
              }`}
            >
              {hud.fireMode}
            </span>
          )}
          {hud.isReloading ? (
            <span className="animate-pulse text-xs font-extrabold text-amber-400">재장전...</span>
          ) : (
            <div className="font-mono leading-none">
              <span className={`text-base font-black ${hud.ammo <= 3 ? 'text-rose-400' : 'text-white'}`}>
                {hud.ammo}
              </span>
              <span className="ml-0.5 text-[11px] text-slate-400">/{hud.maxAmmo}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Mobile portrait / tablet: compact stack positioned cleanly above the Fire/Jump cluster
  if (layoutMode === 'portrait') {
    return (
      <div
        className={`pointer-events-auto fixed z-40 flex flex-col gap-1.5 select-none ${
          swapControls ? 'items-start' : 'items-end'
        }`}
        style={{
          bottom: `calc(${portraitBottomOffset}px + env(safe-area-inset-bottom))`,
          ...(swapControls
            ? { left: 'calc(12px + env(safe-area-inset-left))' }
            : { right: 'calc(12px + env(safe-area-inset-right))' }),
        }}
      >
        <div className="flex gap-1.5">
          {isRifle && (
            <button
              type="button"
              data-testid="hud-fire-mode-button"
              onClick={onToggleFireMode}
              className={`rounded border px-2 py-1 text-[11px] font-bold transition active:scale-95 ${
                hud.fireMode === 'SEMI'
                  ? 'border-amber-400 bg-amber-500/25 text-amber-200'
                  : 'border-cyan-400/60 bg-slate-900/85 text-cyan-200'
              }`}
            >
              {fireModeLabel} (V)
            </button>
          )}
          <button
            type="button"
            onClick={onReload}
            className="rounded border border-slate-600 bg-slate-900/85 px-2 py-1 text-[11px] font-bold text-slate-200 active:scale-95"
          >
            재장전
          </button>
          <button
            type="button"
            data-testid="hud-cycle-weapon-button"
            onClick={onCycleWeapon}
            className="rounded border border-[#3ee0b0]/60 bg-slate-900/85 px-2 py-1 text-[11px] font-bold text-[#3ee0b0] active:scale-95"
          >
            무기 변경
          </button>
        </div>

        <div className="flex items-baseline gap-2 rounded-lg border border-slate-700/80 bg-slate-950/85 px-3 py-1.5 backdrop-blur-sm">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold tracking-wider text-slate-400">{spec.name}</span>
            {isRifle && (
              <span
                data-testid="hud-fire-mode-badge"
                className={`rounded px-1.5 py-0.5 text-[9px] font-black tracking-wider ${
                  hud.fireMode === 'SEMI'
                    ? 'bg-amber-500/25 text-amber-300'
                    : 'bg-cyan-500/20 text-cyan-300'
                }`}
              >
                {hud.fireMode}
              </span>
            )}
          </div>
          {hud.isReloading ? (
            <span className="animate-pulse text-sm font-extrabold text-amber-400">재장전 중...</span>
          ) : (
            <div className="font-mono leading-none">
              <span className={`text-xl font-black ${hud.ammo <= 3 ? 'text-rose-400' : 'text-white'}`}>
                {hud.ammo}
              </span>
              <span className="ml-0.5 text-xs text-slate-400">/ {hud.maxAmmo}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Desktop HUD
  return (
    <div
      className="pointer-events-auto fixed bottom-5 right-5 z-40 flex flex-col items-end gap-2 select-none"
      style={{
        bottom: 'calc(1.25rem + env(safe-area-inset-bottom))',
        right: 'calc(1.25rem + env(safe-area-inset-right))',
      }}
    >
      <div className="flex gap-2">
        {(isRifle || spec.hasScope) && (
          <button
            type="button"
            onClick={onToggleAds}
            className={`rounded border px-3 py-1.5 text-xs font-bold transition ${
              isAimActive
                ? 'border-[#3ee0b0] bg-[#3ee0b0]/25 text-[#3ee0b0]'
                : 'border-slate-600 bg-slate-900/80 text-slate-200 hover:border-slate-400'
            }`}
          >
            {spec.hasScope ? '줌 (우클릭 홀드)' : '정조준 (우클릭 홀드)'}
          </button>
        )}
        {isRifle && (
          <button
            type="button"
            data-testid="hud-fire-mode-button"
            onClick={onToggleFireMode}
            className={`rounded border px-3 py-1.5 text-xs font-bold transition ${
              hud.fireMode === 'SEMI'
                ? 'border-amber-400 bg-amber-500/25 text-amber-200 hover:bg-amber-500/35'
                : 'border-cyan-400/60 bg-slate-900/80 text-cyan-200 hover:border-cyan-300'
            }`}
          >
            {fireModeLabel} (V)
          </button>
        )}
        <button
          type="button"
          onClick={onReload}
          className="rounded border border-slate-600 bg-slate-900/80 px-3 py-1.5 text-xs font-bold text-slate-200 hover:border-slate-400"
        >
          재장전 (R)
        </button>
        <button
          type="button"
          data-testid="hud-cycle-weapon-button"
          onClick={onCycleWeapon}
          className="rounded border border-[#3ee0b0]/60 bg-slate-900/80 px-3 py-1.5 text-xs font-bold text-[#3ee0b0] hover:bg-[#3ee0b0]/20"
        >
          무기 변경 (B)
        </button>
      </div>

      <div className="flex items-baseline gap-3 rounded-lg border border-slate-700/80 bg-slate-950/80 px-4 py-2.5 backdrop-blur-sm">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold tracking-wider text-slate-400">{spec.name}</span>
          {isRifle && (
            <span
              data-testid="hud-fire-mode-badge"
              className={`rounded px-1.5 py-0.5 text-[10px] font-black tracking-wider ${
                hud.fireMode === 'SEMI'
                  ? 'bg-amber-500/25 text-amber-300 border border-amber-400/50'
                  : 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40'
              }`}
            >
              {hud.fireMode}
            </span>
          )}
        </div>
        {hud.isReloading ? (
          <span className="animate-pulse text-lg font-extrabold text-amber-400">재장전 중...</span>
        ) : (
          <div className="font-mono">
            <span className={`text-2xl font-black ${hud.ammo <= 3 ? 'text-rose-400' : 'text-white'}`}>
              {hud.ammo}
            </span>
            <span className="ml-1 text-sm text-slate-400">/ {hud.maxAmmo}</span>
          </div>
        )}
      </div>
    </div>
  );
}
