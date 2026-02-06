// === Bottom Action Bar: Repair + Scrap + Reset ===
import { useState } from 'react';
import { useGame } from '@/contexts/GameContext';
import { getRepairCost, getScrapRefund, formatCurrency } from '@/utils/calculations';
import { Button } from '@/components/ui/button';

export const ActionBar = () => {
  const { state, actions } = useGame();
  const [showResolved, setShowResolved] = useState(false);
  
  // Find selected machine for scrap
  const selectedMachine = state.machines.find(m => m.id === state.selectedMachineId);
  const scrapRefund = selectedMachine ? getScrapRefund(selectedMachine.level) : 0;
  
  // Find the burning machine (if fire is active)
  const burningMachine = state.activeDisaster?.type === 'fire' && state.activeDisaster.targetSlot !== undefined
    ? state.machines.find(m => m.slotIndex === state.activeDisaster!.targetSlot)
    : null;
  
  // Repair conditions: fire is active, burning machine exists, and player can afford
  const repairCost = burningMachine ? getRepairCost(burningMachine.level) : 0;
  const canRepair = burningMachine && 
    burningMachine.disabled && 
    state.currency >= repairCost;

  const handleRepair = () => {
    if (burningMachine && canRepair) {
      actions.repairMachine(burningMachine.id);
      // Show resolved feedback
      setShowResolved(true);
      setTimeout(() => setShowResolved(false), 2000);
    }
  };

  const handleScrap = () => {
    if (selectedMachine) {
      actions.scrapMachine(selectedMachine.id);
    }
  };

  const handleReset = () => {
    if (confirm('Reset all progress? This cannot be undone.')) {
      actions.resetGame();
    }
  };

  return (
    <footer className="bg-card border-t border-border p-4">
      {/* Resolved feedback */}
      {showResolved && (
        <div className="mb-3 text-center py-2 px-4 rounded-md bg-green-500/20 text-green-700 dark:text-green-400 text-sm font-medium animate-pulse">
          ✅ Fire resolved!
        </div>
      )}
      
      <div className="flex gap-3">
        <Button
          onClick={handleRepair}
          disabled={!canRepair}
          variant={canRepair ? 'default' : 'secondary'}
          className="flex-1"
        >
          {burningMachine
            ? `🔧 Repair (${formatCurrency(repairCost)})`
            : '🔧 Repair'
          }
        </Button>
        
        <Button
          onClick={handleScrap}
          disabled={!selectedMachine}
          variant="outline"
          className="flex-1"
        >
          {selectedMachine
            ? `🗑️ Scrap (+${formatCurrency(scrapRefund)})`
            : '🗑️ Scrap'
          }
        </Button>
        
        <Button
          onClick={handleReset}
          variant="destructive"
        >
          Reset
        </Button>
      </div>
    </footer>
  );
};
