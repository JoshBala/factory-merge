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
});
