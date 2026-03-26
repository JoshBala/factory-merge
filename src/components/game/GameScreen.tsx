// === Main Game Screen - Composes all game UI ===
import { useEffect, useState } from 'react';
import { useGame } from '@/contexts/GameContext';
import { useGameLoop } from '@/hooks/useGameLoop';
import { GameHUD } from './GameHUD';
import { FactoryGrid } from './FactoryGrid';
import { ActionBar } from './ActionBar';
import { OfflineModal } from './OfflineModal';
import { calculateOfflineEarnings } from '@/utils/calculations';
import { loadGame } from '@/utils/storage';

export const GameScreen = () => {
  const { state, dispatch } = useGame();
  const [offlineEarnings, setOfflineEarnings] = useState<number | null>(null);

  // Start the game loop
  useGameLoop({ state, dispatch });

  // Check for offline earnings on mount
  useEffect(() => {
    const saved = loadGame();
    if (saved && saved.machines.length > 0) {
      const { earnings, timeAway } = calculateOfflineEarnings(
        saved.machines,
        saved.lastTickTime,
        saved.gridUpgrade ?? null,
        saved
      );
      // Show modal if away > 1 minute and earned something
      if (earnings > 0 && timeAway > 60000) {
        setOfflineEarnings(earnings);
      }
    }
  }, []);

  const handleCollectOffline = () => {
    if (offlineEarnings) {
      dispatch({ type: 'COLLECT_OFFLINE', earnings: offlineEarnings });
      setOfflineEarnings(null);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <GameHUD />

      <FactoryGrid />
      <ActionBar />

      {/* Offline earnings modal */}
      {offlineEarnings !== null && (
        <OfflineModal
          earnings={offlineEarnings}
          onCollect={handleCollectOffline}
        />
      )}
    </div>
  );
};
