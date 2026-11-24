#!/bin/sh
# 從 wuohome-decor-api 分支 chat-todos-demo 的 public/ 打包示範頁：拿掉 Google 登入、先載入假資料與 shim、頂端加示範說明
set -e
REPO=${1:-/Users/9m/Projects/wuohome-decor-api}
OUT=$(cd "$(dirname "$0")/.." && pwd)
node "$OUT/gen/gen.mjs" "$REPO" >/dev/null
cp "$REPO"/public/oversight*.css "$REPO"/public/oversight*.js "$REPO"/public/bug-report.js "$OUT/"
cp "$OUT/gen/shim.js" "$OUT/shim.js"
python3 - "$REPO/public/oversight.html" "$OUT/index.html" <<'EOF'
import sys
s = open(sys.argv[1], encoding='utf-8').read()
s = s.replace('<script src="https://accounts.google.com/gsi/client" async defer></script>', '')
s = s.replace('<title>設計部案件看板</title>', '<title>示範｜群組對話待辦</title>\n<script src="data.js"></script>\n<script src="shim.js"></script>')
banner = ('<div id="demoBar" style="position:fixed;left:0;right:0;bottom:0;z-index:9999;background:#fff4d6;color:#5a4300;padding:8px 14px calc(8px + env(safe-area-inset-bottom));font-size:13px;line-height:1.5;border-top:1px solid #e8d49a;box-shadow:0 -2px 8px rgba(0,0,0,.08)">'
          '示範頁：案件、人名、對話都是假的。請看「待辦事項」裡標「對話」的那幾件，和案件頁的「群組交代」。按鈕可以按，重新整理就回到原樣。</div>')
s = s.replace('</body>', banner + '\n<style>body{padding-bottom:64px}</style>\n</body>', 1)
assert 'gsi/client' not in s and 'shim.js' in s
open(sys.argv[2], 'w', encoding='utf-8').write(s)
EOF
echo built
