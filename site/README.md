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
| Corner rounding D | How far the top edge is filed down, in millimetres at the selected fret. Zero leaves a sharp corner. This is the only control over the section below the crown: the shaping stops 0.1 mm below wherever the file reaches. |

D is the single control over the section. The flat side left on the blank is derived from it:

```
F = D + 0.1 mm
```

so shaping always stops a hair below wherever the file will reach. Both Meares drawings already
followed that rule — each leaves 0.10 mm of flat once its corner is eased — and deriving F this
way reproduces both presets to within microns while matching the traces exactly as well.

That makes D the whole story: the playing circle, width and maximum thickness stay fixed, and
everything below the crown follows from D. The cost is that the underside template now moves
with D, where it used to be independent of it. Physically that is the honest order: to know
where to stop shaping you have to know how much you intend to file off. Generate the template
after settling the rounding.

The 0.1 mm allowance is absolute, not a proportion, because it is a workshop constant rather
than a design ratio. Scaled sections are therefore not exactly similar — F1 and F7 depart from
exact similarity by at most that allowance, about 27 microns on the smaller section.

`model: 'quartic'` keeps the earlier behaviour, including its fixed `0.1 T` flat side and its
independence from D, for comparison.

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
