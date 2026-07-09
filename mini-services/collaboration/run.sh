#!/bin/bash
while true; do
  bun --hot index.ts
  echo "[keepalive] process exited, restarting in 1s..."
  sleep 1
done
