// === CENTRALIZED GAME BALANCE CONFIG ===
// All tuning constants in one place. Modify these to adjust game progression.

export const BALANCE = {
  // === MACHINE PRODUCTION ===
  // Production formula: baseProductionPerSecond * (productionGrowth ^ (level - 1))
  baseProductionPerSecond: 1,    // Lv1 produces $1/s
  productionGrowth: 2.5,         // Each level is 2.5x the previous

  // === MACHINE COSTS & VALUE ===
  // Value formula: baseMachineCost * (valueGrowth ^ (level - 1))
  baseMachineCost: 10,           // Cost to buy Lv1 machine
  valueGrowth: 2.5,              // Each level is worth 2.5x the previous
  scrapRefundMultiplier: 0.5,    // Scrap returns 50% of value
  repairCostMultiplier: 0.5,     // Repair costs 50% of value

  // === GRID ===
  gridSize: 9,                   // 3x3 grid

  // === TIMING (milliseconds) ===
  tickIntervalMs: 1000,          // Game tick every 1s
  autoSaveIntervalMs: 10000,     // Autosave every 10s
  disasterCheckIntervalMs: 30000, // Check for disaster every 30s

  // === DISASTERS ===
  disasterChance: 0.15,          // 15% chance per check
  powerOutageDurationMin: 10000, // Min 10s
  powerOutageDurationMax: 30000, // Max 30s

  // === OFFLINE ===
  offlineEfficiency: 0.5,        // 50% efficiency while away
  maxOfflineHours: 8,            // Cap offline time at 8 hours

  // === ROW MODULES ===
  rowModuleCosts: {
    common: 100,
    uncommon: 500,
    rare: 2000,
    epic: 10000,
  } as Record<string, number>,
  rerollBaseCost: 50,            // Base cost for rerolling bonuses
} as const;

// === HELPER FUNCTIONS ===

/**
 * Calculate production rate for a machine of given level
 * Formula: baseProductionPerSecond * (productionGrowth ^ (level - 1))
 */
export const getProductionRate = (level: number): number => {
  return BALANCE.baseProductionPerSecond * Math.pow(BALANCE.productionGrowth, level - 1);
};

/**
 * Calculate value of a machine at given level (used for scrap/repair)
 * Formula: baseMachineCost * (valueGrowth ^ (level - 1))
 */
export const getMachineValue = (level: number): number => {
  return BALANCE.baseMachineCost * Math.pow(BALANCE.valueGrowth, level - 1);
};

/**
 * Calculate scrap refund for a machine
 */
export const getScrapRefund = (level: number): number => {
  return Math.floor(getMachineValue(level) * BALANCE.scrapRefundMultiplier);
};

/**
 * Calculate repair cost for a machine
 */
export const getRepairCostFromLevel = (level: number): number => {
  return Math.floor(getMachineValue(level) * BALANCE.repairCostMultiplier);
};

/**
 * Format large numbers with K/M/B suffixes
 */
export const formatLargeNumber = (num: number): string => {
  const absNum = Math.abs(num);
  if (absNum >= 1e12) return (num / 1e12).toFixed(1) + 'T';
  if (absNum >= 1e9) return (num / 1e9).toFixed(1) + 'B';
  if (absNum >= 1e6) return (num / 1e6).toFixed(1) + 'M';
  if (absNum >= 1e3) return (num / 1e3).toFixed(1) + 'K';
  return num.toFixed(1);
};

/**
 * Format currency with large number support
 */
export const formatCurrencyLarge = (amount: number): string => {
  const absAmount = Math.abs(amount);
  if (absAmount >= 1000) {
    return '$' + formatLargeNumber(Math.floor(amount));
  }
  return `$${Math.floor(amount).toLocaleString()}`;
};

/**
 * Format production rate with large number support
 */
export const formatRate = (rate: number): string => {
  if (rate >= 1000) {
    return formatLargeNumber(rate) + '/s';
  }
  return rate.toFixed(1) + '/s';
};
