#!/bin/sh
# 土田さんの Mac に自動修正の仕組みを入れる (入れ直しも同じ)。
set -e
DIR="$HOME/smile-fix-runner"
mkdir -p "$DIR" "$HOME/Library/LaunchAgents"
cp "$(dirname "$0")/runner.mjs" "$DIR/runner.mjs"
sed "s#__HOME__#$HOME#g" "$(dirname "$0")/jp.smilereach.fix-runner.plist" > "$HOME/Library/LaunchAgents/jp.smilereach.fix-runner.plist"
launchctl bootout "gui/$(id -u)/jp.smilereach.fix-runner" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/jp.smilereach.fix-runner.plist"
echo "入れました。記録: $DIR/runner.log"
