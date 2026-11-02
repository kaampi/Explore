# Location templates

Open My Library → Location templates (immediately before World Maps) to manage the shared template collection. In Map Studio, right-click empty ground → Add from template opens the same editor and adds a saved template as an independent map node at the clicked position on the current level. Move it, edit its information, draw entrances/routes, then Save map.

The editor separates geographic type (Area, Building, Space, Point of Interest) from name, description, AI instructions, symbol, color and setting tags. The setting selector filters tagged suggestions while keeping untagged templates available. It is a manual library filter in this first version, not a world-level genre restriction. The initial symbol set contains a marker and the four prototype houses; symbols do not yet switch automatically by genre.

Building and Space copies use interior content type. Generic areas are normal geographic nodes, not terrain subareas clipped to a containing forest or settlement. Relations and route access are authored on the map. A ruin can be placed inside any geographic level; placement does not create a traversable route.

Templates are validated and persisted in the existing IndexedDB preferences store under `place-blueprints`, with no database-version change. Starter templates are offered only when no collection exists. Save, duplicate, remove, and import affect templates only, never existing map instances. Source blueprint IDs and chosen symbols survive WorldMap schema serialization.

Use Export templates / Import templates to back up this collection. It is not yet included in the general library backup. Import merges by ID, updating matching templates, and leaves placed copies unchanged. Unsaved edits are guarded on selection changes, modal closure and browser unload.

This delivers the reusable template library and map placement foundation. Automatic settlement overview silhouettes derived from local maps, genre-specific symbol packs and automatic street layout are future work.


