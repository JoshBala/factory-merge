// === Row Upgrades Modal ===
import { useEffect, useMemo, useState } from 'react';
import { useGame } from '@/contexts/GameContext';
import { RowModule } from '@/types/game';
import { 
  formatCurrency, getRowUpgradeCost, getRerollCost,
  calculateBonusValue, getBonusDisplayName, getRarityColor,
  getRarityName, getNextRarity
} from '@/utils/calculations';
import { Button } from '@/components/ui/button';
import { Lock, Unlock, X } from 'lucide-react';

interface RowUpgradesModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialRow?: 0 | 1 | 2 | null;
}

const ROW_NAMES = ['Top Row', 'Middle Row', 'Bottom Row'] as const;

const getRowSummaryLines = (module: RowModule | undefined) => {
  if (!module) return ['Unlock to get row bonuses.'];
  const lines = module.bonuses.slice(0, 2).map(bonus => {
    const value = calculateBonusValue(bonus);
    return `${getBonusDisplayName(bonus.kind)}: ${value.toFixed(1)}%`;
  });
  if (module.bonuses.length > 2) {
    lines.push(`+${module.bonuses.length - 2} more bonus${module.bonuses.length - 2 > 1 ? 'es' : ''}`);
  }
  return lines.length > 0 ? lines : ['No bonuses rolled yet.'];
};

const RowPickerCard = ({
  rowIndex,
  module,
  onOpen,
}: {
  rowIndex: 0 | 1 | 2;
  module: RowModule | undefined;
  onOpen: () => void;
}) => {
  const summaryLines = useMemo(() => getRowSummaryLines(module), [module]);

  return (
    <button
      onClick={onOpen}
      className="w-full text-left bg-card border border-border rounded-lg p-4 hover:bg-card/90 transition-colors"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold text-foreground">{ROW_NAMES[rowIndex]}</span>
        {module ? (
          <span className={`px-2 py-0.5 rounded text-xs text-white font-medium ${getRarityColor(module.rarity)}`}>
            {getRarityName(module.rarity)}
          </span>
        ) : (
          <span className="px-2 py-0.5 rounded text-xs bg-muted text-muted-foreground">
            Not Unlocked
          </span>
        )}
      </div>
      <div className="space-y-1 text-sm text-muted-foreground">
        {summaryLines.map((line, idx) => (
          <div key={idx} className="truncate">
            {line}
          </div>
        ))}
      </div>
    </button>
  );
};

const RowDetailModal = ({
  rowIndex,
  module,
  currency,
  onClose,
  onUpgrade,
  onReroll,
  onToggleLock,
}: {
  rowIndex: 0 | 1 | 2;
  module: RowModule | undefined;
  currency: number;
  onClose: () => void;
  onUpgrade: () => void;
  onReroll: () => void;
  onToggleLock: (bonusIndex: number) => void;
}) => {
  const rerollCost = getRerollCost(rowIndex);
  const upgradeCost = getRowUpgradeCost(module);
  const nextRarity = module ? getNextRarity(module.rarity) : 'common';
  const isMaxed = module && !nextRarity;
  const canAffordUpgrade = currency >= upgradeCost;
  const hasUnlockedBonuses = module ? module.bonuses.some(bonus => !bonus.locked) : false;
  const canAffordReroll = currency >= rerollCost;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-background border border-border rounded-xl w-full max-w-md max-h-[90vh] overflow-auto shadow-2xl">
        <div className="sticky top-0 bg-background border-b border-border p-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-foreground">{ROW_NAMES[rowIndex]}</h3>
            {module && (
              <span className={`inline-flex mt-1 px-2 py-0.5 rounded text-xs text-white font-medium ${getRarityColor(module.rarity)}`}>
                {getRarityName(module.rarity)}
              </span>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="p-4 space-y-4">
          {module ? (
            <div className="space-y-3">
              {module.bonuses.map((bonus, idx) => {
                const value = calculateBonusValue(bonus);
                return (
                  <div
                    key={idx}
                    className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
                      bonus.locked
                        ? 'border-primary/70 bg-primary/10'
                        : 'border-border bg-background/50'
                    }`}
                  >
                    <div>
                      <div className="text-sm font-medium text-foreground">
                        {getBonusDisplayName(bonus.kind)}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {value.toFixed(1)}%
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-9 w-9 p-0"
                      onClick={() => onToggleLock(idx)}
                      aria-pressed={bonus.locked}
                      title={bonus.locked ? 'Unlock bonus' : 'Lock bonus'}
                    >
                      {bonus.locked ? (
                        <Lock className="h-4 w-4" />
                      ) : (
                        <Unlock className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Unlock this row to start rolling bonuses for the machines here.
            </p>
          )}

          {!isMaxed && (
            <Button
              onClick={onUpgrade}
              disabled={!canAffordUpgrade}
              variant={canAffordUpgrade ? 'default' : 'secondary'}
              className="w-full"
            >
              {module
                ? `Upgrade to ${getRarityName(nextRarity!)} (${formatCurrency(upgradeCost)})`
                : `Unlock (${formatCurrency(upgradeCost)})`}
            </Button>
          )}
          {isMaxed && (
            <div className="text-center text-sm text-muted-foreground">
              Max rarity reached.
            </div>
          )}

          {module && (
            <div className="space-y-2">
              <Button
                onClick={onReroll}
                disabled={!canAffordReroll || !hasUnlockedBonuses}
                variant={canAffordReroll && hasUnlockedBonuses ? 'default' : 'secondary'}
                className="w-full"
              >
                Reroll Unlocked ({formatCurrency(rerollCost)})
              </Button>
              {!hasUnlockedBonuses && (
                <p className="text-xs text-muted-foreground text-center">
                  All bonuses are locked.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const RowUpgradesModal = ({ isOpen, onClose, initialRow = null }: RowUpgradesModalProps) => {
  const { state, actions } = useGame();
  const [selectedRow, setSelectedRow] = useState<0 | 1 | 2 | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedRow(initialRow ?? null);
    }
  }, [initialRow, isOpen]);

  if (!isOpen) return null;

  const getModule = (rowIndex: 0 | 1 | 2): RowModule | undefined =>
    state.rowModules.find(m => m.rowIndex === rowIndex);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60"
        onClick={() => {
          setSelectedRow(null);
          onClose();
        }}
      />

      <div className="relative bg-background border border-border rounded-xl w-full max-w-md max-h-[90vh] overflow-auto shadow-2xl">
        <div className="sticky top-0 bg-background border-b border-border p-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-foreground">Row Upgrades</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelectedRow(null);
              onClose();
            }}
            className="h-8 w-8 p-0"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="px-4 pt-3 pb-1">
          <p className="text-sm text-muted-foreground">
            Available: <span className="text-foreground font-semibold">{formatCurrency(state.currency)}</span>
          </p>
        </div>

        <div className="p-4 space-y-4">
          {([0, 1, 2] as const).map(rowIndex => (
            <RowPickerCard
              key={rowIndex}
              rowIndex={rowIndex}
              module={getModule(rowIndex)}
              onOpen={() => setSelectedRow(rowIndex)}
            />
          ))}
        </div>

        <div className="px-4 pb-4">
          <p className="text-xs text-muted-foreground text-center">
            Bonuses apply to machines currently in that row.
            Moving machines changes which bonuses apply.
          </p>
        </div>
      </div>

      {selectedRow !== null && (
        <RowDetailModal
          rowIndex={selectedRow}
          module={getModule(selectedRow)}
          currency={state.currency}
          onClose={() => setSelectedRow(null)}
          onUpgrade={() => actions.upgradeRow(selectedRow)}
          onReroll={() => actions.rerollBonus(selectedRow)}
          onToggleLock={(bonusIndex) => actions.toggleBonusLock(selectedRow, bonusIndex)}
        />
      )}
    </div>
  );
};
