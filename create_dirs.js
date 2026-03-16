const fs = require('fs');

const base = 'C:/Users/Jhocer Barcela/Desktop/AquaGuard/';
const dirs = [
  '.github/workflows',
  '.github/ISSUE_TEMPLATE',
  'config',
  'detection_engine/camera',
  'detection_engine/vision',
  'detection_engine/analysis',
  'detection_engine/alert',
  'detection_engine/models_data',
  'detection_engine/tests',
  'backend/routes',
  'backend/migrations/versions',
  'backend/snapshots',
  'backend/tests',
  'esp32/aquaguard_esp32',
  'frontend/public',
  'frontend/src/context',
  'frontend/src/hooks',
  'frontend/src/pages',
  'frontend/src/components/layout',
  'frontend/src/components/camera',
  'frontend/src/components/alerts',
  'frontend/src/components/events',
  'frontend/src/components/analytics',
  'frontend/src/components/system',
  'frontend/src/utils',
  'mqtt',
  'scripts',
  'agents/queue',
  'agents/status'
];

let created = 0;
let failed = 0;

dirs.forEach(d => {
  try {
    fs.mkdirSync(base + d, { recursive: true });
    created++;
    console.log('✓ ' + d);
  } catch (e) {
    failed++;
    console.log('✗ ' + d + ': ' + e.message);
  }
});

console.log('\n' + created + ' directories created successfully');
if (failed > 0) console.log(failed + ' directories failed');
