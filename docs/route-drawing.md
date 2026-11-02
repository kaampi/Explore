# Drawing roads and paths

Map Studio has Road and Path tools in the left toolbox. Drag a route, then release to commit. Nearby destination nodes or roads are highlighted. Endpoints snap to destination nodes or split existing roads at junctions. Empty endpoints become unnamed geographic waypoints; they do not create library places.

Connect crossings automatically is enabled by default. Drawing a road/path across an existing road/path splits the existing edge and connects the new route through that junction. Existing direction, manual durations and crossing conditions are preserved by the junction-splitting helper. Disable the option when drawing a grade-separated crossing, such as a tunnel or overpass. The setting controls interior crossings; deliberately snapped endpoints still connect.

At creation, forest, mountain, region and generic area boundaries are sampled at approximately two map pixels along the drawn line. Crossing a boundary creates a distinct entry/exit waypoint. Each segment records containing area IDs and retains its own geometry, so opposite sides of a large forest are different positions in the route network. Existing map scale calculates travel durations. Boundary points are infrastructure, not named library destinations.

Save map persists the new graph. Existing roads are not automatically migrated to the new crossing convention. This first implementation does not add automatic building-door selection, off-road journeys to arbitrary interior places, or automatic re-segmentation when an area boundary is subsequently moved. Author door connections separately; redraw affected routes after changing terrain extents. The new metadata establishes the geographic foundation, rather than a complete continuous-coordinate player movement system.
