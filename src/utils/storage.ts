// === LOCAL STORAGE PERSISTENCE ===
import { GameState } from '@/types/game';

const STORAGE_KEY = 'idle_merge_factory_save';

export const saveGame = (state: GameState): void => {
  try {
    const saveData = {
      ...state,
      lastTickTime: Date.now(), // Always update timestamp on save
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saveData));
  } catch (e) {
    console.warn('Failed to save game:', e);
  }
};

export const loadGame = (): GameState | null => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;
    return JSON.parse(saved) as GameState;
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
