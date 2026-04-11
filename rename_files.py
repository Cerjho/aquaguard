#!/usr/bin/env python3
import os
import shutil
from pathlib import Path

# Define files to rename
files_to_rename = {
    r'C:\Users\Balangbang\me\aquaguard-1\frontend\src\App.js': r'C:\Users\Balangbang\me\aquaguard-1\frontend\src\App.jsx',
    r'C:\Users\Balangbang\me\aquaguard-1\frontend\src\pages\AnalyticsPage.js': r'C:\Users\Balangbang\me\aquaguard-1\frontend\src\pages\AnalyticsPage.jsx',
    r'C:\Users\Balangbang\me\aquaguard-1\frontend\src\pages\DashboardPage.js': r'C:\Users\Balangbang\me\aquaguard-1\frontend\src\pages\DashboardPage.jsx',
    r'C:\Users\Balangbang\me\aquaguard-1\frontend\src\pages\IncidentsPage.js': r'C:\Users\Balangbang\me\aquaguard-1\frontend\src\pages\IncidentsPage.jsx',
    r'C:\Users\Balangbang\me\aquaguard-1\frontend\src\pages\LoginPage.js': r'C:\Users\Balangbang\me\aquaguard-1\frontend\src\pages\LoginPage.jsx',
    r'C:\Users\Balangbang\me\aquaguard-1\frontend\src\pages\SystemPage.js': r'C:\Users\Balangbang\me\aquaguard-1\frontend\src\pages\SystemPage.jsx',
    r'C:\Users\Balangbang\me\aquaguard-1\frontend\src\components\ErrorBoundary.js': r'C:\Users\Balangbang\me\aquaguard-1\frontend\src\components\ErrorBoundary.jsx',
    r'C:\Users\Balangbang\me\aquaguard-1\frontend\src\components\layout\Sidebar.js': r'C:\Users\Balangbang\me\aquaguard-1\frontend\src\components\layout\Sidebar.jsx',
    r'C:\Users\Balangbang\me\aquaguard-1\frontend\src\components\layout\TopBar.js': r'C:\Users\Balangbang\me\aquaguard-1\frontend\src\components\layout\TopBar.jsx',
    r'C:\Users\Balangbang\me\aquaguard-1\frontend\src\components\system\SystemStatus.js': r'C:\Users\Balangbang\me\aquaguard-1\frontend\src\components\system\SystemStatus.jsx',
    r'C:\Users\Balangbang\me\aquaguard-1\frontend\src\components\camera\CameraCard.js': r'C:\Users\Balangbang\me\aquaguard-1\frontend\src\components\camera\CameraCard.jsx',
    r'C:\Users\Balangbang\me\aquaguard-1\frontend\src\components\camera\CameraGrid.js': r'C:\Users\Balangbang\me\aquaguard-1\frontend\src\components\camera\CameraGrid.jsx',
    r'C:\Users\Balangbang\me\aquaguard-1\frontend\src\components\camera\CameraManagementPanel.js': r'C:\Users\Balangbang\me\aquaguard-1\frontend\src\components\camera\CameraManagementPanel.jsx',
    r'C:\Users\Balangbang\me\aquaguard-1\frontend\src\components\alerts\AlertBadge.js': r'C:\Users\Balangbang\me\aquaguard-1\frontend\src\components\alerts\AlertBadge.jsx',
    r'C:\Users\Balangbang\me\aquaguard-1\frontend\src\components\alerts\AlertHistory.js': r'C:\Users\Balangbang\me\aquaguard-1\frontend\src\components\alerts\AlertHistory.jsx',
    r'C:\Users\Balangbang\me\aquaguard-1\frontend\src\components\alerts\AlertPanel.js': r'C:\Users\Balangbang\me\aquaguard-1\frontend\src\components\alerts\AlertPanel.jsx',
    r'C:\Users\Balangbang\me\aquaguard-1\frontend\src\components\events\DetectionFeed.js': r'C:\Users\Balangbang\me\aquaguard-1\frontend\src\components\events\DetectionFeed.jsx',
    r'C:\Users\Balangbang\me\aquaguard-1\frontend\src\components\events\IncidentHistory.js': r'C:\Users\Balangbang\me\aquaguard-1\frontend\src\components\events\IncidentHistory.jsx',
    r'C:\Users\Balangbang\me\aquaguard-1\frontend\src\components\analytics\AnalyticsChart.js': r'C:\Users\Balangbang\me\aquaguard-1\frontend\src\components\analytics\AnalyticsChart.jsx',
    r'C:\Users\Balangbang\me\aquaguard-1\frontend\src\context\AuthContext.js': r'C:\Users\Balangbang\me\aquaguard-1\frontend\src\context\AuthContext.jsx',
    r'C:\Users\Balangbang\me\aquaguard-1\frontend\src\context\AlertContext.js': r'C:\Users\Balangbang\me\aquaguard-1\frontend\src\context\AlertContext.jsx',
    r'C:\Users\Balangbang\me\aquaguard-1\frontend\src\context\DataCacheContext.js': r'C:\Users\Balangbang\me\aquaguard-1\frontend\src\context\DataCacheContext.jsx',
}

renamed = []
failed = []

for old_path, new_path in files_to_rename.items():
    if os.path.exists(old_path):
        try:
            shutil.move(old_path, new_path)
            renamed.append(Path(old_path).name)
        except Exception as e:
            failed.append((Path(old_path).name, str(e)))
    else:
        failed.append((Path(old_path).name, "File not found"))

print(f"✓ Renamed {len(renamed)} files")
for f in renamed:
    print(f"  {f}")

if failed:
    print(f"\n✗ Failed {len(failed)} files")
    for f, e in failed:
        print(f"  {f}: {e}")
