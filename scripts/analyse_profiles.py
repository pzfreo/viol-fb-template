#!/usr/bin/env python3
"""Trace the Meares scans and export normalized contours, periodic splines and plots.

Run from any directory with Python plus analysis/requirements.txt installed.
Coordinates: x across width (scan bottom to top), y towards the playing surface.
All lengths are divided by the original traced width; no physical scale is known.
"""
from pathlib import Path
import csv
import json

import numpy as np
from PIL import Image
from scipy.interpolate import splprep, splev
from scipy.ndimage import median_filter
from scipy.optimize import least_squares
from scipy.spatial import cKDTree
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'analysis'
CONFIG = {
    'meares1': dict(crop=(205, 205, 505, 838), origin=(368, 526), slope=60 / 459),
    'meares2': dict(crop=(90, 110, 430, 877), origin=(350, 510), slope=74 / 550),
}
TOP, BOTTOM, FIT, CIRCLE = '#007d91', '#bd5426', '#6d43a0', '#a26700'


def trace(name, cfg, threshold=128):
    im = np.array(Image.open(ROOT / f'{name}.png').convert('L'))
    y, x = np.where(im < threshold)
    l, t, r, b = cfg['crop']
    keep = (x >= l) & (x < r) & (y >= t) & (y < b)
    points = np.c_[x[keep], y[keep]]
    normal = np.array([1., cfg['slope']])
    normal /= np.linalg.norm(normal)
    across = np.array([normal[1], -normal[0]])
    # Refine the width direction with rigid rotations using the midpoints of the
    # two rounded extremities. No perspective correction or shear is applied.
    for iteration in range(4):
        u = (points - cfg['origin']) @ across
        v = -(points - cfg['origin']) @ normal
        bins = np.round(u).astype(int)
        us = np.arange(bins.min(), bins.max() + 1)
        bottom = np.array([v[bins == a].min() if np.any(bins == a) else np.nan for a in us])
        top = np.array([v[bins == a].max() if np.any(bins == a) else np.nan for a in us])
        # The construction line crosses the outline here. Reconstruct this small
        # gap from adjacent samples; the CSV explicitly marks interpolation.
        observed = (np.abs(us) > 9) & np.isfinite(bottom) & np.isfinite(top)
        bottom = median_filter(np.interp(us, us[observed], bottom[observed]), 3)
        top = median_filter(np.interp(us, us[observed], top[observed]), 3)
        width = float(np.ptp(us))
        tip_y = [(bottom[0] + top[0]) / 2, (bottom[-1] + top[-1]) / 2]
        if iteration < 3:
            across = across - (tip_y[1] - tip_y[0]) / width * normal
            across /= np.linalg.norm(across)
            normal = np.array([-across[1], across[0]])
    xs = (us - (us[0] + us[-1]) / 2) / width
    datum = float(np.mean(tip_y))
    return dict(image=im, x=xs, top=(top - datum) / width,
                bottom=(bottom - datum) / width, width=width, us=us,
                top_px=top, bottom_px=bottom, datum=datum, across=across,
                normal=normal, observed=observed, tip_y=tip_y)


def fit_circle(x, y, surface, width, span):
    mask = np.abs(x) < span
    def residual(p):
        return np.hypot(x[mask] - p[0], y[mask] - p[1]) - p[2]
    fit = least_squares(residual, [0, -.7 if surface == 'top' else .3, .8])
    return dict(center=fit.x[:2].tolist(), radius=float(fit.x[2]),
                rms_px=float(np.sqrt(np.mean(residual(fit.x) ** 2)) * width),
                fit_width_fraction=2 * span)


def circle_y(x, model, surface):
    h, k = model['center']
    return k + (1 if surface == 'top' else -1) * np.sqrt(
        np.maximum(0, model['radius'] ** 2 - (x - h) ** 2))


def make_spline(z):
    x = z['x']
    raw = np.r_[np.c_[x, z['top']], np.c_[x[::-1], z['bottom'][::-1]]]
    raw = np.r_[raw, raw[:1]]
    distance = np.r_[0, np.cumsum(np.linalg.norm(np.diff(raw, axis=0), axis=1))]
    keep = np.r_[True, np.diff(distance) > 1e-9]
    raw, distance = raw[keep], distance[keep]
    uniform = np.array([np.interp(np.linspace(0, distance[-1], 1201), distance, raw[:, j])
                        for j in range(2)])
    # Smoothing is in source pixels, avoiding a different relative tolerance per scan.
    tck, _ = splprep(uniform, s=1201 * (.9 / z['width']) ** 2, per=True)
    ts = np.linspace(0, 1, 6001)
    fitted = np.array(splev(ts, tck)).T
    error = cKDTree(fitted).query(raw)[0] * z['width']
    d1, d2 = (np.array(splev(ts, tck, der=i)).T for i in [1, 2])
    signed_curvature = (d1[:, 0] * d2[:, 1] - d1[:, 1] * d2[:, 0]) / np.linalg.norm(d1, axis=1) ** 3
    # Checks apply to these traces; they are not general manufacturing constraints.
    assert np.isfinite(fitted).all()
    assert np.all(z['top'] >= z['bottom'])
    for derivative in [0, 1, 2]:
        assert np.allclose(splev(0, tck, der=derivative), splev(1, tck, der=derivative), atol=1e-8)
    assert np.all(signed_curvature < 0), 'Unexpected inflection in smoothed outline'
    assert error.max() < 6, 'Trace fit exceeds six source pixels'
    return tck, fitted, dict(rms_distance_px=float(np.sqrt(np.mean(error ** 2))),
                            max_distance_px=float(error.max()),
                            control_point_count=len(tck[1][0]),
                            convex_at_6001_samples=True)


def save_csv(path, header, rows):
    with path.open('w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(header)
        writer.writerows(rows)


def save_outline_svg(name, curve):
    # SVG viewport units are normalized width units x 1000, not millimetres.
    coords = ' '.join(f'{1000*x:.4f},{-1000*y:.4f}' for x, y in curve[::5])
    (OUT / f'{name}-outline.svg').write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="-520 -190 1040 510">\n'
        f'<title>{name}: normalized traced outline, width approximately 1000 units</title>\n'
        f'<polygon points="{coords}" fill="none" stroke="#182d3c" stroke-width="1.5"/>\n</svg>\n')


def main():
    OUT.mkdir(exist_ok=True)
    plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 10,
                         'axes.spines.top': False, 'axes.spines.right': False})
    fig, axes = plt.subplots(2, 2, figsize=(13, 10), gridspec_kw={'width_ratios': [1, 2.2]})
    edges, edge_axes = plt.subplots(2, 2, figsize=(12, 8))
    comparison, comp_ax = plt.subplots(figsize=(11, 5))
    report = {}
    for row, (name, cfg) in enumerate(CONFIG.items()):
        z = trace(name, cfg)
        tck, curve, spline_metrics = make_spline(z)
        x, w = z['x'], z['width']
        circles = {surface: {str(int(span * 200)): fit_circle(x, z[surface], surface, w, span)
                             for span in [.3, .4, .48]}
                   for surface in ['top', 'bottom']}
        metrics = dict(source_width_px=w, top_rise_over_width=float(z['top'].max()),
                       underside_depth_over_width=float(-z['bottom'].min()),
                       maximum_thickness_over_width=float(np.max(z['top'] - z['bottom'])),
                       circle_fits=circles, spline=spline_metrics,
                       symmetry_rms_over_width={s: float(np.sqrt(np.mean(((z[s] - z[s][::-1]) / 2) ** 2)))
                                                for s in ['top', 'bottom']})
        report[name] = metrics
        save_csv(OUT / f'{name}-trace.csv',
                 ['x_over_width', 'top_y_over_width', 'underside_y_over_width', 'observed_not_interpolated'],
                 zip(x, z['top'], z['bottom'], z['observed'].astype(int)))
        save_csv(OUT / f'{name}-contour.csv', ['x_over_width', 'y_over_width'], curve[::5])
        (OUT / f'{name}-spline.json').write_text(json.dumps(dict(
            description='Periodic cubic B-spline, x across fingerboard, y toward playing surface; source width = 1',
            parameter_domain=[0, 1], degree=int(tck[2]), knots=tck[0].tolist(),
            coefficients=np.array(tck[1]).T.tolist(),
            source_alignment=dict(**cfg, residual_tip_heights_px=z['tip_y'], width_px=w,
                                  across_unit_vector=z['across'].tolist(),
                                  normal_unit_vector=z['normal'].tolist(),
                                  u_midpoint_px=float((z['us'][0] + z['us'][-1]) / 2),
                                  v_datum_px=z['datum']),
            smoothing_target_px=.9), indent=2) + '\n')
        save_outline_svg(name, curve)
        ax = axes[row, 0]
        ax.imshow(z['image'], cmap='gray', vmin=0, vmax=255)
        for surface, color in [('top', TOP), ('bottom', BOTTOM)]:
            p = np.array(cfg['origin']) + z['us'][:, None] * z['across'] - z[surface + '_px'][:, None] * z['normal']
            ax.plot(p[:, 0], p[:, 1], color=color, lw=1.2)
        l, t, r, b = cfg['crop']
        ax.set(xlim=(l-15, r+15), ylim=(b+15, t-15), title=f'{name} · trace over source')
        ax.axis('off')
        ax = axes[row, 1]
        for surface, color, label in [('top', TOP, 'Playing-surface trace'), ('bottom', BOTTOM, 'Underside trace')]:
            ax.plot(x, z[surface], color=color, lw=2.4, label=label)
            ax.plot(x, circle_y(x, circles[surface]['80'], surface), '--', color=CIRCLE, lw=1.2,
                    label='Circles fitted to middle 80%' if surface == 'top' else None)
        ax.plot(curve[:, 0], curve[:, 1], color=FIT, lw=.9, label='Closed cubic spline')
        ax.axhline(0, color='#c2c6ca', lw=.6)
        ax.set(title=f'{name} · width = 1; thickness = {metrics["maximum_thickness_over_width"]:.3f}',
               xlabel='Across fingerboard / width', ylabel='Height / width', xlim=(-.53, .53), ylim=(-.32, .20))
        ax.set_aspect('equal'); ax.grid(alpha=.18)
        if row == 0:
            ax.set_xlabel('')
        if row == 0:
            ax.legend(loc='lower center', bbox_to_anchor=(.5, 1.04), ncol=2, fontsize=9)
        for side, bounds in enumerate([(-.515, -.36), (.36, .515)]):
            ea = edge_axes[row, side]
            for surface, color in [('top', TOP), ('bottom', BOTTOM)]:
                ea.plot(x, z[surface], color=color, lw=3, alpha=.6)
                ea.plot(x, circle_y(x, circles[surface]['80'], surface), '--', color=CIRCLE, lw=1.3)
            ea.plot(curve[:, 0], curve[:, 1], color=FIT, lw=1.2)
            ea.set(xlim=bounds, ylim=(-.10, .10), title=f'{name} · {"left" if side == 0 else "right"} side',
                   xlabel='Across fingerboard / width', ylabel='Height / width')
            ea.set_aspect('equal'); ea.grid(alpha=.2)
        comp_ax.plot(curve[:, 0], curve[:, 1], color=[TOP, BOTTOM][row], lw=2, label=name)
    fig.suptitle('Meares fingerboard cross sections', fontsize=18, y=.99)
    fig.text(.5, .012, 'Outer ink envelope · construction-line crossings interpolated · no physical scale supplied', ha='center', color='#555555')
    fig.tight_layout(rect=(0, .035, 1, .95))
    fig.subplots_adjust(hspace=.30)
    edges.suptitle('Side blends · source trace (teal / rust), closed spline (purple), circles (dashed)', fontsize=13)
    edges.tight_layout(rect=(0, 0, 1, .95))
    comp_ax.set(title='The two outlines at equal width', xlabel='Across fingerboard / width', ylabel='Height / width')
    comp_ax.set_aspect('equal'); comp_ax.grid(alpha=.2); comp_ax.legend()
    comparison.tight_layout()
    for f, filename in [(fig, 'tracing-comparison'), (edges, 'side-blends'), (comparison, 'normalized-comparison')]:
        f.savefig(OUT / f'{filename}.png', dpi=170)
        f.savefig(OUT / f'{filename}.svg')
    (OUT / 'measurements.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
