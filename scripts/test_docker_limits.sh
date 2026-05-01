#!/bin/bash
# Validation script for Docker resource limits (Fix #3)
#
# This script verifies that docker-compose.yml has correct memory limits
# applied to all services, preventing resource starvation of detection_engine.
#
# Exit codes:
#   0: All limits correctly configured
#   1: Configuration error (missing or incorrect limit)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"

echo "=========================================="
echo "Validating Docker resource limits..."
echo "=========================================="

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'  # No Color

ERRORS=0

# Function to check service limit
check_service_limit() {
    local service=$1
    local expected_limit=$2
    
    echo -n "Checking $service memory limit... "
    
    # Extract memory limit from docker-compose config
    actual_limit=$(docker-compose config 2>/dev/null | \
        awk "/^services:/{flag=1} /^[^ ]/ && !/^services:/{flag=0} flag" | \
        awk "/^  $service:/{found=1} found && /memory:/{print; exit}" | \
        grep -oE '[0-9]+M' || echo "NOT_SET")
    
    if [ "$actual_limit" = "NOT_SET" ]; then
        echo -e "${RED}FAIL${NC} (limit not set)"
        ERRORS=$((ERRORS + 1))
    elif [ "$actual_limit" = "$expected_limit" ]; then
        echo -e "${GREEN}OK${NC} ($actual_limit)"
    else
        echo -e "${RED}FAIL${NC} (got $actual_limit, expected $expected_limit)"
        ERRORS=$((ERRORS + 1))
    fi
}

# Function to check service reservation
check_service_reservation() {
    local service=$1
    local expected_reservation=$2
    
    echo -n "Checking $service memory reservation... "
    
    # Extract memory reservation from docker-compose config
    actual_reservation=$(docker-compose config 2>/dev/null | \
        awk "/^services:/{flag=1} /^[^ ]/ && !/^services:/{flag=0} flag" | \
        awk "/^  $service:/{found=1} found && /reservation:/{found_res=1} found_res && /memory:/{print; exit}" | \
        grep -oE '[0-9]+M' || echo "NOT_SET")
    
    if [ "$actual_reservation" = "NOT_SET" ]; then
        echo -e "${RED}FAIL${NC} (reservation not set)"
        ERRORS=$((ERRORS + 1))
    elif [ "$actual_reservation" = "$expected_reservation" ]; then
        echo -e "${GREEN}OK${NC} ($actual_reservation)"
    else
        echo -e "${RED}FAIL${NC} (got $actual_reservation, expected $expected_reservation)"
        ERRORS=$((ERRORS + 1))
    fi
}

echo ""
echo "Service: mysql"
check_service_limit "mysql" "1024M"
check_service_reservation "mysql" "512M"

echo ""
echo "Service: redis"
check_service_limit "redis" "256M"
check_service_reservation "redis" "128M"

echo ""
echo "Service: mosquitto"
check_service_limit "mosquitto" "128M"
check_service_reservation "mosquitto" "64M"

echo ""
echo "Service: coturn"
check_service_limit "coturn" "512M"
check_service_reservation "coturn" "256M"

echo ""
echo "Service: backend"
check_service_limit "backend" "1024M"
check_service_reservation "backend" "512M"

echo ""
echo "Service: frontend"
check_service_limit "frontend" "256M"
check_service_reservation "frontend" "128M"

echo ""
echo "Service: detection_engine (should have 4096M limit)"
check_service_limit "detection_engine" "4096M"

echo ""
echo "=========================================="

if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}✅ All Docker resource limits are correctly configured${NC}"
    exit 0
else
    echo -e "${RED}❌ Found $ERRORS configuration error(s)${NC}"
    echo ""
    echo "To see actual configuration, run:"
    echo "  docker-compose config | grep -A 20 'memory:'"
    exit 1
fi
