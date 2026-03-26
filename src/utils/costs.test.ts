import { BALANCE } from '@/config/balance';
import { UPGRADE_DEFINITIONS } from '@/config/upgrades';
import { createInitialState } from '@/utils/state';
import { getMachinePurchaseCost, getUpgradePurchaseCost } from '@/utils/costs';

const assertEqual = (actual: number | null, expected: number | null, message: string) => {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}.`);
  }
};

export const runCostsResolverUnitTests = () => {
  const baseState = createInitialState();

  // 0% reduction keeps base machine cost unchanged.
  const zeroReductionMachineState = {
    ...baseState,
    upgradeEffectProjection: {
      ...baseState.upgradeEffectProjection,
      machineCostReductionPercent: 0,
      upgradeCostReductionPercent: 0,
    },
  };
  assertEqual(
    getMachinePurchaseCost(zeroReductionMachineState),
    BALANCE.baseMachineCost,
    'Machine cost should match base cost at 0% reduction'
  );

  const testUpgrade = UPGRADE_DEFINITIONS[0];
  const baseUpgradeCost = getUpgradePurchaseCost(testUpgrade.id, 0, zeroReductionMachineState);
  assertEqual(
    baseUpgradeCost,
    Math.round(testUpgrade.baseCost),
    'Upgrade cost should match base growth formula at level 0 and 0% reduction'
  );

  // Stacked reduction percentages apply multiplicatively once after growth formula.
  const stackedReductionState = {
    ...baseState,
    upgradeEffectProjection: {
      ...baseState.upgradeEffectProjection,
      machineCostReductionPercent: 37.5,
      upgradeCostReductionPercent: 12.5,
    },
  };
  assertEqual(
    getMachinePurchaseCost(stackedReductionState),
    Math.round(BALANCE.baseMachineCost * (1 - 37.5 / 100)),
    'Machine cost should apply stacked machine reduction percent'
  );

  const stackedUpgradeCost = getUpgradePurchaseCost(testUpgrade.id, 1, stackedReductionState);
  const expectedStackedUpgradeBase = testUpgrade.costGrowth.kind === 'exponential'
    ? Math.round(testUpgrade.baseCost * Math.pow(testUpgrade.costGrowth.factor, 1))
    : Math.round(
        testUpgrade.baseCost +
          Math.pow(2, testUpgrade.costGrowth.power) *
            testUpgrade.baseCost *
            0.22 *
            testUpgrade.costGrowth.scale
      );
  assertEqual(
    stackedUpgradeCost,
    Math.round(expectedStackedUpgradeBase * (1 - 12.5 / 100)),
    'Upgrade cost should apply stacked upgrade reduction percent'
  );

  // Clamp cap is enforced at 95%.
  const cappedReductionState = {
    ...baseState,
    upgradeEffectProjection: {
      ...baseState.upgradeEffectProjection,
      machineCostReductionPercent: 999,
      upgradeCostReductionPercent: 999,
    },
  };
  assertEqual(
    getMachinePurchaseCost(cappedReductionState),
    Math.round(BALANCE.baseMachineCost * 0.05),
    'Machine reduction should clamp to 95% max'
  );

  const cappedUpgradeCost = getUpgradePurchaseCost(testUpgrade.id, 0, cappedReductionState);
  assertEqual(
    cappedUpgradeCost,
    Math.round(Math.round(testUpgrade.baseCost) * 0.05),
    'Upgrade reduction should clamp to 95% max'
  );

  // Max level should return null.
  assertEqual(
    getUpgradePurchaseCost(testUpgrade.id, testUpgrade.maxLevel, zeroReductionMachineState),
    null,
    'Upgrade cost should be null at max level'
  );
};
