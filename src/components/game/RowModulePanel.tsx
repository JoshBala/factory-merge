// === Side panel showing row modules aligned with grid rows ===
import { useGame } from '@/contexts/GameContext';
import { RowModule } from '@/types/game';
import { 
  calculateBonusValue, getBonusDisplayName, getRarityColor, getRarityName 
} from '@/utils/calculations';

interface RowModulePanelProps {
  onRowClick: (rowIndex: 0 | 1 | 2) => void;
}

const ROW_LABELS = ['Top', 'Mid', 'Bot'] as const;

// Single row module card
const RowModuleCard = ({ 
  rowIndex, 
  module, 
  onClick 
}: { 
  rowIndex: 0 | 1 | 2;
  module: RowModule | undefined;
  onClick: () => void;
}) => {
  return (
    <button
      onClick={onClick}
      className="w-full h-full flex flex-col items-start justify-center px-2 py-1.5 
                 bg-card/80 hover:bg-card border border-border rounded-lg 
                 transition-colors cursor-pointer text-left"
      title="Click to open Row Upgrades"
    >
      {/* Row name + rarity */}
      <div className="flex items-center gap-1.5 w-full">
        <span className="text-xs font-medium text-foreground">{ROW_LABELS[rowIndex]}</span>
        {module ? (
          <span className={`px-1.5 py-0.5 rounded text-[10px] text-white font-medium ${getRarityColor(module.rarity)}`}>
            {getRarityName(module.rarity).slice(0, 3)}
          </span>
        ) : (
          <span className="px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground">
            —
          </span>
        )}
      </div>
      
      {/* Bonuses (up to 2, truncated) */}
      <div className="mt-1 space-y-0.5 w-full">
        {module ? (
          module.bonuses.slice(0, 2).map((bonus, idx) => {
            const value = calculateBonusValue(bonus, module.rarity);
            // Shortened display names
            const shortName = getShortBonusName(bonus.type);
            return (
              <div 
                key={idx} 
                className="text-[10px] text-muted-foreground truncate"
              >
                <span className="text-green-500">+{value.toFixed(0)}%</span> {shortName}
              </div>
            );
          })
        ) : (
          <div className="text-[10px] text-muted-foreground/60 italic">
            Tap to unlock
          </div>
        )}
        {module && module.bonuses.length > 2 && (
          <div className="text-[10px] text-muted-foreground/60">
            +{module.bonuses.length - 2} more...
          </div>
        )}
      </div>
    </button>
  );
};

// Shortened bonus names for compact display
const getShortBonusName = (type: string): string => {
  const shortNames: Record<string, string> = {
    productionPercent: 'Prod',
    productionAfterMerge: 'Merge',
    disasterDurationReduction: 'Dur↓',
    disasterChanceIncrease: 'Chance',
    disasterResolutionReward: 'Reward',
    upgradeCostReduction: 'Cost↓',
    automationSpeed: 'Auto',
    offlineEarningsPercent: 'Offline',
  };
  return shortNames[type] || type;
};

export const RowModulePanel = ({ onRowClick }: RowModulePanelProps) => {
  const { state } = useGame();

  const getModule = (rowIndex: 0 | 1 | 2): RowModule | undefined =>
    state.rowModules.find(m => m.rowIndex === rowIndex);

  return (
    <div className="flex flex-col gap-3 w-20">
      {([0, 1, 2] as const).map(rowIndex => (
        <div key={rowIndex} className="flex-1 min-h-[72px]">
          <RowModuleCard
            rowIndex={rowIndex}
            module={getModule(rowIndex)}
            onClick={() => onRowClick(rowIndex)}
          />
        </div>
      ))}
    </div>
  );
};
