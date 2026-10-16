# 量原图：抠出轮廓，一行一行量宽度，找眼睛和嘴（深色小块），取颜色，画身子坐标格子。建模时每个数都从这里来，别凭感觉。
#   python3 -I tools/measure.py <原图> [--unit 半宽px --cx 中心x --cy 中心y] [--rows 24] [--pick x,y ...] [--mask 抠图.png] [--grid 格子.png] [--thr 24] [--floor 行px]
# 先不给 --unit：只出像素。看 runs 选「身子」那一段（手、耳朵是分开的段，或者比身子凸出去的部分），身子半宽当 unit、那一段的中点当 cx、
#   你想当 y = 0 的那一行当 cy，再跑一次出身子坐标（x 右、y 上，身子半宽 = 1）。
#   身子最宽那一行被手（鳍、翅膀）挡住、跟手连成一段时：用手下面第一行看得清的身子，再按身子的形状往回推最宽处。
# 底要干净（纯色或平滑渐变都行）。会抠错的两处：
#   - 头顶反光那种很亮的地方，轮廓上会缺一个口：那几行会裂成两段（看 outer：整行最左到最右，比对上下几行）。
#   - 脚下的影子会被算进去：--floor 只能切掉脚底以下；脚旁边那几行还是脏的，脚和肚子底用 --grid 的格子图直接读。
# --grid：原图上画身子坐标的格子（细线 0.1、粗线 0.5，标了数），脸那块、围巾边、垂条下沿、脚趾这些里面的花纹边，就在这张图上读。
import argparse, json, sys
from collections import deque
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import numpy as np


def dil(m, r):                                        # 圆形膨胀 r 像素
    p = np.pad(m, r); o = np.zeros_like(m)
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if dx * dx + dy * dy <= r * r: o |= p[r + dy:r + dy + m.shape[0], r + dx:r + dx + m.shape[1]]
    return o


def ero(m, r): return ~dil(~m, r)


def silhouette(im, thr=24, floor=None, warn=True):
    """原图（PIL RGB）→ (轮廓 mask, 缩放比 k, 缩小后的 RGB 数组)。量的时候缩到 1000px 以内；mask 的坐标 ÷ k 是原图像素。"""
    W, H = im.size
    k = min(1.0, 1000 / max(W, H))
    sm = im.resize((round(W * k), round(H * k)), Image.LANCZOS) if k < 1 else im.copy()
    w, h = sm.size
    # 底：四边那一圈拟合一个平滑的渐变（棚拍图的底多半是中间亮、四角暗），再算每个点跟「这里的底」差多少
    a_ = np.asarray(sm.filter(ImageFilter.BoxBlur(1))).astype(float)
    yy, xx = np.mgrid[0:h, 0:w] / np.array([h, w])[:, None, None]
    edge6 = np.zeros((h, w), bool); edge6[:6] = edge6[-6:] = True; edge6[:, :6] = edge6[:, -6:] = True
    X = np.stack([np.ones_like(xx), xx, yy, xx * xx, xx * yy, yy * yy], -1)
    coef, *_ = np.linalg.lstsq(X[edge6], a_[edge6], rcond=None)
    diff = a_ - X @ coef
    lum = diff.mean(2); chroma = np.abs(diff - lum[..., None]).max(2)
    if warn and np.abs(diff[edge6]).max(1).mean() > 8: print('注意：四边不像干净的底（有东西贴边？），抠出来的轮廓要自己看一眼 --mask', file=sys.stderr)
    gx = np.zeros((h, w)); gy = np.zeros((h, w))
    gx[:, 1:-1] = np.abs(a_[:, 2:] - a_[:, :-2]).max(2); gy[1:-1] = np.abs(a_[2:] - a_[:-2]).max(2)
    # 挡住「底」往里灌的墙：颜色偏了、明暗差很多、或者是一道边
    wall = dil((chroma > thr * 0.42) | (np.abs(lum) > thr * 1.7) | (np.hypot(gx, gy) > thr * 0.6), 2)
    img = Image.fromarray((wall * 255).astype(np.uint8)).copy()
    for x in range(0, w, 10):
        for y in (0, h - 1):
            if img.getpixel((x, y)) == 0: ImageDraw.floodfill(img, (x, y), 128, thresh=0)
    for y in range(0, h, 10):
        for x in (0, w - 1):
            if img.getpixel((x, y)) == 0: ImageDraw.floodfill(img, (x, y), 128, thresh=0)
    mask = ~dil(np.asarray(img) == 128, 2)
    mask = dil(ero(mask, 3), 3)                       # 去掉底上的零星小点
    mask = ero(dil(mask, 6), 6)                       # 补上轮廓上的小缺口
    if floor: mask[round(floor * k):] = False          # 脚下的影子：脚底那一行以下不算
    return mask, k, np.asarray(sm).astype(int)


def runs_of(line):
    """一行 mask → 实的那几段 [起, 止)（缩小图坐标）"""
    out, x, w = [], 0, len(line)
    while x < w:
        if line[x]:
            s = x
            while x < w and line[x]: x += 1
            if x - s > 2: out.append([s, x])
        x += 1
    return out


def dark_blobs(arr, mask, n=8):
    """深色小块（眼睛、嘴、鼻子）：轮廓里面、比周围暗很多的连通块，按大小排。返回 [(中心 x, 中心 y, 宽, 高, 面积)]（缩小图坐标）"""
    lum = arr @ np.array([0.299, 0.587, 0.114])
    inner = ero(mask, 3)                               # 轮廓边上那一圈不算（深色底的渲染图，边上一圈是暗的）
    dark = inner & (lum < min(90, np.percentile(lum[inner], 8)))
    h, w = dark.shape; seen = np.zeros_like(dark); blobs = []
    for sy, sx in zip(*np.nonzero(dark)):
        if seen[sy, sx]: continue
        q = deque([(sy, sx)]); seen[sy, sx] = True; pts = []
        while q:
            y, x = q.popleft(); pts.append((y, x))
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < h and 0 <= nx < w and dark[ny, nx] and not seen[ny, nx]: seen[ny, nx] = True; q.append((ny, nx))
        if len(pts) < 12: continue
        py, px = np.array(pts).T
        blobs.append((px.mean(), py.mean(), px.max() - px.min() + 1, py.max() - py.min() + 1, len(pts)))
    return sorted(blobs, key=lambda b: -b[4])[:n]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('image'); ap.add_argument('--unit', type=float); ap.add_argument('--cx', type=float); ap.add_argument('--cy', type=float)
    ap.add_argument('--rows', type=int, default=24); ap.add_argument('--pick', nargs='*', default=[]); ap.add_argument('--mask'); ap.add_argument('--grid')
    ap.add_argument('--thr', type=float, default=24, help='多灵敏：小一点抠得更紧（底很干净时），大一点不容易把底的噪点算进来')
    ap.add_argument('--floor', type=float, help='脚底在原图哪一行（px）：这一行以下不算（切掉影子）')
    a = ap.parse_args()

    im = Image.open(a.image).convert('RGB'); W, H = im.size
    mask, k, arr = silhouette(im, a.thr, a.floor)
    if a.mask: Image.fromarray((mask * 255).astype(np.uint8)).resize((W, H)).save(a.mask)
    ys, xs = np.nonzero(mask)
    if not len(ys): sys.exit('没抠到东西：底色和角色太像？试试 --thr 小一点')
    P = lambda v: round(float(v) / k, 1)               # 缩小图坐标 → 原图像素
    body = lambda px, py: [round((px - a.cx) / a.unit, 3), round((a.cy - py) / a.unit, 3)] if a.unit else None

    out = {'image': a.image, 'size': [W, H], 'bbox': [P(xs.min()), P(ys.min()), P(xs.max() + 1), P(ys.max() + 1)]}
    if a.unit: out['frame'] = {'unit': a.unit, 'cx': a.cx, 'cy': a.cy, '记法': 'x 右、y 上，身子半宽 = 1；SPEC.ref 里写 unit/W、cx/W、cy/W'}

    # 每一行：哪几段是实的（左、右，原图像素）、整行最左到最右（outer）；给了 unit 再算身子坐标里的 y 和每段半宽、中点
    rows = []
    for r in np.linspace(ys.min(), ys.max(), a.rows).round().astype(int):
        runs = [[P(s), P(e)] for s, e in runs_of(mask[r])]
        row = {'y': P(r), 'runs': runs, 'outer': [runs[0][0], runs[-1][1]] if runs else []}
        if a.unit:
            row['by'] = round((a.cy - r / k) / a.unit, 3)
            row['seg'] = [{'hw': round((R - L) / 2 / a.unit, 3), 'mid': round(((L + R) / 2 - a.cx) / a.unit, 3)} for L, R in runs]
        rows.append(row)
    out['rows'] = rows

    blobs = []
    for bx, by, bw, bh, n in dark_blobs(arr, mask):
        b = {'center': [P(bx), P(by)], 'size': [P(bw), P(bh)], 'area': int(n / k / k)}
        if a.unit:
            b['body'] = body(bx / k, by / k)
            b['half'] = [round(bw / k / 2 / a.unit, 3), round(bh / k / 2 / a.unit, 3)]
        blobs.append(b)
    out['dark'] = blobs
    if blobs: out['dark说明'] = '最大的两块一般是眼睛、扁的是嘴；最大的一块要是在脚下，那是影子'

    # 取颜色：每个点周围 9×9 的中位数（取亮面那一块，不要取在影子里）。点按原图像素给：--pick 800,600 1200,640
    picks = []
    for s in a.pick:
        x, y = (float(v) for v in s.split(','))
        cx, cy = round(x * k), round(y * k)
        c = np.median(arr[max(0, cy - 4):cy + 5, max(0, cx - 4):cx + 5].reshape(-1, 3), axis=0).round().astype(int)
        picks.append({'at': [x, y], 'hex': '#%02x%02x%02x' % tuple(c), 'body': body(x, y)})
    if picks: out['pick'] = picks

    # 格子图：原图上画身子坐标（细线每 0.1，粗线每 0.5，标数）
    if a.grid:
        if not a.unit: sys.exit('--grid 要先给 --unit --cx --cy')
        g = im.copy(); d = ImageDraw.Draw(g)
        try: font = ImageFont.load_default(size=max(14, W // 70))
        except TypeError: font = ImageFont.load_default()      # 老版本 Pillow：字小一点
        for i in range(-30, 31):
            v = i / 10; strong = i % 5 == 0; col = (255, 0, 120) if strong else (0, 160, 255); wd = 2 if strong else 1
            x = a.cx + v * a.unit; y = a.cy - v * a.unit
            if 0 <= x < W: d.line([(x, 0), (x, H)], fill=col, width=wd)
            if 0 <= y < H: d.line([(0, y), (W, y)], fill=col, width=wd)
            if strong:
                if 0 <= x < W: d.text((x + 4, 4), f'x {v:g}', fill=col, font=font)
                if 0 <= y < H: d.text((4, y + 2), f'y {v:g}', fill=col, font=font)
        g.save(a.grid); out['grid'] = a.grid
    print(json.dumps(out, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
