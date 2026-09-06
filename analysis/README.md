# Meares cross-section tracing and analysis

Both scans support a shallow playing surface, a deeper underside, and rounded transitions at the sides. A **closed periodic cubic B-spline** captures all three regions without imposing sharp intersections or a constant side radius. The central playing surface is nevertheless close to circular: the strongest reason to replace the two-arc model is the side blends, rather than evidence of a radically different central crown.

![Traces over the originals and normalized profiles](tracing-comparison.png)

## Measurements

Dimensions below are divided by each drawing's traced width, **W**. They are image measurements, not physical dimensions or claims about the original maker's construction method.

| Measurement | meares1 | meares2 |
| --- | ---: | ---: |
| Traced width, source pixels | 623 | 758 |
| Maximum thickness / W | 0.448 | 0.426 |
| Playing-surface rise above side datum / W | 0.162 | 0.145 |
| Underside depth below side datum / W | 0.287 | 0.282 |
| Approximate crown radius / W, circle fit to central 60% | 1.171 | 1.156 |
| Approximate underside radius / W, circle fit to central 60% | 0.573 | 0.569 |

The crown radii are finite-window estimates, **not exact local curvature measurements**. The side datum is the average height of the two rounded width extrema after alignment. Rise and depth therefore depend somewhat on how the extremities are traced. Maximum thickness is the largest top-to-bottom separation at a common horizontal coordinate; it is not simply the sum of independently located extrema.

At equal width, meares1 is about 5% thicker than meares2. Their middle-region radii are similar. Their blends differ more visibly: meares1 rolls over more broadly, especially on the left in the normalized view; meares2 has tighter transitions. Both have some left/right differences. The scans alone cannot establish whether these differences are intentional, hand-drawing variation, or reproduction effects.

![Equal-width overlay](normalized-comparison.png)

## Where circles succeed and fail

The following RMS distances are radial distances to independently fitted circles, using only the middle 80% of the width. Circle centers and radii were all free to move; the fits were not forced to meet at the sides.

| Surface | meares1 RMS, pixels | meares2 RMS, pixels |
| --- | ---: | ---: |
| Playing surface | 0.63 | 0.62 |
| Underside | 0.90 | 1.32 |

These small errors mean a circle is a reasonable description of much of the central region at this drawing resolution. Fits over different spans give different radii, especially for meares2's top and both undersides; see `measurements.json` for the 60%, 80%, and 96% fits. This suggests variable curvature but does not establish a unique analytic curve family from these scans.

The dashed circles in the following figure are the same middle-80% fits, extrapolated towards the edges. They visibly miss the top roll-over and do not join into the observed closed outline. A separate side blend is essential. A single ellipse or a different conic would still impose a shape assumption; we have not established either as the maker's intended geometry.

![Enlarged side transitions](side-blends.png)

## Trace representation and design parameters

The exported periodic cubic B-splines provide a practical reference shape. Their position, first derivative, and second derivative match at closure, so the regular curves have continuous tangents and curvature through the sides. They preserve the observed asymmetry. This smoothness is a modeling choice, not a claim that the ink specifies an exact curvature law.

The [client-side generator](../site/README.md) provides **width W, playing-surface radius R, maximum thickness T, and corner drop D**. The playing surface is a fixed circular curve. The latest construction retains a short vertical side, carves a quartic underside up into it with a G2 quintic transition, then rounds the top corner with a small tangent circular fillet. Changing D leaves the whole underside unchanged. The nominal flat-side height of `0.1 T` is an assumption awaiting confirmation.

![Latest construction over the Meares traces](latest-meares-overlay.png)

The Meares 1 preset now lowers the top corners with a 4 mm rounding radius (about 2.59 mm corner drop); its accepted underside is unchanged. Meares 2 retains 0.5 mm rounding. These comparisons use an assumed 60 mm width, aligned by crown and equal width. The app exposes a Corner drop control to set the vertical lowering directly. These are symmetric interpretations, not exact reproductions of the drawings. [The original-scan overlay](latest-source-overlay.png) shows the same model in source coordinates. Run `python scripts/compare_latest_profiles.py` after tracing to reproduce both figures from the current JavaScript generator; this also requires Node.js.

The generator is a symmetric design family inspired by these references, not a deformation of the traced splines. The trace files remain measured reference shapes. The four dimensions still do not uniquely specify every possible outline: the underside's quartic proportions and the blend construction are explicit modeling choices, documented with the generator.

## Method and accuracy

1. Crop around each cross section, excluding the neighbouring longitudinal drawing. Interpret the left-hand outer surface in each original scan as the playing surface, consistent with its gentler curvature.
2. Threshold dark ink at grayscale 128. Use the outermost ink envelope, including the outer line where the source has a double outline. Hatching and the internal material boundary are not treated as surface contours.
3. Estimate orientation from the construction line, then refine it with three rigid rotations using the midpoints of the two rounded extremities. Use translation and uniform scaling; no shear or perspective correction is applied. Normalized left corresponds to the lower end of the original scan.
4. Sample the two envelope branches in one-pixel-wide bins. Interpolate a 19-pixel-wide gap around the crossing construction line, about 3.0% of W in meares1 and 2.5% in meares2. The trace CSV marks interpolated samples with `observed_not_interpolated = 0`. Apply a three-sample median filter to reduce raster spikes. Even observed samples are filtered measurements of the ink envelope.
5. Join the branches around the extremities, resample uniformly by perimeter distance, and fit a periodic cubic spline with a 0.9-source-pixel smoothing target. The short end closures are also reconstructed between the sampled envelope branches.
6. Export the fitted contour and compare it with the extracted envelope. Verify closure through the second derivative, finite coordinates, noncrossing envelope branches, and consistently signed curvature at 6,001 spline samples.

The fitted curves have RMS nearest-sampled-curve distances of **0.65 px** (meares1) and **0.64 px** (meares2) to the extracted envelope. Maximum distances are **2.51 px** and **5.13 px**, respectively; the tighter meares2 side is less faithfully retained by the smooth model. These are in-sample approximation errors, not independent validation or absolute measurement accuracy. Convexity was checked densely, not proved analytically.

Ink thickness, doubled outlines, endpoint selection and possible scan distortion limit accuracy. The envelope is the outside of the ink rather than an inferred stroke centre, so it can slightly overestimate width and thickness. Subpixel fit statistics should not be interpreted as subpixel knowledge of the original object. No physical scale, exact side radius, or manufacturing tolerance can be recovered from these images alone.

## Files and reproduction

- `meares1-trace.csv`, `meares2-trace.csv`: sampled top and underside, normalized by source width; includes interpolation flags.
- `meares1-contour.csv`, `meares2-contour.csv`: 1,201 ordered points around each fitted closed outline, including the repeated endpoint.
- `meares1-outline.svg`, `meares2-outline.svg`: sampled vector outlines. SVG coordinates use 1,000 units per source width; they are not millimetres. Smoothing may move the extrema slightly.
- `meares1-spline.json`, `meares2-spline.json`: exact cubic spline knots and control coefficients, plus the source-coordinate transformation. Evaluate with SciPy `splev(t, (knots, np.array(coefficients).T, degree))`, for `0 <= t <= 1`.
- `measurements.json`: full numeric measurements and circle/spline fit diagnostics.
- PNG and SVG comparison figures: source overlays, normalized comparison, and side enlargements.

To regenerate from the unmodified source PNGs:

```sh
python3 -m venv .venv
.venv/bin/pip install -r analysis/requirements.txt
.venv/bin/python scripts/analyse_profiles.py
```

The script contains explicit source-specific crops and alignment estimates. It is reproducible tracing for these two drawings, not a general image-segmentation tool.
