set -e
cd "C:/Users/hyc/Documents/Show1"
for page in "home:1#home" "arena:2#arena/001" "rank:3#rank"; do
  name="${page%%:*}"; rest="${page#*:}"
  timeout 150 node scripts/.tmp-mobile/cdp.mjs nav "http://192.168.1.203:5173/?h=$rest" 25000 8000 >/dev/null
  echo "### $name"
  timeout 150 node scripts/.tmp-mobile/cdp.mjs eval "@./hitbox.js" | python -c "
import sys,json
for r in json.loads(sys.stdin.read())['value']: print('  %-32s 可视%9s  44x44覆盖%5s  遮挡:%s' % (r['t'], r['box'], r['cover'], r['blocker']))
"
done
