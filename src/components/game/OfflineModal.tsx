// === Offline Earnings Modal ===
import { formatCurrency } from '@/utils/calculations';
import { Button } from '@/components/ui/button';

interface OfflineModalProps {
  earnings: number;
  onCollect: () => void;
}

export const OfflineModal = ({ earnings, onCollect }: OfflineModalProps) => {
  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-lg p-6 max-w-sm w-full text-center shadow-lg">
        <h2 className="text-xl font-bold text-foreground mb-2">
          Welcome Back! 👋
        </h2>
        <p className="text-muted-foreground mb-4">
          Your factory earned money while you were away
        </p>
        <p className="text-3xl font-bold text-primary mb-6">
          +{formatCurrency(earnings)}
        </p>
        <Button onClick={onCollect} className="w-full" size="lg">
          Collect
        </Button>
      </div>
    </div>
  );
};
