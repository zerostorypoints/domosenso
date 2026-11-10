"""Slab loss of building materials from ITU-R P.2040-3, behind components/floorplan/cards/lib/materials.json.

A homogeneous slab at normal incidence, with permittivity and conductivity from Table 3
(eta' = a * f^b, sigma = c * f^d, f in GHz), averaged over +-20 % thickness (41 steps) to remove the
standing-wave ripple. `main()` prints the computed column; the rounded, widened field values in
materials.json are written by hand and this script never rewrites them.

Check status: the coefficients were checked against MathWorks' reproduction of P.2040-3 Table 3;
the ITU text was not consulted.
"""
import cmath
import math

# material: (a, b, c, d)
P2040_TABLE_3 = {
    'concrete': (5.24, 0.0, 0.0462, 0.7822),
    'brick': (3.91, 0.0, 0.0238, 0.16),
    'plasterboard': (2.73, 0.0, 0.0085, 0.9395),
    'wood': (1.99, 0.0, 0.0047, 1.0718),
    'glass': (6.31, 0.0, 0.0036, 1.3394),
}
C = 299792458.0
EPS0 = 8.8541878128e-12
STEPS = 41


def _loss_at(material: str, f_ghz: float, d: float) -> float:
    a, b, c, dd = P2040_TABLE_3[material]
    # exp(-i w t) convention: the loss term is +j, so n has a positive imaginary part and the field decays.
    eta = a * f_ghz ** b + 1j * (c * f_ghz ** dd) / (2 * math.pi * f_ghz * 1e9 * EPS0)
    n = cmath.sqrt(eta)
    kd = 2 * math.pi * f_ghz * 1e9 / C * n * d
    t = 2 / (2 * cmath.cos(kd) - 1j * (n + 1 / n) * cmath.sin(kd))
    return -20 * math.log10(abs(t))


def slab_loss(material: str, f_ghz: float, thickness_m: float) -> float:
    """Transmission loss in dB, averaged over 0.8..1.2 x thickness."""
    ds = [thickness_m * (0.8 + 0.4 * i / (STEPS - 1)) for i in range(STEPS)]
    return sum(_loss_at(material, f_ghz, d) for d in ds) / STEPS


def main() -> None:
    rows = [('drywall', 'plasterboard', (0.0125, 0.025)), ('wood', 'wood', (0.04,)), ('brick', 'brick', (0.12, 0.25)),
            ('concrete', 'concrete', (0.10, 0.20)), ('reinforced_concrete', 'concrete', (0.20, 0.25)),
            ('glass', 'glass', (0.004,))]
    for mid, ref, thicknesses in rows:
        for d in thicknesses:
            vals = ' / '.join(f'{slab_loss(ref, f, d):.1f}' for f in (2.437, 5.5, 6.5))
            print(f'{mid:<20} {d * 100:5.2f} cm  {vals} dB (2.4 / 5 / 6 GHz)')


if __name__ == '__main__':
    main()
