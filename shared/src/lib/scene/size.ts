import type { Size } from '../../schemas/common.js';

/** Celle occupate da una creatura per taglia (D&D 5e). */
export const SIZE_CELLS: Readonly<Record<Size, number>> = {
  tiny: 1,
  small: 1,
  medium: 1,
  large: 2,
  huge: 3,
  gargantuan: 4,
};

export const sizeCells = (size: Size): number => SIZE_CELLS[size];
