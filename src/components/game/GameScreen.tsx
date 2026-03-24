// === Main Game Screen - Composes all game UI ===
import { useEffect, useState } from 'react';
import { useGame } from '@/contexts/GameContext';
import { useGameLoop } from '@/hooks/useGameLoop';
import { GameHUD } from './GameHUD';
import { FactoryGrid } from './FactoryGrid';
import { ActionBar } from './ActionBar';
import { OfflineModal } from './OfflineModal';
import { RowUpgradesModal } from './RowUpgradesModal';
import { calculateOfflineEarnings } from '@/utils/calculations';
import { loadGame } from '@/utils/storage';

export const GameScreen = () => {
  const { state, dispatch } = useGame();
  const [offlineEarnings, setOfflineEarnings] = useState<number | null>(null);
  const [showRowUpgrades, setShowRowUpgrades] = useState(false);
  const [focusedRow, setFocusedRow] = useState<0 | 1 | 2 | null>(null);

  // Handle row panel click - open modal
  const handleRowClick = (rowIndex: 0 | 1 | 2) => {
    setFocusedRow(rowIndex);
    setShowRowUpgrades(true);
  };
  
  // Start the game loop
  useGameLoop({ state, dispatch });

  // Check for offline earnings on mount
  useEffect(() => {
    const saved = loadGame();
    if (saved && saved.machines.length > 0) {
      const { earnings, timeAway } = calculateOfflineEarnings(saved.machines, saved.lastTickTime);
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
      
      <FactoryGrid onRowClick={handleRowClick} />
      <ActionBar />
      
      {/* Offline earnings modal */}
      {offlineEarnings !== null && (
        <OfflineModal 
          earnings={offlineEarnings} 
          onCollect={handleCollectOffline} 
        />
      )}

      {/* Row upgrades modal */}
      <RowUpgradesModal 
        isOpen={showRowUpgrades}
        onClose={() => {
          setShowRowUpgrades(false);
          setFocusedRow(null);
        }}
        initialRow={focusedRow}
      />
    </div>
  );
};
