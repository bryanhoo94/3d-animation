#!/usr/bin/env bash
# 凑一个能直接打开的网页文件夹：kit、动作、网页挂载层、预览页、three、模型文件、原图缩略图，全放同一层（文件之间只用 ./ 互相引用）。
#   bash tools/assemble.sh <输出文件夹> <模型.js> [原图 ...]
# config.js 已经有就不动（并排几只、加链接都改它）；没有就生成一份只放这一只的。
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$1"; MODEL="$2"; shift 2
mkdir -p "$OUT"
cp "$HERE/core/kit.js" "$HERE/core/motion.js" "$HERE/core/frames.js" "$HERE/web/avatar.js" "$HERE/web/frames-player.js" "$HERE/web/index.html" "$HERE/vendor/three.module.min.js" "$OUT/"
cp "$MODEL" "$OUT/"
REF=""
for f in "$@"; do cp "$f" "$OUT/"; [ -z "$REF" ] && REF="$(basename "$f")"; done
NAME="$(basename "$MODEL")"
if [ ! -e "$OUT/config.js" ]; then
  cat > "$OUT/config.js" <<JS
/* 预览页放哪几只。并排比「有毛 / 没毛」：SHOW 里写两项，同一个 model、skin 不一样。 */
import * as A from './$NAME';
export const TITLE = '${NAME%-model.js}';
export const SHOW = [
  { model: A, skin: A.SPEC.skin, label: A.SPEC.skin === 'fur' ? '有毛' : '没毛', ref: '$REF' },
];
export const OPT = { shells: 40 };   // 毛几层（慢的设备会自己减到 16）；detail（网格细到几）不写就用模型的 SPEC.detail
export const LINKS = [];             // 右上角的链接：[{ href, label }]
JS
fi
echo "$OUT：$(ls "$OUT" | tr '\n' ' ')"
