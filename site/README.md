# Fingerboard Studio

A dependency-free, client-side viol fingerboard designer with four dimensions, Meares reference overlays and named underside checking templates. No accounts, external font requests, backend geometry service or CSV export.

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

## Four dimensions

| Control | Meaning |
| --- | --- |
| Width W | Full physical width between the two side extrema. |
| Crown radius R | Radius of the **fixed circular playing surface**. |
| Maximum thickness T | Vertical separation from the crown to the underside centre. |
| Corner drop D | Vertical distance from the original top corner down to where the rounding meets the side. Zero leaves a sharp corner. |

Changing D leaves the entire underside carving unchanged. It trims only the top corner, joining the fixed playing circle to the flat side with a small circular fillet. The rounding radius is calculated internally from D; there is no separate radius control. Changing width, crown radius or thickness preserves the entered drop. The retained playing surface stays on the same circle. Width and maximum thickness remain fixed.

The crown is `(0, 0)` and the underside centre is `(0, -T)`. With `a = W/2`, the playing curve is:

```
y_top(x) = sqrt(R² - x²) - R
```

The underside is a fixed quartic curve:

```
h = 0.85 T + sqrt(R² - a²) - R
u = x / a
y_under(x) = -T + h (0.85 u² + 0.15 u⁴)
```

The quartic proportions are a chosen design family, not a recovered historical construction rule. They leave room for the side blends while giving a deeper, noncircular underside. The presets are Meares-inspired interpretations; the overlays preserve the traced drawings, including their asymmetry. Overlays are scaled to equal width and aligned at the crown. No original physical dimensions are known.

The construction starts with vertical sides below the playing arc. A nominal flat side of `0.1 T` remains before corner rounding. This retained height is an explicit assumption, not a measurement recovered from the scans. The underside is carved up into the bottom of that wall with a quintic Bézier transition spanning `0.12 W`, matching tangent and curvature at the quartic and the straight wall (G2). The final circular corner fillet has tangent continuity (G1); its curvature changes at the joins.

Validation rejects incomplete dimensions, insufficient underside depth, nonconvex carving transitions, and corner rounding that consumes the flat side. Bernstein bounds and recursive subdivision check the carving curvature. If a combination is invalid, the preview explicitly shows the last valid profile and downloads are disabled.

The [latest comparison](../analysis/latest-meares-overlay.png) uses a 4 mm corner radius for Meares 1, giving about 2.59 mm of corner drop and 0.10 mm of remaining flat wall at the assumed 60 mm width. This lowers the top corners while preserving the previously accepted underside. Meares 2 retains its 0.5 mm corner radius. These remain symmetric interpretations of asymmetric drawings.

## Paired fret templates

Enter nut width, end width, fingerboard length from the nut, vibrating string length, and maximum thickness at frets 1 and 7. The client uses Overstand's `calculateFretPositions` formula, read from the local `src-ts/geometry_engine.ts`: `x = L (1 - 2^(-n/12))`. With straight sides, `W(x) = W_nut + (W_end - W_nut) x / L_fb`. Frets beyond the board are rejected, not clamped or extrapolated.

Both sections use one shared design; there is no drawing-to-fret assignment. Each uses its calculated width and independently entered thickness. The shared profile supplies radius/width and corner-drop/thickness ratios. An optional explicit playing radius overrides radius scaling and stays fixed at both frets. Thus `R_section = R_shared W_section / W_shared` and `D_section = D_shared T_section / T_shared`. Thickness is never inferred from width. You can adjust the shared profile in the workshop below the paired-template form.

**Import Overstand parameters** reads the `.json` parameter export entirely in the browser. It maps `fingerboard_width_at_nut`, `fingerboard_width_at_end`, `fingerboard_length`, `vsl`, `instrument_name` and optional `fingerboard_radius`. The last value sets the explicit playing radius for both sections. Import clears both maximum-thickness fields for the user to enter; visible-edge heights, Overstand blend percentage and derived board thicknesses are not substituted for them. Invalid files leave existing form values intact. The imported name stays editable, including when it must be shortened to fit the smaller stencil with its F1/F7 suffix.

The shared stencil name receives `F1` and `F7` suffixes. **Download both templates** exports one full-size SVG with two separate plates, separated by 10 mm, with 2 mm viewport margins. The pair is regenerated when measurements, shared design or name change. An invalid section or name disables the whole pair to prevent partial output. The preview shows the actual exported SVG. The app has one download action for the pair; separate single-template and outline downloads are not shown.

## Named underside template

The construction follows [Overstand's radius template](https://github.com/pzfreo/overstand/blob/main/src-ts/radius_template.ts): a solid plate, **5 mm side shoulders**, a **20 mm backing band**, millimetre dimensions, a 2 mm SVG viewport margin, and compound even-odd paths for the stencil lettering. Here the contact edge follows the generated underside, including its lower side blends, rather than extending a circular radius beyond the board width. The name is user supplied.

The bundled Allerta Stencil font is copied from the local Overstand checkout. The browser uses a precomputed vector subset, called Workshop Stencil, so no installed font or runtime font loader is needed. Its original open counters are retained. Font licensing is in `fonts/OFL.txt` and `FONT-LICENSE.txt`; the license is also included in the standalone HTML. `scripts/build_stencil_font.py` at the repository root reproduces the subset from the bundled font and checks for enclosed counters.

Supported names contain Latin A–Z / a–z, digits, spaces and `. - ( )`, up to 32 characters and subject to fitting the plate. Labels fit at a capital height of 4.5–6 mm; names that cannot fit are rejected rather than clipped or shrunk indefinitely.

The template SVG is a **filled 2D extrusion profile**, like the supplied example. Import it into a CAD or slicer application with SVG support, preserve millimetres, and extrude to the desired thickness (for example 3 mm). An STL is not generated. Printability of the original font's small bridges depends on the printer and settings; inspect the sliced result. The geometry module also retains a 1:1 outline export helper for programmatic use.

## Checks

`npm test` covers fixed playing circle and unchanged complete underside under corner-rounding changes, sharp corners at zero, exact dimensions, tangent corner fillets, G2 carving joins, convexity, invalid combinations, faithful template contact geometry, stencil input handling and 1:1 SVG units. The stencil polygons were also checked independently with Shapely for containment, nonoverlap and a single connected remaining plate across every supported letter and digit.

The source sketches and detailed digitization analysis remain in the parent repository's `analysis/` directory.
