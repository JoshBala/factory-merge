// === HUD: Currency display + disaster status ===
import { useGame } from '@/contexts/GameContext';
import { 
  formatCurrency, 
  calculateProductionRate, 
  calculateBaseProductionRate,
  getNextRarity,
  getRowUpgradeCost,
  resolveGameEffects,
} from '@/utils/calculations';
import { Machine } from '@/types/game';
import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { BALANCE, getProductionRate } from '@/config/balance';
import { GameMenuModal } from './GameMenuModal';
import { getCompletedTier, getTierProgress } from '@/config/upgrades';
import { selectAutomationSelectors } from '@/services/automationService';

type DebugPurchase =
  | { key: string; label: string; cost: number; kind: 'machine'; slotIndex: number }
  | { key: string; label: string; cost: number; kind: 'row_upgrade'; rowIndex: 0 | 1 | 2 };

// Calculate per-row contribution
const getRowContributions = (
  machines: Machine[],
  effects: ReturnType<typeof resolveGameEffects>
) => {
  const rowNames = ['Top', 'Mid', 'Bot'] as const;
  const rows = ([0, 1, 2] as const).map(rowIndex => {
    const start = rowIndex * BALANCE.gridColumns;
    const slots = Array.from({ length: BALANCE.gridColumns }, (_, offset) => start + offset);
    return { name: rowNames[rowIndex], index: rowIndex, slots };
  });
  
  return rows.map(row => {
    const rowMachines = machines.filter(m => row.slots.includes(m.slotIndex) && !m.disabled);
    // Use procedural production rate
    const baseRate = rowMachines.reduce((sum, m) => sum + getProductionRate(m.level), 0);
    const bonus = effects.byRowPercent[row.index].productionPercent / 100;
    const modifiedRate = rowMachines.reduce((sum, machine) => {
      const rowBonusMultiplier = 1 + effects.byRowPercent[row.index].productionPercent / 100;
      const mergeBonusMultiplier = machine.level > 1 ? 1 + effects.byKindPercent.productionAfterMerge / 100 : 1;
      return sum + getProductionRate(machine.level) * rowBonusMultiplier * effects.productionMultiplier * mergeBonusMultiplier;
    }, 0);
    return {
      name: row.name,
      baseRate,
      bonus,
      modifiedRate,
    };
  });
};

// Format rate with K/M/B support
const formatRate = (rate: number): string => {
  if (rate >= 1e6) return `$${(rate / 1e6).toFixed(1)}M/s`;
  if (rate >= 1e3) return `$${(rate / 1e3).toFixed(1)}K/s`;
  return `$${rate.toFixed(1)}/s`;
};

export const GameHUD = () => {
  const { state } = useGame();
  const [disasterTimer, setDisasterTimer] = useState<number | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [selectedPurchaseKey, setSelectedPurchaseKey] = useState<string>('machine');

  // Calculate rates using unified function
  const isPowerOutage = state.activeDisaster?.type === 'powerOutage';
  const modifiedRate = calculateProductionRate(state.machines, isPowerOutage, state.rowModules, state);
  const baseRate = calculateBaseProductionRate(state.machines);
  const effects = resolveGameEffects(state.rowModules, state);
  const rowContributions = getRowContributions(state.machines, effects);

  const emptySlots = Array.from({ length: BALANCE.gridSize }, (_, index) => index)
    .filter(slotIndex => !state.machines.some(machine => machine.slotIndex === slotIndex));

  const purchaseOptions: DebugPurchase[] = [
    ...(emptySlots.length > 0
      ? [{
          key: 'machine',
          label: `Buy machine (slot ${emptySlots[0] + 1})`,
          cost: BALANCE.baseMachineCost,
          kind: 'machine' as const,
          slotIndex: emptySlots[0],
        }]
      : []),
    ...([0, 1, 2] as const).flatMap(rowIndex => {
      const module = state.rowModules.find(m => m.rowIndex === rowIndex);
      const nextRarity = module ? getNextRarity(module.rarity) : 'common';
      if (module && !nextRarity) return [];
      return [{
        key: `row-${rowIndex}`,
        label: module ? `Upgrade ${['Top', 'Mid', 'Bot'][rowIndex]} row` : `Unlock ${['Top', 'Mid', 'Bot'][rowIndex]} row`,
        cost: getRowUpgradeCost(module),
        kind: 'row_upgrade' as const,
        rowIndex,
      }];
    }),
  ];

  const selectedPurchase = purchaseOptions.find(option => option.key === selectedPurchaseKey) ?? purchaseOptions[0];
  const rateForAfford = Math.max(modifiedRate, 0);
  const toAffordSeconds = (cost: number) => {
    if (state.currency >= cost) return 0;
    if (rateForAfford <= 0) return Number.POSITIVE_INFINITY;
    return (cost - state.currency) / rateForAfford;
  };
  const beforeRate = modifiedRate;
  const afterRate = selectedPurchase?.kind === 'machine'
      ? calculateProductionRate(
        [...state.machines, { id: 'debug-machine', level: 1, slotIndex: selectedPurchase.slotIndex, disabled: false }],
        isPowerOutage,
        state.rowModules,
        state
      )
    : null;

  const ownedUpgrades = (state as Record<string, unknown>).ownedUpgrades as Record<string, number> | undefined;
  const tierProgress = getTierProgress(ownedUpgrades ?? {});
  const completedTiers = getCompletedTier(ownedUpgrades ?? {});
  const activeTier = tierProgress.find(tier => tier.percent < 100) ?? tierProgress[tierProgress.length - 1];
  const automationMetrics = state.automation.runtime.debugMetrics;
  const automationSelectors = selectAutomationSelectors(state, effects.automationIntervalMs);

  // Update power outage countdown
  useEffect(() => {
    if (state.activeDisaster?.type === 'powerOutage') {
      const updateTimer = () => {
        const elapsed = Date.now() - state.activeDisaster!.startTime;
        const remaining = Math.max(0, state.activeDisaster!.duration - elapsed);
        setDisasterTimer(Math.ceil(remaining / 1000));
      };
      updateTimer();
      const interval = setInterval(updateTimer, 500);
      return () => clearInterval(interval);
    } else {
      setDisasterTimer(null);
    }
  }, [state.activeDisaster]);

  return (
    <header className="bg-card border-b border-border p-4">
      <div className="flex justify-end mb-2">
        <GameMenuModal />
      </div>
      {/* Currency display */}
      <div className="text-center mb-2">
        <span className="text-2xl font-bold text-foreground">
          {formatCurrency(state.currency)}
        </span>
        <p className="text-xs text-muted-foreground">
          +{formatRate(modifiedRate)}
          {baseRate > 0 && baseRate !== modifiedRate && (
            <span className="text-green-500 ml-1">
              (+{((modifiedRate / baseRate - 1) * 100).toFixed(0)}%)
            </span>
          )}
        </p>
        
        {/* Debug toggle */}
        <button
          onClick={() => setShowDebug(!showDebug)}
          className="text-xs text-muted-foreground/60 hover:text-muted-foreground flex items-center gap-1 mx-auto mt-1"
        >
          {showDebug ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {showDebug ? 'Hide' : 'Show'} breakdown
        </button>
      </div>

      {/* Debug panel */}
      {showDebug && (
        <div className="bg-muted/50 rounded-md p-2 mb-2 text-xs font-mono">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <span className="text-muted-foreground">Base rate:</span>
            <span>{formatRate(baseRate)}</span>
            <span className="text-muted-foreground">Modified rate:</span>
            <span className="text-green-500">{formatRate(modifiedRate)}</span>
          </div>
          <div className="border-t border-border mt-2 pt-2">
            <div className="text-muted-foreground mb-1">Effective multipliers:</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <span>Production (global):</span>
              <span>x{effects.productionMultiplier.toFixed(3)}</span>
              <span>Post-merge:</span>
              <span>x{(1 + effects.byKindPercent.productionAfterMerge / 100).toFixed(3)}</span>
              <span>Automation speed:</span>
              <span>x{(1000 / effects.automationIntervalMs).toFixed(3)}</span>
              <span>Disaster duration:</span>
              <span>x{effects.disasterDurationMultiplier.toFixed(3)}</span>
              <span>Upgrade cost:</span>
              <span>x{effects.machineCostMultiplier.toFixed(3)}</span>
            </div>
          </div>
          <div className="border-t border-border mt-2 pt-2">
            <div className="text-muted-foreground mb-1">Per-row breakdown:</div>
            {rowContributions.map(row => (
              <div key={row.name} className="flex justify-between">
                <span>{row.name}:</span>
                <span>
                  {formatRate(row.baseRate).replace('/s', '')} → {formatRate(row.modifiedRate).replace('/s', '')}
                  {row.bonus > 0 && (
                    <span className="text-green-500 ml-1">(+{(row.bonus * 100).toFixed(0)}%)</span>
                  )}
                </span>
              </div>
            ))}
          </div>
          <div className="border-t border-border mt-2 pt-2">
            <div className="text-muted-foreground mb-1">Time to afford next upgrades:</div>
            <div className="space-y-1">
              {purchaseOptions.map(option => {
                const seconds = toAffordSeconds(option.cost);
                const timeLabel = Number.isFinite(seconds)
                  ? seconds === 0
                    ? 'now'
                    : `${seconds.toFixed(1)}s`
                  : '∞';
                return (
                  <div key={option.key} className="flex justify-between">
                    <span>{option.label}:</span>
                    <span>{timeLabel}</span>
                  </div>
                );
              })}
              {purchaseOptions.length === 0 && (
                <div className="text-muted-foreground">No eligible purchases</div>
              )}
            </div>
          </div>
          <div className="border-t border-border mt-2 pt-2">
            <div className="text-muted-foreground mb-1">Rate impact preview:</div>
            <select
              className="w-full rounded border border-border bg-background px-2 py-1 mb-2"
              value={selectedPurchase?.key ?? ''}
              onChange={(event) => setSelectedPurchaseKey(event.target.value)}
            >
              {purchaseOptions.map(option => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
            <div className="flex justify-between">
              <span>Before:</span>
              <span>{formatRate(beforeRate)}</span>
            </div>
            <div className="flex justify-between">
              <span>After:</span>
              <span className="text-green-500">
                {afterRate === null ? 'N/A (bonus roll dependent)' : formatRate(afterRate)}
              </span>
            </div>
          </div>
          <div className="border-t border-border mt-2 pt-2">
            <div className="text-muted-foreground mb-1">Tier completion:</div>
            <div className="flex justify-between">
              <span>Completed tiers:</span>
              <span>{completedTiers}/{tierProgress.length}</span>
            </div>
            {activeTier && (
              <div className="flex justify-between">
                <span>Active tier {activeTier.tier}:</span>
                <span>{activeTier.percent.toFixed(1)}% ({activeTier.unlocked}/{activeTier.total})</span>
              </div>
            )}
          </div>
          {import.meta.env.DEV && automationMetrics && (
            <div className="border-t border-border mt-2 pt-2">
              <div className="text-muted-foreground mb-1">Automation debug:</div>
              <div className="flex justify-between">
                <span>Can run:</span>
                <span>{automationSelectors.canRun ? 'yes' : 'no'}</span>
              </div>
              <div className="flex justify-between">
                <span>Queue length:</span>
                <span>{automationSelectors.queueLength}</span>
              </div>
              <div className="flex justify-between">
                <span>Next run ETA:</span>
                <span>
                  {automationSelectors.nextRunEtaMs === null
                    ? 'blocked'
                    : `${(automationSelectors.nextRunEtaMs / 1000).toFixed(2)}s`}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Last outcome:</span>
                <span>{automationSelectors.lastOutcome}</span>
              </div>
              <div className="flex justify-between">
                <span>Ops (attempted/success):</span>
                <span>{automationMetrics.attemptedOps}/{automationMetrics.successfulOps}</span>
              </div>
              <div className="flex justify-between">
                <span>Blocked:</span>
                <span>
                  match {automationMetrics.blockedReasons.no_match} · cooldown {automationMetrics.blockedReasons.cooldown} · disabled {automationMetrics.blockedReasons.disabled} · full {automationMetrics.blockedReasons.full_grid}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Disaster banner */}
      {state.activeDisaster && (
        <div className={`text-center py-2 px-4 rounded-md text-sm font-medium ${
          state.activeDisaster.type === 'fire' 
            ? 'bg-destructive/20 text-destructive' 
            : 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400'
        }`}>
          {state.activeDisaster.type === 'fire' ? (
            <>🔥 Fire at slot {(state.activeDisaster.targetSlot ?? 0) + 1}! Repair needed</>
          ) : (
            <>⚡ Power outage! {disasterTimer}s remaining</>
          )}
        </div>
      )}
    </header>
  );
};
