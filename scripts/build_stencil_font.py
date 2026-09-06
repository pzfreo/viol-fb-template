"""Generate the Workshop Stencil vector alphabet from Allerta Stencil from Overstand.

Development only: requires fontTools, shapely and a path to AllertaStencil-Regular.ttf.
The web app uses the generated polygons and requires no installed fonts.
"""
import argparse
import json
import string
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.basePen import BasePen
from shapely.geometry import Polygon, GeometryCollection

class FlattenPen(BasePen):
    def __init__(self, glyphs):
        super().__init__(glyphs)
        self.rings=[]
    def _moveTo(self, p): self.rings.append([p])
    def _lineTo(self, p): self.rings[-1].append(p)
    def _qCurveToOne(self, p1, p2):
        p0=self._getCurrentPoint()
        for i in range(1,13):
            t=i/12
            self.rings[-1].append(tuple((1-t)**2*p0[j]+2*(1-t)*t*p1[j]+t*t*p2[j] for j in range(2)))
    def _curveToOne(self, p1,p2,p3):
        p0=self._getCurrentPoint()
        for i in range(1,17):
            t=i/16
            self.rings[-1].append(tuple((1-t)**3*p0[j]+3*(1-t)**2*t*p1[j]+3*(1-t)*t*t*p2[j]+t**3*p3[j] for j in range(2)))
    def _closePath(self): pass
    def _endPath(self): pass


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('font')
    args=parser.parse_args()
    font=TTFont(args.font)
    glyphs=font.getGlyphSet()
    cmap=font.getBestCmap()
    cap=font['glyf'][cmap[ord('H')]].yMax
    result={}
    for char in string.ascii_letters+string.digits+' .-()':
        name=cmap[ord(char)]
        pen=FlattenPen(glyphs)
        glyphs[name].draw(pen)
        shape=GeometryCollection()
        for ring in pen.rings:
            if len(ring)>2:
                polygon=Polygon([(x/cap,-y/cap) for x,y in ring])
                if not polygon.is_valid: polygon=polygon.buffer(0)
                shape=shape.symmetric_difference(polygon)
        polys=list(shape.geoms) if hasattr(shape,'geoms') else [shape]
        assert all(not getattr(p,'interiors',[]) for p in polys), char
        result[char]={'advance':round(font['hmtx'][name][0]/cap,6),'polygons':[
            [[round(x,6),round(y,6)] for x,y in p.exterior.coords[:-1]]
            for p in polys if hasattr(p,'exterior') and not p.is_empty]}
    target=Path(__file__).resolve().parents[1]/'site/src/stencil-font.js'
    target.write_text('// Workshop Stencil outline subset, derived from Allerta Stencil (Overstand). SIL OFL 1.1; see FONT-LICENSE.txt.\nexport const STENCIL_FONT = '+json.dumps(result,separators=(',',':'))+';\n')
    print('Generated',len(result),'glyphs, all with open counters.')

if __name__=='__main__':main()
