import { SAVE_VERSION } from '@/config/version';
import { GameState } from '@/types/game';

export const createInitialState = (): GameState => ({
  currency: 50, // Starting money to buy first machines
  machines: [],
  activeDisaster: null,
  selectedMachineId: null,
  lastTickTime: Date.now(),
  totalPlayTime: 0,
  rowModules: [], // No modules initially
  stats: {
    lifetimeCurrencyEarned: 0,
    lifetimeMachinesBought: 0,
    lifetimeMerges: 0,
    highestMachineLevel: 0,
  },
  ownedUpgrades: {},
  automation: {
    enabled: false,
    rules: [],
    runtime: {
      lastRunAt: null,
      pendingQueue: [],
      opsPerTickBudget: 1,
    },
  },
  saveVersion: SAVE_VERSION,
});
