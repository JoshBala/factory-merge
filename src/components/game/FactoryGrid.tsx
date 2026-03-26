// === 3x3 Factory Grid with persistent row upgrades panel ===
import { useGame } from '@/contexts/GameContext';
import { MachineSlot } from './MachineSlot';
import { RowUpgradesPanel } from './RowUpgradesPanel';
import { GAME_CONFIG } from '@/types/game';
import { MachineDragProvider, useMachineDrag } from './DragContext';
import { getLevelColor } from './machineTileUtils';
import { MachineTileContent } from './MachineTileContent';
import { Button } from '@/components/ui/button';

interface FactoryGridProps {
  onOpenUpgradeMenu?: () => void;
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

const FactoryGridContent = ({ onOpenUpgradeMenu }: FactoryGridProps) => {
  const { state } = useGame();

  // Create array of slots from shared grid capacity config.
  const slots = Array.from({ length: GAME_CONFIG.gridSize }, (_, i) => {
    const machine = state.machines.find(m => m.slotIndex === i) || null;
    return { slotIndex: i, machine };
  });

  return (
    <div className="p-4 flex-1 flex items-center justify-center">
      <div className="w-full max-w-7xl grid gap-4 lg:grid-cols-[minmax(300px,360px)_auto_minmax(220px,280px)] items-start">
        <RowUpgradesPanel />

        {/* Fixed 3x3 grid (guarded in balance config). */}
        <div className="grid grid-cols-3 gap-3 w-full max-w-xs justify-self-center">
          {slots.map(({ slotIndex, machine }) => (
            <MachineSlot
              key={slotIndex}
              slotIndex={slotIndex}
              machine={machine}
            />
          ))}
        </div>

        <aside className="w-full rounded-xl border border-border bg-card p-4 space-y-3">
          <h2 className="text-base font-semibold text-foreground">Upgrades</h2>
          <p className="text-sm text-muted-foreground">
            Open the full upgrades menu to spend currency on factory-wide boosts.
          </p>
          {onOpenUpgradeMenu && (
            <Button className="w-full" onClick={onOpenUpgradeMenu}>
              Open Upgrades
            </Button>
          )}
        </aside>
      </div>
      <DragPreview />
    </div>
  );
};

export const FactoryGrid = ({ onOpenUpgradeMenu }: FactoryGridProps) => (
  <MachineDragProvider>
    <FactoryGridContent onOpenUpgradeMenu={onOpenUpgradeMenu} />
  </MachineDragProvider>
);
