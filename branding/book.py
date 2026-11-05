"""Render the family guide as a vector PDF using the approved source paths.

uv run --with fonttools --with reportlab --with svglib python branding/book.py
"""
from pathlib import Path
from io import BytesIO
import textwrap
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from svglib.svglib import svg2rlg
from reportlab.graphics import renderPDF
import generate as brand

OUT=Path(__file__).resolve().parent
W,H=landscape(A4)
INK,PAPER,MUTED,LINE='#252a24','#faf9f5','#697063','#dce0d5'
for weight in ('regular','semibold'):
    pdfmetrics.registerFont(TTFont(weight,str(brand.ROOT/brand.CONFIG['fonts']/f'manrope-{weight}.ttf')))
c=canvas.Canvas(str(OUT/'brand-book.pdf'),pagesize=(W,H))
c.setTitle('DomoSenso brand book - Portal family 1.0')
c.setAuthor('ZeroStoryPoints GmbH')

def txt(value,x,y,size=11,color=INK,bold=False):
    c.setFillColor(HexColor(color));c.setFont('semibold' if bold else 'regular',size);c.drawString(x,y,value)

def para(value,x,y,width=330,size=11,leading=17):
    # Wrap by actual font metrics, not character counts.
    words=value.split();line='';lines=[]
    for word in words:
        candidate=(line+' '+word).strip()
        if pdfmetrics.stringWidth(candidate,'regular',size)>width and line:
            lines.append(line);line=word
        else:line=candidate
    if line:lines.append(line)
    for line in lines:txt(line,x,y,size);y-=leading
    return y

def art(body,x,y,width,view='0 0 64 64',height=64,source_width=64):
    drawing=svg2rlg(BytesIO(brand.svg(body,source_width,height,'DomoSenso',view).encode()))
    scale=width/drawing.width;drawing.scale(scale,scale)
    renderPDF.draw(drawing,c,x,y)

def logo(domain,x,y,width=330,theme='color',compact=False):
    art(brand.lockup(domain,theme,compact),x,y,width,'0 0 400 56' if compact else '0 0 430 104',56 if compact else 104,400 if compact else 430)

def page(number,title,kicker):
    c.setFillColor(HexColor(PAPER));c.rect(0,0,W,H,fill=1,stroke=0)
    txt('DOMOSENSO / BRAND BOOK',40,H-35,9,MUTED,True)
    txt(kicker.upper(),40,H-82,10,MUTED,True)
    txt(title,40,H-125,30)
    c.setStrokeColor(HexColor(LINE));c.line(40,40,W-40,40)
    txt('Portal family 1.0 / 5 November 2026',40,23,8,MUTED)
    txt(f'{number} / 6',W-70,23,8,MUTED)

page(1,'One architecture. An open foundation.','The family')
logo('com',40,260,355);logo('org',440,260,355)
txt('Professional building automation',48,228,15,bold=True)
txt('The open Home Assistant framework',448,228,15,bold=True)
para('Services for homes, hospitality and businesses. The closed portal is the commercial identity.',48,197,330)
para('Reusable components, documentation and AI-assisted setup. A side opening connects the same portal to the outside.',448,197,330)
para('Use this Open shoulder pair. The two domains share construction, typography and proportions, while shape, domain and colour distinguish their roles.',48,115,720,12)
c.showPage()

page(2,'Built from the same geometry.','Construction')
art(brand.symbol('com'),50,165,208);art(brand.symbol('org'),295,165,208)
txt('CLOSED PORTAL',62,144,10,brand.COLORS['com'],True)
txt('OPEN RIGHT SHOULDER',307,144,10,brand.COLORS['org'],True)
items=[('Canvas','64 x 64 units'),('Visible bounds','48 x 52 units'),('Concentric radii','24 / 12 units'),('Members and centre block','12 units'),('Framework opening','8 units'),('Base gaps','6 units')]
for i,(key,value) in enumerate(items):
    y=H-190-i*39;txt(key,555,y,10,MUTED);txt(value,555,y-17,13,bold=True)
para('The framework mark is a subtraction from the commercial mark. It adds no dot, tile or different outline. Do not redraw either symbol.',48,97,475,11)
c.showPage()

page(3,'Colour identifies. Shape distinguishes.','Colour and type')
swatches=[('COM / OLIVE','#4e5e43'),('ORG / TERRACOTTA','#ad431f'),('INK','#252a24'),('PAPER','#faf9f5')]
for i,(name,color) in enumerate(swatches):
    x=40+i*194;c.setFillColor(HexColor(color));c.setStrokeColor(HexColor(LINE));c.rect(x,338,178,73,fill=1,stroke=1)
    txt(name,x,316,10,bold=True);txt(color.upper(),x,297,11,MUTED)
txt('Manrope regular',40,245,27);txt('Manrope semibold',440,245,27,bold=True)
para('Regular Domo, semibold Senso. Keep the domain suffix on the name baseline. Distributed SVG lettering is outlined.',40,211,710)
c.setFillColor(HexColor(INK));c.rect(40,70,W-80,105,fill=1,stroke=0)
logo('com',55,84,340,'dark',True);logo('org',442,84,340,'dark',True)
txt('On dark: paper lettering + pale sage #D6DFBC / pale terracotta #FFC4A5',52,154,9,PAPER)
c.showPage()

page(4,'Give the mark room to work.','Layout and scale')
logo('com',40,342,355,compact=True);logo('org',440,333,355,compact=False)
txt('Compact / headers and small spaces',40,316,13,bold=True)
para('Remove the fine role label at small sizes; retain the symbol, name and domain. Typical desktop width: 200-240 px. Review 160-200 px responsive applications.',40,288,338)
txt('Full / when the role label can be read',440,316,13,bold=True)
para('Use approximately 520 px or wider when the role label must read as 12 px text. Do not force the full lockup into a small navigation slot.',440,288,338)
for y,title,body in [(188,'Clear space','Keep one member width (12 source units) around visible shapes, measured from the mark rather than its artboard.'),(125,'Digital symbol','Prefer 32 px; use 24 px or larger in general. The 16 px favicon is a specific small-size application.'),(67,'Keep the family intact','Scale uniformly. Do not rotate, stretch, add effects, close the opening, exchange colours or revive the earlier house/tile marks.')]:
    txt(title,40,y+28,13,bold=True);para(body,240,y+28,550,11,16)
c.showPage()

page(5,'The same symbol, part of the casing.','Manufacturing reference')
txt('20 x 20 mm field / 4 square centimetres',40,414,16,bold=True)
for i,domain in enumerate(('com','org')):
    x=54+i*150;y=306
    c.setStrokeColor(HexColor(LINE));c.rect(x,y,20*mm,20*mm,fill=0,stroke=1)
    art(brand.symbol(domain),x+(20-48*20/52)*mm/2,y,48*20/52*mm,'8 6 48 52',52,48)
    txt('.'+domain,x,y-22,12,brand.COLORS[domain],True)
txt('Actual-size vectors on a 100% print',40,250,10,MUTED)
items=[('Symbol','18.462 x 20 mm'),('Main members','4.615 mm'),('Framework opening','3.077 mm'),('Base gaps','2.308 mm'),('Trial relief / recess','0.8 mm')]
for i,(key,value) in enumerate(items):txt(key,440,410-i*39,11,MUTED);txt(value,626,410-i*39,12,bold=True)
para('Use only the symbol. Union raised details into the enclosure surface or subtract the same profiles for a recess. Keep adequate wall thickness; do not treat separated shapes as a freestanding stencil.',40,197,730,12,19)
para('Reference coupon: 28 x 28 x 2.4 mm backing. Raised height: 3.2 mm total. Recess leaves 1.6 mm backing. These are trial dimensions, not a model of the real enclosure.',40,128,730,11,17)
para('Digital meshes were checked. Physical printing, printer-specific slicing, material and enclosure integration remain to be verified.',40,77,730,10,15)
c.showPage()

page(6,'A small, reproducible asset system.','Files and maintenance')
rows=[('logo-color.svg','Full lockup with role label'),('logo-compact-color.svg','Header/footer lockup without small role label'),('logo-*-mono / dark / reverse.svg','Explicit variants for different surfaces'),('symbol-color / mono / reverse.svg','Digital standalone symbols'),('symbol-20mm.svg','Dimensioned physical master'),('favicon.svg / icon PNGs / social.svg','Derived web and application assets')]
for i,(name,purpose) in enumerate(rows):
    y=412-i*35;txt(name,40,y,11,bold=True);txt(purpose,390,y,11)
txt('Source of truth',40,177,15,bold=True)
para('Each owning repository keeps branding/ with this guide, config.json, geometry.json and generate.py. Public site assets are generated from that source. Update both family copies together.',40,150,730,11,17)
txt('Rebuild',40,98,12,bold=True)
txt('uv run --with fonttools python branding/generate.py',130,98,10)
txt('node branding/render.mjs',130,79,10)
txt('Manrope: SIL Open Font License. Font notice is supplied beside this guide.',40,55,9,MUTED)
c.showPage();c.save()
print('Rendered six-page vector brand book.')
