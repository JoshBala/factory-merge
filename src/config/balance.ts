// === CENTRALIZED GAME BALANCE CONFIG ===
// All tuning constants in one place. Modify these to adjust game progression.

// === BASELINE ("RAW") VALUES ===
// Keep raw design targets as standalone constants so upgrade-aware calculations
// can reliably reference a single baseline source of truth.
export const BASE_PRODUCTION_PER_SECOND = 1;
export const BASE_PRODUCTION_GROWTH = 2.5;
export const BASE_MACHINE_COST = 10;
export const BASE_MACHINE_VALUE_GROWTH = 2.5;
export const BASE_TICK_INTERVAL_MS = 1000;
export const BASE_AUTO_SAVE_INTERVAL_MS = 10000;
export const BASE_DISASTER_CHECK_INTERVAL_MS = 30000;
export const GRID_COLUMNS = 3;
export const GRID_ROWS = 3;
export const GRID_SIZE = GRID_COLUMNS * GRID_ROWS;

export const BALANCE = {
  // === MACHINE PRODUCTION ===
  // Production formula: baseProductionPerSecond * (productionGrowth ^ (level - 1))
  baseProductionPerSecond: BASE_PRODUCTION_PER_SECOND, // Lv1 produces $1/s
  productionGrowth: BASE_PRODUCTION_GROWTH,            // Each level is 2.5x the previous

  // === MACHINE COSTS & VALUE ===
  // Value formula: baseMachineCost * (valueGrowth ^ (level - 1))
  baseMachineCost: BASE_MACHINE_COST,    // Cost to buy Lv1 machine
  valueGrowth: BASE_MACHINE_VALUE_GROWTH, // Each level is worth 2.5x the previous
  scrapRefundMultiplier: 0.5,    // Scrap returns 50% of value
  repairCostMultiplier: 0.5,     // Repair costs 50% of value

  // === GRID ===
  // NOTE: The current game design intentionally assumes a fixed 3x3 playfield:
  // - Row modules are strongly typed to row indexes 0 | 1 | 2.
  // - Row upgrade/unlock formulas and UI labels are authored for exactly 3 rows.
  // If you change rows/columns, update row-related types/formulas/components first.
  gridColumns: GRID_COLUMNS,
  gridRows: GRID_ROWS,
  gridSize: GRID_SIZE,

  // === TIMING (milliseconds) ===
  tickIntervalMs: BASE_TICK_INTERVAL_MS,             // Game tick every 1s
  autoSaveIntervalMs: BASE_AUTO_SAVE_INTERVAL_MS,    // Autosave every 10s
  disasterCheckIntervalMs: BASE_DISASTER_CHECK_INTERVAL_MS, // Check for disaster every 30s

  // === DISASTERS ===
  disasterChance: 0.15,          // 15% chance per check
  powerOutageDurationMin: 10000, // Min 10s
  powerOutageDurationMax: 30000, // Max 30s

  // === OFFLINE ===
  offlineEfficiency: 0.5,        // 50% efficiency while away
  maxOfflineHours: 8,            // Cap offline time at 8 hours

  // === ROW MODULES ===
  // Rebalance note (single-grid economy):
  // - Legacy design had 3 independent row tracks; a single active grid module needs steeper
  //   progression to preserve pacing and prevent underpriced rarity rushes.
  // - Target deltas vs prior curve: common +200%, uncommon +200%, rare +200%, epic +200%.
  rowModuleCosts: {
    common: 300,
    uncommon: 1500,
    rare: 6000,
    epic: 30000,
  } as Record<string, number>,
  // Rebalance note (single-grid reroll): base raised to offset loss of row-index 1x/2x/3x curve.
  // Target delta vs old row-0 baseline: +100% base before rarity scaling.
  rerollBaseCost: 100,
} as const;

// Guardrail: keep runtime config coherent for all row-based formulas.
if (BALANCE.gridColumns * BALANCE.gridRows !== BALANCE.gridSize) {
  throw new Error(
    `Invalid BALANCE grid config: gridColumns (${BALANCE.gridColumns}) * gridRows (${BALANCE.gridRows}) must equal gridSize (${BALANCE.gridSize}).`
  );
}

if (BALANCE.gridRows !== 3 || BALANCE.gridColumns !== 3) {
  throw new Error(
    `Unsupported grid dimensions ${BALANCE.gridColumns}x${BALANCE.gridRows}. Current row-module and unlock formulas are intentionally fixed to 3x3.`
  );
}

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
