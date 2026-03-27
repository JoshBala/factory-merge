import { Lock, Unlock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useGame } from '@/contexts/GameContext';
import {
  calculateBonusValue,
  formatCurrency,
  getBonusDisplayName,
  getGridUpgradeCost,
  getNextRarity,
  getRarityColor,
  getRarityName,
  getGridRerollCost,
} from '@/utils/calculations';

export const GridUpgradesPanel = () => {
  const { state, actions } = useGame();
  const module = state.gridUpgrade;

  const rerollCost = getGridRerollCost();
  const upgradeCost = getGridUpgradeCost(module);
  const nextRarity = module ? getNextRarity(module.rarity) : 'common';
  const isMaxed = Boolean(module && !nextRarity);
  const canAffordUpgrade = state.currency >= upgradeCost;
  const hasUnlockedBonuses = module ? module.bonuses.some(bonus => !bonus.locked) : false;
  const canAffordReroll = state.currency >= rerollCost;

  return (
    <aside className="w-full max-w-sm rounded-xl border border-border bg-card p-4 space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-bold text-foreground">Grid Upgrades</h2>
        <p className="text-sm text-muted-foreground">
          Available: <span className="font-semibold text-foreground">{formatCurrency(state.currency)}</span>
        </p>
      </div>

      <div className="rounded-lg border border-border bg-card/80 p-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-foreground">Grid Module</h3>
          {module ? (
            <span className={`px-2 py-0.5 rounded text-xs text-white font-medium ${getRarityColor(module.rarity)}`}>
              {getRarityName(module.rarity)}
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded text-xs bg-muted text-muted-foreground">Not Unlocked</span>
          )}
        </div>

        {module ? (
          <div className="space-y-2">
            {module.bonuses.map((bonus, bonusIndex) => (
              <div
                key={bonusIndex}
                className={`flex items-center justify-between rounded-md border px-2.5 py-2 ${
                  bonus.locked ? 'border-primary/70 bg-primary/10' : 'border-border bg-background/50'
                }`}
              >
                <div>
                  <div className="text-xs font-medium text-foreground">{getBonusDisplayName(bonus.kind)}</div>
                  <div className="text-xs text-muted-foreground">{calculateBonusValue(bonus).toFixed(1)}%</div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => actions.toggleGridBonusLock(bonusIndex)}
                >
                  {bonus.locked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Unlock the grid module to start rolling bonuses.</p>
        )}

        <div className="space-y-2">
          {!isMaxed ? (
            <Button onClick={() => actions.upgradeGrid()} disabled={!canAffordUpgrade} className="w-full">
              {module
                ? `Upgrade to ${getRarityName(nextRarity!)} (${formatCurrency(upgradeCost)})`
                : `Unlock (${formatCurrency(upgradeCost)})`}
            </Button>
          ) : (
            <div className="rounded-md border border-border bg-background/50 px-2 py-2 text-center text-xs text-muted-foreground">
              Max rarity reached.
            </div>
          )}

          {module && (
            <Button
              onClick={() => actions.rerollGridBonuses()}
              disabled={!canAffordReroll || !hasUnlockedBonuses}
              className="w-full"
            >
              Reroll Unlocked ({formatCurrency(rerollCost)})
            </Button>
          )}
        </div>

        <p className="rounded-md border border-border bg-background/50 px-2.5 py-2 text-xs text-muted-foreground">
          Bonuses and rerolls in this module affect every machine in the entire grid.
        </p>
      </div>
    </aside>
  );
};
