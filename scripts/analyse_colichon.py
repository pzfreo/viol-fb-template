#!/usr/bin/env python3
"""Trace the Colichon treble and bass fingerboard sections and compare underside curves.

Unlike the Meares sections these end in a sharp corner: the underside runs up to
meet the playing surface at an angle, with no vertical side and no roll-over.
Coordinates: x across the width, y towards the playing surface, origin midway
between the two corners. The bass sheet is dimensioned, so it is also reported in
millimetres; the treble sheet carries no scale and stays in width units.
"""
from pathlib import Path
import csv
import json

import numpy as np
from PIL import Image
from scipy import ndimage
from scipy.optimize import least_squares
from scipy.spatial import cKDTree
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'analysis'
TOP, BOTTOM, ARC, SUPER, PARA = '#007d91', '#bd5426', '#a26700', '#6d43a0', '#1b7f4b'

# crop: (left, top, right, bottom) in source pixels.
# width_axis: image axis the fingerboard width runs along; top_side: where the
# playing surface lies on the other axis. erase: rectangles (source pixels) blanked
# before tracing to detach labels and arrow shafts. gaps: spans along the width
# axis (source pixels) where an arrowhead or tick touches the outline; these are
# interpolated and flagged in the CSV. corners: on the bass sketch arrows and
# ticks sit on both corners, so the corners are located by eye (source pixels,
# about +-1 px) and the gaps beside them are interpolated to those points.
CONFIG = {
    'colichon-treble-a': dict(
        file='colichon-treble.jpg', instrument='treble', label="A-A'",
        crop=(225, 430, 560, 1130), width_axis='y', top_side='low',
        erase=[], gaps=dict(top=[], bottom=[])),
    'colichon-treble-b': dict(
        file='colichon-treble.jpg', instrument='treble', label='B-B',
        crop=(1530, 380, 1940, 1160), width_axis='y', top_side='low',
        erase=[(1500, 340, 1602, 470), (1690, 340, 1715, 421), (1780, 340, 1990, 420),
               (1815, 420, 1990, 495), (1842, 495, 1990, 530)],
        gaps=dict(top=[(436, 468)], bottom=[(526, 564)])),
    'colichon-bass-1': dict(
        file='colichon-bass.jpg', instrument='bass', label='61.5 wide',
        crop=(251, 70, 623, 222), width_axis='x', top_side='low',
        corners=((252, 111), (621, 115)),
        width_mm=61.5, thickness_mm=21.0, edge_mm=(3.5, 3.5),
        erase=[(617, 50, 700, 110)],
        gaps=dict(top=[(251, 256), (440, 468), (612, 623)], bottom=[(251, 258), (428, 452), (606, 623)])),
    'colichon-bass-2': dict(
        file='colichon-bass.jpg', instrument='bass', label='74.5 wide',
        crop=(215, 1255, 657, 1462), width_axis='x', top_side='low',
        corners=((217, 1325), (654, 1327)),
        width_mm=74.5, thickness_mm=29.6, edge_mm=(6.0, 6.5),
        erase=[(205, 1355, 229, 1364), (643, 1355, 680, 1364), (642, 1362, 680, 1400),
               (646, 1230, 720, 1318)],
        gaps=dict(top=[(215, 222), (438, 456), (646, 657)], bottom=[(215, 222), (420, 442), (648, 657)])),
}


def trace(cfg, threshold=140):
    im = np.array(Image.open(ROOT / cfg['file']).convert('L'))
    ink = im < threshold
    for l, t, r, b in cfg['erase']:
        ink[t:b, l:r] = False
    l, t, r, b = cfg['crop']
    window = np.zeros_like(ink)
    window[t:b, l:r] = ink[t:b, l:r]
    labels, count = ndimage.label(window, structure=np.ones((3, 3)))
    sizes = ndimage.sum(window, labels, range(1, count + 1))
    ys, xs = np.where(labels == 1 + int(np.argmax(sizes)))
    # u runs along the width, v towards the playing surface.
    u, w = (ys, xs) if cfg['width_axis'] == 'y' else (xs, ys)
    v = -w if cfg['top_side'] == 'low' else w
    anchors = None
    if 'corners' in cfg:
        anchors = np.array([(c[0], -c[1]) if cfg['top_side'] == 'low' else c for c in cfg['corners']], float)
        us = np.arange(int(anchors[0, 0]), int(anchors[1, 0]) + 1)
    else:
        us = np.arange(u.min(), u.max() + 1)
    top = np.array([v[u == a].max() if np.any(u == a) else np.nan for a in us], float)
    bottom = np.array([v[u == a].min() if np.any(u == a) else np.nan for a in us], float)
    observed, traced = {}, {}
    for name, values in [('top', top), ('bottom', bottom)]:
        ok = np.isfinite(values)
        for a, c in cfg['gaps'][name]:
            ok &= ~((us >= a) & (us <= c))
        observed[name] = ok
        known_u, known_v = us[ok], values[ok]
        if anchors is not None:
            known_u = np.r_[anchors[0, 0], known_u, anchors[1, 0]]
            known_v = np.r_[anchors[0, 1], known_v, anchors[1, 1]]
        traced[name] = ndimage.median_filter(np.interp(us, known_u, known_v), 3, mode='nearest')
    top, bottom = traced['top'], traced['bottom']
    # The corners are the ends of the envelope. Rotate rigidly so both sit at y = 0.
    tips = (anchors if anchors is not None else
            np.array([[us[0], (top[0] + bottom[0]) / 2], [us[-1], (top[-1] + bottom[-1]) / 2]]))
    axis = tips[1] - tips[0]
    width = float(np.linalg.norm(axis))
    axis /= width
    normal = np.array([-axis[1], axis[0]])
    mid = tips.mean(axis=0)
    out = {}
    for name, values in [('top', top), ('bottom', bottom)]:
        p = np.c_[us, values] - mid
        out[name] = np.c_[p @ axis, p @ normal] / width
    return dict(image=im, us=us, top_px=top, bottom_px=bottom, width_px=width,
                tilt_degrees=float(np.degrees(np.arctan2(axis[1], axis[0]))),
                observed=observed, **out)


def nearest(points, curve):
    return cKDTree(curve).query(points)[0]


def rms(values):
    return float(np.sqrt(np.mean(np.square(values))))


def arc(depth, samples=4000, sign=-1):
    """Circular arc through both corners (+-0.5, 0) with the given sagitta."""
    radius = (.25 + depth ** 2) / (2 * depth)
    x = np.linspace(-.5, .5, samples)
    return np.c_[x, sign * (np.sqrt(radius ** 2 - x ** 2) - (radius - depth))], radius


def clipped_superellipse(a, b, n, samples=6000):
    """Lower part of (x/a)^n + ((y-y0)/b)^n = 1 cut off at the corners (+-0.5, 0).

    a > 0.5: the corners lie inside the full curve's width, so it arrives at an
    angle instead of the vertical tangent the Meares model relies on.
    """
    x = np.linspace(-.5, .5, samples)
    shape = lambda q: b * (1 - np.abs(q / a) ** n) ** (1 / n)
    return np.c_[x, -(shape(x) - shape(.5))]


def fit_underside(points, width_px):
    depth0 = float(-points[:, 1].min())
    inner = np.abs(points[:, 0]) <= .3
    fits = {}

    def record(name, curve, **extra):
        d = nearest(points, curve) * width_px
        slope = (curve[-1, 1] - curve[-40, 1]) / (curve[-1, 0] - curve[-40, 0])
        fits[name] = dict(rms_px=rms(d), rms_px_central_60=rms(d[inner]), rms_px_outer=rms(d[~inner]),
                          max_px=float(d.max()), depth_over_width=float(-curve[:, 1].min()),
                          corner_angle_from_chord_degrees=float(np.degrees(np.arctan(slope))), **extra)
        return curve

    f = least_squares(lambda p: nearest(points, arc(p[0])[0]), [depth0], bounds=([.05], [.49]))
    curves = {'circular_arc': record('circular_arc', arc(f.x[0])[0], radius_over_width=float(arc(f.x[0])[1]))}
    f = least_squares(lambda p: nearest(points, clipped_superellipse(*p)), [.6, depth0 * 1.3, 1.8],
                      bounds=([.5, .05, 1.02], [3, 3, 6]))
    curves['clipped_superellipse'] = record('clipped_superellipse', clipped_superellipse(*f.x),
                                            half_width_a_over_width=float(f.x[0]),
                                            semi_depth_b_over_width=float(f.x[1]), exponent_n=float(f.x[2]))
    # a = 0.5 puts the superellipse's own widest point on the top corner. That is
    # the Studio's Meares model with no corner rounding and no flat side, so these
    # three say how far the existing generator is from Colichon.
    f = least_squares(lambda p: nearest(points, clipped_superellipse(.5, *p)), [depth0, 1.8],
                      bounds=([.05, 1.02], [3, 6]))
    curves['full_width_superellipse'] = record('full_width_superellipse', clipped_superellipse(.5, *f.x),
                                               half_width_a_over_width=.5, exponent_n=float(f.x[1]))
    for n in (1.69, 2.0):
        f = least_squares(lambda p: nearest(points, clipped_superellipse(.5, p[0], n)), [depth0], bounds=([.05], [3]))
        key = f'full_width_superellipse_n_{n:g}'
        curves[key] = record(key, clipped_superellipse(.5, f.x[0], n), half_width_a_over_width=.5, exponent_n=n)
    return fits, curves


def fit_top(points, width_px):
    f = least_squares(lambda p: nearest(points, arc(p[0], sign=1)[0]), [float(points[:, 1].max())],
                      bounds=([.01], [.4]))
    curve, radius = arc(f.x[0], sign=1)
    return dict(rise_over_width=float(f.x[0]), radius_over_width=float(radius),
                rms_px=rms(nearest(points, curve) * width_px)), curve


def main():
    plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 10,
                         'axes.spines.top': False, 'axes.spines.right': False})
    fig, axes = plt.subplots(len(CONFIG), 3, figsize=(15, 4.2 * len(CONFIG)),
                             gridspec_kw={'width_ratios': [1, 2, 1.1]})
    report = {}
    for row, (name, cfg) in enumerate(CONFIG.items()):
        z = trace(cfg)
        top, bottom, w = z['top'], z['bottom'], z['width_px']
        top_fit, top_curve = fit_top(top[z['observed']['top']], w)
        fits, curves = fit_underside(bottom[z['observed']['bottom']], w)
        grid = np.linspace(-.5, .5, 2001)
        thickness = np.interp(grid, top[:, 0], top[:, 1]) - np.interp(grid, bottom[:, 0], bottom[:, 1])
        entry = dict(instrument=cfg['instrument'], section=cfg['label'], source_width_px=w,
                     source_tilt_degrees=z['tilt_degrees'],
                     top_rise_over_width=float(top[:, 1].max()),
                     underside_depth_over_width=float(-bottom[:, 1].min()),
                     maximum_thickness_over_width=float(thickness.max()),
                     playing_surface_circle=top_fit, underside_fits=fits)
        if 'width_mm' in cfg:
            mm = cfg['width_mm']
            entry['millimetres'] = dict(
                stated_width=mm, stated_thickness=cfg['thickness_mm'], stated_edge_heights=cfg['edge_mm'],
                traced_thickness=float(thickness.max() * mm), top_rise=float(top[:, 1].max() * mm),
                underside_depth=float(-bottom[:, 1].min() * mm),
                playing_surface_radius=top_fit['radius_over_width'] * mm,
                underside_arc_radius=fits['circular_arc']['radius_over_width'] * mm,
                px_per_mm=w / mm)
        report[name] = entry
        with (OUT / f'{name}-trace.csv').open('w', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(['surface', 'x_over_width', 'y_over_width', 'observed_not_interpolated'])
            for surface in ['top', 'bottom']:
                writer.writerows((surface, f'{x:.6f}', f'{y:.6f}', int(o))
                                 for (x, y), o in zip(z[surface], z['observed'][surface]))

        ax = axes[row, 0]
        ax.imshow(z['image'], cmap='gray', vmin=0, vmax=255)
        for surface, color in [('top', TOP), ('bottom', BOTTOM)]:
            v = z[surface + '_px'] * (-1 if cfg['top_side'] == 'low' else 1)
            xy = (v, z['us']) if cfg['width_axis'] == 'y' else (z['us'], v)
            ax.plot(*xy, color=color, lw=1.1)
            gap = ~z['observed'][surface]
            ax.plot(np.asarray(xy[0])[gap], np.asarray(xy[1])[gap], '.', color='#ffcc00', ms=2.5)
        l, t, r, b = cfg['crop']
        ax.set(xlim=(l - 12, r + 12), ylim=(b + 12, t - 12))
        ax.set_title(f'{name}\nyellow = interpolated', fontsize=9, loc='left')
        ax.axis('off')

        styles = [('circular_arc', ARC, '--', 'Circular arc'),
                  ('clipped_superellipse', SUPER, '-', 'Superellipse, a and n free'),
                  ('full_width_superellipse_n_2', PARA, '-.', 'Half ellipse to the corner (n = 2)'),
                  ('full_width_superellipse_n_1.69', '#c0407f', ':', 'Meares exponent to the corner (n = 1.69)')]
        for col, (xlim, ylim) in [(1, ((-.53, .53), (-.39, .17))), (2, ((.30, .52), (-.21, .03)))]:
            ax = axes[row, col]
            ax.plot(top[:, 0], top[:, 1], color=TOP, lw=2.6, alpha=.8, label='Playing-surface trace')
            ax.plot(bottom[:, 0], bottom[:, 1], color=BOTTOM, lw=2.6, alpha=.8, label='Underside trace')
            ax.plot(top_curve[:, 0], top_curve[:, 1], color='#333', lw=.9, ls='--', label='Circle through corners (top)')
            for key, color, ls, label in styles:
                ax.plot(curves[key][:, 0], curves[key][:, 1], color=color, ls=ls, lw=1.3,
                        label=f'{label} · {fits[key]["rms_px"]:.2f} px')
            ax.axhline(0, color='#c2c6ca', lw=.6)
            ax.set(xlim=xlim, ylim=ylim, xlabel='Across fingerboard / width')
            ax.set_aspect('equal'); ax.grid(alpha=.18)
        axes[row, 1].set_title(f'{cfg["instrument"]} {cfg["label"]} · thickness / width = '
                               f'{entry["maximum_thickness_over_width"]:.3f}', loc='left')
        axes[row, 1].legend(fontsize=7.5, loc='upper center', ncol=3, bbox_to_anchor=(.5, -.2))
        axes[row, 2].set_title('Right corner', loc='left')
    fig.suptitle('Colichon fingerboard sections: traces and underside candidates', fontsize=16)
    fig.tight_layout(rect=(0, 0, 1, .975), h_pad=4.5)
    fig.savefig(OUT / 'colichon-comparison.png', dpi=150)
    fig.savefig(OUT / 'colichon-comparison.svg')
    (OUT / 'colichon-measurements.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
