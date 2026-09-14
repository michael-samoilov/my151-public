#!/usr/bin/env bash
# Bring up what needs installing: WebKit (apt), Firefox (Mozilla tarball) and the
# agent-browser CLI (npm), which is the default Blink driver. Blink still has
# Playwright as its fallback, so a blocked agent-browser install is not fatal.
# Idempotent: skips anything present.
# On an egress block it prints the exact blocked host and keeps going, so the
# harness degrades to whatever came up instead of failing the run.
#
# Nothing here names a version, an ABI, or a CPU. A container image is rebuilt on
# somebody else's schedule, so every pinned string is a future false DOWN: the
# distro moves webkit2gtk-4.1 to webkitgtk-6.0, an arm runner moves
# x86_64-linux-gnu to aarch64-linux-gnu, and a stale third-party repo appears
# where deadsnakes used to be. Discover each of those instead.
set -uo pipefail

FF_DIR="${VERIFY_ENGINE_DIR:-/opt/verify-my151}"
FF_BIN="$FF_DIR/firefox/firefox"
DISABLED_DIR=/etc/apt/disabled-ppa
status=0

# WebKitGTK puts MiniBrowser under an ABI directory inside a multiarch directory,
# and both halves of that path move. Take the highest ABI present.
find_webkit_browser() {
  ls -d /usr/libexec/webkit*gtk-*/MiniBrowser /usr/lib/*/webkit*gtk-*/MiniBrowser \
    2>/dev/null | sort -V | tail -1
}

# `apt-get update` names the URI it could not reach. Map each failing URI back to
# the file that declares it and move that file aside, so one unreachable
# third-party repo cannot fail the whole refresh. Ubuntu's own repos are never
# touched: a 404 there means a stale index, which the refresh itself repairs.
disable_unreachable_sources() {
  local log="$1" failed f declared u d disabled=0
  failed=$(grep -E "Failed to fetch|no longer signed|is not signed" "$log" 2>/dev/null \
    | grep -oE "https?://[^ ']+" | sort -u)
  [ -n "$failed" ] || return 1
  sudo mkdir -p "$DISABLED_DIR"
  for f in /etc/apt/sources.list.d/*.sources /etc/apt/sources.list.d/*.list; do
    [ -e "$f" ] || continue
    declared=$(grep -oE "https?://[^ ]+" "$f" 2>/dev/null | sort -u)
    for d in $declared; do
      case "$d" in *ubuntu.com*) continue ;; esac
      for u in $failed; do
        case "$u" in
          "$d"*)
            sudo mv "$f" "$DISABLED_DIR"/ &&
              echo "  disabled unreachable source: $(basename "$f")"
            disabled=1
            break 2
            ;;
        esac
      done
    done
  done
  [ "$disabled" = 1 ]
}

echo "== apt index =="
# The image ships a stale package list, so every .deb URL 404s until the list
# refreshes. Refresh once, up front, before anything needs apt. Judge the result
# by whether the install below works, never by this exit code: an unreachable
# third-party repo makes `apt-get update` exit non-zero even when every Ubuntu
# list refreshed fine. Skipped when nothing needs apt, so a warm container is fast.
if [ ! -x "$(find_webkit_browser)" ] || ! command -v ffmpeg >/dev/null; then
  sudo apt-get update >/tmp/verify-aptupd.log 2>&1
  if disable_unreachable_sources /tmp/verify-aptupd.log; then
    sudo apt-get update >/tmp/verify-aptupd.log 2>&1
  fi
  echo "  refreshed $(grep -cE '^(Hit|Get)' /tmp/verify-aptupd.log) lists"
else
  echo "  skipped: webkit and ffmpeg are already present"
fi

echo "== WebKit (webkit driver + xvfb) =="
WEBKIT="$(find_webkit_browser)"
if [ -n "$WEBKIT" ] && [ -x "$WEBKIT" ] && command -v WebKitWebDriver >/dev/null && command -v xvfb-run >/dev/null; then
  echo "  present: $WEBKIT"
else
  # The driver package is renamed across releases, so install whichever one this
  # index actually offers rather than assuming today's name.
  for pkg in webkit2gtk-driver webkitgtk-6.0-driver; do
    apt-cache show "$pkg" >/dev/null 2>&1 || continue
    echo "  installing $pkg"
    sudo apt-get install -y "$pkg" xvfb >/tmp/verify-apt.log 2>&1
    WEBKIT="$(find_webkit_browser)"
    [ -n "$WEBKIT" ] && [ -x "$WEBKIT" ] && break
  done
  if [ -n "$WEBKIT" ] && [ -x "$WEBKIT" ]; then
    echo "  installed: $WEBKIT"
  else
    echo "  BLOCKED: apt could not install a webkit driver (see /tmp/verify-apt.log)"
    grep -iE '403|forbidden|not in allowlist|could not resolve|404' /tmp/verify-apt.log 2>/dev/null | head -3
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

echo "== agent-browser (default Blink driver; Playwright is the fallback) =="
# Installed out-of-tree, beside Firefox, so the skill stays self-contained and
# package.json never changes. The CLI drives Chrome only, so it replaces the
# Blink lane and nothing else: WebKit and Gecko keep their own drivers above.
AB_DIR="$FF_DIR/agent-browser"
AB_BIN="$AB_DIR/node_modules/.bin/agent-browser"
if [ -x "$AB_BIN" ]; then
  echo "  present: $("$AB_BIN" --version 2>/dev/null | head -1)"
else
  sudo mkdir -p "$AB_DIR"
  # sudo resets PATH to a secure_path with no node or npm on it: they live under
  # nvm or a shim dir the login shell added, so a bare `sudo npm` is "command not
  # found" and the install never runs. Carry this shell's PATH through so root
  # runs the same npm the caller already resolved, wherever the image put it.
  if sudo env "PATH=$PATH" npm install --silent --prefix "$AB_DIR" agent-browser >/tmp/verify-ab.log 2>&1 && [ -x "$AB_BIN" ]; then
    echo "  installed: $("$AB_BIN" --version 2>/dev/null | head -1)"
  else
    echo "  BLOCKED: could not install agent-browser (see /tmp/verify-ab.log); Blink falls back to Playwright"
    grep -iE '403|forbidden|not in allowlist|could not resolve|404|ETIMEDOUT|command not found' /tmp/verify-ab.log 2>/dev/null | head -3
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
WEBKIT="$(find_webkit_browser)"
[ -n "$WEBKIT" ] && [ -x "$WEBKIT" ] && echo "  webkit: UP ($WEBKIT)" || echo "  webkit: DOWN"
[ -x "$FF_BIN" ] && echo "  gecko:  UP" || echo "  gecko:  DOWN"
if [ -x "$AB_BIN" ]; then
  echo "  blink:  UP (agent-browser CLI, Chromium from PLAYWRIGHT_BROWSERS_PATH)"
else
  echo "  blink:  UP (Playwright Chromium; agent-browser absent, using the fallback)"
fi
exit $status
