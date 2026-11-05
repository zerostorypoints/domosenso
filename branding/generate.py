"""Rebuild approved assets: uv run --with fonttools python branding/generate.py.

The repository-local config selects the domain and public destinations.
"""
from pathlib import Path
from math import sqrt
from html import escape
import json
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
CONFIG = json.loads((HERE / 'config.json').read_text())
DOMAIN = CONFIG['domain']
assert DOMAIN in ('com', 'org')
FONTS = {w: TTFont(ROOT / CONFIG['fonts'] / f'manrope-{w}.ttf') for w in ('regular','semibold')}
INK, PAPER = '#252a24', '#faf9f5'
COLORS = {'com':'#4e5e43','org':'#ad431f'}
PALE = {'com':'#d6dfbc','org':'#ffc4a5'}
ROLES = {'com':'BUILDING AUTOMATION','org':'OPEN FRAMEWORK'}
FULL = 'M8 56V28A24 24 0 0 1 32 4A24 24 0 0 1 56 28V56H44V28A12 12 0 0 0 32 16A12 12 0 0 0 20 28V56Z'
NODE = 'M26 44H38V56H26Z'
OPEN = f'M8 56V28A24 24 0 0 1 32 4A24 24 0 0 1 {32+sqrt(24**2-8**2):.9f} 20H{32+sqrt(12**2-8**2):.9f}A12 12 0 0 0 32 16A12 12 0 0 0 20 28V56Z'
PATHS = {'com':[FULL,NODE], 'org':[OPEN,'M44 28H56V56H44Z',NODE]}

def symbol(domain, color=INK):
    return f'<g fill="{color}" transform="translate(0 2)">'+''.join(f'<path d="{p}"/>' for p in PATHS[domain])+'</g>'

def text(value,x,y,size,color=INK,weight='regular',spacing=0):
    f=FONTS[weight]; glyphs=f.getGlyphSet(); cmap=f.getBestCmap()
    scale=size/f['head'].unitsPerEm; advance=0; result=[]
    for char in value:
        name=cmap[ord(char)]; pen=SVGPathPen(glyphs); glyphs[name].draw(pen)
        if pen.getCommands():
            result.append(f'<path d="{pen.getCommands()}" transform="translate({x+advance:.5f} {y}) scale({scale:.9f} {-scale:.9f})"/>')
        advance+=f['hmtx'][name][0]*scale+spacing
    return '<g fill="'+color+'">'+''.join(result)+'</g>',advance

def label(*args,**kwargs): return text(*args,**kwargs)[0]

def lockup(domain,theme='color',compact=False):
    ink=PAPER if theme in ('dark','reverse') else INK
    color=PALE[domain] if theme=='dark' else ink if theme in ('mono','reverse') else COLORS[domain]
    x,y=(78,43) if compact else (96,54)
    first,a=text('Domo',x,y,43,ink)
    second,b=text('Senso',x+a-1,y,43,ink,'semibold')
    shift='translate(0 -4)' if compact else 'translate(12 13)'
    result=f'<g transform="{shift}">{symbol(domain,color)}</g>'+first+second+label('.'+domain,x+a+b+4,y,19,color,'semibold')
    if not compact: result+=label(ROLES[domain],98,79,10,color,'semibold',1.6)
    return result

def svg(body,w,h,title,view=None):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="{view or f"0 0 {w} {h}"}" role="img" aria-label="{escape(title)}"><title>{escape(title)}</title>{body}</svg>\n'

def write(path,value):
    path.parent.mkdir(parents=True,exist_ok=True); path.write_text(value)

def build():
    asset=HERE/'assets'; public=ROOT/CONFIG['public']
    for theme in ('color','mono','dark','reverse'):
        for compact in (False,True):
            name='logo-'+('compact-' if compact else '')+theme+'.svg'
            content=svg(lockup(DOMAIN,theme,compact),400 if compact else 430,56 if compact else 104,f'DomoSenso.{DOMAIN} - {ROLES[DOMAIN].lower()}')
            write(asset/name,content); write(public/name,content)
    for theme,color in [('color',COLORS[DOMAIN]),('mono',INK),('reverse',PAPER)]:
        content=svg(symbol(DOMAIN,color),64,64,f'DomoSenso.{DOMAIN} symbol')
        write(asset/f'symbol-{theme}.svg',content);write(public/f'symbol-{theme}.svg',content)
    write(asset/'symbol-20mm.svg',svg(symbol(DOMAIN,'#000000'),'18.46153846153846mm','20mm',f'DomoSenso.{DOMAIN} casing symbol','8 6 48 52'))
    tile=f'<rect width="64" height="64" rx="14" fill="{COLORS[DOMAIN]}"/><g transform="translate(6.4 6.4) scale(.8)">{symbol(DOMAIN,PAPER)}</g>'
    favicon=svg(tile,64,64,f'DomoSenso.{DOMAIN} icon')
    write(asset/'favicon.svg',favicon);write(ROOT/CONFIG['favicon'],favicon)
    body=f'<rect width="1200" height="630" fill="{PAPER}"/>'+label(ROLES[DOMAIN],64,62,15,COLORS[DOMAIN],'semibold',2)
    body+=f'<g transform="translate(54 116) scale(2.4)">{lockup(DOMAIN,compact=True)}</g>'
    lines=['A building that','works with you.'] if DOMAIN=='com' else ['The open framework','for Home Assistant.']
    body+=label(lines[0],64,370,64)+label(lines[1],64,450,64)
    body+=f'<path d="M64 516H1136" stroke="{COLORS[DOMAIN]}"/>'+label('domosenso.'+DOMAIN,64,567,25,COLORS[DOMAIN],'semibold')
    social=svg(body,1200,630,f'DomoSenso.{DOMAIN} - {"Building automation" if DOMAIN=="com" else "The open framework for Home Assistant"}')
    write(asset/'social.svg',social)
    if DOMAIN=='org':write(ROOT/'website/public/social.svg',social)
    write(HERE/'geometry.json',json.dumps({'version':1,'approved':'2026-11-05','canvas':[64,64],'bounds':[8,6,56,58],'radii':[24,12],'structure':12,'opening':8,'base_gap':6,'physical_symbol_mm':[48*20/52,20],'paths':PATHS},indent=2)+'\n')
    print(f'Generated approved .{DOMAIN} assets and site SVGs.')

if __name__=='__main__':build()
