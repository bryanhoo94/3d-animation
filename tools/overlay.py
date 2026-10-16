# 渲染图和原图对齐着比：出一张图（左＝渲染、中＝原图按同一比例对齐、右＝原图的边线（红）叠在渲染上），再打出数字。
#   python3 -I tools/overlay.py <渲染.png> <原图> <输出.png> --ref unit,cx,cy --frame K,FLOOR,GROUND [--cells 2 --cell 1] [--floor 原图行px]
#   渲染图：tools/sheet.cjs 顺手存的 <输出>-front.png（正面、原尺寸）；并排几只就给 --cells / --cell 指第几格（从 0 数）。
#   --ref：SPEC.skins.<皮>.ref 里那三个数（都是除以原图宽度的比例）；--frame：SPEC.frame 的 K、FLOOR、GROUND。从模型文件直接打出来：
#     node --input-type=module -e "import * as M from './x-model.js'; const s = M.SPEC, r = s.skins[s.skin].ref, f = s.frame; console.log('--ref', [r.unit, r.cx, r.cy].join(), '--frame', [f.K, f.FLOOR, f.GROUND].join())"
#   --floor：原图脚底那一行（切掉影子，同 measure.py）。
# 数字（都是身子坐标，身子半宽 = 1）：
#   轮廓：每隔 0.05 一行，原图和渲染「中线那一段」的半宽，差多少；头顶、脚底各差多少。
#   深色小块（眼睛、嘴）：原图和渲染各自的中心，渲染减原图差多少。
# 看图别只信红线：红线是原图里所有的边（围巾的纹、垂条的罗纹、眼睛的高光都算），里面的花纹对不对要放大看、看数字。
# 靠前的零件（眼睛、嘴、脚趾、围巾前沿）在渲染里会比量的数偏外、偏下（近大远小）：照 references/model.md「透视」往回收。
import argparse, importlib.util, math, os
from PIL import Image, ImageFilter
import numpy as np

spec = importlib.util.spec_from_file_location('measure', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'measure.py'))
measure = importlib.util.module_from_spec(spec); spec.loader.exec_module(measure)

ap = argparse.ArgumentParser()
ap.add_argument('render'); ap.add_argument('original'); ap.add_argument('out')
ap.add_argument('--ref', required=True); ap.add_argument('--frame', required=True)
ap.add_argument('--cells', type=int, default=1); ap.add_argument('--cell', type=int, default=0)
ap.add_argument('--floor', type=float)
a = ap.parse_args()
unit, cx, cy = (float(v) for v in a.ref.split(','))
K, FLOOR, GROUND = (float(v) for v in a.frame.split(','))

r = Image.open(a.render).convert('RGB')
w = r.width // a.cells; h = r.height
r = r.crop((a.cell * w, 0, a.cell * w + w, h))
# 机位同 kit.js 的 CAMERA：在 (0, .52, 8) 看 (0, .27, 0)，方的那块竖直视角 20°，画框高 1.375 倍
TALL, FOV, DIST, AT = 1.375, 20, math.hypot(0.25, 8.0), 0.27
pxw = w / (2 * DIST * math.tan(math.radians(FOV / 2)))   # z = 0 处世界 1 单位多少像素
full = w * (2 * TALL - 1)
y0 = FLOOR - GROUND * K                                   # 身子坐标 y = 0 在世界里多高
sx, sy = w / 2, full / 2 - (y0 - AT) * pxw                # 它在渲染图上的位置
U = K * pxw                                               # 身子 1 单位 = 渲染图上多少像素
o = Image.open(a.original).convert('RGB'); W = o.width
k = U / (unit * W)                                        # 原图 → 渲染图的缩放
os_ = o.resize((max(1, round(o.width * k)), max(1, round(o.height * k))), Image.LANCZOS)
ox, oy = round(sx - cx * W * k), round(sy - cy * W * k)
bg = r.getpixel((2, 2))
mid = Image.new('RGB', (w, h), bg); mid.paste(os_, (ox, oy))
e = os_.convert('L').filter(ImageFilter.FIND_EDGES).point(lambda v: 255 if v > 18 else 0)
e.paste(0, (0, 0, e.width, 2)); e.paste(0, (0, e.height - 2, e.width, e.height)); e.paste(0, (0, 0, 2, e.height)); e.paste(0, (e.width - 2, 0, e.width, e.height))
edge = Image.new('L', (w, h), 0); edge.paste(e, (ox, oy))   # 原图自己那个方框的边不算
ov = r.copy(); ov.paste((255, 40, 40), mask=edge)
img = Image.new('RGB', (w * 3, h)); img.paste(r, (0, 0)); img.paste(mid, (w, 0)); img.paste(ov, (2 * w, 0))
top = max(0, round(sy - 1.9 * U))                         # 裁掉上面空的那截
img.crop((0, top, w * 3, h)).save(a.out)
print(a.out)

# ── 数字 ──
om, ok_, oarr = measure.silhouette(o, floor=a.floor, warn=False)          # 原图：缩小图坐标 / ok_ → 原图像素
rm, rk, rarr = measure.silhouette(r, warn=False)                          # 渲染
o2b = lambda px, py: ((px / ok_ - cx * W) / (unit * W), (cy * W - py / ok_) / (unit * W))
r2b = lambda px, py: ((px / rk - sx) / U, (sy - py / rk) / U)
b2o = lambda bx, by: (round((cx * W + bx * unit * W) * ok_), round((cy * W - by * unit * W) * ok_))
b2r = lambda bx, by: (round((sx + bx * U) * rk), round((sy - by * U) * rk))


def half(mask, col, row, scale):                          # 中线那一段的半宽（身子单位）
    if not (0 <= row < mask.shape[0] and 0 <= col < mask.shape[1]) or not mask[row, col]: return None
    for s, e in measure.runs_of(mask[row]):
        if s <= col < e: return (e - s) / 2 / scale


print('\n轮廓（中线那一段的半宽；差 = 渲染 − 原图，|差| > 0.02 标 *）')
errs = []
fmt = lambda v: '   —  ' if v is None else f'{v:6.3f}'
for by in np.arange(1.4, -1.45, -0.05):
    ho = half(om, *b2o(0, by), unit * W * ok_); hr = half(rm, *b2r(0, by), U * rk)
    if ho is None and hr is None: continue
    d = None if ho is None or hr is None else hr - ho
    if d is not None: errs.append(abs(d))
    print(f'  y {by:5.2f}  原图 {fmt(ho)}  渲染 {fmt(hr)}  差 {fmt(d)}{" *" if d is not None and abs(d) > 0.02 else ""}')
if errs: print(f'  中位数 {np.median(errs):.3f}，平均 {np.mean(errs):.3f}，最大 {max(errs):.3f}（{len(errs)} 行；个别行特别大多半是抠图的事：头顶反光缺口、手和身子连成一段、脚边的影子）')
oy_, ry_ = np.nonzero(om)[0], np.nonzero(rm)[0]
ot, ob = o2b(0, oy_.min())[1], o2b(0, oy_.max())[1]; rt, rb = r2b(0, ry_.min())[1], r2b(0, ry_.max())[1]
print(f'  最高点 原图 {ot:.3f} 渲染 {rt:.3f} 差 {rt - ot:+.3f} · 最低点 原图 {ob:.3f} 渲染 {rb:.3f} 差 {rb - ob:+.3f}（原图最低点含影子就先给 --floor）')

print('\n深色小块（眼睛、嘴；中心和宽，身子坐标；差 = 渲染 − 原图）')
ob_ = [(*o2b(x, y), bw / ok_ / (unit * W)) for x, y, bw, bh, n in measure.dark_blobs(oarr, om, 6)]
rb_ = [(*r2b(x, y), bw / rk / U) for x, y, bw, bh, n in measure.dark_blobs(rarr, rm, 6)]
for x, y, bw in [b for b in ob_ if b[2] < 0.5][:3]:                     # 宽过 0.5 的是影子，不是五官
    if not rb_: break
    m = min(rb_, key=lambda b: (b[0] - x) ** 2 + (b[1] - y) ** 2)
    print(f'  原图 ({x:6.3f}, {y:6.3f}) 宽 {bw:.3f} · 渲染 ({m[0]:6.3f}, {m[1]:6.3f}) 宽 {m[2]:.3f} · 差 ({m[0] - x:+.3f}, {m[1] - y:+.3f})')
