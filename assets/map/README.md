# Production map geometry

`world.json` is the committed, projected input to the Pixi renderer. The game does not
download geography, simplify polygons, or run D3 at runtime. `coverage.json` records the
source hash, output hash, build settings, assignments and deliberate omissions.

## Rebuild

Use Node 24 and the locked dependencies. Download the exact source URL recorded in
`content/map-markets.yaml` to a local file, then run:

```powershell
npm.cmd run map:build -- runs/map-example/map-units.geojson
npx.cmd vitest run tests/map.test.ts
```

The builder refuses a source whose SHA-256 differs from the pinned Natural Earth v5.1.2
1:50m admin-0 map-units file. It simplifies shared arcs with mapshaper, preserves small
shapes, normalizes ring winding, projects with D3 Natural Earth I, retains holes, and
rounds coordinates. Output is deterministic; do not manually edit the generated JSON.
Projection, simplification, rounding and the byte budget live in `content/map.yaml`.

## Coverage

- 213 markets: 212 have polygons; Gibraltar has an explicit GeoNames point fallback.
- 264 rendered source units. England, Scotland, Wales and Northern Ireland remain separate.
- Every source unit is explicitly assigned or neutral in `content/map-markets.yaml`.
  Neutral land is hatched and cannot be selected. Antarctica is deliberately omitted.
- Assignments follow the game's sporting markets, not sovereign-state membership. Neutral
  areas and source borders are cartographic choices, not claims about sovereignty.
- Tiny markets retain geometry and receive a screen-space target of at least 24 pixels;
  the country selector provides an alternative where targets overlap.

Tests cover complete assignments, asset integrity, the output size budget, exterior
winding, Lesotho's hole, and Tuvalu/Gibraltar hit targets at multiple scales.

## Build dependency constraint

Mapshaper 0.5.94 is a JavaScript-only build dependency. Newer versions considered for this
implementation pull in native modules, contrary to `CLAUDE.md`. Its D3 color dependencies
are overridden to exact patched versions; the geometry build is tested with those pins.

`npm audit` still reports the moderate
[mapshaper GUI path-traversal advisory](https://github.com/advisories/GHSA-8m36-62rw-9mxw).
This pipeline calls only `applyCommands` with an in-memory, checksum-verified GeoJSON file;
it never starts the GUI/server, accepts command text, or includes mapshaper in the game.
Do not use this dependency's `mapshaper-gui` command. A patched, native-free build-tool
replacement remains follow-up work; this is not an audit-clean development dependency tree.

See [third-party notices](THIRD-PARTY-NOTICES.txt) for geography attribution.
