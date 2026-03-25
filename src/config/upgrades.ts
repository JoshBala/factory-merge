import { BALANCE } from './balance';

export type UpgradeCategory =
  | 'automation'
  | 'speed'
  | 'production'
  | 'base_generation'
  | 'efficiency'
  | 'synergy'
  | 'compounding'
  | 'quality_of_life';

export type UpgradeId = string;

export type CostGrowth =
  | { kind: 'exponential'; factor: number }
  | { kind: 'polynomial'; power: number; scale: number };

export type UpgradeEffect =
  | { type: 'automation_tick_rate'; percentPerLevel: number }
  | { type: 'base_generation_flat'; amountPerLevel: number }
  | { type: 'base_generation_percent'; percentPerLevel: number }
  | { type: 'throughput_percent'; percentPerLevel: number }
  | { type: 'merge_quality_percent'; percentPerLevel: number }
  | { type: 'offline_storage_hours'; hoursPerLevel: number }
  | { type: 'cost_reduction_percent'; target: 'machine' | 'upgrade'; percentPerLevel: number }
  | { type: 'machine_level_bonus'; machineId: string; levelBonusPerLevel: number }
  | { type: 'synergy_per_owned_machine'; percentPerMachine: number }
  | { type: 'tier_multiplier'; targetTier: number; multiplierPerLevel: number }
  | { type: 'prestige_compounding'; percentPerReset: number };

export interface UnlockRequirements {
  requiresUpgrades?: UpgradeId[];
  requiresTierComplete?: number;
  requiresCurrencyTotal?: number;
  requiresMachineLevel?: number;
  requiresOwnedMachines?: number;
}

export interface UpgradeDefinition {
  id: UpgradeId;
  name: string;
  description: string;
  category: UpgradeCategory;
  tier: number;
  maxLevel: number;
  baseCost: number;
  costGrowth: CostGrowth;
  effects: UpgradeEffect[];
  unlockRequirements: UnlockRequirements;
}

const TIER_MIN = 1;
const TIER_MAX = 15;
const UPGRADES_PER_TIER = 8;
const MIN_OWNED_MACHINE_REQUIREMENT = 2;
const MAX_OWNED_MACHINE_REQUIREMENT = BALANCE.gridSize;
const LINE_BALANCER_OWNED_MACHINE_START = MIN_OWNED_MACHINE_REQUIREMENT;
const LINE_BALANCER_OWNED_MACHINE_END = Math.max(
  MIN_OWNED_MACHINE_REQUIREMENT,
  MAX_OWNED_MACHINE_REQUIREMENT - 1
);
const MESH_NETWORK_OWNED_MACHINE_START = Math.min(
  MAX_OWNED_MACHINE_REQUIREMENT,
  MIN_OWNED_MACHINE_REQUIREMENT + 1
);

const scaleOwnedMachineRequirementByTier = (
  tier: number,
  tierOneValue: number,
  tierMaxValue: number
): number => {
  const clampedTier = Math.min(TIER_MAX, Math.max(TIER_MIN, tier));
  const tierProgress = (clampedTier - TIER_MIN) / (TIER_MAX - TIER_MIN);
  const scaledValue = tierOneValue + tierProgress * (tierMaxValue - tierOneValue);

  return Math.min(
    MAX_OWNED_MACHINE_REQUIREMENT,
    Math.max(MIN_OWNED_MACHINE_REQUIREMENT, Math.round(scaledValue))
  );
};

const CATEGORY_ROTATION: UpgradeCategory[] = [
  'automation',
  'base_generation',
  'production',
  'speed',
  'efficiency',
  'synergy',
  'compounding',
  'quality_of_life',
];

const UPGRADE_BLUEPRINTS: Array<{
  key: string;
  name: string;
  category: UpgradeCategory;
  maxLevel: number;
  effectBuilder: (tier: number, phase: 'early' | 'mid' | 'late') => UpgradeEffect[];
  descriptionBuilder: (tier: number, phase: 'early' | 'mid' | 'late') => string;
  unlockBuilder: (tier: number) => UnlockRequirements;
}> = [
  {
    key: 'auto_bootstrap',
    name: 'Auto Bootstrap',
    category: 'automation',
    maxLevel: 5,
    effectBuilder: (tier, phase) => [
      { type: 'automation_tick_rate', percentPerLevel: phase === 'early' ? 3 + tier : 6 + tier },
    ],
    descriptionBuilder: (tier) => `Unlock baseline automation loops for Tier ${tier}.`,
    unlockBuilder: (tier) => ({
      requiresTierComplete: Math.max(0, tier - 1),
      requiresCurrencyTotal: Math.round(100 * Math.pow(1.65, tier - 1)),
    }),
  },
  {
    key: 'core_output',
    name: 'Core Output Routing',
    category: 'base_generation',
    maxLevel: 6,
    effectBuilder: (tier, phase) => [
      { type: 'base_generation_flat', amountPerLevel: Math.round((phase === 'early' ? 2.5 : 4.5) * tier) },
      { type: 'base_generation_percent', percentPerLevel: phase === 'early' ? 2 : 3 },
    ],
    descriptionBuilder: (tier) => `Increase base generation throughput in Tier ${tier}.`,
    unlockBuilder: (tier) => ({
      requiresUpgrades: tier === 1 ? ['u_t1_auto_bootstrap'] : [`u_t${tier}_auto_bootstrap`],
      requiresCurrencyTotal: Math.round(160 * Math.pow(1.68, tier - 1)),
    }),
  },
  {
    key: 'line_balancer',
    name: 'Line Balancer',
    category: 'production',
    maxLevel: 8,
    effectBuilder: (tier, phase) => [
      { type: 'throughput_percent', percentPerLevel: phase === 'early' ? 3 : phase === 'mid' ? 5 : 8 },
    ],
    descriptionBuilder: (tier) => `Smooth line bottlenecks for stronger Tier ${tier} production.`,
    unlockBuilder: (tier) => ({
      requiresUpgrades: [`u_t${tier}_core_output`],
      requiresCurrencyTotal: Math.round(210 * Math.pow(1.7, tier - 1)),
      requiresOwnedMachines: scaleOwnedMachineRequirementByTier(
        tier,
        LINE_BALANCER_OWNED_MACHINE_START,
        LINE_BALANCER_OWNED_MACHINE_END
      ),
    }),
  },
  {
    key: 'servo_overclock',
    name: 'Servo Overclock',
    category: 'speed',
    maxLevel: 5,
    effectBuilder: (tier, phase) => [
      { type: 'automation_tick_rate', percentPerLevel: phase === 'early' ? 2 : phase === 'mid' ? 4 : 7 },
      { type: 'throughput_percent', percentPerLevel: phase === 'late' ? 2 : 1 },
    ],
    descriptionBuilder: (tier) => `Scale cycle speed without losing Tier ${tier} stability.`,
    unlockBuilder: (tier) => ({
      requiresUpgrades: [`u_t${tier}_line_balancer`],
      requiresCurrencyTotal: Math.round(270 * Math.pow(1.72, tier - 1)),
      requiresMachineLevel: tier + 1,
    }),
  },
  {
    key: 'lean_supply',
    name: 'Lean Supply Chains',
    category: 'efficiency',
    maxLevel: 7,
    effectBuilder: (tier, phase) => [
      {
        type: 'cost_reduction_percent',
        target: 'machine',
        percentPerLevel: phase === 'early' ? 0.8 : phase === 'mid' ? 1.2 : 1.8,
      },
      {
        type: 'cost_reduction_percent',
        target: 'upgrade',
        percentPerLevel: phase === 'early' ? 0.4 : phase === 'mid' ? 0.8 : 1.2,
      },
    ],
    descriptionBuilder: (tier) => `Lower spend pressure and sustain Tier ${tier} scaling.`,
    unlockBuilder: (tier) => ({
      requiresUpgrades: [`u_t${tier}_servo_overclock`],
      requiresCurrencyTotal: Math.round(350 * Math.pow(1.75, tier - 1)),
    }),
  },
  {
    key: 'mesh_network',
    name: 'Mesh Network',
    category: 'synergy',
    maxLevel: 6,
    effectBuilder: (tier, phase) => [
      {
        type: 'synergy_per_owned_machine',
        percentPerMachine: phase === 'early' ? 0.03 * tier : phase === 'mid' ? 0.05 * tier : 0.08 * tier,
      },
      { type: 'merge_quality_percent', percentPerLevel: phase === 'late' ? 2 : 1 },
    ],
    descriptionBuilder: (tier, phase) =>
      phase === 'late'
        ? `Enable cross-system compounding links for Tier ${tier}.`
        : `Introduce machine-to-machine synergy for Tier ${tier}.`,
    unlockBuilder: (tier) => ({
      requiresUpgrades: [`u_t${tier}_lean_supply`],
      requiresCurrencyTotal: Math.round(430 * Math.pow(1.79, tier - 1)),
      requiresOwnedMachines: scaleOwnedMachineRequirementByTier(
        tier,
        MESH_NETWORK_OWNED_MACHINE_START,
        MAX_OWNED_MACHINE_REQUIREMENT
      ),
    }),
  },
  {
    key: 'compound_matrix',
    name: 'Compound Matrix',
    category: 'compounding',
    maxLevel: 5,
    effectBuilder: (tier, phase) => [
      { type: 'tier_multiplier', targetTier: Math.max(1, tier - 1), multiplierPerLevel: phase === 'late' ? 0.03 : 0.015 },
      ...(phase === 'late' ? [{ type: 'prestige_compounding', percentPerReset: 0.8 }] : []),
    ],
    descriptionBuilder: (tier, phase) =>
      phase === 'late'
        ? `Unlock recursive multipliers and reset compounding at Tier ${tier}.`
        : `Add mild carry-forward multipliers for Tier ${tier}.`,
    unlockBuilder: (tier) => ({
      requiresUpgrades: [`u_t${tier}_mesh_network`],
      requiresTierComplete: Math.max(1, tier - 1),
      requiresCurrencyTotal: Math.round(550 * Math.pow(1.83, tier - 1)),
      requiresMachineLevel: tier + 2,
    }),
  },
  {
    key: 'command_uplink',
    name: 'Command Uplink',
    category: 'quality_of_life',
    maxLevel: 4,
    effectBuilder: (tier) => [
      { type: 'offline_storage_hours', hoursPerLevel: tier >= 10 ? 2 : 1 },
      { type: 'merge_quality_percent', percentPerLevel: tier >= 10 ? 1.5 : 1 },
    ],
    descriptionBuilder: (tier) => `Expose a concise Tier ${tier} control layer for better pacing.`,
    unlockBuilder: (tier) => ({
      requiresUpgrades: [`u_t${tier}_compound_matrix`],
      requiresCurrencyTotal: Math.round(680 * Math.pow(1.87, tier - 1)),
      requiresTierComplete: Math.max(0, tier - 1),
    }),
  },
];

const phaseForTier = (tier: number): 'early' | 'mid' | 'late' => {
  if (tier <= 5) return 'early';
  if (tier <= 10) return 'mid';
  return 'late';
};

const buildCostGrowth = (tier: number, slot: number): CostGrowth => {
  if ((tier + slot) % 3 === 0) {
    return {
      kind: 'polynomial',
      power: 1.28 + tier * 0.025,
      scale: 1.05 + slot * 0.06,
    };
  }

  return {
    kind: 'exponential',
    factor: 1.22 + tier * 0.011 + slot * 0.018,
  };
};

const makeTierUpgrades = (tier: number): UpgradeDefinition[] => {
  const phase = phaseForTier(tier);
  const tierBase = Math.round(95 * Math.pow(1.62, tier - 1));

  return UPGRADE_BLUEPRINTS.slice(0, UPGRADES_PER_TIER).map((blueprint, slot) => ({
    id: `u_t${tier}_${blueprint.key}`,
    name: `${blueprint.name} T${tier}`,
    description: blueprint.descriptionBuilder(tier, phase),
    category: blueprint.category ?? CATEGORY_ROTATION[slot % CATEGORY_ROTATION.length],
    tier,
    maxLevel: blueprint.maxLevel,
    baseCost: Math.round(tierBase * (1 + slot * 0.34)),
    costGrowth: buildCostGrowth(tier, slot),
    effects: blueprint.effectBuilder(tier, phase),
    unlockRequirements: blueprint.unlockBuilder(tier),
  }));
};

const validateTierUpgradePaths = (upgrades: UpgradeDefinition[]): void => {
  const tiers = Array.from(new Set(upgrades.map((upgrade) => upgrade.tier))).sort((a, b) => a - b);
  const impossibleNodes: string[] = [];

  for (const tier of tiers) {
    const tierUpgrades = upgrades.filter((upgrade) => upgrade.tier === tier);
    const ownedUpgrades = new Set<UpgradeId>();
    let progressed = true;

    while (progressed && ownedUpgrades.size < tierUpgrades.length) {
      progressed = false;

      for (const upgrade of tierUpgrades) {
        if (ownedUpgrades.has(upgrade.id)) {
          continue;
        }

        const requirements = upgrade.unlockRequirements;
        const canSatisfyTierGate = (requirements.requiresTierComplete ?? 0) <= tier - 1;
        const canSatisfyOwnedMachines = (requirements.requiresOwnedMachines ?? 0) <= MAX_OWNED_MACHINE_REQUIREMENT;
        const canSatisfyDependencies = (requirements.requiresUpgrades ?? []).every((upgradeId) => {
          const dependencyTier = UPGRADE_BY_ID[upgradeId]?.tier ?? 0;
          if (dependencyTier > 0 && dependencyTier < tier) {
            return true;
          }
          return ownedUpgrades.has(upgradeId);
        });

        if (canSatisfyTierGate && canSatisfyOwnedMachines && canSatisfyDependencies) {
          ownedUpgrades.add(upgrade.id);
          progressed = true;
        }
      }
    }

    for (const upgrade of tierUpgrades) {
      if (!ownedUpgrades.has(upgrade.id)) {
        impossibleNodes.push(upgrade.id);
      }
    }

    if (ownedUpgrades.size === 0 || ownedUpgrades.size < tierUpgrades.length) {
      const reason = `Tier ${tier} has no full satisfiable unlock path under configured caps`;
      if (import.meta.env.DEV) {
        console.error(`[upgrades] ${reason}`, {
          tier,
          unlocked: Array.from(ownedUpgrades),
          total: tierUpgrades.map((upgrade) => upgrade.id),
        });
      }
    }
  }

  if (impossibleNodes.length > 0) {
    const reason = `[upgrades] Impossible unlock nodes detected: ${impossibleNodes.join(', ')}`;
    if (import.meta.env.DEV) {
      console.error(reason);
      throw new Error(reason);
    }
  }
};

export const UPGRADE_DEFINITIONS: UpgradeDefinition[] = Array.from(
  { length: TIER_MAX - TIER_MIN + 1 },
  (_, index) => makeTierUpgrades(TIER_MIN + index)
).flat();

export const UPGRADE_BY_ID: Record<UpgradeId, UpgradeDefinition> = Object.fromEntries(
  UPGRADE_DEFINITIONS.map((upgrade) => [upgrade.id, upgrade])
);

validateTierUpgradePaths(UPGRADE_DEFINITIONS);

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
      if (!acc[upgrade.category]) {
        acc[upgrade.category] = [];
      }
      acc[upgrade.category].push(upgrade);
      return acc;
    },
    {
      automation: [],
      speed: [],
      production: [],
      base_generation: [],
      efficiency: [],
      synergy: [],
      compounding: [],
      quality_of_life: [],
    } as Record<UpgradeCategory, UpgradeDefinition[]>
  );

export const getUpgradeLockReasons = (
  upgrade: UpgradeDefinition,
  context: {
    ownedUpgrades: Partial<Record<UpgradeId, number>>;
    completedTier: number;
    currencyTotal: number;
    machineLevel: number;
    ownedMachines: number;
  }
): string[] => {
  const reasons: string[] = [];
  const req = upgrade.unlockRequirements;

  if (req.requiresUpgrades?.length) {
    const missing = req.requiresUpgrades.filter((id) => (context.ownedUpgrades[id] ?? 0) < 1);
    if (missing.length > 0) {
      reasons.push(`Requires upgrades: ${missing.join(', ')}`);
    }
  }

  if ((req.requiresTierComplete ?? 0) > context.completedTier) {
    reasons.push(`Requires completing Tier ${req.requiresTierComplete}`);
  }

  if ((req.requiresCurrencyTotal ?? 0) > context.currencyTotal) {
    reasons.push(`Requires ${Math.round(req.requiresCurrencyTotal ?? 0).toLocaleString()} total currency`);
  }

  if ((req.requiresMachineLevel ?? 0) > context.machineLevel) {
    reasons.push(`Requires machine level ${req.requiresMachineLevel}`);
  }

  if ((req.requiresOwnedMachines ?? 0) > context.ownedMachines) {
    reasons.push(`Requires owning ${req.requiresOwnedMachines} machines`);
  }

  return reasons;
};
