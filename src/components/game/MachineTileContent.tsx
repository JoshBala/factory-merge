import { Machine } from '@/types/game';
import { getMachineRateLabel } from './machineTileUtils';

export const MachineTileContent = ({ machine }: { machine: Machine }) => (
  <>
    <span className="text-lg font-bold leading-tight">Lv {machine.level}</span>
    <span className="text-xs text-muted-foreground leading-tight">
      {getMachineRateLabel(machine.level)}
    </span>
    {machine.disabled && (
      <span className="text-xs text-destructive font-medium leading-tight">
        🔥 Disabled
      </span>
    )}
  </>
);
