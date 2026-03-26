import { useGame } from '@/contexts/GameContext';
import { calculateBonusValue, getRarityColor, getRarityName } from '@/utils/calculations';

interface RowModulePanelProps {
  onRowClick: (rowIndex: 0 | 1 | 2) => void;
}

const ROW_LABELS = ['Top', 'Mid', 'Bot'] as const;

export const RowModulePanel = ({ onRowClick }: RowModulePanelProps) => {
  const { state } = useGame();
  const module = state.gridUpgrade;

  return (
    <div className="flex flex-col gap-3 w-24">
      {([0, 1, 2] as const).map(rowIndex => (
        <button
          key={rowIndex}
          onClick={() => onRowClick(rowIndex)}
          className="w-full h-full min-h-[72px] flex flex-col items-start justify-center px-2 py-1.5 bg-card/80 hover:bg-card border border-border rounded-lg"
        >
          <div className="flex items-center gap-1.5 w-full">
            <span className="text-xs font-medium text-foreground">{ROW_LABELS[rowIndex]}</span>
            {module ? (
              <span className={`px-1.5 py-0.5 rounded text-[10px] text-white font-medium ${getRarityColor(module.rarity)}`}>
                {getRarityName(module.rarity).slice(0, 3)}
              </span>
            ) : (
              <span className="px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground">—</span>
            )}
          </div>
          <div className="mt-1 space-y-0.5 w-full">
            {module ? module.bonuses.slice(0, 2).map((bonus, idx) => (
              <div key={idx} className="text-[10px] text-muted-foreground truncate">
                <span className="text-green-500">+{calculateBonusValue(bonus).toFixed(0)}%</span> {bonus.kind}
              </div>
            )) : <div className="text-[10px] text-muted-foreground/60 italic">Tap to unlock</div>}
          </div>
        </button>
      ))}
    </div>
  );
};
