const fs = require('fs');
const path = require('path');

const baseDir = 'C:\\Users\\Balangbang\\me\\aquaguard-1\\frontend\\src';

const filesToRename = [
  ['App.js', 'App.jsx'],
  ['pages/AnalyticsPage.js', 'pages/AnalyticsPage.jsx'],
  ['pages/DashboardPage.js', 'pages/DashboardPage.jsx'],
  ['pages/IncidentsPage.js', 'pages/IncidentsPage.jsx'],
  ['pages/LoginPage.js', 'pages/LoginPage.jsx'],
  ['pages/SystemPage.js', 'pages/SystemPage.jsx'],
  ['components/ErrorBoundary.js', 'components/ErrorBoundary.jsx'],
  ['components/layout/Sidebar.js', 'components/layout/Sidebar.jsx'],
  ['components/layout/TopBar.js', 'components/layout/TopBar.jsx'],
  ['components/system/SystemStatus.js', 'components/system/SystemStatus.jsx'],
  ['components/camera/CameraCard.js', 'components/camera/CameraCard.jsx'],
  ['components/camera/CameraGrid.js', 'components/camera/CameraGrid.jsx'],
  ['components/camera/CameraManagementPanel.js', 'components/camera/CameraManagementPanel.jsx'],
  ['components/alerts/AlertBadge.js', 'components/alerts/AlertBadge.jsx'],
  ['components/alerts/AlertHistory.js', 'components/alerts/AlertHistory.jsx'],
  ['components/alerts/AlertPanel.js', 'components/alerts/AlertPanel.jsx'],
  ['components/events/DetectionFeed.js', 'components/events/DetectionFeed.jsx'],
  ['components/events/IncidentHistory.js', 'components/events/IncidentHistory.jsx'],
  ['components/analytics/AnalyticsChart.js', 'components/analytics/AnalyticsChart.jsx'],
  ['context/AuthContext.js', 'context/AuthContext.jsx'],
  ['context/AlertContext.js', 'context/AlertContext.jsx'],
  ['context/DataCacheContext.js', 'context/DataCacheContext.jsx'],
];

console.log('Starting file rename process...');
console.log('='.repeat(60));

let successCount = 0;
let failureCount = 0;
const failedFiles = [];

filesToRename.forEach(([oldName, newName]) => {
  const oldPath = path.join(baseDir, oldName);
  const newPath = path.join(baseDir, newName);
  
  try {
    if (fs.existsSync(oldPath)) {
      fs.renameSync(oldPath, newPath);
      if (fs.existsSync(newPath) && !fs.existsSync(oldPath)) {
        console.log(`✓ ${oldName} → ${newName}`);
        successCount++;
      } else {
        console.log(`✗ ${oldName} → ${newName} (verification failed)`);
        failureCount++;
        failedFiles.push(oldName);
      }
    } else {
      console.log(`✗ ${oldName} (file not found)`);
      failureCount++;
      failedFiles.push(oldName);
    }
  } catch (error) {
    console.log(`✗ ${oldName} → ${newName} (error: ${error.message})`);
    failureCount++;
    failedFiles.push(oldName);
  }
});

console.log('='.repeat(60));
console.log(`\nRename Summary:`);
console.log(`  Successful: ${successCount}`);
console.log(`  Failed: ${failureCount}`);

if (failedFiles.length > 0) {
  console.log(`\nFailed files:`);
  failedFiles.forEach(file => {
    console.log(`  - ${file}`);
  });
}

console.log('\n' + '='.repeat(60));
console.log('Verification of renamed files:');
console.log('='.repeat(60));

let verifiedCount = 0;
filesToRename.forEach(([oldName, newName]) => {
  const newPath = path.join(baseDir, newName);
  if (fs.existsSync(newPath)) {
    verifiedCount++;
  }
});

console.log(`✓ Verified ${verifiedCount}/${filesToRename.length} .jsx files exist`);
