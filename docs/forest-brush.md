# Painted forests and clearings

In World Maps, open Map Studio at World / region scale. Forest, Clearing, Lake, Low mountain, High mountain, Snow peak and Erase are available above the map. Brush size is adjustable there.

Mountain strokes store height levels 1–3. Finish mountain replaces the draft height areas with stable illustrated mountain symbols; Edit mountain returns to the draft. Painting changes automatically return a mountain to draft mode. Erase affects only the selected terrain; erasing a lake reveals underlying land and does not create a named island.

Editor zoom ranges from 50–400%. Screen scale controls stable nested subsets of tree and mountain symbols. Tree symbols fade in as scale increases. Forest ground remains visible at overview scale. Settlement/region labels take priority when zoomed out, selected labels remain visible, and overlapping names are suppressed. Route duration labels are suppressed in overview unless selected. No zoom setting modifies saved geography or route durations.

Forest creates a place on the first stroke. Further strokes extend the selected painted forest. Select / Move and click empty ground to deselect before creating a separate forest. Clearing creates a separate child area in the selected forest; subsequent strokes extend the selected clearing. Clearings have normal place information and stable IDs. Erase edits only the selected painted entity and never implicitly authors a clearing. Save map persists all strokes and creates the linked library places.

Tree variants, sizes and placement are deterministic. Tree density and size decrease near the forest edge and authored clearings. Painted terrain can be selected and edited with the brush; polygon handles, dragging, resizing and rotation are not enabled for painted footprints. Existing polygon forests remain unchanged.

The stored footprint uses ordered paint/erase circles. Spatial membership and selection use a four-pixel raster of this footprint. Painted subareas participate in existing terrain sampling for route calculations. Player preview renders painted forests and clearings. AI context names clearings as contained places and includes approximate map coordinates and bounding extents; it does not send a screenshot or infer named clearings from erased gaps. New conversations receive the saved geography through the existing snapshot mechanism.

This does not implement free off-road journey planning, biome brushes, or automatic exact distance narration from arbitrary player coordinates. Existing route and movement rules still apply. Overlapping forests retain separate identities; erase affects the selected entity only.
