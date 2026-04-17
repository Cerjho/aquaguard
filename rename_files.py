#!/usr/bin/env python3
import shutil
from pathlib import Path

SOURCE_ROOT = Path(r"C:\Users\Balangbang\me\aquaguard-1\frontend\src")

RENAME_PAIRS = (
    ("App.js", "App.jsx"),
    ("pages/AnalyticsPage.js", "pages/AnalyticsPage.jsx"),
    ("pages/DashboardPage.js", "pages/DashboardPage.jsx"),
    ("pages/IncidentsPage.js", "pages/IncidentsPage.jsx"),
    ("pages/LoginPage.js", "pages/LoginPage.jsx"),
    ("pages/SystemPage.js", "pages/SystemPage.jsx"),
    ("components/ErrorBoundary.js", "components/ErrorBoundary.jsx"),
    ("components/layout/Sidebar.js", "components/layout/Sidebar.jsx"),
    ("components/layout/TopBar.js", "components/layout/TopBar.jsx"),
    ("components/system/SystemStatus.js", "components/system/SystemStatus.jsx"),
    ("components/camera/CameraCard.js", "components/camera/CameraCard.jsx"),
    ("components/camera/CameraGrid.js", "components/camera/CameraGrid.jsx"),
    (
        "components/camera/CameraManagementPanel.js",
        "components/camera/CameraManagementPanel.jsx",
    ),
    ("components/alerts/AlertBadge.js", "components/alerts/AlertBadge.jsx"),
    ("components/alerts/AlertHistory.js", "components/alerts/AlertHistory.jsx"),
    ("components/alerts/AlertPanel.js", "components/alerts/AlertPanel.jsx"),
    ("components/events/DetectionFeed.js", "components/events/DetectionFeed.jsx"),
    (
        "components/events/IncidentHistory.js",
        "components/events/IncidentHistory.jsx",
    ),
    (
        "components/analytics/AnalyticsChart.js",
        "components/analytics/AnalyticsChart.jsx",
    ),
    ("context/AuthContext.js", "context/AuthContext.jsx"),
    ("context/AlertContext.js", "context/AlertContext.jsx"),
    ("context/DataCacheContext.js", "context/DataCacheContext.jsx"),
)

renamed = []
failed = []

for old_rel, new_rel in RENAME_PAIRS:
    old_path = SOURCE_ROOT / old_rel
    new_path = SOURCE_ROOT / new_rel

    if old_path.exists():
        try:
            shutil.move(old_path, new_path)
            renamed.append(old_path.name)
        except Exception as e:
            failed.append((old_path.name, str(e)))
    else:
        failed.append((old_path.name, "File not found"))

print(f"Renamed {len(renamed)} files")
for f in renamed:
    print(f"  {f}")

if failed:
    print(f"\nFailed {len(failed)} files")
    for f, e in failed:
        print(f"  {f}: {e}")
