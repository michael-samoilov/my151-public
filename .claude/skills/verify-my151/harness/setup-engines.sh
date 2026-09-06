#!/usr/bin/env bash
# Bring up the two engines that need installing: WebKit (apt) and Firefox (Mozilla
# tarball). Blink ships with Playwright already. Idempotent: skips anything present.
# On an egress block it prints the exact blocked host and keeps going, so the
# harness degrades to whatever came up instead of failing the run.
set -uo pipefail

FF_DIR="${VERIFY_ENGINE_DIR:-/opt/verify-my151}"
FF_BIN="$FF_DIR/firefox/firefox"
WEBKIT="/usr/lib/x86_64-linux-gnu/webkit2gtk-4.1/MiniBrowser"
status=0

echo "== apt index =="
# Two things in a fresh cloud container break the WebKit install below, and both
# are about the index rather than the package. The image ships a stale package
# list, so every .deb URL 404s until the list refreshes. And two preinstalled
# PPAs (deadsnakes, ondrej/php) answer 403 through the egress proxy, which makes
# `apt-get update` exit non-zero even when every Ubuntu list refreshed fine.
# So move the blocked PPAs aside, refresh, and judge the result by whether the
# install works, never by the exit code. Skipped when nothing needs apt.
if [ ! -x "$WEBKIT" ] || ! command -v ffmpeg >/dev/null; then
  sudo mkdir -p /etc/apt/disabled-ppa
  for f in /etc/apt/sources.list.d/*deadsnakes* /etc/apt/sources.list.d/*ondrej*; do
    if [ -e "$f" ]; then
      sudo mv "$f" /etc/apt/disabled-ppa/ && echo "  moved aside (403 through the proxy): $(basename "$f")"
    fi
  done
  sudo apt-get update >/tmp/verify-aptupd.log 2>&1
  echo "  refreshed $(grep -cE '^(Hit|Get)' /tmp/verify-aptupd.log) lists"
else
  echo "  skipped: webkit and ffmpeg are already present"
fi

echo "== WebKit (webkit2gtk-driver + xvfb) =="
if [ -x "$WEBKIT" ] && command -v WebKitWebDriver >/dev/null && command -v xvfb-run >/dev/null; then
  echo "  present: $(WebKitWebDriver --version 2>/dev/null | head -1)"
else
  sudo apt-get install -y webkit2gtk-driver xvfb >/tmp/verify-apt.log 2>&1
  if [ -x "$WEBKIT" ]; then
    echo "  installed: $WEBKIT"
  else
    echo "  BLOCKED: apt could not install webkit2gtk-driver (see /tmp/verify-apt.log)"
    grep -iE '403|forbidden|not in allowlist|could not resolve' /tmp/verify-apt.log | head -3
    status=1
  fi
fi

echo "== Gecko (Firefox tarball; no geckodriver, we drive Marionette) =="
if [ -x "$FF_BIN" ]; then
  echo "  present: $("$FF_BIN" --version 2>/dev/null | head -1)"
else
  sudo mkdir -p "$FF_DIR"
  url="https://download.mozilla.org/?product=firefox-latest-ssl&os=linux64&lang=en-US"
  if sudo curl -sSL --retry 4 --retry-delay 2 -o "$FF_DIR/firefox.tar.xz" "$url"; then
    sudo tar xf "$FF_DIR/firefox.tar.xz" -C "$FF_DIR" && sudo rm -f "$FF_DIR/firefox.tar.xz"
    if [ -x "$FF_BIN" ]; then
      echo "  installed: $("$FF_BIN" --version 2>/dev/null | head -1)"
    else
      echo "  BLOCKED: tarball downloaded but firefox binary missing after extract"
      status=1
    fi
  else
    echo "  BLOCKED: could not download Firefox. Hosts needed: download.mozilla.org, download-installer.cdn.mozilla.net"
    status=1
  fi
fi

echo "== ffmpeg (only needed for --video on WebKit/Gecko; Blink records without it) =="
if command -v ffmpeg >/dev/null; then
  echo "  present: $(ffmpeg -version 2>/dev/null | head -1)"
else
  sudo apt-get install -y ffmpeg >/tmp/verify-ffmpeg.log 2>&1
  if command -v ffmpeg >/dev/null; then echo "  installed: $(ffmpeg -version 2>/dev/null | head -1)"; else echo "  BLOCKED: could not install ffmpeg (see /tmp/verify-ffmpeg.log); --video real-engine lanes unavailable"; fi
fi

echo "== summary =="
[ -x "$WEBKIT" ] && echo "  webkit: UP" || echo "  webkit: DOWN"
[ -x "$FF_BIN" ] && echo "  gecko:  UP" || echo "  gecko:  DOWN"
echo "  blink:  UP (Playwright Chromium)"
exit $status
