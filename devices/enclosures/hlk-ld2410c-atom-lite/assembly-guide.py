# /// script
# requires-python = ">=3.11"
# dependencies = ["cairosvg==2.8.2"]
# ///
"""Render the English assembly guide: uv run <path>/assembly-guide.py.

Requires OpenSCAD (on PATH or in OPENSCAD) and Cairo for CairoSVG.
All views come from assembly-guide.scad and the adjacent enclosure.scad.
"""
import os, shutil, subprocess
from pathlib import Path
here = Path(__file__).resolve().parent
exe = os.environ.get("OPENSCAD") or shutil.which("openscad")
if not exe:
    raise SystemExit("Install OpenSCAD or set OPENSCAD to its executable")
preview = here / "preview"
preview.mkdir(exist_ok=True)
cameras = {"stand":"130,-180,130,0,0,45", "clamp":"130,-180,130,0,0,40",
           "dock":"100,-140,140,0,0,45", "rear":"-150,210,130,0,0,45"}
for name, camera in cameras.items():
    subprocess.run([exe,"--backend=Manifold","--render","--imgsize=1000,850",
        "--viewall","--autocenter","--projection=o","--colorscheme=Tomorrow",
        "--camera="+camera,"-D",'part="none"',"-D",f'scene="{name}"',
        "-o",str(preview/(name+".png")),str(here/"assembly-guide.scad")],check=True)
from pathlib import Path
import base64,html,cairosvg
p=Path(__file__).resolve().parent / 'preview'
s=['<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1510" viewBox="0 0 1600 1510"><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0L8 4L0 8Z" fill="#c05222"/></marker></defs><rect width="1600" height="1510" fill="#f7f7f7"/>']
def text(x,y,t,size=24,color='#253b47'):
 s.append(f'<text x="{x}" y="{y}" font-family="Arial,DejaVu Sans,sans-serif" font-size="{size}" fill="{color}">{html.escape(t)}</text>')
def img(name,x,y,w=650,h=552):
 data=base64.b64encode((p/(name+'.png')).read_bytes()).decode();s.append(f'<image x="{x}" y="{y}" width="{w}" height="{h}" href="data:image/png;base64,{data}"/>')
text(50,58,'ATOM LITE + LD2410C · V5.1 desktop mount',38)
text(50,98,'Standing or shelf base • sliding cradle with lower bearing pads',25)
text(50,148,'Orange: cradle    Yellow: Atom keeper    Cream: radar keeper',23)
img('stand',25,165,740,540);img('clamp',825,165,740,540)
text(50,205,'1A  DESKTOP BASE',27);text(850,205,'1B  SHELF CLAMP',27)
text(50,689,'Lower the mast into the base socket.',23)
text(50,722,'Use the base key only if loose; do not force it.',23)
text(850,689,'Fit the clamp over the shelf; advance its wedge by hand.',23)
text(850,722,'Reference shelf thickness: 12 mm; adjust before printing.',23)
s.append('<path d="M45 750H1555" stroke="#c7d0d4" stroke-width="2"/>')
text(50,800,'2  LOWER THE CRADLE INTO ITS GUIDES',27)
text(850,800,'3  USB AND WIRES — REAR VIEW',27)
img('dock',20,815,750,530);img('rear',815,815,750,530)
# Vertical lowering beside the cradle guide.
s.append('<path d="M598 1120L598 1165" fill="none" stroke="#c05222" stroke-width="6" marker-end="url(#arrow)"/>')
text(80,1280,'The lower pads bear against the upright mast rails.',20)
text(50,1332,'Slide the keeper in from the front until its tooth engages.',23)
text(50,1367,'Align both guides; lower the cradle about 6.3 mm.',23)
text(50,1402,'Trial fit with USB plugged in. Do not bend the guides.',22)
text(850,1332,'Teal: 10 × 5 × 30 mm plug inside a larger clearance.',23)
text(850,1367,'Purple: illustrative route; check actual cable slack.',23)
text(850,1402,'Turn the radar both ways without pulling its connectors.',22)
text(50,1470,'Trial fit without electronics first. The printed V5 fits; finger access to the Atom button remains cramped.',24)
s.append('</svg>');out=''.join(s);(p/'assembly-guide.svg').write_text(out);cairosvg.svg2png(bytestring=out.encode(),write_to=str(p/'assembly-guide.png'))
