// === 3x3 Factory Grid with Row Module Panel ===
import { useGame } from '@/contexts/GameContext';
import { MachineSlot } from './MachineSlot';
import { RowModulePanel } from './RowModulePanel';
import { GAME_CONFIG } from '@/types/game';
import { MachineDragProvider, useMachineDrag } from './DragContext';
import { getLevelColor } from './machineTileUtils';
import { MachineTileContent } from './MachineTileContent';

interface FactoryGridProps {
  onRowClick?: (rowIndex: 0 | 1 | 2) => void;
}

const DragPreview = () => {
  const { state } = useGame();
  const { dragState } = useMachineDrag();
  const draggedMachine = dragState.draggedMachineId
    ? state.machines.find(machine => machine.id === dragState.draggedMachineId)
    : null;

  if (!dragState.isDragging || !dragState.pointerPosition || !draggedMachine) return null;

  const left = dragState.pointerPosition.x - (dragState.dragOffset?.x ?? 0);
  const top = dragState.pointerPosition.y - (dragState.dragOffset?.y ?? 0);

  return (
    <div
      className="fixed z-50 pointer-events-none"
      style={{
        left,
        top,
        width: dragState.ghostSize?.width ?? undefined,
        height: dragState.ghostSize?.height ?? undefined,
      }}
    >
      <div
        className={`w-full h-full rounded-lg border-2 flex flex-col items-center justify-center text-foreground font-medium shadow-lg ${
          draggedMachine.disabled ? 'bg-destructive/10 border-destructive' : getLevelColor(draggedMachine.level)
        } opacity-90 scale-105`}
      >
        <div className="h-[52px] flex flex-col items-center justify-center">
          <MachineTileContent machine={draggedMachine} />
        </div>
      </div>
    </div>
  );
};

const FactoryGridContent = ({ onRowClick }: FactoryGridProps) => {
  const { state } = useGame();

  // Create array of 9 slots
  const slots = Array.from({ length: GAME_CONFIG.gridSize }, (_, i) => {
    const machine = state.machines.find(m => m.slotIndex === i) || null;
    return { slotIndex: i, machine };
  });

  return (
    <div className="p-4 flex-1 flex items-center justify-center">
      <div className="flex items-stretch gap-3">
        {/* Row module panel - aligned with grid rows */}
        {onRowClick && (
          <RowModulePanel onRowClick={onRowClick} />
        )}
        
        {/* 3x3 Grid */}
        <div className="grid grid-cols-3 gap-3 w-full max-w-xs">
          {slots.map(({ slotIndex, machine }) => (
            <MachineSlot 
              key={slotIndex} 
              slotIndex={slotIndex} 
              machine={machine} 
            />
          ))}
        </div>
      </div>
      <DragPreview />
    </div>
  );
};

export const FactoryGrid = ({ onRowClick }: FactoryGridProps) => (
  <MachineDragProvider>
    <FactoryGridContent onRowClick={onRowClick} />
  </MachineDragProvider>
);
