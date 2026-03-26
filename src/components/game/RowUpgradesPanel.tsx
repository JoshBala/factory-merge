import { useMemo } from 'react';
import { Lock, Unlock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useGame } from '@/contexts/GameContext';
import { RowModule } from '@/types/game';
import {
  calculateBonusValue,
  formatCurrency,
  getBonusDisplayName,
  getNextRarity,
  getRarityColor,
  getRarityName,
  getRerollCost,
  getRowUpgradeCost,
} from '@/utils/calculations';

const ROW_NAMES = ['Top Row', 'Middle Row', 'Bottom Row'] as const;

const getModule = (rowModules: RowModule[], rowIndex: 0 | 1 | 2): RowModule | undefined =>
  rowModules.find(module => module.rowIndex === rowIndex);

const RowCard = ({ rowIndex }: { rowIndex: 0 | 1 | 2 }) => {
  const { state, actions } = useGame();
  const module = useMemo(() => getModule(state.rowModules, rowIndex), [state.rowModules, rowIndex]);

  const rerollCost = getRerollCost(rowIndex);
  const upgradeCost = getRowUpgradeCost(module);
  const nextRarity = module ? getNextRarity(module.rarity) : 'common';
  const isMaxed = Boolean(module && !nextRarity);
  const canAffordUpgrade = state.currency >= upgradeCost;
  const hasUnlockedBonuses = module ? module.bonuses.some(bonus => !bonus.locked) : false;
  const canAffordReroll = state.currency >= rerollCost;

  return (
    <div className="rounded-lg border border-border bg-card/80 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{ROW_NAMES[rowIndex]}</h3>
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
          {module.bonuses.map((bonus, bonusIndex) => {
            const value = calculateBonusValue(bonus);

            return (
              <div
                key={bonusIndex}
                className={`flex items-center justify-between rounded-md border px-2.5 py-2 ${
                  bonus.locked ? 'border-primary/70 bg-primary/10' : 'border-border bg-background/50'
                }`}
              >
                <div>
                  <div className="text-xs font-medium text-foreground">{getBonusDisplayName(bonus.kind)}</div>
                  <div className="text-xs text-muted-foreground">{value.toFixed(1)}%</div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => actions.toggleBonusLock(rowIndex, bonusIndex)}
                  aria-pressed={bonus.locked}
                  title={bonus.locked ? 'Unlock bonus' : 'Lock bonus'}
                >
                  {bonus.locked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                </Button>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Unlock this row to start rolling row bonuses.</p>
      )}

      <div className="space-y-2">
        {!isMaxed ? (
          <Button
            onClick={() => actions.upgradeRow(rowIndex)}
            disabled={!canAffordUpgrade}
            variant={canAffordUpgrade ? 'default' : 'secondary'}
            className="w-full"
          >
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
          <>
            <Button
              onClick={() => actions.rerollBonus(rowIndex)}
              disabled={!canAffordReroll || !hasUnlockedBonuses}
              variant={canAffordReroll && hasUnlockedBonuses ? 'default' : 'secondary'}
              className="w-full"
            >
              Reroll Unlocked ({formatCurrency(rerollCost)})
            </Button>
            {!hasUnlockedBonuses && (
              <p className="text-[11px] text-muted-foreground text-center">All bonuses are locked.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export const RowUpgradesPanel = () => {
  const { state } = useGame();

  return (
    <aside className="w-full max-w-sm rounded-xl border border-border bg-card p-4 space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-bold text-foreground">Row Upgrades</h2>
        <p className="text-sm text-muted-foreground">
          Available: <span className="font-semibold text-foreground">{formatCurrency(state.currency)}</span>
        </p>
      </div>

      <div className="space-y-3">
        {([0, 1, 2] as const).map(rowIndex => (
          <RowCard key={rowIndex} rowIndex={rowIndex} />
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Bonuses apply to machines currently in that row. Moving machines changes which bonuses apply.
      </p>
    </aside>
  );
};
