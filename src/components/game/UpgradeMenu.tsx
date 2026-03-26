import { useMemo, useState } from 'react';
import { useGame } from '@/contexts/GameContext';
import {
  UpgradeCategory,
  UpgradeDefinition,
  UPGRADE_DEFINITIONS,
  getCompletedTier,
  getUpgradeLockReasons,
} from '@/config/upgrades';
import { formatCurrency } from '@/utils/calculations';
import { getUpgradePurchaseCost } from '@/utils/costs';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { X } from 'lucide-react';

interface UpgradeMenuProps {
  isOpen: boolean;
  onClose: () => void;
}

const ONBOARDING_VISIBLE_COUNT = 8;

const CATEGORY_LABELS: Record<UpgradeCategory, string> = {
  automation: 'Automation',
  speed: 'Speed',
  production: 'Production',
  base_generation: 'Base Generation',
  efficiency: 'Efficiency',
  synergy: 'Synergy',
  compounding: 'Compounding',
  quality_of_life: 'QoL',
};

const getTopLockReasons = (lockReasons: string[]): string[] => lockReasons.slice(0, 2);


const formatEffectAtLevel = (effect: UpgradeDefinition['effects'][number], level: number): string => {
  switch (effect.type) {
    case 'automation_tick_rate':
      return `+${(effect.percentPerLevel * level).toFixed(1)}% automation tick rate`;
    case 'base_generation_flat':
      return `+${Math.round(effect.amountPerLevel * level)} base generation`;
    case 'base_generation_percent':
      return `+${(effect.percentPerLevel * level).toFixed(1)}% base generation`;
    case 'throughput_percent':
      return `+${(effect.percentPerLevel * level).toFixed(1)}% throughput`;
    case 'merge_quality_percent':
      return `+${(effect.percentPerLevel * level).toFixed(1)}% merge quality`;
    case 'offline_storage_hours':
      return `+${(effect.hoursPerLevel * level).toFixed(1)}h offline storage`;
    case 'cost_reduction_percent':
      return `-${(effect.percentPerLevel * level).toFixed(1)}% ${effect.target} costs`;
    case 'machine_level_bonus':
      return `+${effect.levelBonusPerLevel * level} level for ${effect.machineId}`;
    case 'synergy_per_owned_machine':
      return `+${(effect.percentPerMachine * level).toFixed(2)}% per owned machine`;
    case 'tier_multiplier':
      return `+${(effect.multiplierPerLevel * level * 100).toFixed(1)}% tier ${effect.targetTier} multiplier`;
    case 'prestige_compounding':
      return `+${(effect.percentPerReset * level).toFixed(1)}% per reset`;
    default:
      return 'Effect scales with level';
  }
};

const getScalingText = (upgrade: UpgradeDefinition): string => {
  if (upgrade.costGrowth.kind === 'exponential') {
    return `Cost scales exponentially (x${upgrade.costGrowth.factor.toFixed(2)} per level).`;
  }
  return `Cost scales polynomially (power ${upgrade.costGrowth.power.toFixed(2)}, scale ${upgrade.costGrowth.scale.toFixed(2)}).`;
};

export const UpgradeMenu = ({ isOpen, onClose }: UpgradeMenuProps) => {
  const { state, actions } = useGame();
  const [categoryFilter, setCategoryFilter] = useState<UpgradeCategory | 'all'>('all');
  const [tierFilter, setTierFilter] = useState<number | 'all'>('all');
  const [hideMaxUpgrades, setHideMaxUpgrades] = useState(false);

  const ownedUpgrades = useMemo(
    () => ((state as Record<string, unknown>).ownedUpgrades ?? {}) as Record<string, number>,
    [state]
  );

  const upgradeRows = useMemo(() => {
    const context = {
      ownedUpgrades,
      completedTier: getCompletedTier(ownedUpgrades),
      currencyTotal: state.stats.lifetimeCurrencyEarned,
      machineLevel: state.stats.highestMachineLevel,
      ownedMachines: state.machines.length,
    };

    return UPGRADE_DEFINITIONS
      .map((upgrade, index) => {
        const currentLevel = ownedUpgrades[upgrade.id] ?? 0;
        const nextLevel = Math.min(currentLevel + 1, upgrade.maxLevel);
        const lockReasons = getUpgradeLockReasons(upgrade, context);
        const canBuy = lockReasons.length === 0 && currentLevel < upgrade.maxLevel;
        const cost = getUpgradePurchaseCost(upgrade.id, currentLevel, state) ?? Number.POSITIVE_INFINITY;
        const revealed = index < ONBOARDING_VISIBLE_COUNT || currentLevel > 0 || lockReasons.length === 0;

        return {
          upgrade,
          currentLevel,
          nextLevel,
          canBuy,
          cost,
          lockReasons,
          revealed,
        };
      })
      .filter(item => item.revealed)
      .filter(item => categoryFilter === 'all' || item.upgrade.category === categoryFilter)
      .filter(item => tierFilter === 'all' || item.upgrade.tier === tierFilter)
      .filter(item => !hideMaxUpgrades || item.currentLevel < item.upgrade.maxLevel);
  }, [
    categoryFilter,
    hideMaxUpgrades,
    ownedUpgrades,
    state,
    tierFilter,
  ]);

  const availableNow = upgradeRows.filter(item => item.canBuy && state.currency >= item.cost);

  const tierOptions = Array.from(new Set(UPGRADE_DEFINITIONS.map(upgrade => upgrade.tier)));

  if (!isOpen) return null;

  return (
    <TooltipProvider>
      <div className="fixed inset-0 z-[65] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/60" onClick={onClose} />

        <div className="relative bg-background border border-border rounded-xl w-full max-w-6xl max-h-[92vh] overflow-hidden shadow-2xl flex">
          <aside className="w-60 border-r border-border p-4 space-y-4 bg-card/30 overflow-y-auto">
            <div>
              <h2 className="text-lg font-bold text-foreground">Upgrade Menu</h2>
              <p className="text-xs text-muted-foreground mt-1">Filter by category or tier.</p>
            </div>

            <div>
              <p className="text-xs uppercase text-muted-foreground mb-2">Categories</p>
              <div className="space-y-1">
                <Button
                  variant={categoryFilter === 'all' ? 'default' : 'ghost'}
                  className="w-full justify-start"
                  size="sm"
                  onClick={() => setCategoryFilter('all')}
                >
                  All categories
                </Button>
                {(Object.keys(CATEGORY_LABELS) as UpgradeCategory[]).map(category => (
                  <Button
                    key={category}
                    variant={categoryFilter === category ? 'default' : 'ghost'}
                    className="w-full justify-start"
                    size="sm"
                    onClick={() => setCategoryFilter(category)}
                  >
                    {CATEGORY_LABELS[category]}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs uppercase text-muted-foreground mb-2">Tier</p>
              <div className="grid grid-cols-3 gap-1">
                <Button
                  variant={tierFilter === 'all' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setTierFilter('all')}
                  className="col-span-3"
                >
                  All
                </Button>
                {tierOptions.map(tier => (
                  <Button
                    key={tier}
                    variant={tierFilter === tier ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setTierFilter(tier)}
                  >
                    T{tier}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs uppercase text-muted-foreground mb-2">Display</p>
              <Button
                variant={hideMaxUpgrades ? 'default' : 'ghost'}
                className="w-full justify-start"
                size="sm"
                onClick={() => setHideMaxUpgrades(prev => !prev)}
              >
                Hide Max Upgrades
              </Button>
            </div>
          </aside>

          <section className="flex-1 flex flex-col min-w-0">
            <div className="border-b border-border p-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Available currency</p>
                <p className="font-semibold text-foreground">{formatCurrency(state.currency)}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="p-4 overflow-y-auto space-y-5">
              <div>
                <h3 className="text-sm font-semibold mb-2">Available now</h3>
                {availableNow.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No upgrades currently affordable and unlocked.</p>
                ) : (
                  <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {availableNow.map(item => (
                      <Button
                        key={`available-${item.upgrade.id}`}
                        variant="outline"
                        className="justify-between h-auto py-2"
                        onClick={() => actions.buyUpgrade(item.upgrade.id)}
                      >
                        <span className="truncate">{item.upgrade.name}</span>
                        <span>{formatCurrency(item.cost)}</span>
                      </Button>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
                {upgradeRows.map(({ upgrade, currentLevel, nextLevel, cost, canBuy, lockReasons }) => {
                  const atMax = currentLevel >= upgrade.maxLevel;
                  const isAffordable = state.currency >= cost;
                  const isLocked = !atMax && lockReasons.length > 0;
                  const canBuyNow = !atMax && canBuy && isAffordable;
                  const topLockReasons = getTopLockReasons(lockReasons);
                  const statusLabel = atMax
                    ? 'Maxed'
                    : isLocked
                      ? 'Locked'
                      : isAffordable
                        ? 'Ready'
                        : 'Unlocked • Need currency';
                  const statusClassName = atMax
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                    : isLocked
                      ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                      : isAffordable
                        ? 'bg-primary/15 text-primary'
                        : 'bg-blue-500/15 text-blue-600 dark:text-blue-400';

                  return (
                    <article key={upgrade.id} className="rounded-lg border border-border p-3 bg-card/50 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="font-semibold text-sm leading-tight">{upgrade.name}</h4>
                          <p className="text-xs text-muted-foreground">{CATEGORY_LABELS[upgrade.category]} • T{upgrade.tier}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-xs rounded bg-muted px-2 py-0.5">Lv {currentLevel}/{upgrade.maxLevel}</span>
                          <span className={`text-[10px] rounded px-2 py-0.5 ${statusClassName}`}>{statusLabel}</span>
                        </div>
                      </div>

                      <p className="text-xs text-muted-foreground">{upgrade.description}</p>
                      <p className="text-xs">
                        {atMax ? (
                          <>
                            <span className="text-muted-foreground">Current effect:</span>{' '}
                            {formatEffectAtLevel(upgrade.effects[0], currentLevel)}
                          </>
                        ) : (
                          <>
                            <span className="text-muted-foreground">Effect:</span>{' '}
                            {formatEffectAtLevel(upgrade.effects[0], currentLevel)} →{' '}
                            {formatEffectAtLevel(upgrade.effects[0], nextLevel)}
                          </>
                        )}
                      </p>

                      <div className="text-xs text-muted-foreground">Cost: {atMax ? 'MAX' : formatCurrency(cost)}</div>

                      {!atMax && topLockReasons.length > 0 && (
                        <div className="space-y-1">
                          {topLockReasons.map((reason, index) => (
                            <p key={`${upgrade.id}-reason-${index}`} className="text-xs text-amber-500">
                              {index === 0 ? `Primary lock: ${reason}` : `Secondary lock: ${reason}`}
                            </p>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center justify-between">
                        <div className="flex gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted cursor-help">Scaling</span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="max-w-xs text-xs">{getScalingText(upgrade)}</p>
                            </TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted cursor-help">Prereqs</span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="max-w-xs text-xs">
                                {lockReasons.length > 0
                                  ? lockReasons.join(' • ')
                                  : 'All prerequisites met.'}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </div>

                        <Button
                          size="sm"
                          disabled={atMax || !canBuyNow}
                          onClick={() => actions.buyUpgrade(upgrade.id)}
                        >
                          {atMax ? 'Maxed' : canBuyNow ? 'Buy' : isLocked ? 'Locked' : 'Need currency'}
                        </Button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </section>
        </div>
      </div>
    </TooltipProvider>
  );
};
