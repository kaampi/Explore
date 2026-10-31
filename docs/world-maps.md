# World maps — first working version

Open My library → Maps. Choose a saved world or create one. Add places manually, bring in existing library places, or generate a starter layout. Select a place to name it, describe it, adjust its position, or open its contents. There is no fixed nesting depth.

Connections are separate from containment. Connect any two places and specify travel mode, approximate travel time, access and direction. Connections between levels are visible in the details; the canvas draws connections between places on the displayed level.

Save map persists the graph on the realm. New map nodes also create library places; existing linked places retain their media and other settings. Renaming a map node updates the linked library name on save. Removing a node removes it from the map, not the library. Existing room data is not migrated automatically.

New sessions using that realm receive a snapshot of map descriptions, containment, population and routes through realmPlayFields. Saved conversations are not retroactively changed. Geography is AI context, not a movement engine: route permissions and travel time are not mechanically enforced, and selecting a map node does not move the player. Character residency and automatic encounters are future work.

Choose World / region, Village / city or House / interior per map level. The root defaults to world scale. Generated settlements open at settlement scale, and generated buildings open at interior scale. World maps use regions and settlements with multi-day routes; settlements use buildings and short routes; interiors use adjacent rectangular rooms with shared walls and door connections. Regenerating replaces the current level and its nested map contents after confirmation, while keeping library places. Existing maps are retained until regenerated. Terrain outlines and richer geometry remain future work.
