#!/usr/bin/env bash
set -euo pipefail

# Default: run detection engine module when no args provided
if [ "$#" -eq 0 ]; then
  exec /opt/venv/bin/python -m detection_engine.main
fi

case "$1" in
  detection_engine.main)
    exec /opt/venv/bin/python -m detection_engine.main
    ;;
  python|python3)
    # Run the venv python (PATH includes /opt/venv/bin)
    exec "$@"
    ;;
  -*)
    # If first arg is an option, run it with the venv python
    exec /opt/venv/bin/python "$@"
    ;;
  *)
    # If the arg looks like a python module (contains a dot and no leading slash), run as module
    if [[ "$1" == *.* && "$1" != /* ]]; then
      exec /opt/venv/bin/python -m "$1" "${@:2}"
    else
      exec "$@"
    fi
    ;;
esac
