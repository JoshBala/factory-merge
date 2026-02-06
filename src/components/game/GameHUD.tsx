// === HUD: Currency display + disaster status ===
import { useGame } from '@/contexts/GameContext';
import { 
  formatCurrency, 
  calculateProductionRate, 
  calculateBaseProductionRate,
  getRowProductionBonus
} from '@/utils/calculations';
import { RowModule, Machine } from '@/types/game';
import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { getProductionRate } from '@/config/balance';

// Calculate per-row contribution
const getRowContributions = (machines: Machine[], rowModules: RowModule[]) => {
  const rows = [
    { name: 'Top', index: 0, slots: [0, 1, 2] },
    { name: 'Mid', index: 1, slots: [3, 4, 5] },
    { name: 'Bot', index: 2, slots: [6, 7, 8] },
  ];
  
  return rows.map(row => {
    const rowMachines = machines.filter(m => row.slots.includes(m.slotIndex) && !m.disabled);
    // Use procedural production rate
    const baseRate = rowMachines.reduce((sum, m) => sum + getProductionRate(m.level), 0);
    const bonus = getRowProductionBonus(rowModules, row.index);
    const modifiedRate = baseRate * (1 + bonus);
    return {
      name: row.name,
      baseRate,
      bonus,
      modifiedRate,
    };
  });
};

// Format rate with K/M/B support
const formatRate = (rate: number): string => {
  if (rate >= 1e6) return `$${(rate / 1e6).toFixed(1)}M/s`;
  if (rate >= 1e3) return `$${(rate / 1e3).toFixed(1)}K/s`;
  return `$${rate.toFixed(1)}/s`;
};

export const GameHUD = () => {
  const { state } = useGame();
  const [disasterTimer, setDisasterTimer] = useState<number | null>(null);
  const [showDebug, setShowDebug] = useState(false);

  // Calculate rates using unified function
  const isPowerOutage = state.activeDisaster?.type === 'powerOutage';
  const modifiedRate = calculateProductionRate(state.machines, isPowerOutage, state.rowModules);
  const baseRate = calculateBaseProductionRate(state.machines);
  const rowContributions = getRowContributions(state.machines, state.rowModules);

  // Update power outage countdown
  useEffect(() => {
    if (state.activeDisaster?.type === 'powerOutage') {
      const updateTimer = () => {
        const elapsed = Date.now() - state.activeDisaster!.startTime;
        const remaining = Math.max(0, state.activeDisaster!.duration - elapsed);
        setDisasterTimer(Math.ceil(remaining / 1000));
      };
      updateTimer();
      const interval = setInterval(updateTimer, 500);
      return () => clearInterval(interval);
    } else {
      setDisasterTimer(null);
    }
  }, [state.activeDisaster]);

  return (
    <header className="bg-card border-b border-border p-4">
      {/* Currency display */}
      <div className="text-center mb-2">
        <span className="text-2xl font-bold text-foreground">
          {formatCurrency(state.currency)}
        </span>
        <p className="text-xs text-muted-foreground">
          +{formatRate(modifiedRate)}
          {baseRate > 0 && baseRate !== modifiedRate && (
            <span className="text-green-500 ml-1">
              (+{((modifiedRate / baseRate - 1) * 100).toFixed(0)}%)
            </span>
          )}
        </p>
        
        {/* Debug toggle */}
        <button
          onClick={() => setShowDebug(!showDebug)}
          className="text-xs text-muted-foreground/60 hover:text-muted-foreground flex items-center gap-1 mx-auto mt-1"
        >
          {showDebug ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {showDebug ? 'Hide' : 'Show'} breakdown
        </button>
      </div>

      {/* Debug panel */}
      {showDebug && (
        <div className="bg-muted/50 rounded-md p-2 mb-2 text-xs font-mono">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <span className="text-muted-foreground">Base rate:</span>
            <span>{formatRate(baseRate)}</span>
            <span className="text-muted-foreground">Modified rate:</span>
            <span className="text-green-500">{formatRate(modifiedRate)}</span>
          </div>
          <div className="border-t border-border mt-2 pt-2">
            <div className="text-muted-foreground mb-1">Per-row breakdown:</div>
            {rowContributions.map(row => (
              <div key={row.name} className="flex justify-between">
                <span>{row.name}:</span>
                <span>
                  {formatRate(row.baseRate).replace('/s', '')} → {formatRate(row.modifiedRate).replace('/s', '')}
                  {row.bonus > 0 && (
                    <span className="text-green-500 ml-1">(+{(row.bonus * 100).toFixed(0)}%)</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Disaster banner */}
      {state.activeDisaster && (
        <div className={`text-center py-2 px-4 rounded-md text-sm font-medium ${
          state.activeDisaster.type === 'fire' 
            ? 'bg-destructive/20 text-destructive' 
            : 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400'
        }`}>
          {state.activeDisaster.type === 'fire' ? (
            <>🔥 Fire at slot {(state.activeDisaster.targetSlot ?? 0) + 1}! Repair needed</>
          ) : (
            <>⚡ Power outage! {disasterTimer}s remaining</>
          )}
        </div>
      )}
    </header>
  );
};
