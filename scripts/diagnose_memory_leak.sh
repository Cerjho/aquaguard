#!/usr/bin/env bash
# Memory leak diagnostic script for AquaGuard
# Run this to track memory growth over time

echo "=== AquaGuard Memory Leak Diagnostics ==="
echo "Running for 10 minutes, checking every 30 seconds..."
echo ""

for i in {1..20}; do
    echo "Sample $i ($(($i * 30)) seconds):"
    
    echo "Backend:"
    docker stats aquaguard-backend --no-stream --format "{{.MemUsage}}"
    
    echo "Detection Engine:"
    docker stats aquaguard-detection --no-stream --format "{{.MemUsage}}"
    
    echo "Database:"
    docker stats aquaguard-db --no-stream --format "{{.MemUsage}}"
    
    echo "Redis:"
    docker stats aquaguard-redis --no-stream --format "{{.MemUsage}}"
    
    echo "---"
    
    if [ $i -lt 20 ]; then
        sleep 30
    fi
done

echo ""
echo "If any container's memory grows significantly, that's your leak source."
echo "Compare this output with the initial run to identify which container is leaking."
