import { z } from 'zod';
/** Visual-only, local artwork. Never interpreted as a gameplay command. */
export const CombatFigureImageSchema = z.string().max(6_000_000).regex(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/);
export const CombatArtworkSchema = z.record(z.object({ imageDataUrl: CombatFigureImageSchema }));
export const MAX_COMBAT_IMAGE_BYTES = 4 * 1024 * 1024;
