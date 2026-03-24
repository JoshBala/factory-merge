// === LOCAL STORAGE PERSISTENCE ===
import { SAVE_VERSION } from '@/config/version';
import { GameState } from '@/types/game';
import { migrateGameState } from '@/utils/migrations';

const STORAGE_KEY = 'idle_merge_factory_save';

export const createSaveData = (state: GameState): GameState => ({
  ...state,
  saveVersion: SAVE_VERSION,
  lastTickTime: Date.now(), // Always update timestamp on save
});

export const saveGame = (state: GameState): void => {
  try {
    const saveData = createSaveData(state);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saveData));
  } catch (e) {
    console.warn('Failed to save game:', e);
  }
};

export const loadGame = (): GameState | null => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved) as GameState;
    return migrateGameState(parsed);
  } catch (e) {
    console.warn('Failed to load game:', e);
    return null;
  }
};

export const deleteSave = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn('Failed to delete save:', e);
  }
};

export const hasSave = (): boolean => {
  return localStorage.getItem(STORAGE_KEY) !== null;
};
