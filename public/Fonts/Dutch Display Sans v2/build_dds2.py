"""Dutch Display Sans v2 — the DDS chevron applied to every capital, every lowercase letter (at x-height),
figures and selected symbols. Modified OFL derivative of Unbounded 1.701; stays under SIL OFL 1.1."""
import os, sys, json, shutil, unicodedata
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.basePen import decomposeQuadraticSegment
from fontTools.misc.bezierTools import splitQuadraticAtT

OLD = '/private/tmp/claude-501/-Users-caden-Documents-OpenPhoto-End-of-26-27--Thank-You-ASB-/05c278d8-b922-4e5f-90b2-b98102cb4865/scratchpad/'
NEW = '/private/tmp/claude-501/-Users-caden-Keep-OpenPhoto-End-of-26-27--Thank-You-ASB-/05c278d8-b922-4e5f-90b2-b98102cb4865/scratchpad/'
SRC = OLD + 'fonts/Unbounded.ttf'
OUT = '/Users/caden/Keep/OpenPhoto/End of 26-27 (Thank You ASB)/Dutch Display Sans/v2/'
FAM = 'Dutch Display Sans'; PS = 'DutchDisplaySans'; VER = '2.000'
WEIGHTS = [(200, 'ExtraLight'), (300, 'Light'), (400, 'Regular'), (500, 'Medium'),
           (600, 'SemiBold'), (700, 'Bold'), (800, 'ExtraBold'), (900, 'Black')]
CFG = dict(zone_full=1.8, zone_zero=2.2,       # stroke within 1.8x depth of the left edge bends; beyond 2.2x stays put
           lower_scale=0.72,                    # lowercase notch depth relative to the caps notch
           symbols='0123456789&?!$#%@',
           diag_slope=0.15, diag_scale=0.5,
           skip={'B', 'E'})                     # already carry the original notch
NOTE = 'DDS chevron: capitals, lowercase (x-height), figures and & ? ! $ # % @'


# ---------- outline <-> segments ----------
def segments(gs, name):
    rp = RecordingPen(); gs[name].draw(rp)
    contours, cur, start, pen = [], None, None, None
    for op, args in rp.value:
        if op == 'moveTo':
            cur = []; start = pen = tuple(args[0])
        elif op == 'lineTo':
            p = tuple(args[0]); cur.append(('L', pen, p)); pen = p
        elif op == 'qCurveTo':
            if args[-1] is None: return None          # all-off-curve contour: leave glyph untouched
            for c, p in decomposeQuadraticSegment(args):
                cur.append(('Q', pen, tuple(c), tuple(p))); pen = tuple(p)
        elif op == 'closePath' or op == 'endPath':
            if pen != start: cur.append(('L', pen, start))
            contours.append(cur); cur = None
        else:
            return None
    return contours


def flatten(contours, n=12):
    edges = []
    for cont in contours:
        for s in cont:
            if s[0] == 'L': edges.append((s[1], s[2]))
            else:
                p0, c, p1 = s[1:]; prev = p0
                for k in range(1, n + 1):
                    t = k / n; mt = 1 - t
                    q = (mt * mt * p0[0] + 2 * mt * t * c[0] + t * t * p1[0], mt * mt * p0[1] + 2 * mt * t * c[1] + t * t * p1[1])
                    edges.append((prev, q)); prev = q
    return edges


def left_edge_fn(edges):
    cache = {}
    def L(y):
        yk = round(y * 2) / 2
        if yk in cache: return cache[yk]
        xs = []
        for (a, b) in edges:
            if (a[1] - yk) * (b[1] - yk) <= 0 and a[1] != b[1]:
                xs.append(a[0] + (yk - a[1]) * (b[0] - a[0]) / (b[1] - a[1]))
        cache[yk] = min(xs) if xs else None
        return cache[yk]
    return L


def is_vert(seg, ratio=1.2):
    p0, p1 = seg[1], seg[-1]
    dy, dx = abs(p1[1] - p0[1]), abs(p1[0] - p0[0])
    return dy > 1 and dy >= ratio * dx


def split_at(contours, ay, L, zone):
    """Split upright segments that cross y=ay within `zone` of the left silhouette (sharp apex point)."""
    la = L(ay); out = []
    for cont in contours:
        nc = []
        for s in cont:
            done = False
            if la is not None and is_vert(s):
                if s[0] == 'L':
                    p0, p1 = s[1], s[2]
                    if (p0[1] - ay) * (p1[1] - ay) < 0:
                        t = (ay - p0[1]) / (p1[1] - p0[1]); x = p0[0] + t * (p1[0] - p0[0])
                        if x - la <= zone:
                            m = (x, ay); nc += [('L', p0, m), ('L', m, p1)]; done = True
                else:
                    p0, c, p1 = s[1:]
                    a_ = p0[1] - 2 * c[1] + p1[1]; b_ = 2 * (c[1] - p0[1]); c_ = p0[1] - ay; ts = []
                    if abs(a_) < 1e-9:
                        if abs(b_) > 1e-9: ts = [-c_ / b_]
                    else:
                        disc = b_ * b_ - 4 * a_ * c_
                        if disc >= 0:
                            r = disc ** 0.5; ts = [(-b_ - r) / (2 * a_), (-b_ + r) / (2 * a_)]
                    ts = sorted(t for t in ts if 1e-4 < t < 1 - 1e-4)
                    if ts:
                        t = ts[0]; x = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * c[0] + t * t * p1[0]
                        if x - la <= zone:
                            (q0, qc, qm), (_, qc2, q1) = splitQuadraticAtT(p0, c, p1, t)
                            qm = (qm[0], ay); nc += [('Q', q0, qc, qm), ('Q', qm, qc2, q1)]; done = True
            if not done: nc.append(s)
        out.append(nc)
    return out


def to_points(cont):
    """contour segments -> point list [(x,y,on)], plus per-segment point indices."""
    pts = [(cont[0][1][0], cont[0][1][1], True)]; idx = []
    for k, s in enumerate(cont):
        st = len(pts) - 1
        if s[0] == 'Q': pts.append((s[2][0], s[2][1], False))
        last = k == len(cont) - 1
        if last: idx.append([st] + ([len(pts) - 1] if s[0] == 'Q' else []) + [0])
        else:
            pts.append((s[-1][0], s[-1][1], True)); idx.append(list(range(st, len(pts))))
    return pts, idx


def from_points(pts, cont, idx):
    out = []
    for s, ix in zip(cont, idx):
        P = [(pts[i][0], pts[i][1]) for i in ix]
        out.append(('L', P[0], P[1]) if s[0] == 'L' else ('Q', P[0], P[1], P[2]))
    return out


def deform(contours, L, depth, y_lo, ay, y_hi, z0, z1):
    """Move only the upright left stroke(s) that pass through the apex, following the DDS '<' profile."""
    def tri(y):
        if y_lo < y <= ay: return (y - y_lo) / (ay - y_lo)
        if ay < y < y_hi: return (y_hi - y) / (y_hi - ay)
        return 0.0
    la = L(ay)
    if la is None: return contours
    wfun = lambda d: 1.0 if d <= z0 else (0.0 if d >= z1 else (z1 - d) / (z1 - z0))
    data = [to_points(c) for c in contours]
    moves = [dict() for _ in contours]; bend_d, bend_w = None, 0.0
    for ci, cont in enumerate(contours):
        n = len(cont)
        for k, s in enumerate(cont):
            p = s[-1]
            if abs(p[1] - ay) > 1e-6 or not is_vert(s): continue
            nxt = cont[(k + 1) % n]
            if not is_vert(nxt): continue
            d = p[0] - la; w = wfun(d)
            if w <= 0: continue
            q0 = s[1]; slope = abs(p[0] - q0[0]) / max(abs(p[1] - q0[1]), 1e-6)
            if s[0] == 'L' and slope > CFG['diag_slope']: w *= CFG['diag_scale']   # diagonal leg: facet, not fracture
            chain = {k, (k + 1) % n}
            j = k
            while True:                      # walk backwards while upright and inside the profile
                j = (j - 1) % n
                if j in chain or not is_vert(cont[j]) or tri(cont[j][-1][1]) <= 0 and tri(cont[j][1][1]) <= 0: break
                chain.add(j)
            j = (k + 1) % n
            while True:
                j = (j + 1) % n
                if j in chain or not is_vert(cont[j]) or tri(cont[j][1][1]) <= 0 and tri(cont[j][-1][1]) <= 0: break
                chain.add(j)
            pts, idx = data[ci]
            for sj in chain:
                for pi in idx[sj]:
                    moves[ci][pi] = max(moves[ci].get(pi, 0.0), w)
            if d > 1:                           # an inner edge moved -> the stroke bends
                bend_d = max(bend_d or 0, d); bend_w = max(bend_w, w)
    out = []
    for ci, cont in enumerate(contours):
        pts, idx = data[ci]; mv = moves[ci]; new = []
        for pi, (x, y, on) in enumerate(pts):
            w = mv.get(pi)
            if w is None and bend_d is not None and tri(y) > 0:
                le = L(y)
                if le is not None and x - le <= bend_d + 2: w = bend_w      # crossbar/bowl ends inside a bent stem
            new.append((x + depth * tri(y) * w, y, on) if w else (x, y, on))
        out.append(from_points(new, cont, idx))
    return out


def rebuild(contours, gs):
    pen = TTGlyphPen(gs)
    for cont in contours:
        if not cont: continue
        pen.moveTo(cont[0][1])
        for s in cont:
            if s[0] == 'L': pen.lineTo(s[2])
            else: pen.qCurveTo(s[2], s[3])
        pen.closePath()
    return pen.glyph()


def b_notch(f):
    g = f['glyf']['B']; c = list(g.coordinates); e0 = g.endPtsOfContours[0]
    outer = c[:e0 + 1]; mn = min(p[0] for p in outer)
    apex = max((p for p in outer if 300 < p[1] < 450 and p[0] < mn + 120), key=lambda p: p[0])
    return apex[0] - mn, apex[1]


def targets(f):
    cmap = f.getBestCmap(); glyf = f['glyf']; seen = {}
    for cp, gn in cmap.items():
        if gn in seen or gn in CFG['skip'] or gn not in glyf or glyf[gn].isComposite() or glyf[gn].numberOfContours <= 0:
            continue
        ch = chr(cp); cat = unicodedata.category(ch)
        if cat == 'Lu' and unicodedata.name(ch, '').startswith('LATIN'): seen[gn] = 'cap'
        elif cat == 'Ll' and unicodedata.name(ch, '').startswith('LATIN'): seen[gn] = 'low'
        elif ch in CFG['symbols']: seen[gn] = 'sym'
    return seen


def process_weight(wt):
    f = instantiateVariableFont(TTFont(SRC), {'wght': wt}, updateFontNames=False)
    gs = f.getGlyphSet(); glyf = f['glyf']; hmtx = f['hmtx']
    cap = f['OS/2'].sCapHeight; xh = f['OS/2'].sxHeight
    depth, ay = b_notch(f)
    stats = {'cap': 0, 'low': 0, 'sym': 0, 'skipped': []}
    for gn, kind in targets(f).items():
        cont = segments(gs, gn)
        if cont is None: stats['skipped'].append(gn); continue
        if kind == 'low':
            d, lo, a_, hi = depth * CFG['lower_scale'], 0, xh / 2, xh
        else:
            d, lo, a_, hi = depth, 0, ay * cap / 750, cap
        z0, z1 = CFG['zone_full'] * d, CFG['zone_zero'] * d
        L = left_edge_fn(flatten(cont))
        cont = split_at(cont, a_, L, z1)
        L = left_edge_fn(flatten(cont))
        cont = deform(cont, L, d, lo, a_, hi, z0, z1)
        g = rebuild(cont, gs)
        glyf[gn] = g; g.recalcBounds(glyf)
        hmtx[gn] = (hmtx[gn][0], g.xMin if hasattr(g, 'xMin') else hmtx[gn][1])
        stats[kind] += 1
    return f, depth, stats


def set_names(f, style):
    n = f['name']; n.names = [r for r in n.names if r.nameID > 255]
    legacy_fam, legacy_sub = (FAM, style) if style in ('Regular', 'Bold') else (f'{FAM} {style}', 'Regular')
    recs = {0: 'Copyright 2022 The Unbounded Project Authors (https://github.com/googlefonts/unbounded). '
               'Dutch Display Sans modifications copyright 2026 Caden "Dutch".',
            1: legacy_fam, 2: legacy_sub, 3: f'{VER};{PS}-{style}', 4: f'{FAM} {style}',
            5: f'Version {VER}; derived from Unbounded 1.701', 6: f'{PS}-{style}',
            9: 'Luke Prowse, Jean-Baptiste Morizot, Fátima Lázaro, Florian Runge (Unbounded); DDS modifications by Caden "Dutch"',
            10: f'Dutch Display Sans {VER}: a modified version of Unbounded 1.701 with the DDS chevron ({NOTE}). '
                'Licensed under the SIL Open Font License 1.1.',
            13: 'This Font Software is licensed under the SIL Open Font License, Version 1.1. '
                'This license is available with a FAQ at: https://openfontlicense.org',
            14: 'https://openfontlicense.org', 16: FAM, 17: style}
    for nid, txt in recs.items(): n.setName(txt, nid, 3, 1, 0x409)


if __name__ == '__main__':
    os.makedirs(OUT + 'static', exist_ok=True)
    only = sys.argv[1:]
    for wt, style in WEIGHTS:
        if only and style not in only: continue
        f, depth, st = process_weight(wt)
        if 'STAT' in f: del f['STAT']
        f['OS/2'].usWeightClass = wt
        f['OS/2'].fsSelection = (f['OS/2'].fsSelection & ~0b1100001) | (0b100000 if style == 'Bold' else 0) | (0b1000000 if style == 'Regular' else 0)
        f['head'].macStyle = 1 if style == 'Bold' else 0
        f['head'].fontRevision = float(VER)
        set_names(f, style)
        f.save(OUT + f'static/{PS}-{style}.ttf')
        print(f'{style:10s} depth {depth:5.1f} | caps {st["cap"]} lower {st["low"]} symbols {st["sym"]} | skipped {st["skipped"]}')
    json.dump(CFG | {'skip': sorted(CFG['skip'])}, open(NEW + 'out/dds2_cfg.json', 'w'), indent=2)
