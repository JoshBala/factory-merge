// === Entry Page - Renders the Idle Merge Factory Game ===
import { GameProvider } from '@/contexts/GameContext';
import { GameScreen } from '@/components/game/GameScreen';

const Index = () => {
  return (
    <GameProvider>
      <GameScreen />
    </GameProvider>
  );
};

export default Index;
