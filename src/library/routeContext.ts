import type { WorldMap } from "./worldMap";
import { crossingSummary } from "./mapCrossings";

/** Facts about the route itself; neither endpoint establishes the intervening terrain. */
export function authoredRouteInfo(map: WorldMap, routeId: string): string {
  const route = map.routes.find(r => r.id === routeId);
  if (!route) return "";
  return [
    `Route type: ${route.type ?? route.mode}. Endpoint names and terrain do not describe the route between them.`,
    route.description?.trim() ? `Route surroundings and terrain: ${route.description.trim()}` :
      "Surrounding terrain along this route is unspecified. Keep it neutral; do not invent a forest, canopy, mountains, weather or landmarks from the destination name.",
    route.instructions?.trim() ? `Route instructions: ${route.instructions.trim()}` : "",
    ...crossingSummary(map, routeId)
  ].filter(Boolean).join("\n");
}
