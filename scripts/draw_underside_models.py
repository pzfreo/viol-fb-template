#!/usr/bin/env python3
"""One diagram per underside model: its formula, what each symbol means, and the
curve laid over the traces it was fitted to.

Every schematic is drawn at 60 mm width so the five can be compared directly.
Trace panels are in width units, as traced. Fitted values are read from
analysis/superellipse-fit.json and analysis/colichon-measurements.json, and the
Meares models come from the JavaScript generator itself, so nothing is retyped.
"""
from pathlib import Path
import csv
import json
import subprocess

import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.gridspec import GridSpecFromSubplotSpec

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'analysis' / 'underside-models'
W = 60.0
WOOD, EDGE, TRACE, TOPTRACE = '#ecd9b6', '#3b2a1a', '#2f8a99', '#b9b9b9'
CURVE, CURVE2, FLAT, MARK, DIM = '#6b3fa0', '#d0731f', '#1b7f4b', '#c0392b', '#555555'

program = ("import {generate,PRESETS} from './site/src/profile.js';"
           "const out={};for(const [n,p] of Object.entries(PRESETS)){"
           "for(const m of ['quartic','superellipse']){const g=generate({...p,model:m});"
           "out[n+':'+m]={points:g.points,underside:g.underside,edgeY:g.edgeY,sideY:g.sideY,"
           "underJoinX:g.underJoinX,cornerTop:g.corner.sideTopY,joinX:g.joinX,params:g.params}}}"
           "console.log(JSON.stringify(out))")
GEN = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', program], cwd=ROOT, text=True))
MEARES_FIT = json.loads((ROOT / 'analysis' / 'superellipse-fit.json').read_text())
MEARES_MEAS = json.loads((ROOT / 'analysis' / 'measurements.json').read_text())
COL = json.loads((ROOT / 'analysis' / 'colichon-measurements.json').read_text())


def meares_trace(name):
    rows = list(csv.DictReader((ROOT / 'analysis' / f'{name}-trace.csv').open()))
    x = np.array([float(r['x_over_width']) for r in rows])
    return (np.c_[x, [float(r['top_y_over_width']) for r in rows]],
            np.c_[x, [float(r['underside_y_over_width']) for r in rows]])


def colichon_trace(name):
    rows = list(csv.DictReader((ROOT / 'analysis' / f'{name}-trace.csv').open()))
    pick = lambda s: np.array([[float(r['x_over_width']), float(r['y_over_width'])] for r in rows if r['surface'] == s])
    return pick('top'), pick('bottom')


def superellipse(a, b, n, y0, half_width=None, samples=3000):
    """Lower half of |x/a|^n + |(y - y0)/b|^n = 1, optionally cut at |x| = half_width."""
    t = np.linspace(np.pi, 2 * np.pi, samples)
    c, s = np.cos(t), np.sin(t)
    p = np.c_[a * np.sign(c) * np.abs(c) ** (2 / n), y0 + b * np.sign(s) * np.abs(s) ** (2 / n)]
    return p if half_width is None else p[np.abs(p[:, 0]) <= half_width + 1e-12]


def full_superellipse(a, b, n, y0, samples=3000):
    t = np.linspace(0, 2 * np.pi, samples)
    c, s = np.cos(t), np.sin(t)
    return np.c_[a * np.sign(c) * np.abs(c) ** (2 / n), y0 + b * np.sign(s) * np.abs(s) ** (2 / n)]


def crown(rise, width=W, samples=400):
    """Circular playing surface through the corners at y = 0, rising `rise` at the centre."""
    h = width / 2
    r = (h * h + rise * rise) / (2 * rise)
    x = np.linspace(-h, h, samples)
    return np.c_[x, np.sqrt(r * r - x * x) - (r - rise)]


def section(ax, top, under, extra=None):
    """Fill the wood and outline it. top runs left to right, under runs left to right."""
    outline = np.r_[top, (extra if extra is not None else np.empty((0, 2))), under[::-1]]
    ax.fill(outline[:, 0], outline[:, 1], color=WOOD, zorder=1)
    ax.plot(top[:, 0], top[:, 1], color=EDGE, lw=2, zorder=3)


def dim_h(ax, x0, x1, y, text, color=DIM, above=True):
    ax.annotate('', (x1, y), (x0, y), arrowprops=dict(arrowstyle='<->', color=color, lw=1.1, shrinkA=0, shrinkB=0), zorder=6)
    ax.text((x0 + x1) / 2, y + (0.8 if above else -0.8), text, color=color, ha='center',
            va='bottom' if above else 'top', fontsize=12, zorder=6)


def dim_v(ax, x, y0, y1, text, color=DIM, side='right'):
    ax.annotate('', (x, y1), (x, y0), arrowprops=dict(arrowstyle='<->', color=color, lw=1.1, shrinkA=0, shrinkB=0), zorder=6)
    ax.text(x + (0.8 if side == 'right' else -0.8), (y0 + y1) / 2, text, color=color,
            ha='left' if side == 'right' else 'right', va='center', fontsize=12, zorder=6)


def style_schematic(ax, ylim=(-30, 12), xlim=(-40, 40)):
    ax.set_aspect('equal'); ax.set_xlim(*xlim); ax.set_ylim(*ylim); ax.axis('off')
    ax.set_title('What the symbols mean (drawn at 60 mm width)', fontsize=11, loc='left', color='#333')


def trace_panel(ax, top, under, curves, title):
    ax.plot(top[:, 0], top[:, 1], color=TOPTRACE, lw=1.4)
    ax.plot(under[:, 0], under[:, 1], color=TRACE, lw=3, alpha=.75, label='traced underside')
    for c, label, color, ls in curves:
        ax.plot(c[:, 0], c[:, 1], color=color, lw=1.6, ls=ls, label=label)
    ax.set_aspect('equal'); ax.set_xlim(-.55, .55); ax.set_ylim(-.58, .19)
    ax.grid(alpha=.18); ax.tick_params(labelsize=8)
    ax.spines[['top', 'right']].set_visible(False)
    ax.set_title(title, fontsize=10.5, loc='left')
    ax.legend(fontsize=8, loc='lower center', frameon=False, bbox_to_anchor=(.5, -.02))


def text_panel(ax, title, subtitle, formula, lines, note=None):
    ax.axis('off')
    ax.text(0, 1, title, fontsize=17, fontweight='bold', va='top', transform=ax.transAxes)
    ax.text(0, .9, subtitle, fontsize=11, va='top', color='#555', transform=ax.transAxes, linespacing=1.4)
    y = .72
    for f in formula:
        ax.text(.02, y, f, fontsize=17, va='top', transform=ax.transAxes, color=CURVE)
        y -= .115
    y -= .02
    for line in lines:
        ax.text(.02, y, line, fontsize=11, va='top', transform=ax.transAxes, linespacing=1.35)
        y -= .062 * (1 + line.count('\n'))
    if note:
        ax.text(0, .0, note, fontsize=10, va='bottom', color='#6a5a3a', style='italic',
                transform=ax.transAxes, linespacing=1.4)


def figure():
    fig = plt.figure(figsize=(17, 6.2))
    gs = fig.add_gridspec(1, 3, width_ratios=[1.25, 1.25, .95], wspace=.08, left=.03, right=.985, top=.93, bottom=.06)
    right = GridSpecFromSubplotSpec(2, 1, subplot_spec=gs[2], hspace=.32)
    return fig, fig.add_subplot(gs[0]), fig.add_subplot(gs[1]), fig.add_subplot(right[0]), fig.add_subplot(right[1])


def meares_overlay(name, model):
    g = GEN[f'{name}:{model}']
    rise = MEARES_MEAS[name]['top_rise_over_width']
    return np.array(g['underside']) / g['params']['width'] + [0, rise]


def model_meares(model, number):
    g = GEN[f'meares1:{model}']
    p = g['params']; T, R, a = p['thickness'], p['radius'], p['width'] / 2
    pts = np.array(g['points']); under = np.array(g['underside'])
    edgeY, sideY, cornerTop = g['edgeY'], g['sideY'], g['cornerTop']
    fig, tx, sx, t1, t2 = figure()
    # The section, from the generator, with the corner left sharp in the drawing so
    # the flat is legible; the real preset files it round (shown dotted).
    top = np.array([q for q in pts if q[1] > sideY + 1e-9 and q[0] >= -a])
    top = top[np.argsort(top[:, 0])]
    ux = under[np.argsort(under[:, 0])]
    ax = sx
    outline = np.array(g['points'])
    ax.fill(outline[:, 0], outline[:, 1], color=WOOD, zorder=1)
    ax.plot(np.r_[outline[:, 0], outline[0, 0]], np.r_[outline[:, 1], outline[0, 1]], color=EDGE, lw=1.6, zorder=2)
    if model == 'quartic':
        core = ux[np.abs(ux[:, 0]) <= g['underJoinX'] + 1e-9]
        ax.plot(core[:, 0], core[:, 1], color=CURVE, lw=3.2, zorder=4)
        for sgn in (-1, 1):
            blend = ux[(sgn * ux[:, 0] >= g['underJoinX'] - 1e-9)]
            ax.plot(blend[:, 0], blend[:, 1], color=CURVE2, lw=3.2, zorder=4)
            ax.plot([sgn * g['underJoinX']], [core[0 if sgn < 0 else -1, 1]], 'o', color=EDGE, ms=5, zorder=5)
        ax.text(0, -T - 1.2, 'quartic', color=CURVE, ha='center', va='top', fontsize=12)
        ax.text(a + 1, sideY - 7.5, 'quintic\nBézier', color=CURVE2, ha='left', va='center', fontsize=11)
        dim_h(ax, -g['underJoinX'], g['underJoinX'], -T - 5.2, '0.76 a each side of centre', above=False)
    else:
        ax.plot(ux[:, 0], ux[:, 1], color=CURVE, lw=3.2, zorder=4)
        ghost = full_superellipse(a, sideY + T, p.get('exponent', 1.69), sideY)
        ax.plot(ghost[ghost[:, 1] > sideY][:, 0], ghost[ghost[:, 1] > sideY][:, 1], color=CURVE, lw=1, ls=(0, (4, 3)), zorder=2)
        ax.plot([-a, a], [sideY, sideY], ':', color=MARK, lw=1, zorder=5)
        ax.plot([-a, a], [sideY, sideY], 'o', color=MARK, ms=6, zorder=6)
        ax.text(-a - 1, sideY + .2, r'$y_0$', color=MARK, ha='right', va='center', fontsize=14)
        dim_h(ax, 0, a, -T - 3.5, r'$a = W/2$', above=False)
        dim_v(ax, 0, sideY, -T, r'$b$', color=CURVE, side='right')
    for sgn in (-1, 1):
        ax.plot([sgn * a, sgn * a], [edgeY, sideY], color=FLAT, lw=4.5, solid_capstyle='butt', zorder=5)
    dim_v(ax, a + 5, edgeY, sideY, r'$F$', color=FLAT)
    ax.plot([a + .3, a + 5], [edgeY, edgeY], color=FLAT, lw=.6)
    ax.plot([a + .3, a + 5], [sideY, sideY], color=FLAT, lw=.6)
    dim_v(ax, -a - 5, 0, -T, r'$T$', side='left')
    ax.plot([-a - 5, 0], [0, 0], color=DIM, lw=.5, ls=':'); ax.plot([-a - 5, 0], [-T, -T], color=DIM, lw=.5, ls=':')
    ax.text(0, 1.3, f'playing arc, radius R = {R:g}', ha='center', fontsize=10.5, color=EDGE)
    ax.text(-14, (sideY - T) / 2 + 3, 'wood', ha='center', color='#8a6a3a', fontsize=12)
    style_schematic(ax, ylim=(-T - 9, 6))
    key = 'generator' if model == 'quartic' else 'generator_superellipse_model'
    for axis, name in [(t1, 'meares1'), (t2, 'meares2')]:
        top_t, under_t = meares_trace(name)
        rms = MEARES_FIT[name]['nearest_point_rms'][key]['rms_px']
        trace_panel(axis, top_t, under_t, [(meares_overlay(name, model), f'model · RMS {rms:.2f} px', CURVE, '-')],
                    f'{name} trace (width = 1)')
    if model == 'quartic':
        text_panel(tx, f'{number}. Quartic + Bézier + flat side',
                   'Earlier Meares generator; still selectable as model: \'quartic\'.\nThree pieces each side of the centre.',
                   [r'$y = -T + h\,(0.85\,u^2 + 0.15\,u^4)$', r'$u = x/a,\quad h = 0.85\,T - s$'],
                   [r'$|x| \leq 0.76\,a$: the quartic above (purple)',
                    r'$0.76\,a < |x| \leq a$: quintic Bézier (orange), matching the quartic' '\n'
                    r'      in slope and curvature, arriving vertical with zero curvature',
                    r'$F = 0.1\,T$: flat side left on the blank (green)',
                    r'$s = R - \sqrt{R^2 - a^2}$: how far the playing arc drops to the corner',
                    'Six fixed constants: 0.85, 0.15, 0.76, 0.1, and two in the Bézier.'],
                   note='A polynomial y = f(x) can never reach the side vertically,\nso a second curve was needed just to get there.')
    else:
        text_panel(tx, f'{number}. Superellipse + flat side',
                   'Current Meares generator (the default).\nOne curve from the centre right up to the flat.',
                   [r'$|\,x/a\,|^{\,n} + |\,(y - y_0)/b\,|^{\,n} = 1$'],
                   [r'$a = W/2$: the curve is widest exactly at the board edge',
                    r'$y_0 = -s - F$: height of the widest point, the foot of the flat',
                    r'$b = T - s - F$: depth from there down to the centre',
                    r'$F = D + 0.1$ mm: flat side, derived from the corner rounding $D$',
                    r'$n = 1.69$: fitted jointly to both Meares drawings',
                    r'$s = R - \sqrt{R^2 - a^2}$: drop of the playing arc to the corner'],
                   note='Reaches the side with a vertical tangent on its own,\nso no second curve is needed. Only n is chosen.')
    return fig


def model_corner(number):
    fit = COL['colichon-bass-2']['underside_fits']['full_width_superellipse']
    rise = COL['colichon-bass-2']['top_rise_over_width'] * W
    b, n, a = fit['depth_over_width'] * W, fit['exponent_n'], W / 2
    fig, tx, sx, t1, t2 = figure()
    top = crown(rise); under = superellipse(a, b, n, 0)
    section(sx, top, under)
    sx.plot(under[:, 0], under[:, 1], color=CURVE, lw=3.2, zorder=4)
    ghost = full_superellipse(a, b, n, 0); ghost = ghost[ghost[:, 1] > 0]
    sx.plot(ghost[:, 0], ghost[:, 1], color=CURVE, lw=1, ls=(0, (4, 3)), zorder=2)
    sx.plot([-a, a], [0, 0], ':', color=MARK, lw=1, zorder=5); sx.plot([-a, a], [0, 0], 's', color=MARK, ms=7, zorder=6)
    sx.text(-a - 1, 0, r'$y_0 = 0$' '\n(corner)', color=MARK, ha='right', va='center', fontsize=11)
    dim_h(sx, 0, a, 1.2 + rise, r'$a = W/2$')
    dim_v(sx, 0, 0, -b, r'$b$', color=CURVE)
    sx.text(-12, -b / 2, 'wood', ha='center', color='#8a6a3a', fontsize=12)
    style_schematic(sx, ylim=(-b - 5, rise + 14))
    for axis, name in [(t1, 'colichon-bass-2'), (t2, 'colichon-treble-b')]:
        top_t, under_t = colichon_trace(name)
        f = COL[name]['underside_fits']['full_width_superellipse']
        c = superellipse(.5, f['depth_over_width'], f['exponent_n'], 0)
        trace_panel(axis, top_t, under_t, [(c, f'n = {f["exponent_n"]:.2f} · RMS {f["rms_px"]:.2f} px', CURVE, '-')],
                    f'{name} (width = 1)')
    text_panel(tx, f'{number}. Superellipse to the corner',
               'Colichon. Same equation as 2, with the flat gone:\nthe underside runs straight into the playing surface.',
               [r'$|\,x/a\,|^{\,n} + |\,(y - y_0)/b\,|^{\,n} = 1$'],
               [r'$a = W/2$: widest point at the board edge, as in 2',
                r'$y_0 = $ corner height: the widest point IS the top corner',
                r'$b$ = depth of the underside below the corners',
                r'$F = 0,\ D = 0$: no flat side, no corner rounding',
                r'$n$ fitted: 1.86 (bass, 74.5 wide), 2.05 (bass, 61.5),' '\n'
                r'      1.58 (treble B–B), 1.63 (treble A–A$^\prime$)'],
               note='Fits three of the four Colichon sections well.\nThe exponent differs between the treble and the bass.')
    return fig


def model_clipped(number):
    name = 'colichon-treble-a'
    f = COL[name]['underside_fits']['clipped_superellipse']
    rise = COL[name]['top_rise_over_width'] * W
    a, b, n = f['half_width_a_over_width'] * W, f['semi_depth_b_over_width'] * W, f['exponent_n']
    h = W / 2
    y0 = b * (1 - (h / a) ** n) ** (1 / n)
    fig, tx, sx, t1, t2 = figure()
    top = crown(rise); under = superellipse(a, b, n, y0, half_width=h)
    section(sx, top, under)
    sx.plot(under[:, 0], under[:, 1], color=CURVE, lw=3.2, zorder=4)
    ghost = full_superellipse(a, b, n, y0)
    ghost_out = ghost[(np.abs(ghost[:, 0]) > h) | (ghost[:, 1] > y0)]
    sx.plot(*full_superellipse(a, b, n, y0).T, color=CURVE, lw=1, ls=(0, (4, 3)), zorder=2)
    for sgn in (-1, 1):
        sx.plot([sgn * h, sgn * h], [-b + y0 - 3, y0 + 3], color=DIM, lw=1, ls='-.', zorder=0)
    sx.text(h + .6, -b + y0 - 2.5, 'board edge', rotation=90, fontsize=10, color=DIM, va='bottom')
    sx.plot([-a, a], [y0, y0], ':', color=MARK, lw=1, zorder=5); sx.plot([-a, a], [y0, y0], 'o', color=MARK, ms=6, zorder=6)
    sx.text(-a - 1, y0, r'$y_0$', color=MARK, ha='right', va='center', fontsize=14)
    dim_h(sx, 0, a, y0 + 1.6, r'$a$ (wider than $W/2$)')
    dim_h(sx, -h, h, -b + y0 - 5, r'$W$', above=False)
    dim_v(sx, 0, y0, y0 - b, r'$b$', color=CURVE)
    sx.plot([-h, h], [0, 0], 's', color=EDGE, ms=6, zorder=6)
    sx.text(-12, -9, 'wood', ha='center', color='#8a6a3a', fontsize=12)
    style_schematic(sx, ylim=(y0 - b - 10, y0 + 12), xlim=(-44, 44))
    top_t, under_t = colichon_trace(name)
    c = superellipse(f['half_width_a_over_width'], f['semi_depth_b_over_width'], n,
                     f['semi_depth_b_over_width'] * (1 - (.5 / f['half_width_a_over_width']) ** n) ** (1 / n), half_width=.5)
    full = COL[name]['underside_fits']['full_width_superellipse']
    c2 = superellipse(.5, full['depth_over_width'], full['exponent_n'], 0)
    trace_panel(t1, top_t, under_t, [(c, f'cut short · RMS {f["rms_px"]:.2f} px', CURVE, '-'),
                                     (c2, f'to the corner (3) · RMS {full["rms_px"]:.2f} px', CURVE2, '--')],
                f'{name} (width = 1)')
    zoom = t2
    zoom.plot(under_t[:, 0], under_t[:, 1], color=TRACE, lw=3, alpha=.75)
    zoom.plot(c[:, 0], c[:, 1], color=CURVE, lw=1.6)
    zoom.plot(c2[:, 0], c2[:, 1], color=CURVE2, lw=1.6, ls='--')
    zoom.plot(top_t[:, 0], top_t[:, 1], color=TOPTRACE, lw=1.4)
    zoom.set(xlim=(.28, .52), ylim=(-.2, .04)); zoom.set_aspect('equal'); zoom.grid(alpha=.18)
    zoom.tick_params(labelsize=8); zoom.spines[['top', 'right']].set_visible(False)
    zoom.set_title(f'right corner: arrives at {f["corner_angle_from_chord_degrees"]:.0f}° instead of {full["corner_angle_from_chord_degrees"]:.0f}°',
                   fontsize=10.5, loc='left')
    text_panel(tx, f'{number}. Superellipse cut short',
               'Colichon treble A–A$^\\prime$ only. Same equation again, but\nthe curve is wider than the board and the edge slices it.',
               [r'$|\,x/a\,|^{\,n} + |\,(y - y_0)/b\,|^{\,n} = 1$', r'$\mathrm{kept\ only\ for}\ \ |x| \leq W/2$'],
               [r'$a > W/2$: the curve would be widest out past the board',
                r'$y_0 = b\,\left(1 - (W/2a)^n\right)^{1/n}$ above the corners,' '\n'
                r'      so the curve passes exactly through both corners',
                f'Fitted: a = {f["half_width_a_over_width"]:.3f} W,  b = {f["semi_depth_b_over_width"]:.3f} W,  n = {n:.2f}',
                r'One more number than 3. A maker would more naturally' '\n'
                r'      set it as the angle the underside meets the corner at.'],
               note='Cut-off position and n trade against each other in the fit,\nso one drawing cannot tell them apart.')
    return fig


def model_arc(number):
    fig, tx, sx, t1, t2 = figure()
    name = 'colichon-treble-a'
    f = COL[name]['underside_fits']['circular_arc']
    rise = COL[name]['top_rise_over_width'] * W
    r, d, h = f['radius_over_width'] * W, f['depth_over_width'] * W, W / 2
    k = r - d
    x = np.linspace(-h, h, 400); under = np.c_[x, k - np.sqrt(r * r - x * x)]
    top = crown(rise)
    section(sx, top, under)
    sx.plot(under[:, 0], under[:, 1], color=CURVE, lw=3.2, zorder=4)
    t = np.linspace(0, 2 * np.pi, 600)
    sx.plot(r * np.cos(t), k + r * np.sin(t), color=CURVE, lw=1, ls=(0, (4, 3)), zorder=2)
    sx.plot([0], [k], '+', color=MARK, ms=12, mew=2, zorder=6)
    sx.text(1, k + 1, r'centre $(0, k)$', color=MARK, fontsize=11)
    sx.annotate('', (r * np.cos(-.5), k + r * np.sin(-.5)), (0, k), arrowprops=dict(arrowstyle='->', color=MARK))
    sx.text(r * np.cos(-.5) / 2 + 1, k + r * np.sin(-.5) / 2 - 1, r'$r$', color=MARK, fontsize=14)
    dim_v(sx, 0, 0, -d, r'$d$', color=CURVE, side='left')
    sx.plot([-h, h], [0, 0], color=DIM, lw=.6, ls=':')
    dim_h(sx, -h, h, -d - 4, r'$W$', above=False)
    sx.text(12, -d / 2 - 2, 'wood', ha='center', color='#8a6a3a', fontsize=12)
    style_schematic(sx, ylim=(-d - 9, k + r + 2), xlim=(-46, 46))
    for axis, nm in [(t1, 'colichon-treble-a'), (t2, 'colichon-bass-1')]:
        top_t, under_t = colichon_trace(nm)
        ff = COL[nm]['underside_fits']['circular_arc']
        rr, dd = ff['radius_over_width'], ff['depth_over_width']
        xx = np.linspace(-.5, .5, 400)
        verdict = 'good' if ff['rms_px'] < 4 else 'too shallow at the edges'
        trace_panel(axis, top_t, under_t, [(np.c_[xx, (rr - dd) - np.sqrt(rr * rr - xx * xx)],
                                            f'r = {rr:.2f} W · RMS {ff["rms_px"]:.2f} px', CURVE, '-')],
                    f'{nm}: {verdict}')
    text_panel(tx, f'{number}. Circular arc',
               'The simplest candidate: one radius, through both corners.\nUsed for the playing surface in every model.',
               [r'$x^2 + (y - k)^2 = r^2$', r'$r = \frac{W^2/4 + d^2}{2d},\quad k = r - d$'],
               [r'$d$: depth of the underside below the corners',
                r'$r$: radius, which follows from $W$ and $d$',
                r'$k$: height of the centre above the corners',
                'Nothing to choose beyond the depth.',
                r'Colichon fits: r = 0.57 W treble A–A$^\prime$ (2.75 px),' '\n'
                r'      0.59 W bass 61.5 (7.35 px), 0.57 W bass 74.5 (5.45 px)'],
               note='Fair for the treble, but on the bass it is about 1 mm too\nshallow near the edges. Meares needed far more than one arc.')
    return fig


def main():
    OUT.mkdir(exist_ok=True)
    plt.rcParams.update({'font.family': 'DejaVu Sans', 'mathtext.fontset': 'dejavusans'})
    figures = [('1-quartic-bezier', model_meares('quartic', 1)),
               ('2-superellipse-flat', model_meares('superellipse', 2)),
               ('3-superellipse-to-corner', model_corner(3)),
               ('4-superellipse-cut-short', model_clipped(4)),
               ('5-circular-arc', model_arc(5))]
    for name, fig in figures:
        fig.savefig(OUT / f'{name}.png', dpi=130)
        plt.close(fig)
    from PIL import Image
    pages = [Image.open(OUT / f'{n}.png').convert('RGB') for n, _ in figures]
    sheet = Image.new('RGB', (pages[0].width, sum(p.height for p in pages)), 'white')
    y = 0
    for page in pages:
        sheet.paste(page, (0, y)); y += page.height
    sheet.save(OUT / 'all-undersides.png')
    print('\n'.join(str(OUT / f'{n}.png') for n, _ in figures))


if __name__ == '__main__':
    main()
