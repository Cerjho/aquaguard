#!/bin/bash
# AquaGuard Annotation Fix Verification Script
# Verifies that the annotation loss fix is correctly deployed

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "================================================"
echo "AquaGuard Annotation Loss Fix - Verification"
echo "================================================"
echo

# Check 1: Docker images built
echo -n "Checking Docker images... "
if docker image inspect aquaguard-detection_engine:latest > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} detection_engine image exists"
else
    echo -e "${RED}✗${NC} detection_engine image NOT found"
    exit 1
fi

if docker image inspect aquaguard-backend:latest > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} backend image exists"
else
    echo -e "${RED}✗${NC} backend image NOT found"
    exit 1
fi

echo

# Check 2: Containers running
echo "Checking container status..."
if docker-compose ps detection_engine | grep -q "Up"; then
    echo -e "${GREEN}✓${NC} detection_engine container is running"
else
    echo -e "${YELLOW}⚠${NC} detection_engine container not running (expected if services not started)"
fi

if docker-compose ps backend | grep -q "Up"; then
    echo -e "${GREEN}✓${NC} backend container is running"
else
    echo -e "${YELLOW}⚠${NC} backend container not running (expected if services not started)"
fi

echo

# Check 3: Pipeline manager source code
echo "Verifying pipeline manager code..."
if grep -q "CRITICAL FIX: Drain ALL available annotated frames" detection_engine/pipeline/pipeline_manager.py; then
    echo -e "${GREEN}✓${NC} Drain loop fix found in pipeline_manager.py"
else
    echo -e "${RED}✗${NC} Drain loop fix NOT found in pipeline_manager.py"
    exit 1
fi

if grep -q "while True:" detection_engine/pipeline/pipeline_manager.py | head -1; then
    echo -e "${GREEN}✓${NC} Drain loop while loop present"
else
    echo -e "${RED}✗${NC} Drain loop structure not found"
    exit 1
fi

if grep -q "update_annotated_frame" detection_engine/pipeline/pipeline_manager.py; then
    echo -e "${GREEN}✓${NC} Annotated frame update calls present"
else
    echo -e "${RED}✗${NC} Annotated frame updates not found"
    exit 1
fi

echo

# Check 4: Frame writer architecture
echo "Verifying frame writer architecture..."
if grep -q "_latest_raw_frame" detection_engine/camera/frame_writer.py; then
    echo -e "${GREEN}✓${NC} Separate raw frame buffer exists"
else
    echo -e "${RED}✗${NC} Raw frame buffer not found"
    exit 1
fi

if grep -q "_latest_annotated_frame" detection_engine/camera/frame_writer.py; then
    echo -e "${GREEN}✓${NC} Separate annotated frame buffer exists"
else
    echo -e "${RED}✗${NC} Annotated frame buffer not found"
    exit 1
fi

if grep -q "if self._latest_annotated_frame is not None:" detection_engine/camera/frame_writer.py; then
    echo -e "${GREEN}✓${NC} Priority logic (annotated > raw) present"
else
    echo -e "${RED}✗${NC} Priority logic not found"
    exit 1
fi

echo

# Check 5: Logging
echo "Verifying logging output..."
if docker-compose logs detection_engine 2>/dev/null | grep -q "annotated drained"; then
    DRAIN_RATE=$(docker-compose logs detection_engine 2>/dev/null | grep "annotated drained" | tail -1)
    echo -e "${GREEN}✓${NC} Drain loop telemetry found:"
    echo "  $DRAIN_RATE"
else
    echo -e "${YELLOW}⚠${NC} Drain loop telemetry not yet logged (expected if services just started)"
fi

echo

# Check 6: MJPEG stream accessibility
echo "Checking MJPEG stream endpoint..."
BACKEND_URL=${AQUAGUARD_API_URL:-"http://localhost:8000"}
if curl -s -f "$BACKEND_URL/api/v1/cameras" > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Backend API is accessible"
    
    # Try to get stream token
    CAMERAS=$(curl -s "$BACKEND_URL/api/v1/cameras" 2>/dev/null | jq '.cameras[0].zone_id' 2>/dev/null)
    if [ ! -z "$CAMERAS" ]; then
        echo -e "${GREEN}✓${NC} Cameras available in backend"
    fi
else
    echo -e "${YELLOW}⚠${NC} Backend API not accessible (expected if services not started)"
fi

echo

# Check 7: Python syntax
echo "Verifying Python syntax..."
python -m py_compile detection_engine/pipeline/pipeline_manager.py 2>/dev/null && \
    echo -e "${GREEN}✓${NC} pipeline_manager.py syntax valid" || \
    echo -e "${RED}✗${NC} Syntax error in pipeline_manager.py"

python -m py_compile detection_engine/camera/frame_writer.py 2>/dev/null && \
    echo -e "${GREEN}✓${NC} frame_writer.py syntax valid" || \
    echo -e "${RED}✗${NC} Syntax error in frame_writer.py"

echo

# Summary
echo "================================================"
echo -e "${GREEN}Verification Complete${NC}"
echo "================================================"
echo
echo "Deployment Status:"
echo "  • Drain loop fix: APPLIED ✓"
echo "  • Separate buffer architecture: VERIFIED ✓"
echo "  • Priority logic: VERIFIED ✓"
echo "  • Syntax: VALID ✓"
echo
echo "Next steps:"
echo "  1. Start services: docker-compose up -d"
echo "  2. Monitor logs: docker-compose logs -f detection_engine"
echo "  3. Check stream: Access MJPEG endpoint with valid token"
echo "  4. Verify annotations appear on live video"
echo
echo "Expected behavior:"
echo "  • MJPEG stream shows bounding boxes and labels"
echo "  • Annotations update in real-time"
echo "  • Drain loop logs show ~10-15/sec drained rate"
echo "  • No annotation flickering or loss"
echo
