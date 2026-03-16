import os
from pathlib import Path

base_path = r"C:\Users\Jhocer Barcela\Desktop\AquaGuard"

directories = [
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
]

created = 0
already_existed = 0
failed = 0

for dir_path in directories:
    full_path = os.path.join(base_path, dir_path)
    try:
        Path(full_path).mkdir(parents=True, exist_ok=True)
        if os.path.exists(full_path):
            # Check if it's newly created
            print(f'✓ {dir_path}')
            created += 1
        else:
            print(f'? {dir_path}')
    except Exception as e:
        failed += 1
        print(f'✗ {dir_path}: {e}')

print(f'\n{created} directories created successfully')
if failed > 0:
    print(f'{failed} directories failed')
