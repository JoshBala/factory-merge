import { BALANCE } from '@/config/balance';
import { UPGRADE_BY_ID, UpgradeId } from '@/config/upgrades';
import { GameState } from '@/types/game';
import { resolveUpgradeEffects } from '@/utils/upgradeEffects';

const MAX_COST_REDUCTION_PERCENT = 95;

const clampCostReductionPercent = (percent: number): number =>
  Math.max(0, Math.min(MAX_COST_REDUCTION_PERCENT, percent));

const resolveCostReductionMultiplier = (percent: number): number =>
  1 - clampCostReductionPercent(percent) / 100;

const resolveUpgradeBaseCost = (upgradeId: UpgradeId, currentLevel: number): number | null => {
  const definition = UPGRADE_BY_ID[upgradeId];
  if (!definition || currentLevel >= definition.maxLevel) return null;

  if (definition.costGrowth.kind === 'exponential') {
    return Math.round(definition.baseCost * Math.pow(definition.costGrowth.factor, currentLevel));
  }

  const levelFactor = Math.pow(currentLevel + 1, definition.costGrowth.power);
  return Math.round(definition.baseCost + levelFactor * definition.baseCost * 0.22 * definition.costGrowth.scale);
};

const resolveProjectedEffects = (state: GameState) =>
  state.upgradeEffectProjection ?? resolveUpgradeEffects(state.ownedUpgrades ?? {}, state.machines);

export const getMachinePurchaseCost = (state: GameState): number => {
  const reductionPercent = resolveProjectedEffects(state).machineCostReductionPercent;
  return Math.round(BALANCE.baseMachineCost * resolveCostReductionMultiplier(reductionPercent));
};

export const getUpgradePurchaseCost = (
  upgradeId: UpgradeId,
  currentLevel: number,
  state: GameState
): number | null => {
  const baseCost = resolveUpgradeBaseCost(upgradeId, currentLevel);
  if (baseCost === null) return null;

  const reductionPercent = resolveProjectedEffects(state).upgradeCostReductionPercent;
  return Math.round(baseCost * resolveCostReductionMultiplier(reductionPercent));
};
