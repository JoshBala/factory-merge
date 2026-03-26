import { SAVE_VERSION } from '@/config/version';
import { GameState } from '@/types/game';

export const createInitialState = (): GameState => ({
  currency: 50, // Starting money to buy first machines
  machines: [],
  activeDisaster: null,
  selectedMachineId: null,
  lastTickTime: Date.now(),
  totalPlayTime: 0,
  gridUpgrade: null,
  rowModules: [], // Legacy save compatibility
  stats: {
    lifetimeCurrencyEarned: 0,
    lifetimeMachinesBought: 0,
    lifetimeMerges: 0,
    highestMachineLevel: 0,
  },
  ownedUpgrades: {},
  automation: {
    enabled: true,
    rules: [],
    runtime: {
      lastRunAt: null,
      pendingQueue: [],
      opsPerTickBudget: 1,
      triggerFlags: {
        afterBuyMachine: false,
        afterMergeMachines: false,
        afterScrapOrMoveMachine: false,
      },
      debugMetrics: {
        attemptedOps: 0,
        successfulOps: 0,
        blockedReasons: {
          no_match: 0,
          cooldown: 0,
          disabled: 0,
          full_grid: 0,
        },
      },
    },
  },
  saveVersion: SAVE_VERSION,
});

export const normalizePersistedState = (data: unknown): GameState | null => {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const base = createInitialState();
  const partial = data as Partial<GameState>;

  return {
    ...base,
    ...partial,
    currency: typeof partial.currency === 'number' ? partial.currency : base.currency,
    machines: Array.isArray(partial.machines) ? partial.machines : base.machines,
    gridUpgrade: partial.gridUpgrade ?? base.gridUpgrade,
    // Legacy import compatibility only; migration resolves canonical gridUpgrade.
    rowModules: Array.isArray(partial.rowModules) ? partial.rowModules : base.rowModules,
    activeDisaster: partial.activeDisaster ?? base.activeDisaster,
    selectedMachineId:
      typeof partial.selectedMachineId === 'string' || partial.selectedMachineId === null
        ? partial.selectedMachineId
        : base.selectedMachineId,
    lastTickTime: typeof partial.lastTickTime === 'number' ? partial.lastTickTime : base.lastTickTime,
    totalPlayTime: typeof partial.totalPlayTime === 'number' ? partial.totalPlayTime : base.totalPlayTime,
    stats: {
      ...base.stats,
      ...(partial.stats ?? {}),
    },
    saveVersion: typeof partial.saveVersion === 'number' ? partial.saveVersion : base.saveVersion,
  };
};
