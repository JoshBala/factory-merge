// === TYPES & CONSTANTS FOR IDLE MERGE FACTORY ===
// Note: Game balance constants are in src/config/balance.ts

import { BALANCE } from '@/config/balance';
import type { UpgradeId } from '@/config/upgrades';
import type { UpgradeEffectProjection } from '@/utils/upgradeEffects';

// Machine level is now a number (no cap)
export type DisasterType = 'fire' | 'powerOutage';

export interface Machine {
  id: string;
  level: number;  // Procedural: 1, 2, 3, 4, ...
  slotIndex: number;
  disabled: boolean; // True when affected by fire
}

export interface Disaster {
  type: DisasterType;
  targetSlot?: number; // For fire: which slot is burning
  startTime: number;
  duration: number; // ms
}

// === ROW MODULE TYPES ===
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic';

export type BonusKind = 
  | 'productionPercent'           // +Production% (APPLIED)
  | 'productionAfterMerge'        // +Production-after-merge% (STUB)
  | 'disasterDurationReduction'   // -Disaster duration% (APPLIED)
  | 'disasterChanceIncrease'      // +Disaster chance% (STUB)
  | 'disasterResolutionReward'    // +Reward on disaster resolution% (STUB)
  | 'upgradeCostReduction'        // -Upgrade costs% (STUB)
  | 'automationSpeed'             // +Automation speed% (STUB)
  | 'offlineEarningsPercent';     // +Offline earnings% (STUB)

export interface RowBonus {
  kind: BonusKind;
  value: number;
  rarity?: Rarity;
  locked: boolean;
}

export interface RowModule {
  rowIndex: 0 | 1 | 2; // top=0, mid=1, bottom=2
  rarity: Rarity;
  bonuses: RowBonus[];
}

export interface GameStats {
  lifetimeCurrencyEarned: number;
  lifetimeMachinesBought: number;
  lifetimeMerges: number;
  highestMachineLevel: number;
}

export type AutomationTriggerType = 'interval' | 'slot_filled' | 'merge_available';

export interface AutomationRule {
  id: string;
  enabled: boolean;
  triggerType: AutomationTriggerType;
  sourceRowFilter: Array<0 | 1 | 2>;
  targetRowFilter: Array<0 | 1 | 2>;
  sourceSlotFilter: number[];
  targetSlotFilter: number[];
  cooldownMs: number;
  lastTriggeredAt: number | null;
}

export interface AutomationRuntime {
  lastRunAt: number | null;
  pendingQueue: string[];
  opsPerTickBudget: number;
  debugMetrics?: AutomationDebugMetrics;
}

export interface AutomationState {
  rules: AutomationRule[];
  runtime: AutomationRuntime;
  enabled: boolean;
}

export type AutomationBlockedReason = 'no_match' | 'cooldown' | 'disabled' | 'full_grid';

export interface AutomationDebugMetrics {
  attemptedOps: number;
  successfulOps: number;
  blockedReasons: Record<AutomationBlockedReason, number>;
}

export type AutomationOp =
  | { type: 'merge_machines'; sourceId: string; targetId: string; ruleId?: string }
  | { type: 'move_machine'; machineId: string; targetSlot: number; ruleId?: string };

export interface GameState {
  currency: number;
  machines: Machine[];
  activeDisaster: Disaster | null;
  selectedMachineId: string | null;
  lastTickTime: number;
  totalPlayTime: number;
  rowModules: RowModule[]; // 0-3 modules, one per row
  stats: GameStats;
  saveVersion?: number;
  ownedUpgrades: Record<string, number>;
  upgradeEffectProjection?: UpgradeEffectProjection;
  automation: AutomationState;
}

// === GAME BALANCE CONSTANTS (legacy wrapper, prefer importing from balance.ts) ===
export const GAME_CONFIG = {
  // Grid size
  gridSize: BALANCE.gridSize,

  // Machine costs
  machineCost: BALANCE.baseMachineCost,

  // Repair costs (percentage of equivalent value)
  repairCostMultiplier: BALANCE.repairCostMultiplier,

  // Timing (ms)
  tickInterval: BALANCE.tickIntervalMs,
  autoSaveInterval: BALANCE.autoSaveIntervalMs,
  disasterCheckInterval: BALANCE.disasterCheckIntervalMs,

  // Disaster settings
  disasterChance: BALANCE.disasterChance,
  powerOutageDuration: { 
    min: BALANCE.powerOutageDurationMin, 
    max: BALANCE.powerOutageDurationMax 
  },
  
  // Offline earnings
  offlineEfficiency: BALANCE.offlineEfficiency,
  maxOfflineHours: BALANCE.maxOfflineHours,

  // Row module costs
  rowModuleCosts: BALANCE.rowModuleCosts as Record<Rarity, number>,

  // Reroll cost per row (scales)
  rerollBaseCost: BALANCE.rerollBaseCost,
} as const;

// Number of bonuses per rarity
export const RARITY_BONUS_COUNT: Record<Rarity, number> = {
  common: 1,
  uncommon: 2,
  rare: 3,
  epic: 4,
};

// Bonus ranges per rarity tier: [min, max] as percentages
export const BONUS_RANGES: Record<BonusKind, Record<Rarity, [number, number]>> = {
  productionPercent: {
    common: [5, 10],
    uncommon: [10, 20],
    rare: [20, 35],
    epic: [35, 50],
  },
  productionAfterMerge: {
    common: [3, 8],
    uncommon: [8, 15],
    rare: [15, 25],
    epic: [25, 40],
  },
  disasterDurationReduction: {
    common: [5, 10],
    uncommon: [10, 20],
    rare: [20, 30],
    epic: [30, 50],
  },
  disasterChanceIncrease: {
    common: [2, 5],
    uncommon: [5, 10],
    rare: [10, 18],
    epic: [18, 30],
  },
  disasterResolutionReward: {
    common: [10, 20],
    uncommon: [20, 40],
    rare: [40, 70],
    epic: [70, 100],
  },
  upgradeCostReduction: {
    common: [3, 6],
    uncommon: [6, 12],
    rare: [12, 20],
    epic: [20, 30],
  },
  automationSpeed: {
    common: [5, 10],
    uncommon: [10, 20],
    rare: [20, 35],
    epic: [35, 50],
  },
  offlineEarningsPercent: {
    common: [5, 10],
    uncommon: [10, 20],
    rare: [20, 35],
    epic: [35, 50],
  },
};

// Reducer action types
export type GameAction =
  | { type: 'TICK'; deltaMs: number }
  | { type: 'BUY_MACHINE'; slotIndex: number }
  | { type: 'SELECT_MACHINE'; machineId: string | null }
  | { type: 'MERGE_MACHINES'; sourceId: string; targetId: string }
  | { type: 'START_DISASTER'; disaster: Disaster }
  | { type: 'END_DISASTER' }
  | { type: 'REPAIR_MACHINE'; machineId: string }
  | { type: 'COLLECT_OFFLINE'; earnings: number }
  | { type: 'LOAD_GAME'; state: GameState }
  | { type: 'RESET_GAME' }
  | { type: 'UPGRADE_ROW'; rowIndex: 0 | 1 | 2 }
  | { type: 'REROLL_ROW_BONUSES'; rowIndex: 0 | 1 | 2 }
  | { type: 'TOGGLE_ROW_BONUS_LOCK'; rowIndex: 0 | 1 | 2; bonusIndex: number }
  | { type: 'MOVE_MACHINE'; machineId: string; targetSlot: number }
  | { type: 'SCRAP_MACHINE'; machineId: string }
  | { type: 'BUY_UPGRADE'; upgradeId: UpgradeId }
  | { type: 'REFUND_UPGRADE'; upgradeId: UpgradeId }
  | { type: 'RESET_UPGRADES' }
  | { type: 'ADD_AUTOMATION_RULE'; rule: AutomationRule }
  | { type: 'UPDATE_AUTOMATION_RULE'; ruleId: string; updates: Partial<AutomationRule> }
  | { type: 'REMOVE_AUTOMATION_RULE'; ruleId: string }
  | { type: 'TOGGLE_AUTOMATION'; enabled?: boolean }
  | { type: 'RUN_AUTOMATION_OPS'; ops: AutomationOp[] }
  | { type: 'RECORD_AUTOMATION_BLOCKED'; reason: AutomationBlockedReason };
