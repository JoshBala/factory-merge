// === GAME STATE CONTEXT & REDUCER ===
import React, { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import { GameState, GameAction, Machine, GAME_CONFIG } from '@/types/game';
import { BALANCE, getScrapRefund } from '@/config/balance';
import { 
  generateId, calculateEarnings, canMerge, getMergedLevel, 
  getRepairCost, createRowModule, upgradeRowModule, rerollBonus,
  getRowUpgradeCost, getRerollCost, getNextRarity
} from '@/utils/calculations';
import { saveGame, loadGame, deleteSave } from '@/utils/storage';

// Initial state for new game
const createInitialState = (): GameState => ({
  currency: 50, // Starting money to buy first machines
  machines: [],
  activeDisaster: null,
  selectedMachineId: null,
  lastTickTime: Date.now(),
  totalPlayTime: 0,
  rowModules: [], // No modules initially
});

// === REDUCER ===
const gameReducer = (state: GameState, action: GameAction): GameState => {
  switch (action.type) {
    case 'TICK': {
      const isPowerOutage = state.activeDisaster?.type === 'powerOutage';
      const earnings = calculateEarnings(
        state.machines, 
        isPowerOutage, 
        action.deltaMs,
        state.rowModules
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
      };
    }

    case 'BUY_MACHINE': {
      if (state.currency < BALANCE.baseMachineCost) return state;
      
      const newMachine: Machine = {
        id: generateId(),
        level: 1,
        slotIndex: action.slotIndex,
        disabled: false,
      };
      
      return {
        ...state,
        currency: state.currency - BALANCE.baseMachineCost,
        machines: [...state.machines, newMachine],
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
        selectedMachineId: null,
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
      // Ensure rowModules exists for backwards compatibility
      const loadedState = {
        ...action.state,
        rowModules: action.state.rowModules || [],
      };
      return { ...loadedState, lastTickTime: Date.now() };
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

    case 'REROLL_BONUS': {
      const module = state.rowModules.find(m => m.rowIndex === action.rowIndex);
      if (!module) return state;
      if (action.bonusIndex >= module.bonuses.length) return state;
      
      const cost = getRerollCost(action.rowIndex);
      if (state.currency < cost) return state;
      
      const updated = rerollBonus(module, action.bonusIndex);
      
      return {
        ...state,
        currency: state.currency - cost,
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
        selectedMachineId: null,
        // If scrapping a burning machine, clear the fire
        activeDisaster: state.activeDisaster?.targetSlot === machine.slotIndex 
          ? null 
          : state.activeDisaster,
      };
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
    rerollBonus: (rowIndex: 0 | 1 | 2, bonusIndex: number) => void;
    moveMachine: (machineId: string, targetSlot: number) => void;
    scrapMachine: (machineId: string) => void;
  };
}

const GameContext = createContext<GameContextType | null>(null);

export const GameProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(gameReducer, null, () => {
    // Try to load saved game
    const saved = loadGame();
    if (saved) {
      // Ensure rowModules exists for backwards compatibility
      return { ...saved, rowModules: saved.rowModules || [] };
    }
    return createInitialState();
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
    rerollBonus: useCallback((rowIndex: 0 | 1 | 2, bonusIndex: number) =>
      dispatch({ type: 'REROLL_BONUS', rowIndex, bonusIndex }), []),
    moveMachine: useCallback((machineId: string, targetSlot: number) =>
      dispatch({ type: 'MOVE_MACHINE', machineId, targetSlot }), []),
    scrapMachine: useCallback((machineId: string) =>
      dispatch({ type: 'SCRAP_MACHINE', machineId }), []),
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
