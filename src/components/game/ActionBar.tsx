// === Bottom Action Bar: Repair + Scrap ===
import { useState } from 'react';
import { useGame } from '@/contexts/GameContext';
import { getRepairCost, getScrapRefund, formatCurrency } from '@/utils/calculations';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { FEATURE_FLAGS } from '@/config/featureFlags';
import { createAutomationRuleSummary, listAutomationPresets } from '@/services/automationService';

export const ActionBar = () => {
  const { state, actions } = useGame();
  const [showResolved, setShowResolved] = useState(false);
  const automationSummary = createAutomationRuleSummary(state);
  const presets = listAutomationPresets();
  
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

  return (
    <footer className="bg-card border-t border-border p-4">
      <div className="mb-3 rounded-md border border-border/70 bg-muted/30 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">Automation</p>
            <p className="text-xs text-muted-foreground">
              {automationSummary.enabled}/{automationSummary.total} rules enabled
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Master</span>
            <Switch
              checked={state.automation.enabled}
              onCheckedChange={(checked) => actions.toggleAutomation(checked)}
              aria-label="Toggle automation"
            />
          </div>
        </div>

        <div className="mt-2 flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={actions.addAutomationPresetRule}
          >
            + Add preset
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={actions.removeLatestAutomationRule}
            disabled={automationSummary.total === 0}
          >
            − Remove latest
          </Button>
        </div>

        <p className="mt-2 text-[11px] text-muted-foreground">
          Default preset: {presets[0].label}
        </p>

        {FEATURE_FLAGS.automationAdvancedEditor ? (
          <Button variant="ghost" size="sm" className="mt-2 h-7 px-2 text-xs">
            Open advanced rule editor
          </Button>
        ) : (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Advanced editor is temporarily disabled while balancing stabilizes.
          </p>
        )}
      </div>

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
        
      </div>
    </footer>
  );
};
