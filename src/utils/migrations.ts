import { BONUS_RANGES, BonusKind, GameState, RowBonus, RowModule } from '@/types/game';

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

export const migrateGameState = (state: GameState): GameState => ({
  ...state,
  rowModules: migrateRowModules(state.rowModules || []),
});
