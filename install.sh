#!/usr/bin/env bash
# 安装 3d-animation：把这个文件夹链接进 Claude Code 和 Codex 的 skills 文件夹。
#
#   bash install.sh          看它打算做什么，确认后才动手
#   bash install.sh --yes    不问，直接装
#
# 只会碰 ~/.claude/skills/3d-animation 和 ~/.codex/skills/3d-animation（有 ~/.codex 才碰）。不下载东西，不改你的项目。
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
YES=0; [ "${1:-}" = "--yes" ] && YES=1
TARGETS=("${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}")
[ -d "${CODEX_HOME:-$HOME/.codex}" ] && TARGETS+=("${CODEX_HOME:-$HOME/.codex}/skills")

echo "要做的事："
for d in "${TARGETS[@]}"; do
  if [ -e "$d/3d-animation" ]; then echo "  $d/3d-animation 已经有了，跳过"
  else echo "  链接 $d/3d-animation → $HERE"; fi
done
echo
echo "不会做的事：不下载东西；不给任何项目装 npm 包；不改你项目里的文件。"
echo

if [ "$YES" != 1 ]; then
  read -r -p "开始装吗？[y/N] " ans
  case "$ans" in y|Y|yes|YES) ;; *) echo "取消了。"; exit 0 ;; esac
fi

for d in "${TARGETS[@]}"; do
  [ -e "$d/3d-animation" ] && continue
  mkdir -p "$d"
  # 能做链接就做链接，这样 git pull 以后立刻生效；不行就整份复制
  ln -s "$HERE" "$d/3d-animation" 2>/dev/null || cp -r "$HERE" "$d/3d-animation"
  echo "✓ $d/3d-animation"
done

echo
echo "装完了。重开一个会话："
echo "  Claude Code 里打 /3d-animation <图片路径>"
echo "  Codex 里打 \$3d-animation <图片路径>"
echo "要更新：在这个文件夹里 git pull。"
