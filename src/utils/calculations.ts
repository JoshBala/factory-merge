// === GAME CALCULATIONS ===
import { 
  Machine, GAME_CONFIG, 
  RowModule, Rarity, BonusType, RowBonus,
  BONUS_RANGES, RARITY_BONUS_COUNT 
} from '@/types/game';
import { 
  BALANCE, 
  getProductionRate, 
  getScrapRefund as getScrapRefundFromBalance,
  getRepairCostFromLevel 
} from '@/config/balance';

// Generate unique ID for machines
export const generateId = (): string => 
  `m_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

// === ROW MODULE HELPERS ===

// All 8 bonus types for random selection
const ALL_BONUS_TYPES: BonusType[] = [
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
export const getBonusDisplayName = (type: BonusType): string => {
  const names: Record<BonusType, string> = {
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
export const calculateBonusValue = (bonus: RowBonus, rarity: Rarity): number => {
  const [min, max] = BONUS_RANGES[bonus.type][rarity];
  return min + bonus.roll * (max - min);
};

// Get row index for a slot (0-2 = row 0, 3-5 = row 1, 6-8 = row 2)
export const getRowForSlot = (slotIndex: number): 0 | 1 | 2 => {
  return Math.floor(slotIndex / 3) as 0 | 1 | 2;
};

// Get next rarity in progression
export const getNextRarity = (rarity: Rarity): Rarity | null => {
  const progression: Rarity[] = ['common', 'uncommon', 'rare', 'epic'];
  const idx = progression.indexOf(rarity);
  return idx < progression.length - 1 ? progression[idx + 1] : null;
};

// Get upgrade cost for a row (to next rarity)
export const getRowUpgradeCost = (rowModule: RowModule | undefined): number => {
  if (!rowModule) {
    return GAME_CONFIG.rowModuleCosts.common;
  }
  const nextRarity = getNextRarity(rowModule.rarity);
  return nextRarity ? GAME_CONFIG.rowModuleCosts[nextRarity] : 0;
};

// Get reroll cost for a row
export const getRerollCost = (rowIndex: 0 | 1 | 2): number => {
  return GAME_CONFIG.rerollBaseCost * (rowIndex + 1);
};

// Generate a random bonus (avoids existing types)
export const generateRandomBonus = (existingTypes: BonusType[]): RowBonus => {
  const available = ALL_BONUS_TYPES.filter(t => !existingTypes.includes(t));
  const type = available.length > 0 
    ? available[Math.floor(Math.random() * available.length)]
    : ALL_BONUS_TYPES[Math.floor(Math.random() * ALL_BONUS_TYPES.length)];
  return { type, roll: Math.random() };
};

// Create initial row module (common with 1 bonus)
export const createRowModule = (rowIndex: 0 | 1 | 2): RowModule => ({
  rowIndex,
  rarity: 'common',
  bonuses: [generateRandomBonus([])],
});

// Upgrade row module to next rarity (keeps bonuses, adds new ones)
export const upgradeRowModule = (module: RowModule): RowModule | null => {
  const nextRarity = getNextRarity(module.rarity);
  if (!nextRarity) return null;
  
  const currentCount = module.bonuses.length;
  const targetCount = RARITY_BONUS_COUNT[nextRarity];
  
  const newBonuses = [...module.bonuses];
  for (let i = currentCount; i < targetCount; i++) {
    newBonuses.push(generateRandomBonus(newBonuses.map(b => b.type)));
  }
  
  return {
    ...module,
    rarity: nextRarity,
    bonuses: newBonuses,
  };
};

// Reroll a specific bonus (keeps same type, new roll)
export const rerollBonus = (module: RowModule, bonusIndex: number): RowModule => ({
  ...module,
  bonuses: module.bonuses.map((b, i) => 
    i === bonusIndex ? { ...b, roll: Math.random() } : b
  ),
});

// Calculate total production bonus for machines in a specific row
export const getRowProductionBonus = (
  rowModules: RowModule[],
  rowIndex: number
): number => {
  const module = rowModules.find(m => m.rowIndex === rowIndex);
  if (!module) return 0;
  
  let totalBonus = 0;
  for (const bonus of module.bonuses) {
    if (bonus.type === 'productionPercent') {
      totalBonus += calculateBonusValue(bonus, module.rarity);
    }
  }
  return totalBonus / 100; // Convert percentage to multiplier
};

// Calculate disaster duration reduction for a specific row
export const getDisasterDurationReduction = (
  rowModules: RowModule[],
  rowIndex: number
): number => {
  const module = rowModules.find(m => m.rowIndex === rowIndex);
  if (!module) return 0;
  
  let totalReduction = 0;
  for (const bonus of module.bonuses) {
    if (bonus.type === 'disasterDurationReduction') {
      totalReduction += calculateBonusValue(bonus, module.rarity);
    }
  }
  return totalReduction / 100; // Convert percentage to multiplier
};

// === PRODUCTION CALCULATIONS ===

/**
 * Calculate total production rate with row bonuses (single source of truth)
 * Uses procedural formula: baseProductionPerSecond * (productionGrowth ^ (level - 1))
 */
export const calculateProductionRate = (
  machines: Machine[],
  isPowerOutage: boolean,
  rowModules: RowModule[] = []
): number => {
  if (isPowerOutage) return 0;
  
  return machines.reduce((total, machine) => {
    if (machine.disabled) return total;
    // Use procedural production rate from balance config
    const baseRate = getProductionRate(machine.level);
    const rowIndex = getRowForSlot(machine.slotIndex);
    const bonus = getRowProductionBonus(rowModules, rowIndex);
    return total + baseRate * (1 + bonus);
  }, 0);
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
  rowModules: RowModule[] = []
): number => {
  const rate = calculateProductionRate(machines, isPowerOutage, rowModules);
  return (rate * deltaMs) / 1000; // Convert ms to seconds
};

// Calculate offline earnings with efficiency penalty
export const calculateOfflineEarnings = (
  machines: Machine[],
  lastTickTime: number
): { earnings: number; timeAway: number } => {
  const now = Date.now();
  const maxOfflineMs = BALANCE.maxOfflineHours * 60 * 60 * 1000;
  const timeAway = Math.min(now - lastTickTime, maxOfflineMs);
  
  // Assume no disasters while offline, all machines functional
  const activeMachines = machines.filter(m => !m.disabled);
  const rate = activeMachines.reduce(
    (total, m) => total + getProductionRate(m.level),
    0
  );
  
  const earnings = (rate * timeAway * BALANCE.offlineEfficiency) / 1000;
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
