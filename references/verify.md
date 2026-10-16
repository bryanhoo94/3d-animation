# 验收

截图是给自己验的。验完了再给用户链接 / 路径，不发截图让用户挑。

## 准备

```bash
bash tools/assemble.sh /tmp/av <名字>-model.js <原图>          # 凑预览页（已有 config.js 不会被盖）
cd /tmp/av && python3 -m http.server 8781 --bind 127.0.0.1 &   # 端口被占就换一个（先 ss -ltn 看）；用完 kill 那个 pid，别 pkill -f（会把自己的 shell 一起杀掉）
export PW=<…/node_modules/playwright>
```

## 清单

| 查什么 | 怎么查 | 过的标准 |
|---|---|---|
| 像不像原图 | `tools/overlay.py`（sheet 存的 `-front.png` 对原图），看图也看数字 | 每行轮廓差中位数 ≤ 0.015；最高点、最低点差 ≤ 0.02；眼睛、嘴中心差 ≤ 0.02；亮面颜色看不出差 |
| 每个姿势 | `tools/sheet.cjs` 出姿势表（正面、闭眼、左右看、侧面、背面、蹲、跳到最高 ＋ 每个动作；做一次的动作取做到一半那一刻） | 手看得见、没有穿模、背面和侧面不露馅（没有破洞、零件没飘在空中） |
| 动画真跑 | `tools/live.cjs <网址> <前缀> 390 844`，再跑一次 `1440 900` | 开场转身 → 跳 → 平时；每个按钮都能进；做一次的动作做完按钮回到「平时」；点它会跳；一直在动；没有报错；没有横向滚动 |
| 帧图 | `tools/frames.cjs`，看 frames.png | 每格都在画框里（跳到最高不出顶）；新动作的几格对 |
| App | 见 [app.md](app.md)「验」：tsc ＋ expo 网页导出跑一遍 | 同「动画真跑」 |
| 线上 | 部署完 `cmp` 线上文件和验过的那份；开一次线上地址 | 一模一样；能打开 |

## 这台机器的坑

- **没有显卡**：chromium 带 `--use-angle=swiftshader --enable-unsafe-swiftshader` 软件渲染。有毛 40 层一帧几秒：测动画流程时 `SHELLS=2`（只在测试里改 config.js 的毛层数，页面代码不动）；视口别开太大（390 宽最快）。
- **页面会以为设备慢、自己停掉**：无头浏览器一秒只有几帧。`live.cjs` 已经把页面的时钟换成「每帧 16.7ms」，截图那几秒时钟停住（不然截到的是几百毫秒以后的样子）。
- **整页截图、toDataURL 很慢会超时**：只截画布（`clip` / 元素截图），超时给够（几分钟）。
- 服务器忙（别的任务占满 CPU）时更慢：先看一眼 `uptime`，慢就等或者把测试拆小。

## 改了 kit.js / motion.js 以后：回归比对

kit 和 motion 是所有角色共用的。改之前先用旧版本给 `examples/` 的每只、几个姿势各截一张（同样的视口、同样的画布宽），改完再截，逐像素比：

```bash
python3 -I -c "from PIL import Image; import numpy as np; a=np.asarray(Image.open('old.png')).astype(int); b=np.asarray(Image.open('new.png')).astype(int); print(np.abs(a-b).max())"
```
本来就不该变的，差要是 0。2026-10-16 把 r1 / r3 / r2 的代码拆成 kit ＋ 模型文件时就是这样验的：6 个姿势 × 3 只，差都是 0。
