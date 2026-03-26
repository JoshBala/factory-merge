// === GAME STATE CONTEXT & REDUCER ===
import React, { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import { GameState, GameAction, Machine, GAME_CONFIG, AutomationBlockedReason, AutomationOp } from '@/types/game';
import { BALANCE, getScrapRefund } from '@/config/balance';
import { 
  generateId, calculateEarnings, canMerge, getMergedLevel, 
  getRepairCost, createRowModule, upgradeRowModule, rerollRowBonuses,
  getRowUpgradeCost, getRerollCost, getNextRarity
} from '@/utils/calculations';
import { saveGame, loadGame, deleteSave } from '@/utils/storage';
import { migrateGameState } from '@/utils/migrations';
import { createInitialState } from '@/utils/state';
import { UPGRADE_BY_ID, getCompletedTier, getUpgradeLockReasons } from '@/config/upgrades';
import { resolveUpgradeEffects } from '@/utils/upgradeEffects';
import { getMachinePurchaseCost, getUpgradePurchaseCost } from '@/utils/costs';
import {
  createAddPresetAutomationRuleIntent,
  createRemoveLatestAutomationRuleIntent,
  createToggleAutomationIntent,
} from '@/services/automationService';

type UpgradeDefinition = {
  unlockRequirements?: Record<string, number> | Array<{ upgradeId: string; level: number }>;
  maxLevel?: number;
  resource?: string;
  cost?: number | Record<string, number>;
  costs?: number[] | Record<string, number>;
};

const readResourceMap = (resources: unknown): Record<string, number> => {
  if (!resources || typeof resources !== 'object' || Array.isArray(resources)) {
    return {};
  }

  return Object.entries(resources as Record<string, unknown>).reduce<Record<string, number>>(
    (acc, [resource, amount]) => {
      if (typeof amount === 'number' && Number.isFinite(amount)) {
        acc[resource] = amount;
      }
      return acc;
    },
    {}
  );
};

const getDynamicField = (state: GameState, key: string): unknown => {
  return (state as Record<string, unknown>)[key];
};

const readUpgradeDefinition = (state: GameState, upgradeId: string): UpgradeDefinition | null => {
  const sources = [
    getDynamicField(state, 'upgradeDefinitions'),
    getDynamicField(state, 'upgrades'),
    getDynamicField(state, 'upgradeConfig'),
  ];

  for (const source of sources) {
    if (!source || typeof source !== 'object' || Array.isArray(source)) continue;
    const definition = (source as Record<string, unknown>)[upgradeId];
    if (definition && typeof definition === 'object' && !Array.isArray(definition)) {
      return definition as UpgradeDefinition;
    }
  }

  return null;
};

const meetsUnlockRequirements = (
  definition: UpgradeDefinition,
  ownedUpgrades: Record<string, number>
): boolean => {
  if (!definition.unlockRequirements) return true;

  if (Array.isArray(definition.unlockRequirements)) {
    return definition.unlockRequirements.every(req => (ownedUpgrades[req.upgradeId] ?? 0) >= req.level);
  }

  return Object.entries(definition.unlockRequirements).every(
    ([requiredUpgradeId, requiredLevel]) => (ownedUpgrades[requiredUpgradeId] ?? 0) >= requiredLevel
  );
};

const resolveUpgradeCost = (definition: UpgradeDefinition, nextLevel: number): Record<string, number> => {
  if (typeof definition.cost === 'number') {
    const resource = definition.resource ?? 'currency';
    return { [resource]: definition.cost };
  }

  if (definition.cost && typeof definition.cost === 'object' && !Array.isArray(definition.cost)) {
    return definition.cost as Record<string, number>;
  }

  if (Array.isArray(definition.costs)) {
    const clampedIndex = Math.max(0, Math.min(nextLevel - 1, definition.costs.length - 1));
    const listedCost = definition.costs[clampedIndex] ?? definition.costs[definition.costs.length - 1] ?? 0;
    const resource = definition.resource ?? 'currency';
    return { [resource]: listedCost };
  }

  if (definition.costs && typeof definition.costs === 'object') {
    return definition.costs as Record<string, number>;
  }

  return { currency: 0 };
};

const canAffordUpgrade = (state: GameState, costs: Record<string, number>): boolean => {
  const resources = readResourceMap(getDynamicField(state, 'resources'));

  return Object.entries(costs).every(([resource, amount]) => {
    const topLevelValue = getDynamicField(state, resource);
    if (typeof topLevelValue === 'number') return topLevelValue >= amount;
    const nestedValue = resources[resource];
    if (typeof nestedValue === 'number') return nestedValue >= amount;
    return false;
  });
};

const applyUpgradeCost = (state: GameState, costs: Record<string, number>): GameState => {
  const nextState = { ...state } as Record<string, unknown>;
  const currentResources = readResourceMap(getDynamicField(state, 'resources'));
  const updatedResources = { ...currentResources };
  let touchedNestedResources = false;

  Object.entries(costs).forEach(([resource, amount]) => {
    if (typeof nextState[resource] === 'number') {
      nextState[resource] = (nextState[resource] as number) - amount;
      return;
    }

    updatedResources[resource] = (updatedResources[resource] ?? 0) - amount;
    touchedNestedResources = true;
  });

  if (touchedNestedResources) {
    nextState.resources = updatedResources;
  }

  return nextState as GameState;
};


const withBlockedMetric = (state: GameState, reason: AutomationBlockedReason): GameState => {
  const debugMetrics = state.automation.runtime.debugMetrics ?? {
    attemptedOps: 0,
    successfulOps: 0,
    blockedReasons: {
      no_match: 0,
      cooldown: 0,
      disabled: 0,
      full_grid: 0,
    },
  };

  return {
    ...state,
    automation: {
      ...state.automation,
      runtime: {
        ...state.automation.runtime,
        debugMetrics: {
          ...debugMetrics,
          blockedReasons: {
            ...debugMetrics.blockedReasons,
            [reason]: debugMetrics.blockedReasons[reason] + 1,
          },
        },
      },
    },
  };
};

const executeAutomationOpSafely = (
  state: GameState,
  op: AutomationOp
): { nextState: GameState; success: boolean; blockedReason?: AutomationBlockedReason } => {
  const operationAction: GameAction | null = (() => {
    switch (op.type) {
      case 'merge_machines': {
        const source = state.machines.find(machine => machine.id === op.sourceId);
        const target = state.machines.find(machine => machine.id === op.targetId);
        if (!source || !target) return null;
        if (source.disabled || target.disabled) return null;
        if (!canMerge(source, target)) return null;
        return { type: 'MERGE_MACHINES', sourceId: op.sourceId, targetId: op.targetId };
      }
      case 'move_machine': {
        const machine = state.machines.find(candidate => candidate.id === op.machineId);
        if (!machine || machine.disabled) return null;
        const slotOccupied = state.machines.some(candidate => candidate.slotIndex === op.targetSlot);
        if (slotOccupied) return null;
        return { type: 'MOVE_MACHINE', machineId: op.machineId, targetSlot: op.targetSlot };
      }
      default:
        return null;
    }
  })();

  if (!operationAction) {
    if (op.type === 'move_machine') {
      const machine = state.machines.find(candidate => candidate.id === op.machineId);
      if (machine?.disabled) return { nextState: state, success: false, blockedReason: 'disabled' };
      const hasEmptySlots = state.machines.length < GAME_CONFIG.gridSize;
      return { nextState: state, success: false, blockedReason: hasEmptySlots ? 'no_match' : 'full_grid' };
    }

    const source = state.machines.find(machine => machine.id === op.sourceId);
    const target = state.machines.find(machine => machine.id === op.targetId);
    if (source?.disabled || target?.disabled) {
      return { nextState: state, success: false, blockedReason: 'disabled' };
    }
    return { nextState: state, success: false, blockedReason: 'no_match' };
  }

  const nextState = gameReducer(state, operationAction);
  if (nextState === state) return { nextState: state, success: false, blockedReason: 'no_match' };

  if (nextState.machines === state.machines) return { nextState: nextState, success: false, blockedReason: 'no_match' };

  return {
    nextState: {
      ...nextState,
      upgradeEffectProjection: resolveUpgradeEffects(nextState.ownedUpgrades, nextState.machines),
    },
    success: true,
  };
};

// === REDUCER ===
export const gameReducer = (state: GameState, action: GameAction): GameState => {
  switch (action.type) {
    case 'TICK': {
      const isPowerOutage = state.activeDisaster?.type === 'powerOutage';
      const earnings = calculateEarnings(
        state.machines, 
        isPowerOutage, 
        action.deltaMs,
        state.rowModules,
        state
      );
      
      // Check if disaster should end
      let activeDisaster = state.activeDisaster;
      if (activeDisaster) {
        const elapsed = Date.now() - activeDisaster.startTime;
        if (elapsed >= activeDisaster.duration) {
          activeDisaster = null;
        }
      }
      
      return {
        ...state,
        currency: state.currency + earnings,
        activeDisaster,
        lastTickTime: Date.now(),
        totalPlayTime: state.totalPlayTime + action.deltaMs,
        stats: {
          ...state.stats,
          lifetimeCurrencyEarned: state.stats.lifetimeCurrencyEarned + earnings,
        },
      };
    }

    case 'BUY_MACHINE': {
      const machineCost = getMachinePurchaseCost(state);
      if (state.currency < machineCost) return state;
      
      const newMachine: Machine = {
        id: generateId(),
        level: 1,
        slotIndex: action.slotIndex,
        disabled: false,
      };
      
      return {
        ...state,
        currency: state.currency - machineCost,
        machines: [...state.machines, newMachine],
        automation: {
          ...state.automation,
          runtime: {
            ...state.automation.runtime,
            triggerFlags: {
              ...state.automation.runtime.triggerFlags,
              afterBuyMachine: true,
            },
          },
        },
        stats: {
          ...state.stats,
          lifetimeMachinesBought: state.stats.lifetimeMachinesBought + 1,
          highestMachineLevel: Math.max(state.stats.highestMachineLevel, newMachine.level),
        },
      };
    }

    case 'SELECT_MACHINE': {
      return { ...state, selectedMachineId: action.machineId };
    }

    case 'MERGE_MACHINES': {
      const source = state.machines.find(m => m.id === action.sourceId);
      const target = state.machines.find(m => m.id === action.targetId);
      
      if (!source || !target || !canMerge(source, target)) return state;
      
      // Get merged level (no cap)
      const newLevel = getMergedLevel(source.level);
      
      // Remove both, create merged at target position
      const mergedMachine: Machine = {
        id: generateId(),
        level: newLevel,
        slotIndex: target.slotIndex,
        disabled: false,
      };
      
      return {
        ...state,
        machines: state.machines
          .filter(m => m.id !== source.id && m.id !== target.id)
          .concat(mergedMachine),
        automation: {
          ...state.automation,
          runtime: {
            ...state.automation.runtime,
            triggerFlags: {
              ...state.automation.runtime.triggerFlags,
              afterMergeMachines: true,
            },
          },
        },
        selectedMachineId: null,
        stats: {
          ...state.stats,
          lifetimeMerges: state.stats.lifetimeMerges + 1,
          highestMachineLevel: Math.max(state.stats.highestMachineLevel, mergedMachine.level),
        },
      };
    }

    case 'START_DISASTER': {
      if (state.activeDisaster) return state; // Only one at a time
      
      // If fire, immediately disable the target machine
      if (action.disaster.type === 'fire' && action.disaster.targetSlot !== undefined) {
        const targetMachine = state.machines.find(m => m.slotIndex === action.disaster.targetSlot);
        if (!targetMachine) return state; // No valid target, skip fire
        
        return {
          ...state,
          activeDisaster: action.disaster,
          machines: state.machines.map(m =>
            m.slotIndex === action.disaster.targetSlot ? { ...m, disabled: true } : m
          ),
        };
      }
      
      return { ...state, activeDisaster: action.disaster };
    }

    case 'END_DISASTER': {
      return { ...state, activeDisaster: null };
    }

    case 'REPAIR_MACHINE': {
      const machine = state.machines.find(m => m.id === action.machineId);
      if (!machine || !machine.disabled) return state;
      
      const cost = getRepairCost(machine.level);
      if (state.currency < cost) return state;
      
      return {
        ...state,
        currency: state.currency - cost,
        machines: state.machines.map(m =>
          m.id === action.machineId ? { ...m, disabled: false } : m
        ),
        // Clear fire disaster if this was the target
        activeDisaster: state.activeDisaster?.targetSlot === machine.slotIndex 
          ? null 
          : state.activeDisaster,
      };
    }

    case 'COLLECT_OFFLINE': {
      return { ...state, currency: state.currency + action.earnings };
    }

    case 'LOAD_GAME': {
      const loadedState = migrateGameState(action.state);
      return {
        ...loadedState,
        upgradeEffectProjection: resolveUpgradeEffects(loadedState.ownedUpgrades, loadedState.machines),
        lastTickTime: Date.now(),
      };
    }

    case 'RESET_GAME': {
      deleteSave();
      return createInitialState();
    }

    case 'UPGRADE_ROW': {
      const existingModule = state.rowModules.find(m => m.rowIndex === action.rowIndex);
      const cost = getRowUpgradeCost(existingModule);
      
      if (state.currency < cost) return state;
      
      if (!existingModule) {
        // Create new module
        const newModule = createRowModule(action.rowIndex);
        return {
          ...state,
          currency: state.currency - cost,
          rowModules: [...state.rowModules, newModule],
        };
      } else {
        // Upgrade existing
        if (!getNextRarity(existingModule.rarity)) return state;
        
        const upgraded = upgradeRowModule(existingModule);
        if (!upgraded) return state;
        
        return {
          ...state,
          currency: state.currency - cost,
          rowModules: state.rowModules.map(m =>
            m.rowIndex === action.rowIndex ? upgraded : m
          ),
        };
      }
    }

    case 'REROLL_ROW_BONUSES': {
      const module = state.rowModules.find(m => m.rowIndex === action.rowIndex);
      if (!module) return state;
      const hasUnlocked = module.bonuses.some(bonus => !bonus.locked);
      if (!hasUnlocked) return state;
      
      const cost = getRerollCost(action.rowIndex);
      if (state.currency < cost) return state;
      
      const updated = rerollRowBonuses(module);
      
      return {
        ...state,
        currency: state.currency - cost,
        rowModules: state.rowModules.map(m =>
          m.rowIndex === action.rowIndex ? updated : m
        ),
      };
    }

    case 'TOGGLE_ROW_BONUS_LOCK': {
      const module = state.rowModules.find(m => m.rowIndex === action.rowIndex);
      if (!module) return state;
      if (action.bonusIndex >= module.bonuses.length) return state;

      const updated = {
        ...module,
        bonuses: module.bonuses.map((bonus, idx) =>
          idx === action.bonusIndex ? { ...bonus, locked: !bonus.locked } : bonus
        ),
      };

      return {
        ...state,
        rowModules: state.rowModules.map(m =>
          m.rowIndex === action.rowIndex ? updated : m
        ),
      };
    }

    case 'MOVE_MACHINE': {
      const machine = state.machines.find(m => m.id === action.machineId);
      if (!machine) return state;
      // Disabled machines cannot be moved
      if (machine.disabled) return state;
      // Check target slot is empty
      const slotOccupied = state.machines.some(m => m.slotIndex === action.targetSlot);
      if (slotOccupied) return state;
      
      return {
        ...state,
        machines: state.machines.map(m =>
          m.id === action.machineId ? { ...m, slotIndex: action.targetSlot } : m
        ),
        automation: {
          ...state.automation,
          runtime: {
            ...state.automation.runtime,
            triggerFlags: {
              ...state.automation.runtime.triggerFlags,
              afterScrapOrMoveMachine: true,
            },
          },
        },
        selectedMachineId: null,
      };
    }

    case 'SCRAP_MACHINE': {
      const machine = state.machines.find(m => m.id === action.machineId);
      if (!machine) return state;
      
      // Use procedural scrap refund
      const refund = getScrapRefund(machine.level);
      
      return {
        ...state,
        currency: state.currency + refund,
        machines: state.machines.filter(m => m.id !== action.machineId),
        automation: {
          ...state.automation,
          runtime: {
            ...state.automation.runtime,
            triggerFlags: {
              ...state.automation.runtime.triggerFlags,
              afterScrapOrMoveMachine: true,
            },
          },
        },
        selectedMachineId: null,
        // If scrapping a burning machine, clear the fire
        activeDisaster: state.activeDisaster?.targetSlot === machine.slotIndex 
          ? null 
          : state.activeDisaster,
      };
    }

    case 'BUY_UPGRADE': {
      const ownedUpgrades = state.ownedUpgrades;
      const currentLevel = ownedUpgrades[action.upgradeId] ?? 0;

      const catalogUpgrade = UPGRADE_BY_ID[action.upgradeId];
      if (catalogUpgrade) {
        const unlockContext = {
          ownedUpgrades,
          completedTier: getCompletedTier(ownedUpgrades),
          currencyTotal: state.stats.lifetimeCurrencyEarned,
          machineLevel: state.stats.highestMachineLevel,
          ownedMachines: state.machines.length,
        };
        const lockReasons = getUpgradeLockReasons(catalogUpgrade, unlockContext);
        if (lockReasons.length > 0) return state;

        if (currentLevel >= catalogUpgrade.maxLevel) return state;
        const cost = getUpgradePurchaseCost(action.upgradeId, currentLevel, state);
        if (cost === null || state.currency < cost) return state;

        return {
          ...state,
          currency: state.currency - cost,
          ownedUpgrades: {
            ...ownedUpgrades,
            [action.upgradeId]: currentLevel + 1,
          },
          upgradeEffectProjection: resolveUpgradeEffects(
            {
              ...ownedUpgrades,
              [action.upgradeId]: currentLevel + 1,
            },
            state.machines
          ),
        };
      }

      const definition = readUpgradeDefinition(state, action.upgradeId);
      if (!definition) return state;

      const maxLevel = definition.maxLevel ?? Number.POSITIVE_INFINITY;
      if (currentLevel >= maxLevel) return state;
      if (!meetsUnlockRequirements(definition, ownedUpgrades)) return state;

      const nextLevel = currentLevel + 1;
      const costs = resolveUpgradeCost(definition, nextLevel);
      if (!canAffordUpgrade(state, costs)) return state;

      const nextState = applyUpgradeCost(state, costs);
      return {
        ...nextState,
        ownedUpgrades: {
          ...ownedUpgrades,
          [action.upgradeId]: nextLevel,
        },
        upgradeEffectProjection: resolveUpgradeEffects(
          {
            ...ownedUpgrades,
            [action.upgradeId]: nextLevel,
          },
          state.machines
        ),
      };
    }

    case 'ADD_AUTOMATION_RULE': {
      if (state.automation.rules.some(rule => rule.id === action.rule.id)) return state;

      return {
        ...state,
        automation: {
          ...state.automation,
          rules: [...state.automation.rules, action.rule],
        },
      };
    }

    case 'UPDATE_AUTOMATION_RULE': {
      const hasRule = state.automation.rules.some(rule => rule.id === action.ruleId);
      if (!hasRule) return state;

      return {
        ...state,
        automation: {
          ...state.automation,
          rules: state.automation.rules.map(rule =>
            rule.id === action.ruleId ? { ...rule, ...action.updates, id: rule.id } : rule
          ),
        },
      };
    }

    case 'REMOVE_AUTOMATION_RULE': {
      return {
        ...state,
        automation: {
          ...state.automation,
          rules: state.automation.rules.filter(rule => rule.id !== action.ruleId),
        },
      };
    }

    case 'TOGGLE_AUTOMATION': {
      const enabled = action.enabled ?? !state.automation.enabled;
      return {
        ...state,
        automation: {
          ...state.automation,
          enabled,
        },
      };
    }

    case 'RUN_AUTOMATION_OPS': {
      if (action.ops.length === 0) return state;

      const debugMetrics = state.automation.runtime.debugMetrics ?? {
        attemptedOps: 0,
        successfulOps: 0,
        blockedReasons: {
          no_match: 0,
          cooldown: 0,
          disabled: 0,
          full_grid: 0,
        },
      };
      const op = action.ops[0];
      const result = executeAutomationOpSafely(state, op);
      const baseState = result.nextState;

      const withAttempt = {
        ...baseState,
        automation: {
          ...baseState.automation,
          runtime: {
            ...baseState.automation.runtime,
            lastRunAt: Date.now(),
            debugMetrics: {
              ...debugMetrics,
              attemptedOps: debugMetrics.attemptedOps + 1,
              successfulOps: debugMetrics.successfulOps + (result.success ? 1 : 0),
              blockedReasons: { ...debugMetrics.blockedReasons },
            },
          },
          rules: result.success && op.ruleId
            ? baseState.automation.rules.map(rule =>
                rule.id === op.ruleId ? { ...rule, lastTriggeredAt: Date.now() } : rule
              )
            : baseState.automation.rules,
        },
      };

      if (result.blockedReason) {
        return withBlockedMetric(withAttempt, result.blockedReason);
      }

      return withAttempt;
    }

    case 'CONSUME_AUTOMATION_TRIGGERS': {
      if (
        !state.automation.runtime.triggerFlags.afterBuyMachine &&
        !state.automation.runtime.triggerFlags.afterMergeMachines &&
        !state.automation.runtime.triggerFlags.afterScrapOrMoveMachine
      ) {
        return state;
      }

      return {
        ...state,
        automation: {
          ...state.automation,
          runtime: {
            ...state.automation.runtime,
            triggerFlags: {
              afterBuyMachine: false,
              afterMergeMachines: false,
              afterScrapOrMoveMachine: false,
            },
          },
        },
      };
    }

    case 'RECORD_AUTOMATION_BLOCKED': {
      return withBlockedMetric(state, action.reason);
    }

    default:
      return state;
  }
};

// === CONTEXT ===
interface GameContextType {
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
  actions: {
    buyMachine: (slotIndex: number) => void;
    selectMachine: (id: string | null) => void;
    mergeMachines: (sourceId: string, targetId: string) => void;
    repairMachine: (id: string) => void;
    resetGame: () => void;
    upgradeRow: (rowIndex: 0 | 1 | 2) => void;
    rerollBonus: (rowIndex: 0 | 1 | 2) => void;
    toggleBonusLock: (rowIndex: 0 | 1 | 2, bonusIndex: number) => void;
    moveMachine: (machineId: string, targetSlot: number) => void;
    scrapMachine: (machineId: string) => void;
    buyUpgrade: (upgradeId: string) => void;
    toggleAutomation: (enabled?: boolean) => void;
    addAutomationPresetRule: () => void;
    removeLatestAutomationRule: () => void;
  };
}

const GameContext = createContext<GameContextType | null>(null);

export const GameProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(gameReducer, null, () => {
    // Try to load saved game
    const saved = loadGame();
    if (saved) {
      const migrated = migrateGameState(saved);
      return {
        ...migrated,
        upgradeEffectProjection: resolveUpgradeEffects(migrated.ownedUpgrades, migrated.machines),
      };
    }
    const initialState = createInitialState();
    return {
      ...initialState,
      upgradeEffectProjection: resolveUpgradeEffects(initialState.ownedUpgrades, initialState.machines),
    };
  });

  // Note: Offline earnings are handled by GameScreen with a modal
  // We don't auto-collect here to allow user interaction

  // Autosave
  useEffect(() => {
    const interval = setInterval(() => saveGame(state), GAME_CONFIG.autoSaveInterval);
    return () => clearInterval(interval);
  }, [state]);

  // Save on page unload
  useEffect(() => {
    const handleUnload = () => saveGame(state);
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, [state]);

  // Action helpers
  const actions = {
    buyMachine: useCallback((slotIndex: number) => 
      dispatch({ type: 'BUY_MACHINE', slotIndex }), []),
    selectMachine: useCallback((id: string | null) => 
      dispatch({ type: 'SELECT_MACHINE', machineId: id }), []),
    mergeMachines: useCallback((sourceId: string, targetId: string) => 
      dispatch({ type: 'MERGE_MACHINES', sourceId, targetId }), []),
    repairMachine: useCallback((id: string) => 
      dispatch({ type: 'REPAIR_MACHINE', machineId: id }), []),
    resetGame: useCallback(() => 
      dispatch({ type: 'RESET_GAME' }), []),
    upgradeRow: useCallback((rowIndex: 0 | 1 | 2) =>
      dispatch({ type: 'UPGRADE_ROW', rowIndex }), []),
    rerollBonus: useCallback((rowIndex: 0 | 1 | 2) =>
      dispatch({ type: 'REROLL_ROW_BONUSES', rowIndex }), []),
    toggleBonusLock: useCallback((rowIndex: 0 | 1 | 2, bonusIndex: number) =>
      dispatch({ type: 'TOGGLE_ROW_BONUS_LOCK', rowIndex, bonusIndex }), []),
    moveMachine: useCallback((machineId: string, targetSlot: number) =>
      dispatch({ type: 'MOVE_MACHINE', machineId, targetSlot }), []),
    scrapMachine: useCallback((machineId: string) =>
      dispatch({ type: 'SCRAP_MACHINE', machineId }), []),
    buyUpgrade: useCallback((upgradeId: string) =>
      dispatch({ type: 'BUY_UPGRADE', upgradeId }), []),
    toggleAutomation: useCallback((enabled?: boolean) =>
      dispatch(createToggleAutomationIntent(enabled)), []),
    addAutomationPresetRule: useCallback(() => {
      const stateSnapshot = state;
      const toggleAction = createAddPresetAutomationRuleIntent(
        'merge_any',
        stateSnapshot.automation.rules.map(rule => rule.id)
      );
      dispatch(toggleAction);
    }, [state]),
    removeLatestAutomationRule: useCallback(() => {
      const action = createRemoveLatestAutomationRuleIntent(state.automation.rules);
      if (action) dispatch(action);
    }, [state.automation.rules]),
  };

  return (
    <GameContext.Provider value={{ state, dispatch, actions }}>
      {children}
    </GameContext.Provider>
  );
};

export const useGame = (): GameContextType => {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within GameProvider');
  return ctx;
};
