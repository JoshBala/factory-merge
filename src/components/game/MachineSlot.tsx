// === Single machine slot in the 3x3 grid ===
import { Machine } from '@/types/game';
import { BALANCE } from '@/config/balance';
import { useGame } from '@/contexts/GameContext';
import { canMerge } from '@/utils/calculations';
import { cn } from '@/lib/utils';
import { useMachineDrag } from './DragContext';
import { MachineTileContent } from './MachineTileContent';
import { getLevelColor } from './machineTileUtils';

interface MachineSlotProps {
  slotIndex: number;
  machine: Machine | null;
}

export const MachineSlot = ({ slotIndex, machine }: MachineSlotProps) => {
  const { state, actions } = useGame();
  const { dragState, startDrag, ignoreClick, clearIgnoreClick } = useMachineDrag();
  const canAfford = state.currency >= BALANCE.baseMachineCost;
  const isSelected = machine && state.selectedMachineId === machine.id;
  
  // Check if this slot can be merge target
  const selectedMachine = state.machines.find(m => m.id === state.selectedMachineId);
  const canMergeHere = selectedMachine && machine && canMerge(selectedMachine, machine);

  // Check if selected machine can move here
  const canMoveHere = !machine && selectedMachine && !selectedMachine.disabled;

  const handleClick = () => {
    if (ignoreClick) {
      clearIgnoreClick();
      return;
    }
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

  const draggedMachine = dragState.draggedMachineId
    ? state.machines.find(m => m.id === dragState.draggedMachineId)
    : null;
  const isDragging = dragState.isDragging && !!dragState.draggedMachineId;
  const isDragOrigin = isDragging && dragState.fromSlotIndex === slotIndex;
  const dragMoveTarget = isDragging && draggedMachine && !machine && !draggedMachine.disabled
    && dragState.fromSlotIndex !== slotIndex;
  const dragMergeTarget = isDragging && draggedMachine && machine && machine.id !== draggedMachine.id
    && canMerge(draggedMachine, machine);
  const isValidDropTarget = dragMoveTarget || dragMergeTarget;
  const isHoverTarget = isValidDropTarget && dragState.overSlotIndex === slotIndex;

  return (
    <button
      data-slot-index={slotIndex}
      onClick={handleClick}
      onPointerDown={
        machine
          ? event => startDrag(machine.id, slotIndex, event)
          : undefined
      }
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
        canMergeHere && 'ring-2 ring-green-500 ring-offset-2 ring-offset-background animate-pulse',
        machine && 'touch-none select-none cursor-grab active:cursor-grabbing',
        isDragOrigin && 'opacity-60 scale-95',
        dragMoveTarget && 'ring-2 ring-primary/70 ring-offset-2 ring-offset-background',
        dragMergeTarget && 'ring-2 ring-green-500 ring-offset-2 ring-offset-background',
        isHoverTarget && 'ring-4'
      )}
    >
      {/* Fixed-height content area to prevent layout shifts */}
      <div className="h-[52px] flex flex-col items-center justify-center">
        {machine ? (
          <MachineTileContent machine={machine} />
        ) : (
          <span className="text-sm leading-tight">
            {canMoveHere ? '→ Move' : canAfford ? '+ Buy' : 'Empty'}
          </span>
        )}
      </div>
    </button>
  );
};
