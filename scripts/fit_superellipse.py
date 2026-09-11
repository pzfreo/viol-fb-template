"""Fit a single-equation superellipse underside to the Meares traces.

Compares it with the generator's piecewise quartic + quintic Bezier + flat side.
Exploratory analysis only: nothing here feeds the generator.
"""
import csv
import json
import subprocess
from pathlib import Path
import numpy as np
from scipy.optimize import least_squares
from scipy.spatial import cKDTree
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
ROOT=Path(__file__).resolve().parents[1]
MODEL='#b24f2b';TRACE='#287a89';SUPER='#6b3fa0'
program=("import {generate,PRESETS} from './site/src/profile.js';"
  "console.log(JSON.stringify(Object.fromEntries(Object.entries(PRESETS).flatMap(([n,p])=>"
  "[[n,generate({...p,model:'quartic'})],[n+':superellipse',generate(p)]]))));")
profiles=json.loads(subprocess.check_output(['node','--input-type=module','-e',program],cwd=ROOT,text=True))
measurements=json.loads((ROOT/'analysis'/'measurements.json').read_text())

def superellipse(a,b,y_side,n,samples=6000):
    """Lower half of (x/a)^n + (y/b)^n = 1, sampled parametrically.

    The parametric form is used so the vertical tangent at x = a is reached
    exactly instead of being approached by an ever-steeper y = f(x) sampling.
    """
    t=np.linspace(0,np.pi,samples)
    return np.column_stack([a*np.sign(np.cos(t))*np.abs(np.cos(t))**(2/n),
                            y_side-b*np.abs(np.sin(t))**(2/n)])

def nearest(points,curve):
    return cKDTree(curve).query(points)[0]

report={}
fig,axes=plt.subplots(3,3,figsize=(14,12))
for row,name in enumerate(n for n in profiles if ':' not in n):
    rows=list(csv.DictReader((ROOT/'analysis'/f'{name}-trace.csv').open()))
    x=np.array([float(r['x_over_width']) for r in rows])
    top=np.array([float(r['top_y_over_width']) for r in rows])
    under=np.array([float(r['underside_y_over_width']) for r in rows])
    observed=np.array([int(r['observed_not_interpolated']) for r in rows]).astype(bool)
    px=measurements[name]['source_width_px']
    rise=measurements[name]['top_rise_over_width']
    points=np.column_stack([x[observed],under[observed]])
    depth=float(-under.min()+np.mean([under[0],under[-1]]))

    # Half-width is pinned at the traced half width: the whole point of the
    # single-equation form is that it reaches full width with a vertical tangent.
    datum=float(np.mean([under[0],under[-1]]))
    fit=least_squares(lambda p:nearest(points,superellipse(.5,*p)),[depth,datum,2.],
                      bounds=([.1,-.1,1.02],[.6,.1,14.]))
    b,y_side,n=fit.x
    curve=superellipse(.5,b,y_side,n)
    # The free fit puts the curve's maximum-width height above the traced widest
    # point, so the trace stops short of the vertical tangent. Pinning that height
    # to the traced side datum is the honest single-equation constraint; report both.
    pin=least_squares(lambda p:nearest(points,superellipse(.5,p[0],datum,p[1])),[depth,2.],
                      bounds=([.1,1.02],[.6,14.]))
    pinned=superellipse(.5,pin.x[0],datum,pin.x[1])
    profile=profiles[name]
    model=np.array(profile['underside'])/profile['params']['width']+[0,rise]
    built=profiles[f'{name}:superellipse']
    implemented=np.array(built['underside'])/built['params']['width']+[0,rise]
    inner=np.abs(points[:,0])<=.3
    stats={}
    for label,candidate in [('superellipse',curve),('superellipse_side_pinned',pinned),
                            ('generator_superellipse_model',implemented),('generator',model)]:
        d=nearest(points,candidate)*px
        stats[label]={'rms_px':float(np.sqrt((d**2).mean())),
                      'rms_px_central_60':float(np.sqrt((d[inner]**2).mean())),
                      'rms_px_outer':float(np.sqrt((d[~inner]**2).mean())),
                      'max_px':float(d.max())}
    exponents=np.linspace(1.1,5,140)
    sweep=[float(np.sqrt((nearest(points,superellipse(.5,b,y_side,e))**2).mean())*px) for e in exponents]

    outline=np.concatenate([np.column_stack([x,top]),np.column_stack([x,under])[::-1]])
    panels=[('Underside · whole width',(-.53,.53),(-.33,.20)),
            ('Right side detail',(.33,.52),(-.16,.03)),
            ('Centre detail',(-.10,.10),(-.30,-.26))]
    for col,(title,xlim,ylim) in enumerate(panels):
        ax=axes[row,col]
        if col==0:
            ax.plot(outline[:,0],outline[:,1],color='#bbb',lw=1,label='Traced outline')
        ax.plot(x,under,color=TRACE,lw=2.6,alpha=.85,label='Meares underside trace')
        ax.plot(curve[:,0],curve[:,1],color=SUPER,lw=1.8,label=f'Superellipse n={n:.2f}')
        ax.plot(pinned[:,0],pinned[:,1],color=SUPER,lw=1.3,ls=':',label=f'Superellipse n={pin.x[1]:.2f}, side pinned')
        ax.plot(model[:,0],model[:,1],color=MODEL,lw=1.6,ls=(0,(5,2)),label='Earlier quartic + Bezier')
        ax.plot(implemented[:,0],implemented[:,1],color='#1b7f4b',lw=1.6,ls=(0,(2,2)),label='Shipped superellipse model')
        ax.set(xlim=xlim,ylim=ylim);ax.set_aspect('equal');ax.grid(alpha=.18)
        ax.spines[['top','right']].set_visible(False)
        ax.set_title(f'{name} · {title}',loc='left',fontsize=11)
        if col==0:ax.set_ylabel('Height above side datum / width')
        ax.set_xlabel('Across fingerboard / width')
    report[name]={'fitted':{'exponent_n':float(n),'depth_b_over_width':float(b),
                            'y_side_over_width':float(y_side),'half_width_a_over_width':.5,
                            'side_overshoot_mm_at_60mm_width':float((y_side-datum)*60)},
                  'fitted_side_pinned':{'exponent_n':float(pin.x[1]),'depth_b_over_width':float(pin.x[0]),
                            'y_side_over_width':datum,'half_width_a_over_width':.5},
                  'nearest_point_rms':stats,
                  'centre_curvature_radius_mm_at_60mm_width':{
                      f'{d}mm_from_centre':float(60/(b*(n-1)/.5**n*(d/60)**(n-2)))
                      for d in (0.06,0.6,3.0,9.0)},
                  'note':'Symmetric models measured against an asymmetric trace; both pay that penalty equally.'}
    ax=axes[2,row]
    ax.plot(exponents,sweep,color=SUPER,lw=1.8)
    ax.axvline(n,color=SUPER,ls=':',lw=1)
    ax.axvline(2,color='#888',ls='--',lw=1)
    ax.axhline(stats['generator']['rms_px'],color=MODEL,ls=(0,(5,2)),lw=1.4)
    ax.annotate(f'best n={n:.2f}',(n,min(sweep)),textcoords='offset points',xytext=(8,26),color=SUPER,fontsize=9)
    ax.annotate('n=2 (ellipse)',(2,max(sweep)*.72),textcoords='offset points',xytext=(6,0),color='#666',fontsize=9)
    ax.annotate('earlier quartic',(4.9,stats['generator']['rms_px']),textcoords='offset points',xytext=(-6,6),color=MODEL,fontsize=9,ha='right')
    ax.axhline(stats['generator_superellipse_model']['rms_px'],color='#1b7f4b',ls=(0,(2,2)),lw=1.4)
    ax.annotate('shipped superellipse',(4.9,stats['generator_superellipse_model']['rms_px']),textcoords='offset points',xytext=(-6,-14),color='#1b7f4b',fontsize=9,ha='right')
    ax.set(xlabel='Superellipse exponent n',ylabel='Nearest-point RMS, source pixels',title=f'{name} · fit quality against n')
    ax.grid(alpha=.18);ax.spines[['top','right']].set_visible(False)

ax=axes[2,2]
for e,style in [(1.67,'-'),(2.,'--'),(3.,'-.'),(5.,':')]:
    c=superellipse(.5,.30,0,e)
    ax.plot(c[:,0],c[:,1],ls=style,lw=1.7,label=f'n = {e:g}')
ax.set(xlim=(-.53,.53),ylim=(-.33,.03),xlabel='Across fingerboard / width',
       title='Superellipse family at equal width and depth')
ax.set_aspect('equal');ax.grid(alpha=.18);ax.legend(fontsize=9,loc='lower right')
ax.spines[['top','right']].set_visible(False)
handles,labels=axes[0,0].get_legend_handles_labels()
fig.legend(handles,labels,loc='upper center',ncol=5,fontsize=9.5,bbox_to_anchor=(.5,.975))
fig.suptitle('Single-equation superellipse underside compared with the traces and the generator',fontsize=16,y=.998)
fig.tight_layout(rect=(0,0,1,.945))
fig.savefig(ROOT/'analysis'/'superellipse-comparison.png',dpi=160)
fig.savefig(ROOT/'analysis'/'superellipse-comparison.svg')
(ROOT/'analysis'/'superellipse-fit.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
