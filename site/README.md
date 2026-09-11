# Fingerboard Studio

A self-contained, client-side viol fingerboard designer with F1/F7 section review, Meares reference overlays and named underside checking templates. No accounts, external font requests, backend geometry service or CSV export.

```sh
cd site
npm run dev
```

Open **http://127.0.0.1:5173/**. There are no packages to install. Reload the page after source edits.

```sh
npm test
npm run build
```

`dist/client/index.html` is a self-contained app, including styles, scripts, reference images and stencil glyphs. It can be opened directly from disk, or served on any static host. `dist/server/index.js` is an optional static Cloudflare Worker entrypoint for Sites hosting. The worker serves the app; all geometry and downloads run in the browser.

GitHub Pages publishes this app at https://pzfreo.github.io/viol-fb-template/.
The repository's `.github/workflows/static.yml` runs the tests and build with Node 22, then uploads only `site/dist/client`. Pushes to `main` deploy automatically; the workflow can also be run manually. No dependency installation is needed. Embedded assets and relative links work under the repository's Pages subpath.

## Review workflow

1. Enter or import the taper and string measurements, then enter maximum thickness at frets 1 and 7.
2. Review the actual sections using the F1/F7 tabs. Adjust corner rounding; the same percentage of each section's flat side applies to both. Arrow keys, Home and End switch tabs from the keyboard.
3. Optionally download the selected section as a full-size outline SVG.
4. Enter the stencil name, review the paired template preview, and download template SVG or 3MF.

The diagram is independent of stencil-name validation: a long or unsupported name blocks templates but still allows section review and outline download. Invalid section dimensions clear the diagram and disable geometry downloads rather than showing stale geometry.

## Section dimensions

| Dimension | Meaning |
| --- | --- |
| Width W | Full physical width between the two side extrema. |
| Crown radius R | Radius of the **fixed circular playing surface**. |
| Maximum thickness T | Vertical separation from the crown to the underside centre. |
| Corner rounding D | Share of the flat side left on the blank that gets filed away, as a percentage. Zero leaves a sharp corner; 100% would remove the whole flat and is rejected. The resulting drop in millimetres is shown with the section measurements. |

Changing D leaves the entire underside unchanged. It trims only the top corner, joining the fixed playing circle to the flat side with a small circular fillet. The rounding radius is calculated internally from D; there is no separate radius control. The retained playing surface stays on the same circle. Width and maximum thickness remain fixed.

D is a **percentage of the available flat side**, not a distance. How much flat a design leaves depends on its `sideFraction` and thickness, so an absolute millimetre control left most of its range unusable on designs with a thin wall — Meares 2 leaves 0.42 mm where Meares 1 leaves 2.69 mm. As a share, the full 0–99% range is usable on every design, and the millimetre equivalent for the selected fret is shown beside the slider and in the section measurements.

The crown is `(0, 0)` and the underside centre is `(0, -T)`. With `a = W/2`, the playing curve is:

```
y_top(x) = sqrt(R² - x²) - R
```

The underside is a single superellipse. It follows how the board is made: a rectangular blank is radiused on top, the underside is worked down until it rises to meet the blank's original flat face, and the flat left over is softened last with a file. `F` is the flat side still standing before that filing.

```
edge  = sqrt(R² - a²) - R        top corner of the playing arc
side  = edge - F                 foot of the flat, where the underside arrives
b     = side + T                 depth from there to the centre
y_under(x) = side - b (1 - |x/a|ⁿ)^(1/n)
```

Only the exponent `n` is chosen; `a`, `b` and everything else follow from W, R, T and F. The default `n = 1.69` is the joint least-squares fit to both Meares traces with each flat sized to its own corner drop. It is a tuning dial, not a recovered historical construction rule. The presets are Meares-inspired interpretations; the overlays preserve the traced drawings, including their asymmetry.

The superellipse reaches the flat face with a **vertical tangent**, which is what the wood does and what no curve written `y = f(x)` can do — its slope would have to be infinite. The earlier construction needed a separate quintic Bézier purely to bridge that gap, and is kept for comparison as `model: 'quartic'`; it uses six chosen constants where this uses one.

Two costs come with `n < 2`: curvature is unbounded at the centre and at the flat face, where the old Bézier arrived at zero curvature. Both singularities sit within a micron of the extremes, below what any tool resolves in wood. The corner fillet still has tangent continuity (G1) and its curvature changes at the joins.

`F` is leftover stock, not a design proportion, so it only has to outlast the corner drop. It is set as a fraction of T (`sideFraction`, default 0.1). Meares 1 keeps 0.1 for its 2.59 mm drop; Meares 2 uses 0.0164, giving 0.42 mm for its 0.32 mm drop.

Validation rejects incomplete dimensions, insufficient underside depth, nonconvex carving transitions, and corner rounding that consumes the flat side. Bernstein bounds and recursive subdivision check the carving curvature. If a combination is invalid, the section preview asks for valid measurements and geometry downloads are disabled.

The [latest comparison](../analysis/latest-meares-overlay.png) uses a 4 mm corner radius for Meares 1, giving about 2.59 mm of corner drop and 0.10 mm of remaining flat wall at the assumed 60 mm width. This lowers the top corners while preserving the previously accepted underside. Meares 2 retains its 0.5 mm corner radius. These remain symmetric interpretations of asymmetric drawings.

## Paired fret templates

Enter nut width, end width, fingerboard length from the nut, vibrating string length, and maximum thickness at frets 1 and 7. The client uses Overstand's `calculateFretPositions` formula, read from the local `src-ts/geometry_engine.ts`: `x = L (1 - 2^(-n/12))`. With straight sides, `W(x) = W_nut + (W_end - W_nut) x / L_fb`. Frets beyond the board are rejected, not clamped or extrapolated.

Both sections use one shared design; there is no drawing-to-fret assignment. Each uses its calculated width and independently entered thickness. Both sections use one fixed playing radius, taken from the explicit radius input or the shared profile when that input is blank. Thus `R_F1 = R_F7`, and because D is a share of each section's own flat side, the same percentage applies at both frets; in millimetres that still works out as `D_section = D_shared T_section / T_shared`. Both review tabs use the same screen scale and crown alignment; the wider section shows more of the same playing circle. Thickness is never inferred from width. You can adjust the shared profile in the workshop below the paired-template form.

**Import Overstand parameters** reads the `.json` parameter export entirely in the browser. It maps `fingerboard_width_at_nut`, `fingerboard_width_at_end`, `fingerboard_length`, `vsl`, `instrument_name` and optional `fingerboard_radius`. The last value sets the explicit playing radius for both sections. Import clears both maximum-thickness fields for the user to enter; visible-edge heights, Overstand blend percentage and derived board thicknesses are not substituted for them. Invalid files leave existing form values intact. The imported name stays editable, including when it must be shortened to fit the smaller stencil with its F1/F7 suffix.

The shared stencil name receives `F1` and `F7` suffixes. **Download SVG** exports one full-size SVG with two separate plates, separated by 10 mm, with 2 mm viewport margins. The pair is regenerated when measurements, shared design or name change. An invalid section or name disables the whole pair to prevent partial output. The preview shows the actual exported SVG. The app offers SVG and 3MF formats for the same pair; the optional section outline download is in the review step, while both template formats are in the final printing step.

## Direct 3MF download

**Download 3MF** produces two separate named mesh objects and build items, F1 and F7, in millimetres. Both plates lie flat at Z=0 with a **1.5 mm default print thickness**. The Printed plate thickness control changes only the extrusion depth, with a supported range of 0.1–20 mm. SVG outlines and fingerboard maximum thicknesses are unaffected. Open the file in a slicer and choose your printer and material settings; this is a geometry 3MF, not pre-sliced machine instructions.

The exporter follows the [3MF Core specification](https://github.com/3MFConsortium/spec_core/blob/master/3MF%20Core%20Specification.md). It triangulates the actual stencil polygons, preserves the through-cut lettering, joins cap and wall vertices, and writes a ZIP/OPC package containing two meshes. It uses vendored [Earcut 3.2.3](https://github.com/mapbox/earcut/tree/v3.2.3), with its ISC license retained in the source and standalone HTML. Collinear triangulation edges are split to prevent T-junctions. No runtime network calls or package installation are needed.

Checks cover closed edges, consistent face winding, connected solids, open stencil holes, positive volume, Z bounds, and unchanged XY geometry when print thickness changes. All supported letters and digits are exercised. A generated pair was independently read by Bambu Studio 02.08.02.61: both objects reported manifold, one part each, and 1.5 mm thickness. Python ZIP/XML and polygon checks also verified the archive and matching SVG/mesh faces.

## Named underside template

The construction follows [Overstand's radius template](https://github.com/pzfreo/overstand/blob/main/src-ts/radius_template.ts): a solid plate, **5 mm side shoulders**, a **20 mm backing band**, millimetre dimensions, a 2 mm SVG viewport margin, and compound even-odd paths for the stencil lettering. Here the contact edge follows the generated underside, including its lower side blends, rather than extending a circular radius beyond the board width. The name is user supplied.

The bundled Allerta Stencil font is copied from the local Overstand checkout. The browser uses a precomputed vector subset, called Workshop Stencil, so no installed font or runtime font loader is needed. Its original open counters are retained. Font licensing is in `fonts/OFL.txt` and `FONT-LICENSE.txt`; the license is also included in the standalone HTML. `scripts/build_stencil_font.py` at the repository root reproduces the subset from the bundled font and checks for enclosed counters.

Supported names contain Latin A–Z / a–z, digits, spaces and `. - ( )`, up to 32 characters and subject to fitting the plate. Labels fit at a capital height of 4.5–6 mm; names that cannot fit are rejected rather than clipped or shrunk indefinitely.

The template SVG is a **filled 2D extrusion profile**, like the supplied example. Use the 3MF download for already-extruded plates, or import SVG into CAD for further editing. An STL is not generated. Printability of the original font's small bridges depends on the printer and settings; inspect the sliced result. The review step exports the selected F1 or F7 outline at 1:1 scale.

## Checks

`npm test` covers fixed playing circle and unchanged complete underside under corner-rounding changes, sharp corners at zero, exact dimensions, tangent corner fillets, G2 carving joins, convexity, invalid combinations, faithful template contact geometry, stencil input handling and 1:1 SVG units. The stencil polygons were also checked independently with Shapely for containment, nonoverlap and a single connected remaining plate across every supported letter and digit.

The source sketches and detailed digitization analysis remain in the parent repository's `analysis/` directory.
