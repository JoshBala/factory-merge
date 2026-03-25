import { BONUS_RANGES, BonusKind, GameState, RowBonus, RowModule } from '@/types/game';

const migrateOwnedUpgrades = (ownedUpgrades: unknown): Record<string, number> => {
  if (!ownedUpgrades || typeof ownedUpgrades !== 'object' || Array.isArray(ownedUpgrades)) {
    return {};
  }

  return Object.entries(ownedUpgrades as Record<string, unknown>).reduce<Record<string, number>>(
    (acc, [upgradeId, rawLevel]) => {
      if (typeof rawLevel === 'number' && Number.isFinite(rawLevel) && rawLevel >= 0) {
        acc[upgradeId] = Math.floor(rawLevel);
      } else {
        acc[upgradeId] = 0;
      }
      return acc;
    },
    {}
  );
};

const migrateRowBonus = (bonus: RowBonus, rarity: RowModule['rarity']): RowBonus => {
  const bonusShape = bonus as RowBonus & { type?: BonusKind; roll?: number };

  if (bonusShape.kind) {
    const value = typeof bonusShape.value === 'number' ? bonusShape.value : 0;
    return {
      ...bonusShape,
      value,
      locked: bonusShape.locked ?? false,
    };
  }

  if (bonusShape.type) {
    const [min, max] = BONUS_RANGES[bonusShape.type][rarity];
    const roll = typeof bonusShape.roll === 'number' ? bonusShape.roll : 0;
    const value = min + roll * (max - min);
    return {
      kind: bonusShape.type,
      value,
      locked: false,
    };
  }

  return {
    kind: 'productionPercent',
    value: 0,
    locked: false,
  };
};

const migrateRowModules = (modules: RowModule[] = []): RowModule[] =>
  modules.map(module => ({
    ...module,
    bonuses: module.bonuses.map(bonus => migrateRowBonus(bonus, module.rarity)),
  }));

const migrateAutomationState = (automation: Partial<GameState>['automation']): GameState['automation'] => {
  const runtime = automation?.runtime;
  const blockedReasons = runtime?.debugMetrics?.blockedReasons;

  return {
    enabled: automation?.enabled ?? false,
    rules: Array.isArray(automation?.rules) ? automation.rules : [],
    runtime: {
      lastRunAt: typeof runtime?.lastRunAt === 'number' ? runtime.lastRunAt : null,
      pendingQueue: Array.isArray(runtime?.pendingQueue)
        ? runtime.pendingQueue.filter((entry): entry is string => typeof entry === 'string')
        : [],
      opsPerTickBudget:
        typeof runtime?.opsPerTickBudget === 'number' && Number.isFinite(runtime.opsPerTickBudget) && runtime.opsPerTickBudget > 0
          ? Math.floor(runtime.opsPerTickBudget)
          : 1,
      debugMetrics: {
        attemptedOps:
          typeof runtime?.debugMetrics?.attemptedOps === 'number' && Number.isFinite(runtime.debugMetrics.attemptedOps)
            ? Math.max(0, Math.floor(runtime.debugMetrics.attemptedOps))
            : 0,
        successfulOps:
          typeof runtime?.debugMetrics?.successfulOps === 'number' && Number.isFinite(runtime.debugMetrics.successfulOps)
            ? Math.max(0, Math.floor(runtime.debugMetrics.successfulOps))
            : 0,
        blockedReasons: {
          no_match:
            typeof blockedReasons?.no_match === 'number' && Number.isFinite(blockedReasons.no_match)
              ? Math.max(0, Math.floor(blockedReasons.no_match))
              : 0,
          cooldown:
            typeof blockedReasons?.cooldown === 'number' && Number.isFinite(blockedReasons.cooldown)
              ? Math.max(0, Math.floor(blockedReasons.cooldown))
              : 0,
          disabled:
            typeof blockedReasons?.disabled === 'number' && Number.isFinite(blockedReasons.disabled)
              ? Math.max(0, Math.floor(blockedReasons.disabled))
              : 0,
          full_grid:
            typeof blockedReasons?.full_grid === 'number' && Number.isFinite(blockedReasons.full_grid)
              ? Math.max(0, Math.floor(blockedReasons.full_grid))
              : 0,
        },
      },
    },
  };
};

export const migrateGameState = (state: Partial<GameState>): GameState => ({
  ...state,
  saveVersion: state.saveVersion ?? 0,
  stats: {
    lifetimeCurrencyEarned: state.stats?.lifetimeCurrencyEarned ?? 0,
    lifetimeMachinesBought: state.stats?.lifetimeMachinesBought ?? 0,
    lifetimeMerges: state.stats?.lifetimeMerges ?? 0,
    highestMachineLevel: state.stats?.highestMachineLevel ?? 0,
  },
  rowModules: migrateRowModules(state.rowModules || []),
  ownedUpgrades: migrateOwnedUpgrades(state.ownedUpgrades),
  automation: migrateAutomationState(state.automation),
});
