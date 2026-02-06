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
  const lastFrameRef = useRef<number | null>(null);
  const lastDisasterCheckRef = useRef(Date.now());
  const accumulatedTimeRef = useRef(0);
  const animationFrameRef = useRef<number | null>(null);
  const stateRef = useRef(state);

  const maxFrameDeltaSeconds = 0.1;
  const uiUpdateIntervalSeconds = 0.1;

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const step = (time: number) => {
      if (lastFrameRef.current === null) {
        lastFrameRef.current = time;
      }

      const deltaSeconds = Math.min(
        (time - lastFrameRef.current) / 1000,
        maxFrameDeltaSeconds
      );
      lastFrameRef.current = time;
      accumulatedTimeRef.current += deltaSeconds;

      const now = Date.now();

      // Disaster check (every 30s)
      if (now - lastDisasterCheckRef.current >= GAME_CONFIG.disasterCheckInterval) {
        lastDisasterCheckRef.current = now;

        // Only trigger if no active disaster and player has machines
        const currentState = stateRef.current;
        if (!currentState.activeDisaster && currentState.machines.length > 0) {
          if (Math.random() < GAME_CONFIG.disasterChance) {
            const disaster = generateDisaster(currentState, currentState.rowModules);
            if (disaster) {
              dispatch({ type: 'START_DISASTER', disaster });
            }
          }
        }
      }

      if (accumulatedTimeRef.current >= uiUpdateIntervalSeconds) {
        const deltaMs = accumulatedTimeRef.current * 1000;
        accumulatedTimeRef.current = 0;

        // Production tick
        dispatch({ type: 'TICK', deltaMs });
      }

      animationFrameRef.current = requestAnimationFrame(step);
    };

    animationFrameRef.current = requestAnimationFrame(step);

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [dispatch]);
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
