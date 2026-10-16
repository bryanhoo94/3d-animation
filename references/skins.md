# 两种皮：有毛 / 没毛

同一份形状，`skin: 'fur'` 或 `'vinyl'` 一个字切换；`SPEC.skin` 是默认的那种。两种并排比：`config.js` 的 `SHOW` 放两项，同一个 model、skin 不一样（`examples/pink`：r1 有毛、r3 没毛）。

## 有毛（fur）

套壳毛：每个零件画 `shells` 层（默认 40–48，InstancedMesh），每层沿法线往外推一点，按细胞噪声丢掉不在毛上的点；毛尖往下坠、毛根暗毛尖亮、逆光一圈绒。
- 毛的参数：`SPEC.fur = { fine, small }`，不写就用 kit 的 `FUR_PARAMS`。fine 给实时那只；small（毛粗一点、乱一点）给帧图里 64px 以下的小格。
- 每个零件的毛长比例 `lenK`（在 `mesh(…, { lenK })`）：身子 1、手 0.9、耳朵脚 0.5–0.8、围巾起绒 0.35。
- 光：`SPEC.look.fur = { wrap, dark, lit, root, droop, rimPow, rimMix, rim }`。
- 代价：每帧画几十层。慢的设备自己减到 16 层（网页、App 都会），还慢就停在正面那一格。帧图里的毛是先画 2 倍大再缩一半（不超采样会全是锯齿）。

## 没毛（vinyl：软胶、搪胶、黏土）

每个零件一层：哑光，一大片很宽很淡的亮，边上一圈很淡的光。
- 光：`SPEC.look.vinyl = { wrap, dark, lit, push, specCol, specPow, spec, rimMix, rimPow, rim }`。`spec` 是亮有多强（0.10–0.12），`specPow` 越小亮那片越大（8–10）；每个零件还能用 `gloss` 乘一下（围巾 0.7，没那么亮）。
- `push`：面往外推几成毛长。同一份形状同时做有毛和没毛两只时用 0.6，两只轮廓一样大；只做没毛的用 0。
- 软胶上「嵌进去」的花纹（肚子那块、脸那块）在 `alb()` 的 `ao` 里给边一道浅影；围巾在肚子上的影子也写在 `ao`。毛不吃 `ao`（毛自己根部就暗）。
- 压纹只改法线：`#define BUMP` ＋ `vec3 bump(vec3 N, vec3 p, vec3 X)`（X 是零件自己的 x 在画面里朝哪）。

## 共同的

- `SPEC.look.L`：光从哪来（跟着镜头走）。默认左上；**原图右边亮就把 x 改成正的**。`ao`：脚下自己挡自己有多暗。`eyeRim`：眼珠下沿一圈反光（软胶 0.16 看得出眼珠是鼓的）。
- 暗面颜色对着原图调，别用灰：粉的影子偏玫瑰、绿的影子偏黄绿、白的影子偏暖。
- 两张原图（有毛一张、没毛一张）颜色不同：颜色写在 `SPEC.skins.<皮>.uniforms`，各自取色。
