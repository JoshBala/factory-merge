import { BONUS_RANGES, BonusKind, GameState, GridModule, RowBonus, RowModule } from '@/types/game';
import { sanitizeAutomationState } from '@/utils/automationValidation';

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

const migrateGridUpgrade = (
  gridUpgrade: GridModule | null | undefined,
  rowModules: RowModule[]
): GridModule | null => {
  if (gridUpgrade && Array.isArray(gridUpgrade.bonuses)) {
    return {
      ...gridUpgrade,
      bonuses: gridUpgrade.bonuses.map(bonus => migrateRowBonus(bonus, gridUpgrade.rarity)),
    };
  }

  // Legacy rowModules -> gridUpgrade policy (deterministic):
  // - We treat legacy rows as parallel progression tracks.
  // - We select a single winner instead of merging to avoid surprise power spikes.
  // - Winner order is: highest rarity, then most unlocked bonuses, then earliest row index.
  // This keeps migration stable and reproducible across imports/loads.
  const rarityRank: Record<RowModule['rarity'], number> = {
    common: 0,
    uncommon: 1,
    rare: 2,
    epic: 3,
  };
  const fallback = [...rowModules].sort((a, b) => {
    const byRarity = rarityRank[b.rarity] - rarityRank[a.rarity];
    if (byRarity !== 0) return byRarity;

    const unlockedA = a.bonuses.filter(bonus => !bonus.locked).length;
    const unlockedB = b.bonuses.filter(bonus => !bonus.locked).length;
    const byUnlocked = unlockedB - unlockedA;
    if (byUnlocked !== 0) return byUnlocked;

    return a.rowIndex - b.rowIndex;
  })[0];
  return fallback ? { rarity: fallback.rarity, bonuses: fallback.bonuses } : null;
};

const AUTOMATION_VALIDATION_ROLLOUT_VERSION = 2;

const migrateAutomationState = (
  automation: Partial<GameState>['automation'],
  saveVersion: number
): GameState['automation'] => {
  const defaultEnabled = saveVersion >= AUTOMATION_VALIDATION_ROLLOUT_VERSION;
  const sanitized = sanitizeAutomationState(automation, { defaultEnabled });
  if (saveVersion < AUTOMATION_VALIDATION_ROLLOUT_VERSION) {
    return { ...sanitized, enabled: false };
  }
  return sanitized;
};

export const migrateGameState = (state: Partial<GameState>): GameState => {
  const migratedRowModules = migrateRowModules(state.rowModules || []);

  return {
  ...state,
  saveVersion: state.saveVersion ?? 0,
  stats: {
    lifetimeCurrencyEarned: state.stats?.lifetimeCurrencyEarned ?? 0,
    lifetimeMachinesBought: state.stats?.lifetimeMachinesBought ?? 0,
    lifetimeMerges: state.stats?.lifetimeMerges ?? 0,
    highestMachineLevel: state.stats?.highestMachineLevel ?? 0,
  },
  gridUpgrade: migrateGridUpgrade(state.gridUpgrade, migratedRowModules),
  rowModules: migratedRowModules,
  ownedUpgrades: migrateOwnedUpgrades(state.ownedUpgrades),
  automation: migrateAutomationState(state.automation, state.saveVersion ?? 0),
};
};
