import { getProductionRate } from '@/config/balance';

// Generate color for any level (procedural)
export const getLevelColor = (level: number): string => {
  // Cycle through a progression of colors for higher levels
  const colors = [
    'bg-emerald-500/20 border-emerald-500',   // Lv 1
    'bg-blue-500/20 border-blue-500',          // Lv 2
    'bg-purple-500/20 border-purple-500',      // Lv 3
    'bg-orange-500/20 border-orange-500',      // Lv 4
    'bg-pink-500/20 border-pink-500',          // Lv 5
    'bg-cyan-500/20 border-cyan-500',          // Lv 6
    'bg-yellow-500/20 border-yellow-500',      // Lv 7
    'bg-red-500/20 border-red-500',            // Lv 8
    'bg-indigo-500/20 border-indigo-500',      // Lv 9
    'bg-lime-500/20 border-lime-500',          // Lv 10+
  ];
  return colors[Math.min(level - 1, colors.length - 1)];
};

// Format production rate for display
export const formatRate = (rate: number): string => {
  if (rate >= 1e6) return `$${(rate / 1e6).toFixed(1)}M/s`;
  if (rate >= 1e3) return `$${(rate / 1e3).toFixed(1)}K/s`;
  return `$${rate.toFixed(1)}/s`;
};

export const getMachineRateLabel = (level: number): string =>
  formatRate(getProductionRate(level));
