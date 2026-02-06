// === Single machine slot in the 3x3 grid ===
import { Machine } from '@/types/game';
import { BALANCE, getProductionRate } from '@/config/balance';
import { useGame } from '@/contexts/GameContext';
import { canMerge, formatCurrency } from '@/utils/calculations';
import { cn } from '@/lib/utils';

interface MachineSlotProps {
  slotIndex: number;
  machine: Machine | null;
}

// Generate color for any level (procedural)
const getLevelColor = (level: number): string => {
  // Cycle through a progression of colors for higher levels
  const colors = [
    'bg-emerald-500/20 border-emerald-500',   // Lv 1
    'bg-blue-500/20 border-blue-500',          // Lv 2
    'bg-purple-500/20 border-purple-500',      // Lv 3
    'bg-orange-500/20 border-orange-500',      // Lv 4
    'bg-pink-500/20 border-pink-500',          // Lv 5
    'bg-cyan-500/20 border-cyan-500',          // Lv 6
    'bg-yellow-500/20 border-yellow-500',      // Lv 7
    'bg-red-500/20 border-red-500',            // Lv 8
    'bg-indigo-500/20 border-indigo-500',      // Lv 9
    'bg-lime-500/20 border-lime-500',          // Lv 10+
  ];
  return colors[Math.min(level - 1, colors.length - 1)];
};

// Format production rate for display
const formatRate = (rate: number): string => {
  if (rate >= 1e6) return `$${(rate / 1e6).toFixed(1)}M/s`;
  if (rate >= 1e3) return `$${(rate / 1e3).toFixed(1)}K/s`;
  return `$${rate.toFixed(1)}/s`;
};

export const MachineSlot = ({ slotIndex, machine }: MachineSlotProps) => {
  const { state, actions } = useGame();
  const canAfford = state.currency >= BALANCE.baseMachineCost;
  const isSelected = machine && state.selectedMachineId === machine.id;
  
  // Check if this slot can be merge target
  const selectedMachine = state.machines.find(m => m.id === state.selectedMachineId);
  const canMergeHere = selectedMachine && machine && canMerge(selectedMachine, machine);

  // Check if selected machine can move here
  const canMoveHere = !machine && selectedMachine && !selectedMachine.disabled;

  const handleClick = () => {
    if (!machine) {
      // Empty slot
      if (selectedMachine && !selectedMachine.disabled) {
        // Move selected machine here
        actions.moveMachine(selectedMachine.id, slotIndex);
      } else if (canAfford) {
        // Buy new machine
        actions.buyMachine(slotIndex);
      }
    } else if (state.selectedMachineId && state.selectedMachineId !== machine.id) {
      // Another machine selected - try to merge
      if (canMergeHere) {
        actions.mergeMachines(state.selectedMachineId, machine.id);
      } else {
        // Can't merge, select this one instead
        actions.selectMachine(machine.id);
      }
    } else if (isSelected) {
      // Deselect
      actions.selectMachine(null);
    } else {
      // Select this machine
      actions.selectMachine(machine.id);
    }
  };

  // Get production rate for this machine
  const productionRate = machine ? getProductionRate(machine.level) : 0;

  return (
    <button
      onClick={handleClick}
      className={cn(
        'w-full aspect-square rounded-lg border-2 flex flex-col items-center justify-center transition-all',
        'text-foreground font-medium',
        machine ? (
          machine.disabled 
            ? 'bg-destructive/10 border-destructive' 
            : getLevelColor(machine.level)
        ) : (
          canMoveHere
            ? 'bg-primary/20 border-primary cursor-pointer'
            : canAfford 
              ? 'bg-secondary border-border hover:border-primary cursor-pointer' 
              : 'bg-muted border-border opacity-60'
        ),
        isSelected && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
        canMergeHere && 'ring-2 ring-green-500 ring-offset-2 ring-offset-background animate-pulse'
      )}
    >
      {/* Fixed-height content area to prevent layout shifts */}
      <div className="h-[52px] flex flex-col items-center justify-center">
        {machine ? (
          <>
            <span className="text-lg font-bold leading-tight">Lv {machine.level}</span>
            <span className="text-xs text-muted-foreground leading-tight">
              {formatRate(productionRate)}
            </span>
            {machine.disabled && (
              <span className="text-xs text-destructive font-medium leading-tight">
                🔥 Disabled
              </span>
            )}
          </>
        ) : (
          <span className="text-sm leading-tight">
            {canMoveHere ? '→ Move' : canAfford ? '+ Buy' : 'Empty'}
          </span>
        )}
      </div>
    </button>
  );
};
