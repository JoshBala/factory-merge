// === GAME LOOP HOOK ===
// Handles production ticks and disaster generation
import { useEffect, useRef } from 'react';
import { GameState, GameAction, Disaster, GAME_CONFIG, RowModule } from '@/types/game';
import { randomInRange, getDisasterDurationReduction } from '@/utils/calculations';

interface UseGameLoopProps {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
}

export const useGameLoop = ({ state, dispatch }: UseGameLoopProps): void => {
  const lastTickRef = useRef(Date.now());
  const lastDisasterCheckRef = useRef(Date.now());

  useEffect(() => {
    const gameLoop = setInterval(() => {
      const now = Date.now();
      const deltaMs = now - lastTickRef.current;
      lastTickRef.current = now;

      // Production tick
      dispatch({ type: 'TICK', deltaMs });

      // Disaster check (every 30s)
      if (now - lastDisasterCheckRef.current >= GAME_CONFIG.disasterCheckInterval) {
        lastDisasterCheckRef.current = now;
        
        // Only trigger if no active disaster and player has machines
        if (!state.activeDisaster && state.machines.length > 0) {
          if (Math.random() < GAME_CONFIG.disasterChance) {
            const disaster = generateDisaster(state, state.rowModules);
            if (disaster) {
              dispatch({ type: 'START_DISASTER', disaster });
            }
          }
        }
      }
    }, GAME_CONFIG.tickInterval);

    return () => clearInterval(gameLoop);
  }, [dispatch, state.activeDisaster, state.machines, state.rowModules]);
};

// Calculate global disaster duration reduction from all row modules
const getGlobalDisasterReduction = (rowModules: RowModule[]): number => {
  let totalReduction = 0;
  for (let row = 0; row < 3; row++) {
    totalReduction += getDisasterDurationReduction(rowModules, row);
  }
  // Cap at 80% reduction to keep some challenge
  return Math.min(totalReduction, 0.8);
};

// Generate a random disaster
const generateDisaster = (state: GameState, rowModules: RowModule[]): Disaster | null => {
  const disasterType = Math.random() < 0.5 ? 'fire' : 'powerOutage';

  if (disasterType === 'fire') {
    // Fire targets one random non-disabled machine
    const validTargets = state.machines.filter(m => !m.disabled);
    if (validTargets.length === 0) return null;
    
    const target = validTargets[Math.floor(Math.random() * validTargets.length)];
    
    return {
      type: 'fire',
      targetSlot: target.slotIndex,
      startTime: Date.now(),
      duration: 999999999, // Fire lasts until repaired (JSON-safe, not Infinity)
    };
  } else {
    // Power outage affects all, auto-resolves
    // Apply disaster duration reduction from row modules
    const baseDuration = randomInRange(
      GAME_CONFIG.powerOutageDuration.min,
      GAME_CONFIG.powerOutageDuration.max
    );
    const reduction = getGlobalDisasterReduction(rowModules);
    const finalDuration = Math.max(baseDuration * (1 - reduction), 2000); // Min 2s
    
    return {
      type: 'powerOutage',
      startTime: Date.now(),
      duration: finalDuration,
    };
  }
};

export default useGameLoop;
