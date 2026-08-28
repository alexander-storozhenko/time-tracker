#!/usr/bin/env bash
# Build the Linux app and (re)install it for the current user, no root needed:
# binaries in ~/.local/opt, icon in the hicolor theme, launcher in the local
# applications directory — the layout this machine already uses.
set -euo pipefail

cd "$(dirname "$0")/.."

APP_DIR="$HOME/.local/opt/time-tracker"
DESKTOP_FILE="$HOME/.local/share/applications/time-tracker.desktop"
ICON_FILE="$HOME/.local/share/icons/hicolor/512x512/apps/time-tracker.png"

npm run build
npx electron-builder --linux dir

# Into place atomically enough for a desktop app: drop the old tree only
# after the new one has fully built.
rm -rf "$APP_DIR"
mkdir -p "$APP_DIR"
cp -a dist/linux-unpacked/. "$APP_DIR/"

mkdir -p "$(dirname "$ICON_FILE")"
cp resources/icon.png "$ICON_FILE"

mkdir -p "$(dirname "$DESKTOP_FILE")"
cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Type=Application
Name=Time Tracker
Comment=Трекер времени с очередью задач
Exec=$APP_DIR/time-tracker %U
Icon=time-tracker
Terminal=false
Categories=Utility;
StartupNotify=true
StartupWMClass=Time Tracker
EOF

update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
gtk-update-icon-cache "$HOME/.local/share/icons/hicolor" 2>/dev/null || true

# A running copy keeps the OLD code in memory; restart it onto the new build.
# The app recovers a hard-killed running stretch on next launch (heartbeat).
if pgrep -f "$APP_DIR/time-tracker" > /dev/null; then
  pkill -f "$APP_DIR/time-tracker" || true
  sleep 1
  (setsid "$APP_DIR/time-tracker" >/dev/null 2>&1 &)
  echo "Installed and restarted: $APP_DIR/time-tracker"
else
  echo "Installed: $APP_DIR/time-tracker"
fi
