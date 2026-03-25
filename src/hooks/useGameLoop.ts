// === GAME LOOP HOOK ===
// Handles production ticks, disaster generation, and automation scheduling
import { useEffect, useRef } from 'react';
import { GameState, GameAction, Disaster, GAME_CONFIG, RowModule } from '@/types/game';
import { randomInRange, resolveGameEffects } from '@/utils/calculations';
import { planAutomationOps } from '@/utils/automationPlanner';
import { resolveUpgradeEffects } from '@/utils/upgradeEffects';

interface UseGameLoopProps {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
}

const mapPlannedOpsToActions = (
  ops: ReturnType<typeof planAutomationOps>,
  maxOps: number
): GameAction['ops'] => {
  const actionableOps: GameAction['ops'] = [];

  for (const op of ops) {
    if (actionableOps.length >= maxOps) break;

    if (op.kind === 'MERGE') {
      actionableOps.push({
        type: 'merge_machines',
        sourceId: op.sourceId,
        targetId: op.targetId,
      });
      continue;
    }

    if (op.kind === 'MOVE') {
      actionableOps.push({
        type: 'move_machine',
        machineId: op.machineId,
        targetSlot: op.targetSlot,
      });
    }
  }

  return actionableOps;
};

const isAutomationBlockedByDisaster = (state: GameState): boolean => {
  return state.activeDisaster?.type === 'powerOutage';
};

export const useGameLoop = ({ state, dispatch }: UseGameLoopProps): void => {
  const lastFrameRef = useRef<number | null>(null);
  const lastDisasterCheckRef = useRef(Date.now());
  const accumulatedTimeRef = useRef(0);
  const automationAccumulatedMsRef = useRef(0);
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
      automationAccumulatedMsRef.current += deltaSeconds * 1000;

      const now = Date.now();

      // Disaster check (every 30s)
      if (now - lastDisasterCheckRef.current >= GAME_CONFIG.disasterCheckInterval) {
        lastDisasterCheckRef.current = now;

        // Only trigger if no active disaster and player has machines
        const currentState = stateRef.current;
        if (!currentState.activeDisaster && currentState.machines.length > 0) {
          const effects = resolveGameEffects(currentState.rowModules, currentState);
          if (Math.random() < effects.disasterChance) {
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

      // Automation scheduling phase (bounded to one schedule evaluation per frame)
      const currentState = stateRef.current;
      if (currentState.automation.enabled && !isAutomationBlockedByDisaster(currentState)) {
        // Resolve row + upgrade effects exactly once per scheduling cycle
        const rowEffects = resolveGameEffects(currentState.rowModules, currentState);
        const automationIntervalMs = rowEffects.automationIntervalMs;

        if (automationAccumulatedMsRef.current >= automationIntervalMs) {
          const upgradeEffects =
            currentState.upgradeEffectProjection ??
            resolveUpgradeEffects(currentState.ownedUpgrades, currentState.machines);

          const plannedOps = planAutomationOps(
            currentState,
            {
              ...currentState.automation,
              runtime: {
                ...currentState.automation.runtime,
                opsPerTickBudget: 1,
              },
            },
            upgradeEffects,
            now
          );

          const ops = mapPlannedOpsToActions(plannedOps, 1);
          if (ops.length > 0) {
            dispatch({ type: 'RUN_AUTOMATION_OPS', ops });
          }

          // Never loop to exhaustion in one frame.
          automationAccumulatedMsRef.current = Math.max(
            0,
            automationAccumulatedMsRef.current - automationIntervalMs
          );
        }
      } else {
        // Keep accumulator bounded while blocked/disabled.
        automationAccumulatedMsRef.current = Math.min(automationAccumulatedMsRef.current, 1000);
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
  const effects = resolveGameEffects(rowModules);
  // Cap at 80% reduction to keep some challenge
  return Math.min(0.8, 1 - effects.disasterDurationMultiplier);
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
