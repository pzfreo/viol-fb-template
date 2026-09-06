"""Render the current JS generator over Meares traces and original scans."""
import csv
import json
import subprocess
from pathlib import Path
import numpy as np
from PIL import Image
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
ROOT=Path(__file__).resolve().parents[1]
program="import {generate,PRESETS} from './site/src/profile.js'; console.log(JSON.stringify(Object.fromEntries(Object.entries(PRESETS).map(([n,p])=>[n,generate(p)]))));"
profiles=json.loads(subprocess.check_output(['node','--input-type=module','-e',program],cwd=ROOT,text=True))
fig,axes=plt.subplots(2,2,figsize=(13,9),gridspec_kw={'width_ratios':[2.5,1]})
source_fig,source_axes=plt.subplots(1,2,figsize=(9,10))
MODEL='#b24f2b';TRACE='#287a89'
report={}
for row,(name,p) in enumerate(profiles.items()):
    with (ROOT/'analysis'/f'{name}-contour.csv').open() as f:
        ref=np.array([[float(r['x_over_width']),float(r['y_over_width'])] for r in csv.DictReader(f)])
    ref_top=float(ref[:,1].max())
    model=np.array(p['points'])/p['params']['width']
    trace=ref-[0,ref_top]
    for col in range(2):
        ax=axes[row,col]
        ax.plot(trace[:,0],trace[:,1],color=TRACE,lw=2.4,alpha=.8,label=f'{name} trace')
        ax.plot(model[:,0],model[:,1],color=MODEL,lw=1.7,ls=(0,(5,2)),label='Latest model')
        ax.set_aspect('equal');ax.grid(alpha=.18)
        ax.spines[['top','right']].set_visible(False)
        ax.set_xlabel('Across fingerboard / width')
        if col==0:
            ax.set(xlim=(-.53,.53),ylim=(-.48,.04),ylabel='Height below crown / width')
            ax.set_title(f"{name} · corner radius {p['params']['blend']:g} mm · equal width",loc='left',fontsize=12,pad=10)
            if row==0:
                handles,labels=ax.get_legend_handles_labels()
                fig.legend(handles,['Meares trace','Latest model'],loc='upper center',bbox_to_anchor=(.5,.955),ncol=2,fontsize=10)
        else:
            ax.set(xlim=(.35,.515),ylim=(-.25,-.055))
            ax.set_title('Right side detail',fontsize=11)
    align=json.loads((ROOT/'analysis'/f'{name}-spline.json').read_text())['source_alignment']
    pixels=np.array(align['origin'])+(model[:,0]*align['width_px']+align['u_midpoint_px'])[:,None]*np.array(align['across_unit_vector'])-(model[:,1]*align['width_px']+ref_top*align['width_px']+align['v_datum_px'])[:,None]*np.array(align['normal_unit_vector'])
    ax=source_axes[row]
    ax.imshow(Image.open(ROOT/f'{name}.png'),cmap='gray')
    ax.plot(pixels[:,0],pixels[:,1],color=MODEL,lw=1.4,alpha=.95)
    l,t,r,b=align['crop']
    ax.set(xlim=(l-18,r+18),ylim=(b+18,t-18),title=f'{name} · latest model over original')
    ax.axis('off')
    report[name]={'parameters_mm':p['params'],'side_before_corner_rounding_mm':.1*p['params']['thickness'],'remaining_flat_side_mm':p['flatSideHeight'],'alignment':'equal source width, crown aligned; no best-fit translation, scaling or rotation beyond this registration'}
fig.suptitle('Latest construction compared with Meares',fontsize=17,y=.995)
fig.text(.5,.01,'Teal: digitized drawing   ·   Rust dashed: latest model   ·   Crown aligned, assumed width 60 mm',ha='center',fontsize=10,color='#555')
fig.tight_layout(rect=(0,.035,1,.91));fig.subplots_adjust(hspace=.35)
source_fig.suptitle('Latest construction over the original drawings',fontsize=16,y=.98)
source_fig.tight_layout(rect=(0,0,1,.96))
for f,name in [(fig,'latest-meares-overlay'),(source_fig,'latest-source-overlay')]:
    f.savefig(ROOT/'analysis'/f'{name}.png',dpi=160)
    f.savefig(ROOT/'analysis'/f'{name}.svg')
(ROOT/'analysis/latest-model-comparison.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
