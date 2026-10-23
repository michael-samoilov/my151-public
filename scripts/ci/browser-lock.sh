#!/usr/bin/env bash
set -u

if (( $# < 2 )); then
  echo 'Usage: bash scripts/ci/browser-lock.sh LOCK COMMAND...' >&2
  exit 64
fi
lock=$1
shift

notice() {
  printf '%s\n' "$1"
  { printf '%s\n' "$1" >&3; } 2>/dev/null
}

holder() {
  local dev ino id kind pid lock_id
  local -a argv
  if read -r dev ino < <(stat -L -c '%d %i' -- "$lock" 2>/dev/null); then
    id=$(printf '%02x:%02x:%d' $(( (dev >> 8) & 0xfff )) $(( (dev & 0xff) | ((dev >> 12) & 0xfff00) )) "$ino")
    while read -r _ kind _ _ pid lock_id _; do
      [[ $kind == FLOCK && $lock_id == "$id" && $pid =~ ^[1-9][0-9]*$ ]] || continue
      { mapfile -d '' -t argv <"/proc/$pid/cmdline"; } 2>/dev/null
      if (( ${#argv[@]} )); then
        printf 'held by PID %s: %s' "$pid" "${argv[*]}"
      else
        printf 'held by PID %s' "$pid"
      fi
      return
    done </proc/locks
  fi
  printf 'holder unknown'
}

# Read-only, as flock(1) opens it, so a lock file that another user created still opens.
[[ -e $lock ]] || : >>"$lock" || exit
exec 9<"$lock" || exit

flock --nonblock --conflict-exit-code 75 9
status=$?
if (( status == 75 )); then
  notice "Waiting for $lock ($(holder)). Another browser run holds it. Do not wrap ci-local.sh in this lock."
  SECONDS=0
  while :; do
    flock --wait 300 --conflict-exit-code 75 9
    status=$?
    (( status == 75 )) || break
    notice "Still waiting for $lock after $(( SECONDS / 60 )) min ($(holder))."
  done
  (( status == 0 )) && notice "Acquired $lock after $SECONDS s."
fi
(( status == 0 )) || exit "$status"

# Browser processes can outlive the runner. If they held its stdout, a pipe from the runner would stay open after it exits.
exec "$@" 3>&-
