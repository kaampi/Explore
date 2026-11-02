import { z } from "zod";

export const ObjectLocationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("place"), placeId: z.string().min(1) }),
  z.object({ kind: z.literal("character"), characterId: z.string().min(1) }),
  z.object({ kind: z.literal("player") }),
  z.object({ kind: z.literal("object"), objectId: z.string().min(1) })
]);
export type ObjectLocation = z.infer<typeof ObjectLocationSchema>;
type LocatedObject = { id: string; startingLocation?: ObjectLocation | undefined };

export function objectContents<T extends LocatedObject>(objects: T[], id: string): T[] {
  return objects.filter(o => o.startingLocation?.kind === "object" && o.startingLocation.objectId === id);
}

export function validateObjectNesting(object: LocatedObject, objects: LocatedObject[]): string | undefined {
  const byId = new Map(objects.map(o => [o.id, o]));
  byId.set(object.id, object);
  const seen = new Set([object.id]);
  let location = object.startingLocation;
  while (location?.kind === "object") {
    if (seen.has(location.objectId)) return "An object cannot contain itself or one of its containers.";
    seen.add(location.objectId);
    const parent = byId.get(location.objectId);
    if (!parent) return "The containing object no longer exists. Choose another starting location.";
    location = parent.startingLocation;
  }
  return undefined;
}

/** Children retain their parent link when a container moves. */
export function effectiveObjectLocation(object: LocatedObject, objects: LocatedObject[]): ObjectLocation | undefined {
  if (validateObjectNesting(object, objects)) return undefined;
  let location = object.startingLocation;
  while (location?.kind === "object") {
    const id = location.objectId;
    location = objects.find(o => o.id === id)?.startingLocation;
  }
  return location;
}
