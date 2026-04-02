# Security Report

## Resolved Vulnerabilities

### Python Dependencies

#### Backend (`backend/requirements.txt`)

- **requests**: Upgraded from `2.32.4` to `2.33.0`
  - **CVE-2026-25645** (GHSA-gc5v-m9x4-r6x2): Fixed predictable temp file
    extraction
  - **Impact**: Low - Standard usage of requests library not affected
  - **Resolution**: Patched in 2.33.0

#### Detection Engine (`detection_engine/requirements.txt`)

- **requests**: Upgraded from `2.32.4` to `2.33.0`
  - Same fix as backend

### Frontend Dependencies (`frontend/package.json`)

Fixed via npm audit fix + overrides:

- **brace-expansion**: Fixed zero-step sequence hang
- **lodash**: Fixed code injection and prototype pollution
- **node-forge**: Fixed certificate chain verification issues
- **path-to-regexp**: Fixed ReDoS vulnerability
- **picomatch**: Fixed method injection and ReDoS
- **yaml**: Fixed stack overflow vulnerability
- **underscore**: Upgraded to 1.13.8 to fix recursion DoS

**Total fixed**: 26 vulnerabilities (9 low, 3 moderate, 14 high)

______________________________________________________________________

## Accepted Risk - Development Dependencies

### Remaining Vulnerabilities (6 high)

All remaining vulnerabilities are in **development-time only** dependencies
nested within `react-scripts@5.0.1`:

1. **serialize-javascript** (≤7.0.4) in:
   - `css-minimizer-webpack-plugin`
   - `rollup-plugin-terser`
   - `workbox-webpack-plugin`

**Why accepted:**

- These are **webpack build tools** used only during `npm run build` on
  trusted developer machines
- The vulnerabilities (RCE via RegExp.flags, CPU exhaustion) require:
  - Attacker-controlled input to the webpack build process
  - Access to the development environment during build
- **Production bundle is NOT affected** - these libraries are not included in
  the deployed application
- Upgrading `react-scripts` to v6.x would be a breaking change requiring app
  ejection

**Mitigation:**

- Build process runs in controlled CI environment (GitHub Actions)
- Production bundle scanned separately with `npm audit --omit=dev` (0
  vulnerabilities)
- Developers should not build on compromised machines

______________________________________________________________________

## Known Upstream Issues

### PyTorch (torch 2.2.2)

5 CVEs detected but **NOT upgraded** due to CUDA compatibility:

- PYSEC-2025-41
- PYSEC-2024-259
- GHSA-3749-ghw9-m3mg
- GHSA-887c-mr87-cxwp
- GHSA-7gcm-g887-7qv7

**Why accepted:**

- PyTorch 2.2.2 is tightly coupled with:
  - CUDA 12.1 toolkit
  - cuDNN 8.9.2
  - Ultralytics YOLOv11s model weights
- Upgrading to PyTorch 2.6+ requires:
  - CUDA toolkit upgrade
  - Model retraining/validation
  - Potential performance degradation
- Detection engine runs in **isolated environment** with no external input
- Camera frames are validated before processing

**CI Workflow:**

- These CVEs are explicitly ignored in `.github/workflows/ci.yml`
- Security scans are non-blocking to allow controlled risk assessment

______________________________________________________________________

## Security Best Practices Followed

✅ All secrets loaded from environment variables\
✅ No hardcoded credentials in repository\
✅ Database queries use SQLAlchemy ORM (no raw SQL)\
✅ API inputs validated before processing\
✅ Production dependencies have 0 high/critical vulnerabilities\
✅ JWT tokens for authentication\
✅ Rate limiting enabled on API endpoints

______________________________________________________________________

Last updated: 2026-04-02
