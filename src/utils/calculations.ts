// === GAME CALCULATIONS ===
import { 
  Machine, GAME_CONFIG, 
  GridModule, Rarity, BonusKind, RowBonus, GameState,
  BONUS_RANGES, RARITY_BONUS_COUNT 
} from '@/types/game';
import { 
  BALANCE, 
  BASE_MACHINE_COST,
  BASE_PRODUCTION_PER_SECOND,
  BASE_TICK_INTERVAL_MS,
  getProductionRate, 
  getScrapRefund as getScrapRefundFromBalance,
  getRepairCostFromLevel 
} from '@/config/balance';
import { resolveUpgradeEffects } from '@/utils/upgradeEffects';

// Generate unique ID for machines
export const generateId = (): string => 
  `m_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

// === UPGRADE-AWARE BASE STAT RESOLVERS ===
/**
 * Stacking model used by all resolvers below:
 * 1) Percentage bonuses of the same family stack additively (e.g. +10% and +15% = +25%).
 * 2) Distinct multiplicative layers multiply together at the end.
 * 3) Discounts/reductions are clamped to [0%, 95%] to avoid invalid negative values.
 */
type UpgradeAwareState = GameState;

const EMPTY_GRID_BONUSES: Record<BonusKind, number> = {
  productionPercent: 0,
  productionAfterMerge: 0,
  disasterDurationReduction: 0,
  disasterChanceIncrease: 0,
  disasterResolutionReward: 0,
  upgradeCostReduction: 0,
  automationSpeed: 0,
  offlineEarningsPercent: 0,
};

export interface ResolvedGameEffects {
  byKindPercent: Record<BonusKind, number>;
  byGridPercent: Record<BonusKind, number>;
  productionMultiplier: number;
  mergedProductionMultiplier: number;
  automationIntervalMs: number;
  disasterChance: number;
  disasterDurationMultiplier: number;
  disasterResolutionRewardMultiplier: number;
  offlineEfficiency: number;
  machineCostMultiplier: number;
}

const MIN_AUTOMATION_INTERVAL_MS = 50;
const MAX_AUTOMATION_INTERVAL_MS = 60_000;

/**
 * Centralized automation interval resolver.
 *
 * Keep this aligned with:
 * - upgrade automation effects from `src/utils/upgradeEffects.ts` (`automationSpeedPercent`)
 * - row module bonus kinds from `src/types/game.ts` (`BonusKind: 'automationSpeed'`)
 *
 * This gives us one integration point whenever new automation-related effects are added.
 */
export const resolveAutomationIntervalMs = (
  rowAutomationSpeedPercent: number,
  upgradeAutomationSpeedPercent: number
): number => {
  const totalAutomationSpeedPercent = rowAutomationSpeedPercent + upgradeAutomationSpeedPercent;
  const intervalMs = BASE_TICK_INTERVAL_MS / Math.max(0.05, 1 + totalAutomationSpeedPercent / 100);

  return Math.min(MAX_AUTOMATION_INTERVAL_MS, Math.max(MIN_AUTOMATION_INTERVAL_MS, intervalMs));
};

const resolveGridBonusPercents = (gridUpgrade: GridModule | null): Record<BonusKind, number> => {
  const totals: Record<BonusKind, number> = { ...EMPTY_GRID_BONUSES };

  if (!gridUpgrade) return totals;

  for (const bonus of gridUpgrade.bonuses) {
    const value = calculateBonusValue(bonus);
    totals[bonus.kind] += value;
  }

  return totals;
};

const resolveGlobalUpgradePercents = (state?: UpgradeAwareState): Record<BonusKind, number> => {
  if (!state) {
    return { ...EMPTY_GRID_BONUSES };
  }

  const projection = resolveUpgradeEffects(state.ownedUpgrades ?? {}, state.machines);

  return {
    productionPercent:
      projection.throughputPercent + projection.synergyProductionPercent + projection.tierTargetedProductionPercent,
    productionAfterMerge: projection.mergeQualityPercent,
    disasterDurationReduction: 0,
    disasterChanceIncrease: 0,
    disasterResolutionReward: 0,
    upgradeCostReduction: projection.machineCostReductionPercent,
    automationSpeed: projection.automationSpeedPercent,
    offlineEarningsPercent: 0,
  };
};

export const resolveGameEffects = (
  gridUpgrade: GridModule | null = null,
  state?: UpgradeAwareState
): ResolvedGameEffects => {
  const effectiveGridUpgrade = gridUpgrade ?? state?.gridUpgrade ?? null;
  const gridBonusPercents = resolveGridBonusPercents(effectiveGridUpgrade);
  const upgradePercents = resolveGlobalUpgradePercents(state);
  const byKindPercent = Object.keys(EMPTY_GRID_BONUSES).reduce((acc, key) => {
    const kind = key as BonusKind;
    acc[kind] = upgradePercents[kind] + gridBonusPercents[kind];
    return acc;
  }, { ...EMPTY_GRID_BONUSES });

  // `productionPercent` must be applied exactly once as the global production layer.
  // Per-machine logic should only add *orthogonal* layers (e.g. post-merge bonuses).
  const productionMultiplier = Math.max(0, 1 + byKindPercent.productionPercent / 100);
  const mergedProductionMultiplier = Math.max(
    0,
    productionMultiplier * (1 + byKindPercent.productionAfterMerge / 100)
  );
  const automationIntervalMs = resolveAutomationIntervalMs(
    gridBonusPercents.automationSpeed,
    upgradePercents.automationSpeed
  );
  const disasterChance = Math.min(0.95, Math.max(0, GAME_CONFIG.disasterChance * (1 + byKindPercent.disasterChanceIncrease / 100)));
  const disasterDurationMultiplier = Math.max(0.2, 1 - Math.min(80, Math.max(0, byKindPercent.disasterDurationReduction)) / 100);
  const disasterResolutionRewardMultiplier = Math.max(0, 1 + byKindPercent.disasterResolutionReward / 100);
  const offlineEfficiency = Math.min(1, Math.max(0, BALANCE.offlineEfficiency * (1 + byKindPercent.offlineEarningsPercent / 100)));
  const machineCostMultiplier = 1 - Math.min(95, Math.max(0, byKindPercent.upgradeCostReduction)) / 100;

  return {
    byKindPercent,
    byGridPercent: gridBonusPercents,
    productionMultiplier,
    mergedProductionMultiplier,
    automationIntervalMs,
    disasterChance,
    disasterDurationMultiplier,
    disasterResolutionRewardMultiplier,
    offlineEfficiency,
    machineCostMultiplier,
  };
};

const getMachineRateWithResolvedEffects = (
  machine: Machine,
  effects: ResolvedGameEffects
): number => {
  if (machine.disabled) return 0;

  const baseRate = getProductionRate(machine.level);
  const mergeBonusMultiplier = machine.level > 1 ? 1 + effects.byKindPercent.productionAfterMerge / 100 : 1;

  return baseRate * effects.productionMultiplier * mergeBonusMultiplier;
};

/**
 * Effective automation interval in milliseconds.
 * Formula: baseIntervalMs / (1 + totalAutomationSpeed%)
 */
export const getEffectiveAutomationInterval = (
  state: UpgradeAwareState
): number => {
  return resolveGameEffects(state.gridUpgrade ?? null, state).automationIntervalMs;
};

/**
 * Effective global production multiplier.
 * Formula: (1 + totalProductionBonus%) * explicitMultipliers
 */
export const getEffectiveProductionMultiplier = (
  state: UpgradeAwareState
): number => {
  return resolveGameEffects(state.gridUpgrade ?? null, state).productionMultiplier;
};

/**
 * Effective Lv1 machine output after upgrade effects.
 * Formula: baseMachineOutput * effectiveProductionMultiplier
 */
export const getEffectiveBaseMachineOutput = (
  state: UpgradeAwareState
): number => {
  return BASE_PRODUCTION_PER_SECOND * getEffectiveProductionMultiplier(state);
};

/**
 * Effective base resource ("cell") generation rate.
 * If no dedicated cell generator baseline exists in state, this falls back to
 * the effective base machine output so callers always receive a stable value.
 */
export const getEffectiveBaseCellCreationRate = (
  state: UpgradeAwareState
): number => {
  const projection = resolveUpgradeEffects(state.ownedUpgrades ?? {}, state.machines);
  const baseCellRate = BASE_PRODUCTION_PER_SECOND + projection.baseGenerationFlat;
  return baseCellRate * Math.max(0, 1 + projection.baseGenerationPercent / 100);
};

/**
 * Effective machine purchase cost after discount effects.
 * Formula: baseMachineCost * (1 - totalDiscount%)
 */
export const getEffectiveMachineCost = (state: UpgradeAwareState): number => {
  return BASE_MACHINE_COST * resolveGameEffects(state.gridUpgrade ?? null, state).machineCostMultiplier;
};

// === ROW MODULE HELPERS ===

// All 8 bonus types for random selection
const ALL_BONUS_TYPES: BonusKind[] = [
  'productionPercent',
  'productionAfterMerge',
  'disasterDurationReduction',
  'disasterChanceIncrease',
  'disasterResolutionReward',
  'upgradeCostReduction',
  'automationSpeed',
  'offlineEarningsPercent',
];

// Get display name for bonus type
export const getBonusDisplayName = (type: BonusKind): string => {
  const names: Record<BonusKind, string> = {
    productionPercent: '+Production',
    productionAfterMerge: '+Post-Merge Production',
    disasterDurationReduction: '-Disaster Duration',
    disasterChanceIncrease: '+Disaster Chance',
    disasterResolutionReward: '+Disaster Reward',
    upgradeCostReduction: '-Upgrade Cost',
    automationSpeed: '+Automation Speed',
    offlineEarningsPercent: '+Offline Earnings',
  };
  return names[type];
};

// Calculate actual bonus value from normalized roll
export const calculateBonusValue = (bonus: RowBonus): number => bonus.value;

// Get next rarity in progression
export const getNextRarity = (rarity: Rarity): Rarity | null => {
  const progression: Rarity[] = ['common', 'uncommon', 'rare', 'epic'];
  const idx = progression.indexOf(rarity);
  return idx < progression.length - 1 ? progression[idx + 1] : null;
};

// Get upgrade cost for a row (to next rarity)
export const getGridUpgradeCost = (gridUpgrade: GridModule | null): number => {
  if (!gridUpgrade) {
    return GAME_CONFIG.rowModuleCosts.common;
  }
  const nextRarity = getNextRarity(gridUpgrade.rarity);
  return nextRarity ? GAME_CONFIG.rowModuleCosts[nextRarity] : 0;
};

// Get reroll cost for the grid module
export const getGridRerollCost = (): number => GAME_CONFIG.rerollBaseCost;
export const getGridRerollCostForModule = (module: GridModule | null): number => {
  const rarityMultiplier: Record<Rarity, number> = {
    common: 1,
    uncommon: 1.75,
    rare: 2.75,
    epic: 4,
  };
  const multiplier = module ? rarityMultiplier[module.rarity] : 1;
  return Math.floor(GAME_CONFIG.rerollBaseCost * multiplier);
};

// Generate a random bonus (avoids existing types)
const getRandomBonusKind = (): BonusKind =>
  ALL_BONUS_TYPES[Math.floor(Math.random() * ALL_BONUS_TYPES.length)];

const scaleBonusValue = (
  bonus: RowBonus,
  fromRarity: Rarity,
  toRarity: Rarity
): number => {
  const [fromMin, fromMax] = BONUS_RANGES[bonus.kind][fromRarity];
  const [toMin, toMax] = BONUS_RANGES[bonus.kind][toRarity];
  const roll = fromMax === fromMin ? 0 : (bonus.value - fromMin) / (fromMax - fromMin);
  const clamped = Math.min(1, Math.max(0, roll));
  return toMin + clamped * (toMax - toMin);
};

export const generateRandomBonus = (rarity: Rarity): RowBonus => {
  const kind = getRandomBonusKind();
  const [min, max] = BONUS_RANGES[kind][rarity];
  const value = min + Math.random() * (max - min);
  return { kind, value, locked: false };
};

// Create initial row module (common with 1 bonus)
export const createGridModule = (): GridModule => ({
  rarity: 'common',
  bonuses: [generateRandomBonus('common')],
});

// Upgrade row module to next rarity (keeps bonuses, adds new ones)
export const upgradeGridModule = (module: GridModule): GridModule | null => {
  const nextRarity = getNextRarity(module.rarity);
  if (!nextRarity) return null;
  
  const currentCount = module.bonuses.length;
  const targetCount = RARITY_BONUS_COUNT[nextRarity];
  
  const upgradedBonuses = module.bonuses.map(bonus => ({
    ...bonus,
    value: scaleBonusValue(bonus, module.rarity, nextRarity),
  }));
  const newBonuses = [...upgradedBonuses];
  for (let i = currentCount; i < targetCount; i++) {
    newBonuses.push(generateRandomBonus(nextRarity));
  }
  
  return {
    ...module,
    rarity: nextRarity,
    bonuses: newBonuses,
  };
};

// Reroll a specific bonus (keeps same type, new roll)
export const rerollGridBonuses = (module: GridModule): GridModule => ({
  ...module,
  bonuses: module.bonuses.map(bonus =>
    bonus.locked ? bonus : generateRandomBonus(module.rarity)
  ),
});

// Calculate total production bonus for the active grid module
export const getGridProductionBonus = (
  gridUpgrade: GridModule | null
): number => {
  const effects = resolveGameEffects(gridUpgrade);
  return effects.byKindPercent.productionPercent / 100;
};

// Calculate disaster duration reduction from the active grid module
export const getGridDisasterDurationReduction = (
  gridUpgrade: GridModule | null
): number => {
  const effects = resolveGameEffects(gridUpgrade);
  return effects.byKindPercent.disasterDurationReduction / 100;
};
// === PRODUCTION CALCULATIONS ===

/**
 * Calculate total production rate with row bonuses (single source of truth)
 * Uses procedural formula: baseProductionPerSecond * (productionGrowth ^ (level - 1))
 */
export const calculateProductionRate = (
  machines: Machine[],
  isPowerOutage: boolean,
  gridUpgrade: GridModule | null = null,
  state?: UpgradeAwareState
): number => {
  if (isPowerOutage) return 0;
  const effects = resolveGameEffects(gridUpgrade, state);
  return machines.reduce((total, machine) => total + getMachineRateWithResolvedEffects(machine, effects), 0);
};

/**
 * Calculate base production rate without row bonuses
 */
export const calculateBaseProductionRate = (machines: Machine[]): number => {
  return machines.reduce((total, m) => {
    if (m.disabled) return total;
    return total + getProductionRate(m.level);
  }, 0);
};

// Calculate earnings for a time period
export const calculateEarnings = (
  machines: Machine[],
  isPowerOutage: boolean,
  deltaMs: number,
  gridUpgrade: GridModule | null = null,
  state?: UpgradeAwareState
): number => {
  const rate = calculateProductionRate(machines, isPowerOutage, gridUpgrade, state);
  return (rate * deltaMs) / 1000; // Convert ms to seconds
};

// Calculate offline earnings with efficiency penalty
export const calculateOfflineEarnings = (
  machines: Machine[],
  lastTickTime: number,
  gridUpgrade: GridModule | null = null,
  state?: UpgradeAwareState
): { earnings: number; timeAway: number } => {
  const now = Date.now();
  const maxOfflineMs = BALANCE.maxOfflineHours * 60 * 60 * 1000;
  const timeAway = Math.min(now - lastTickTime, maxOfflineMs);
  const effects = resolveGameEffects(gridUpgrade, state);

  // Assume no disasters while offline, all machines functional except disabled machines.
  const rate = machines.reduce((total, machine) => total + getMachineRateWithResolvedEffects(machine, effects), 0);
  
  const earnings = (rate * timeAway * effects.offlineEfficiency) / 1000;
  return { earnings: Math.floor(earnings), timeAway };
};

// Check if two machines can merge (no level cap!)
export const canMerge = (machineA: Machine, machineB: Machine): boolean => {
  if (machineA.id === machineB.id) return false;
  if (machineA.level !== machineB.level) return false;
  // No max level cap - can always merge same-level machines
  if (machineA.disabled || machineB.disabled) return false;
  return true;
};

// Get merged machine level (no cap - always level + 1)
export const getMergedLevel = (level: number): number => {
  return level + 1;
};

// Calculate repair cost for a machine (uses procedural value)
export const getRepairCost = (level: number): number => {
  return getRepairCostFromLevel(level);
};

// Get scrap refund for a machine (uses procedural value)
export const getScrapRefund = (level: number): number => {
  return getScrapRefundFromBalance(level);
};

// Check if player can afford a new machine
export const canBuyMachine = (currency: number): boolean => 
  currency >= BALANCE.baseMachineCost;

// Find empty slot in grid
export const findEmptySlot = (machines: Machine[]): number | null => {
  const occupied = new Set(machines.map(m => m.slotIndex));
  for (let i = 0; i < BALANCE.gridSize; i++) {
    if (!occupied.has(i)) return i;
  }
  return null;
};

// Format currency for display (with K/M/B support)
export const formatCurrency = (amount: number): string => {
  const absAmount = Math.abs(amount);
  if (absAmount >= 1e12) return `$${(amount / 1e12).toFixed(1)}T`;
  if (absAmount >= 1e9) return `$${(amount / 1e9).toFixed(1)}B`;
  if (absAmount >= 1e6) return `$${(amount / 1e6).toFixed(1)}M`;
  if (absAmount >= 1e3) return `$${(amount / 1e3).toFixed(1)}K`;
  return `$${Math.floor(amount).toLocaleString()}`;
};

// Format time duration
export const formatTime = (ms: number): string => {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
};

// Random number in range
export const randomInRange = (min: number, max: number): number =>
  Math.floor(Math.random() * (max - min + 1)) + min;

// Rarity display info
export const getRarityColor = (rarity: Rarity): string => {
  const colors: Record<Rarity, string> = {
    common: 'bg-gray-500',
    uncommon: 'bg-green-500',
    rare: 'bg-blue-500',
    epic: 'bg-purple-500',
  };
  return colors[rarity];
};

export const getRarityName = (rarity: Rarity): string => {
  return rarity.charAt(0).toUpperCase() + rarity.slice(1);
};
