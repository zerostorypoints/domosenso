# /// script
# requires-python = ">=3.11"
# dependencies = ["trimesh", "numpy", "shapely", "matplotlib", "networkx", "scipy", "rtree"]
# ///
"""Export the dragon stand's printable parts and preview images with OpenSCAD.

Usage: uv run build.py [-D name=value ...]
Writes light_left/ and light_right/ (the two halves of each version), stl/ (the shared parts and the
print plates) and preview/ (renders, and connections.png: what goes where, drawn from the model).
Every -D is passed on to OpenSCAD, e.g. -D 'head_vents="slots"'. OpenSCAD 2025 or newer with the
Manifold backend is found through $OPENSCAD, then PATH, then the macOS app bundle.
The Bambu Studio projects in 3mf/ and test/ are made from these STLs with the settings in README.md.
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
SCAD = HERE / "enclosure.scad"
PREFIX = "dragon_stand-"

VERSIONS = {"light_left": 1, "light_right": -1}   # folder: cave_side
HALVES = ["half_r", "half_l"]
PARTS = ["wing_r", "wing_l", "plunger", "key_bottom", "key_rear", "dowel_7", "dowel_9", "dowel_8", "dowel_4",
         "plate_coupon", "plate_dowels"]

# name: (part, camera eye x,y,z, centre x,y,z), the light_right version
VIEWS = {
    "closed": ("assembly", "260,-330,230,10,0,80"),
    "other_side": ("assembly", "200,330,180,10,0,70"),
    "exploded": ("exploded", "330,-380,260,10,0,80"),
}
# meshes in the assembled pose for the connections drawing
POSE = {
    "x_half_l": "half(-1);", "x_half_r": "half(1);", "x_atom": "atom_proxy();", "x_plunger": "plunger_placed();",
    "x_sensor": "sensor_proxy();",
}
GEOMETRY = ('echo(J = str("{\\"dowels\\":", dowels, ",\\"bottom_keys\\":", bottom_keys, ",\\"rear_key\\":", rear_key, '
            '",\\"rock0\\":", rock_pts[0], ",\\"shoulder\\":", shoulder, ",\\"atom_box\\":", atom_box, '
            '",\\"head_c\\":", head_c, ",\\"peg_at\\":", peg_at, "}"));')


def openscad() -> str:
    for candidate in (
        os.environ.get("OPENSCAD"),
        shutil.which("openscad"),
        "/Applications/OpenSCAD.app/Contents/MacOS/OpenSCAD",
    ):
        if candidate and Path(candidate).exists():
            return candidate
    sys.exit("OpenSCAD not found: install it or set OPENSCAD")


def run(exe: str, out: Path, part: str, defines: list[str], extra: list[str], scad: Path = SCAD) -> str:
    out.parent.mkdir(exist_ok=True)
    cmd = [exe, "--backend=manifold", "-o", str(out), "-D", f'part="{part}"', *defines, *extra, str(scad)]
    result = subprocess.run(cmd, capture_output=True, text=True)
    log = result.stdout + result.stderr
    if result.returncode != 0 or "ERROR" in log or "WARNING" in log:
        sys.exit(f"FAIL {out.name}\n{log}")
    if out.is_relative_to(HERE):
        print(f"ok {out.relative_to(HERE)}")
    return log


def connections(exe: str, defines: list[str], out: Path) -> None:
    import numpy as np
    import trimesh
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from shapely import affinity
    from shapely.geometry import Polygon
    from shapely.ops import unary_union
    from trimesh.path.polygons import projected

    with tempfile.TemporaryDirectory() as tmp:
        D = Path(tmp)
        scad = D / "pose.scad"
        scad.write_text(f"include <{SCAD}>\n" + GEOMETRY + "\n" +
                        "".join(f'if (part == "{n}") {{ {body} }}\n' for n, body in POSE.items()))
        cave = ["-D", "cave_side=-1"]
        log = run(exe, D / "g.csg", "none", defines + cave, [], scad)
        line = next(l for l in log.splitlines() if l.startswith("ECHO: J = "))
        g = json.loads(line.removeprefix("ECHO: J = ").strip().strip('"').replace('\\"', '"'))
        for name in POSE:
            run(exe, D / f"{name}.stl", name, defines + cave, [], scad)
        run(exe, D / "wing_print.stl", "wing_r", defines, [])
        L = lambda n: trimesh.load(D / f"{n}.stl")
        def xz_poly(mesh):   # silhouette in X-Z, x mirrored (view from +Y onto the cut face)
            m = mesh.copy(); m.vertices = np.c_[-m.vertices[:, 0], m.vertices[:, 2], m.vertices[:, 1]]
            return projected(m, normal=[0, 0, 1], origin=[0, 0, 0], ignore_sign=True, rpad=1e-5, apad=1e-5)
        def fill(ax, geom, **kw):
            for p in (geom.geoms if hasattr(geom, 'geoms') else [geom]):
                ax.fill(*p.exterior.xy, **kw)
                for h in p.interiors: ax.fill(*h.xy, color='white', zorder=kw.get('zorder', 1))
        def section(mesh, y):
            s = mesh.section(plane_origin=[0, y, 0], plane_normal=[0, 1, 0]); geo = None
            for loop in s.discrete:
                p = Polygon(np.c_[-loop[:, 0], loop[:, 2]]).buffer(0)
                geo = p if geo is None else geo.symmetric_difference(p)
            return geo
        C = dict(body='#3c3c3c', cut='#8a8a8a', dowel='#2fb34a', key='#d9a35f', atom='#2c4a9a', plunger='#f08a00', sensor='#e8c400', wing='#5a5a5a')
        fig, (a1, a2) = plt.subplots(1, 2, figsize=(16, 9), dpi=100)
        # --- panel 1: inside, the cave half's cut face ---
        half = L('x_half_l')
        fill(a1, section(half, -0.3), color=C['cut'], zorder=1)
        fill(a1, xz_poly(L('x_atom')), color=C['atom'], alpha=.9, zorder=3)
        fill(a1, xz_poly(L('x_plunger')), color=C['plunger'], alpha=.9, zorder=4)
        fill(a1, xz_poly(L('x_sensor')), color=C['sensor'], alpha=.9, zorder=3)
        lab = dict(fontsize=11, zorder=10)
        for x, z, d in g['dowels']:
            ln = 2 * d - 0.6
            a1.add_patch(plt.Circle((-x, z), 4.5, color=C['dowel'], zorder=6))
            off = {7: (-80, -22), 9: (14, 14), 8: (-60, 30), 4: (85 - x * -1 - (-x), 0)}[d]
            a1.annotate(f'dowel {ln:g} mm', (-x, z), ((92, 75) if d == 4 else (-x + off[0], z + off[1])), arrowprops=dict(arrowstyle='-', color=C['dowel']), color='#1d7a31', fontweight='bold', **lab)
        for x, l in g['bottom_keys']:
            a1.add_patch(plt.Rectangle((-x - 3.5, -1), 7, l + 1, color=C['key'], zorder=6))
        a1.annotate('2 short keys\n(9 mm) from below', (-38, 2), (-25, -22), ha='center', arrowprops=dict(arrowstyle='->', color='#a06a20'), color='#8a5a18', fontweight='bold', **lab)
        rx = g['rock0'][0]; rz, rl = g['rear_key']
        a1.add_patch(plt.Rectangle((-rx - 4, rz - 3.5), rl, 7, color=C['key'], zorder=6))
        a1.annotate('long key (13.5 mm)\ninto the back face', (-rx, rz), (92, 45), arrowprops=dict(arrowstyle='->', color='#a06a20'), color='#8a5a18', fontweight='bold', **lab)
        ab = g['atom_box']; a1.annotate('Atom Lite, button down\non the plunger', (-(ab[0][0] + ab[1][0]) / 2, ab[1][2]), (92, 15), arrowprops=dict(arrowstyle='-', color=C['atom']), color=C['atom'], fontweight='bold', **lab)
        a1.annotate('plunger', (-ab[0][0] + 2, 8), (92, -15), arrowprops=dict(arrowstyle='-', color=C['plunger']), color='#b06000', fontweight='bold', **lab)
        hc = g['head_c']; a1.annotate('Unit CO2L', (-hc[0], hc[2]), (-hc[0] + 10, hc[2] + 30), arrowprops=dict(arrowstyle='-', color='#a08800'), color='#806c00', fontweight='bold', **lab)
        a1.set_title('1  Inside: the cave half, cut face up', fontsize=14, loc='left')
        # --- panel 2: outside, keys and wings ---
        body = unary_union([xz_poly(L('x_half_l')), xz_poly(L('x_half_r'))])
        fill(a2, body, color=C['body'], zorder=1)
        sx, sy, sz = g['shoulder']; px, pv = g['peg_at']
        a2.add_patch(plt.Rectangle((-(sx + px) - 4.2, sz + pv - 2.7), 8.4, 5.4, color='white', zorder=5))
        a2.add_patch(plt.Rectangle((-(sx + px) - 4.2, sz + pv - 2.7), 8.4, 5.4, fill=False, ec='black', lw=1.5, zorder=6))
        w = L('wing_print'); wp = projected(w, normal=[0, 0, 1], ignore_sign=True, rpad=1e-5, apad=1e-5)
        from shapely import affinity
        R = (110, 178); wp = affinity.translate(affinity.scale(wp, -1, 1, origin=(0, 0)), *R)
        fill(a2, wp, color=C['wing'], zorder=2)
        pk = (R[0] - px, R[1] + pv); a2.add_patch(plt.Rectangle((pk[0] - 4, pk[1] - 2.5), 8, 5, color='black', zorder=4))
        a2.annotate('', (-(sx + px) + 3, sz + pv + 1), pk, arrowprops=dict(arrowstyle='->', lw=2.5, color='black', connectionstyle='arc3,rad=0.25'), zorder=7)
        a2.annotate('peg', pk, (pk[0] - 3, pk[1] + 8), color='black', fontweight='bold', **lab)
        a2.annotate('wing peg into the shoulder socket\n(8 mm deep; the other wing likewise)', (0, 0), (-125, 190), color='black', fontweight='bold', **lab)
        for x, l in g['bottom_keys']:
            a2.add_patch(plt.Rectangle((-x - 3.5, -14), 7, 9, color=C['key'], zorder=6))
            a2.annotate('', (-x, 0), (-x, -5), arrowprops=dict(arrowstyle='->', lw=2, color='#a06a20'))
        a2.add_patch(plt.Rectangle((-rx + 6, rz - 3.5), 13.5, 7, color=C['key'], zorder=6))
        a2.annotate('', (-rx, rz), (-rx + 6, rz), arrowprops=dict(arrowstyle='->', lw=2, color='#a06a20'))
        a2.annotate('keys slide in after the halves\nare pressed together', (-38, -14), (-15, -40), ha='center', color='#8a5a18', fontweight='bold', **lab)
        a2.set_title('2  Outside: keys and wings', fontsize=14, loc='left')
        for a, xl in ((a1, (-130, 170)), (a2, (-130, 170))):
            a.set_aspect('equal'); a.axis('off'); a.set_xlim(*xl); a.set_ylim(-50, 205)
        fig.suptitle('Dragon stand for Unit CO2L and Atom Lite: what goes where', fontsize=17, x=0.02, ha='left')
        plt.tight_layout(); fig.savefig(out, dpi=100)


def main() -> None:
    exe = openscad()
    defines: list[str] = []
    args = sys.argv[1:]
    while args:
        flag = args.pop(0)
        if flag == "-D" and args:
            defines += ["-D", args.pop(0)]
        else:
            sys.exit(__doc__)
    binstl = ["--export-format", "binstl"]
    for folder, side in VERSIONS.items():
        for half in HALVES:
            run(exe, HERE / folder / f"{PREFIX}{half}.stl", half, defines + ["-D", f"cave_side={side}"], binstl)
    for part in PARTS:
        run(exe, HERE / "stl" / f"{PREFIX}{part}.stl", part, defines, binstl)
    for name, (part, camera) in VIEWS.items():
        run(exe, HERE / "preview" / f"{name}.png", part, defines + ["-D", "cave_side=-1"],
            ["--render", "--imgsize=1600,1200", f"--camera={camera}", "--projection=p", "--colorscheme=Tomorrow",
             "--viewall", "--autocenter"])
    connections(exe, defines, HERE / "preview" / "connections.png")
    print("ok preview/connections.png")


if __name__ == "__main__":
    main()
