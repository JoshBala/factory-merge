// Shared layout constants for the factory playfield.
// Keep sizing values centralized so all disaster states use the same baseline scale.

export const FACTORY_LAYOUT = {
  gridColumnsClass: 'grid-cols-3',
  gridGapClass: 'gap-4',
  gridMaxWidthClass: 'max-w-sm',
  machineSlotSizeClass: 'w-full aspect-square',
  machineContentHeightClass: 'h-[52px]',
} as const;
