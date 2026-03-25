import { UPGRADE_DEFINITIONS, UpgradeEffect, UpgradeId } from '@/config/upgrades';
import { Machine } from '@/types/game';

export type OwnedUpgrades = Partial<Record<UpgradeId, number>>;

export interface UpgradeEffectProjection {
  automationSpeedPercent: number;
  throughputPercent: number;
  mergeQualityPercent: number;
  baseGenerationFlat: number;
  baseGenerationPercent: number;
  machineCostReductionPercent: number;
  upgradeCostReductionPercent: number;
  offlineStorageHours: number;
  synergyPercentPerOwnedMachine: number;
  prestigeCompoundingPercentPerReset: number;
  tierProductionMultipliers: Record<number, number>;
  machineLevelBonusByMachineId: Record<string, number>;
  synergyProductionPercent: number;
  tierTargetedProductionPercent: number;
}

export const EMPTY_UPGRADE_EFFECT_PROJECTION: UpgradeEffectProjection = {
  automationSpeedPercent: 0,
  throughputPercent: 0,
  mergeQualityPercent: 0,
  baseGenerationFlat: 0,
  baseGenerationPercent: 0,
  machineCostReductionPercent: 0,
  upgradeCostReductionPercent: 0,
  offlineStorageHours: 0,
  synergyPercentPerOwnedMachine: 0,
  prestigeCompoundingPercentPerReset: 0,
  tierProductionMultipliers: {},
  machineLevelBonusByMachineId: {},
  synergyProductionPercent: 0,
  tierTargetedProductionPercent: 0,
};

const clampOwnedLevel = (ownedLevel: number, maxLevel: number): number =>
  Math.max(0, Math.min(maxLevel, Math.floor(ownedLevel)));

const resolveStaticEffectTotals = (
  effect: UpgradeEffect,
  level: number,
  projection: UpgradeEffectProjection
): void => {
  if (level <= 0) return;

  switch (effect.type) {
    case 'automation_tick_rate':
      projection.automationSpeedPercent += effect.percentPerLevel * level;
      return;
    case 'base_generation_flat':
      projection.baseGenerationFlat += effect.amountPerLevel * level;
      return;
    case 'base_generation_percent':
      projection.baseGenerationPercent += effect.percentPerLevel * level;
      return;
    case 'throughput_percent':
      projection.throughputPercent += effect.percentPerLevel * level;
      return;
    case 'merge_quality_percent':
      projection.mergeQualityPercent += effect.percentPerLevel * level;
      return;
    case 'offline_storage_hours':
      projection.offlineStorageHours += effect.hoursPerLevel * level;
      return;
    case 'cost_reduction_percent':
      if (effect.target === 'machine') {
        projection.machineCostReductionPercent += effect.percentPerLevel * level;
      } else {
        projection.upgradeCostReductionPercent += effect.percentPerLevel * level;
      }
      return;
    case 'machine_level_bonus':
      projection.machineLevelBonusByMachineId[effect.machineId] =
        (projection.machineLevelBonusByMachineId[effect.machineId] ?? 0) + effect.levelBonusPerLevel * level;
      return;
    case 'synergy_per_owned_machine':
      projection.synergyPercentPerOwnedMachine += effect.percentPerMachine * level;
      return;
    case 'tier_multiplier': {
      projection.tierProductionMultipliers[effect.targetTier] =
        (projection.tierProductionMultipliers[effect.targetTier] ?? 0) + effect.multiplierPerLevel * level;
      return;
    }
    case 'prestige_compounding':
      projection.prestigeCompoundingPercentPerReset += effect.percentPerReset * level;
  }
};

const resolveTierTargetedProductionPercent = (
  machines: Machine[],
  tierProductionMultipliers: Record<number, number>
): number => {
  if (machines.length === 0) return 0;

  return machines.reduce((total, machine) => {
    const tierMultiplier = tierProductionMultipliers[machine.level] ?? 0;
    return total + tierMultiplier * 100;
  }, 0) / machines.length;
};

export const resolveUpgradeEffects = (
  ownedUpgrades: OwnedUpgrades = {},
  machines: Machine[] = []
): UpgradeEffectProjection => {
  const projection: UpgradeEffectProjection = {
    ...EMPTY_UPGRADE_EFFECT_PROJECTION,
    tierProductionMultipliers: {},
    machineLevelBonusByMachineId: {},
  };

  for (const definition of UPGRADE_DEFINITIONS) {
    const level = clampOwnedLevel(ownedUpgrades[definition.id] ?? 0, definition.maxLevel);
    if (level <= 0) continue;

    for (const effect of definition.effects) {
      resolveStaticEffectTotals(effect, level, projection);
    }
  }

  const ownedMachineCount = machines.length;
  projection.synergyProductionPercent = projection.synergyPercentPerOwnedMachine * ownedMachineCount;
  projection.tierTargetedProductionPercent = resolveTierTargetedProductionPercent(
    machines,
    projection.tierProductionMultipliers
  );

  return projection;
};
