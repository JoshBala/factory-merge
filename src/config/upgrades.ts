export type UpgradeCategory =
  | 'automation'
  | 'production'
  | 'speed'
  | 'synergy'
  | 'merge'
  | 'offline'
  | 'disaster'
  | 'compounding';

export interface UpgradeEffects {
  automationSpeedPercent?: number;
  productionPercent?: number;
  productionMultiplier?: number;
  mergeBonusPercent?: number;
  rowSynergyPercent?: number;
  crossRowPercent?: number;
  offlineEarningsPercent?: number;
  offlineStorageHours?: number;
  disasterChanceReductionPercent?: number;
  disasterDurationReductionPercent?: number;
  disasterMitigationPercent?: number;
  compoundingGrowthPercent?: number;
  machineCostReductionPercent?: number;
}

export interface UpgradeDefinition {
  id: string;
  tier: number;
  category: UpgradeCategory;
  name: string;
  description: string;
  maxLevel: number;
  baseCostCurrency: number;
  costMultiplier: number;
  effects: UpgradeEffects;
  requiresUpgrades?: string[];
  requiresTier?: number;
  requiresCurrencyLifetime?: number;
  requiresMergesLifetime?: number;
  requiresHighestMachineLevel?: number;
  requiresRowModules?: number;
}

const TIER_MIN = 1;
const TIER_MAX = 15;

const phaseForTier = (tier: number): 'early' | 'mid' | 'late' => {
  if (tier <= 5) return 'early';
  if (tier <= 10) return 'mid';
  return 'late';
};

const makeTierUpgrades = (tier: number): UpgradeDefinition[] => {
  const phase = phaseForTier(tier);
  const tierBaseCost = Math.round(45 * Math.pow(1.72, tier - 1));
  const lifetimeCurrencyGate = Math.round(250 * Math.pow(1.82, tier - 1));
  const mergeGate = Math.max(0, Math.round(6 * Math.pow(1.45, tier - 1)));
  const previousTierCapstone = tier > 1 ? `u_t${tier - 1}_stability_web` : undefined;

  const automationScale = phase === 'early' ? 2 : phase === 'mid' ? 4 : 7;
  const productionScale = phase === 'early' ? 3 : phase === 'mid' ? 6 : 11;
  const synergyScale = phase === 'early' ? 2 : phase === 'mid' ? 7 : 13;
  const mergeScale = phase === 'early' ? 4 : phase === 'mid' ? 10 : 18;
  const offlineScale = phase === 'early' ? 3 : phase === 'mid' ? 8 : 15;

  return [
    {
      id: `u_t${tier}_auto_grid`,
      tier,
      category: 'automation',
      name: `Auto Grid T${tier}`,
      description: 'Unlocks stronger baseline automation cadence for all rows.',
      maxLevel: 5,
      baseCostCurrency: tierBaseCost,
      costMultiplier: 1.38,
      effects: {
        automationSpeedPercent: automationScale,
      },
      requiresTier: Math.max(1, tier - 1),
      requiresCurrencyLifetime: Math.round(lifetimeCurrencyGate * 0.7),
      requiresUpgrades: previousTierCapstone ? [previousTierCapstone] : undefined,
    },
    {
      id: `u_t${tier}_output_tuning`,
      tier,
      category: 'production',
      name: `Output Tuning T${tier}`,
      description: 'Improves factory throughput with direct production gains.',
      maxLevel: 8,
      baseCostCurrency: Math.round(tierBaseCost * 1.2),
      costMultiplier: 1.45,
      effects: {
        productionPercent: productionScale,
        productionMultiplier: phase === 'late' ? 0.01 : undefined,
      },
      requiresTier: tier,
      requiresCurrencyLifetime: lifetimeCurrencyGate,
      requiresUpgrades: [`u_t${tier}_auto_grid`],
    },
    {
      id: `u_t${tier}_line_accelerant`,
      tier,
      category: 'speed',
      name: `Line Accelerant T${tier}`,
      description: 'Adds extra tick speed and gentle compounding momentum.',
      maxLevel: 6,
      baseCostCurrency: Math.round(tierBaseCost * 1.45),
      costMultiplier: 1.48,
      effects: {
        automationSpeedPercent: Math.round(automationScale * 0.8),
        compoundingGrowthPercent: phase === 'late' ? 0.4 : phase === 'mid' ? 0.15 : undefined,
      },
      requiresTier: tier,
      requiresCurrencyLifetime: Math.round(lifetimeCurrencyGate * 1.15),
      requiresUpgrades: [`u_t${tier}_output_tuning`],
    },
    {
      id: `u_t${tier}_row_lattice`,
      tier,
      category: phase === 'late' ? 'compounding' : 'synergy',
      name: `Row Lattice T${tier}`,
      description: 'Builds row-level synergy; late tiers add cross-row scaling.',
      maxLevel: 5,
      baseCostCurrency: Math.round(tierBaseCost * 1.75),
      costMultiplier: 1.52,
      effects: {
        rowSynergyPercent: synergyScale,
        crossRowPercent: phase === 'late' ? Math.round(synergyScale * 0.65) : phase === 'mid' ? 2 : undefined,
      },
      requiresTier: tier,
      requiresCurrencyLifetime: Math.round(lifetimeCurrencyGate * 1.35),
      requiresHighestMachineLevel: tier + 2,
      requiresUpgrades: [`u_t${tier}_line_accelerant`],
    },
    {
      id: `u_t${tier}_merge_forge`,
      tier,
      category: 'merge',
      name: `Merge Forge T${tier}`,
      description: 'Boosts merge outcomes and post-merge production value.',
      maxLevel: 7,
      baseCostCurrency: Math.round(tierBaseCost * 2.05),
      costMultiplier: 1.56,
      effects: {
        mergeBonusPercent: mergeScale,
        productionPercent: Math.round(productionScale * 0.5),
      },
      requiresTier: tier,
      requiresCurrencyLifetime: Math.round(lifetimeCurrencyGate * 1.55),
      requiresMergesLifetime: mergeGate,
      requiresUpgrades: [`u_t${tier}_output_tuning`, `u_t${tier}_row_lattice`],
    },
    {
      id: `u_t${tier}_stability_web`,
      tier,
      category: phase === 'early' ? 'offline' : phase === 'mid' ? 'disaster' : 'compounding',
      name: `Stability Web T${tier}`,
      description: 'Packages offline gains with disaster control to smooth progression.',
      maxLevel: 5,
      baseCostCurrency: Math.round(tierBaseCost * 2.4),
      costMultiplier: 1.62,
      effects: {
        offlineEarningsPercent: offlineScale,
        offlineStorageHours: phase === 'late' ? 1.5 : phase === 'mid' ? 1 : 0.5,
        disasterChanceReductionPercent: phase === 'early' ? 1 : phase === 'mid' ? 3 : 6,
        disasterDurationReductionPercent: phase === 'early' ? 2 : phase === 'mid' ? 5 : 9,
        disasterMitigationPercent: phase === 'late' ? 10 : phase === 'mid' ? 4 : undefined,
        machineCostReductionPercent: phase === 'late' ? 1 : undefined,
      },
      requiresTier: tier,
      requiresCurrencyLifetime: Math.round(lifetimeCurrencyGate * 1.9),
      requiresMergesLifetime: Math.round(mergeGate * 1.2),
      requiresRowModules: phase === 'early' ? undefined : phase === 'mid' ? 1 : 2,
      requiresUpgrades: [`u_t${tier}_row_lattice`, `u_t${tier}_merge_forge`],
    },
  ];
};

export const UPGRADE_DEFINITIONS: UpgradeDefinition[] = Array.from(
  { length: TIER_MAX - TIER_MIN + 1 },
  (_, index) => makeTierUpgrades(TIER_MIN + index)
).flat();

export const UPGRADE_BY_ID: Record<string, UpgradeDefinition> = Object.fromEntries(
  UPGRADE_DEFINITIONS.map((upgrade) => [upgrade.id, upgrade])
);

export const UPGRADES_BY_TIER: Record<number, UpgradeDefinition[]> = UPGRADE_DEFINITIONS.reduce(
  (acc, upgrade) => {
    if (!acc[upgrade.tier]) acc[upgrade.tier] = [];
    acc[upgrade.tier].push(upgrade);
    return acc;
  },
  {} as Record<number, UpgradeDefinition[]>
);

export const UPGRADES_BY_CATEGORY: Record<UpgradeCategory, UpgradeDefinition[]> =
  UPGRADE_DEFINITIONS.reduce(
    (acc, upgrade) => {
      acc[upgrade.category].push(upgrade);
      return acc;
    },
    {
      automation: [],
      production: [],
      speed: [],
      synergy: [],
      merge: [],
      offline: [],
      disaster: [],
      compounding: [],
    } as Record<UpgradeCategory, UpgradeDefinition[]>
  );
