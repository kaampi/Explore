import { z } from 'zod';

export const interiorFurniture = {
  table: { label: 'Table', icon: '▤', width: 1.6, depth: 0.9, category: 'furnish' },
  'dining-set': { label: 'Table & chairs', icon: '⊡', width: 1.9, depth: 1.65, category: 'furnish' },
  chair: { label: 'Armchair', icon: '▱', width: 0.85, depth: 0.85, category: 'furnish' },
  bed: { label: 'Bed', icon: '▰', width: 0.9, depth: 2, category: 'furnish' },
  storage: { label: 'Storage', icon: '▥', width: 1.2, depth: 0.5, category: 'furnish' },
  rug: { label: 'Rug', icon: '▧', width: 1.8, depth: 1.25, category: 'furnish' },
  'bar-counter': { label: 'Bar counter', icon: '▬', width: 2.4, depth: 0.65, category: 'fixture' },
  toilet: { label: 'Toilet', icon: '◉', width: 0.42, depth: 0.75, category: 'fixture' },
  stove: { label: 'Stove', icon: '⊞', width: 0.65, depth: 0.6, category: 'fixture' },
  fireplace: { label: 'Fireplace', icon: '♨', width: 1.4, depth: 0.75, category: 'fixture' },
  lamp: { label: 'Lamp', icon: '☼', width: 0.45, depth: 0.45, category: 'fixture' }
} as const;

export type FurnitureType = keyof typeof interiorFurniture;
export const furnitureTypes = Object.keys(interiorFurniture) as [FurnitureType, ...FurnitureType[]];
export const FurnitureTypeSchema = z.enum(furnitureTypes);

export function isFurnitureType(value: string): value is FurnitureType {
  return Object.hasOwn(interiorFurniture, value);
}

export function furnitureLayer(a: { furnitureType?: FurnitureType | undefined }, b: { furnitureType?: FurnitureType | undefined }) {
  return Number(a.furnitureType !== 'rug') - Number(b.furnitureType !== 'rug');
}
