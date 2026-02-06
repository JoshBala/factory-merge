// === Row Upgrades Modal ===
import { useGame } from '@/contexts/GameContext';
import { RowModule, Rarity, RARITY_BONUS_COUNT } from '@/types/game';
import { 
  formatCurrency, getRowUpgradeCost, getRerollCost,
  calculateBonusValue, getBonusDisplayName, getRarityColor,
  getRarityName, getNextRarity
} from '@/utils/calculations';
import { Button } from '@/components/ui/button';
import { X, Dice6 } from 'lucide-react';

interface RowUpgradesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ROW_NAMES = ['Top Row', 'Middle Row', 'Bottom Row'] as const;

// Single row card component
const RowCard = ({ 
  rowIndex, 
  module, 
  currency,
  onUpgrade,
  onReroll 
}: { 
  rowIndex: 0 | 1 | 2;
  module: RowModule | undefined;
  currency: number;
  onUpgrade: () => void;
  onReroll: (bonusIndex: number) => void;
}) => {
  const upgradeCost = getRowUpgradeCost(module);
  const rerollCost = getRerollCost(rowIndex);
  const canAffordUpgrade = currency >= upgradeCost;
  const canAffordReroll = currency >= rerollCost;
  const nextRarity = module ? getNextRarity(module.rarity) : 'common';
  const isMaxed = module && !nextRarity;

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="font-semibold text-foreground">{ROW_NAMES[rowIndex]}</span>
        {module && (
          <span className={`px-2 py-0.5 rounded text-xs text-white font-medium ${getRarityColor(module.rarity)}`}>
            {getRarityName(module.rarity)}
          </span>
        )}
        {!module && (
          <span className="px-2 py-0.5 rounded text-xs bg-muted text-muted-foreground">
            Not Unlocked
          </span>
        )}
      </div>

      {/* Bonuses list */}
      <div className="space-y-2 mb-4 min-h-[80px]">
        {module ? (
          module.bonuses.map((bonus, idx) => {
            const value = calculateBonusValue(bonus, module.rarity);
            return (
              <div key={idx} className="flex items-center justify-between bg-background/50 rounded px-2 py-1.5">
                <span className="text-sm text-foreground">
                  {getBonusDisplayName(bonus.type)}: <strong>{value.toFixed(1)}%</strong>
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onReroll(idx)}
                  disabled={!canAffordReroll}
                  className="h-7 w-7 p-0"
                  title={`Reroll: ${formatCurrency(rerollCost)}`}
                >
                  <Dice6 className="h-4 w-4" />
                </Button>
              </div>
            );
          })
        ) : (
          <p className="text-sm text-muted-foreground italic">
            Unlock to get production bonuses for machines in this row.
          </p>
        )}
      </div>

      {/* Upgrade button */}
      {!isMaxed && (
        <Button
          onClick={onUpgrade}
          disabled={!canAffordUpgrade}
          variant={canAffordUpgrade ? 'default' : 'secondary'}
          className="w-full"
        >
          {module 
            ? `Upgrade to ${getRarityName(nextRarity!)} (${formatCurrency(upgradeCost)})`
            : `Unlock (${formatCurrency(upgradeCost)})`
          }
        </Button>
      )}
      {isMaxed && (
        <div className="text-center text-sm text-muted-foreground py-2">
          Max rarity reached!
        </div>
      )}

      {/* Reroll cost hint */}
      {module && (
        <p className="text-xs text-muted-foreground text-center mt-2">
          Reroll cost: {formatCurrency(rerollCost)}
        </p>
      )}
    </div>
  );
};

export const RowUpgradesModal = ({ isOpen, onClose }: RowUpgradesModalProps) => {
  const { state, actions } = useGame();

  if (!isOpen) return null;

  const getModule = (rowIndex: 0 | 1 | 2): RowModule | undefined =>
    state.rowModules.find(m => m.rowIndex === rowIndex);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60" 
        onClick={onClose}
      />
      
      {/* Modal content */}
      <div className="relative bg-background border border-border rounded-xl w-full max-w-md max-h-[90vh] overflow-auto shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-background border-b border-border p-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-foreground">Row Upgrades</h2>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onClose}
            className="h-8 w-8 p-0"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Currency display */}
        <div className="px-4 pt-3 pb-1">
          <p className="text-sm text-muted-foreground">
            Available: <span className="text-foreground font-semibold">{formatCurrency(state.currency)}</span>
          </p>
        </div>

        {/* Row cards */}
        <div className="p-4 space-y-4">
          {([0, 1, 2] as const).map(rowIndex => (
            <RowCard
              key={rowIndex}
              rowIndex={rowIndex}
              module={getModule(rowIndex)}
              currency={state.currency}
              onUpgrade={() => actions.upgradeRow(rowIndex)}
              onReroll={(bonusIndex) => actions.rerollBonus(rowIndex, bonusIndex)}
            />
          ))}
        </div>

        {/* Info footer */}
        <div className="px-4 pb-4">
          <p className="text-xs text-muted-foreground text-center">
            Bonuses apply to machines currently in that row.
            Moving machines changes which bonuses apply.
          </p>
        </div>
      </div>
    </div>
  );
};
