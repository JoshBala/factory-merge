// === 3x3 Factory Grid with Row Module Panel ===
import { useGame } from '@/contexts/GameContext';
import { MachineSlot } from './MachineSlot';
import { RowModulePanel } from './RowModulePanel';
import { GAME_CONFIG } from '@/types/game';

interface FactoryGridProps {
  onRowClick?: (rowIndex: 0 | 1 | 2) => void;
}

export const FactoryGrid = ({ onRowClick }: FactoryGridProps) => {
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
    </div>
  );
};
