# AquaGuard — GitHub Copilot Instructions

These rules apply to every task, PR, branch, and commit
Copilot assists with in this repository. Follow them strictly.

---

## 1. Branch Rules

- Always branch off `develop`, never off `main`
- Branch names must follow this format:

```
feat/short-description
fix/short-description
refactor/short-description
docs/short-description
test/short-description
chore/short-description
```

- Never create sub-PR branches (no `copilot/sub-pr-*` patterns)
- Never create session or worktree branches
  (no `copilot/worktree-*` or `claude/*` patterns)
- One branch = one concern. If a task touches multiple
  concerns, create separate branches for each.

---

## 2. Commit Rules

- Every commit message must follow Conventional Commits format:

```
type(scope): short description in lowercase
```

- Allowed types: `feat` `fix` `refactor` `docs`
  `test` `chore` `perf` `style`
- The scope must refer to the module changed:
  `auth` `backend` `frontend` `detection` `webrtc`
  `ci` `api` `config` `scripts` `esp32`
- Never write vague messages like:
  - `Initial plan`
  - `Checkpoint`
  - `Changes before error encountered`
  - `WIP`
  - `fix stuff`

---

## 3. Pull Request Rules — Single Responsibility

**One PR = One concern. No exceptions.**

- A PR must do exactly one of the following:
  - Add a feature
  - Fix a bug
  - Refactor existing code
  - Add or update tests
  - Update documentation
  - Perform a chore (deps, config, CI)

- If a PR title needs the word **"and"** — split it into
  two separate PRs.

- Never combine these in one PR:
  - A fix + a refactor
  - A feature + a chore
  - A bug fix + dependency upgrade
  - Frontend changes + backend changes
    (unless tightly coupled by contract)

---

## 4. Merge Rules

- Always use `--squash` merge into `develop`:

```bash
git checkout develop
git merge --squash feat/your-feature-name
git commit -m "feat(scope): describe the feature"
git branch -d feat/your-feature-name
git push origin --delete feat/your-feature-name
```

- Never use plain `git merge` into `develop` or `main`
- Never use `git merge --no-ff` (creates noisy merge commits)
- Delete the feature branch immediately after merging

---

## 5. Main Branch Rules

- Never push directly to `main`
- `main` is only updated on releases
- Merging develop into main must use `--squash`:

```bash
git checkout main
git merge --squash develop
git commit -m "release: AquaGuard vX.X.X"
git tag vX.X.X
git push origin main
git push origin vX.X.X
```

---

## 6. What Copilot Must Never Do

- Never create `copilot/*` branches
- Never create `claude/*` branches
- Never create worktree or session branches
- Never push a stash ref to remote
- Never force-push to `main` or `develop`
- Never combine unrelated changes in one commit or PR
- Never write `Initial plan` as a standalone commit
- Never open a sub-PR off another PR branch

---

## 7. PR Description Template

Every PR must include:

```
## What
One sentence describing what this PR does.

## Why
One sentence explaining why this change is needed.

## Type
- [ ] feat
- [ ] fix
- [ ] refactor
- [ ] docs
- [ ] test
- [ ] chore

## Single Responsibility Check
Does this PR do only ONE thing? Yes / No
If No — split it before opening.
```

---

## 8. Quick Reference — Git

| Rule | Good | Bad |
|---|---|---|
| Branch name | `feat/remember-me` | `copilot/sub-pr-74` |
| Commit message | `feat(auth): add remember me flag` | `Initial plan` |
| PR scope | Auth only | Auth + WebRTC + deps |
| Merge strategy | `--squash` | plain `merge` |
| Push to main | Release only | Direct push |
| Sub-PRs | Never | Never |

---

---

# AquaGuard — Coding Rules

These rules apply to every file Copilot generates or edits
in this repository. Follow them strictly across all modules.

---

## 9. General Principles (All Languages)

- **Single Responsibility** — every function, class, and
  module does exactly one thing
- **DRY** — never duplicate logic; extract shared code into
  utilities or helpers
- **Fail loudly** — never silently swallow exceptions;
  always log or re-raise
- **No magic numbers** — all constants must be named and
  defined in `config/settings.py` or a dedicated constants file
- **No dead code** — never leave commented-out code,
  unused imports, or unreachable blocks
- **No TODOs in merged code** — resolve or create a
  tracked issue before merging

---

## 10. Python Rules (Backend + Detection Engine)

### Style
- Follow **PEP 8** strictly — max line length is **88 chars**
  (Black formatter standard)
- Use **type hints** on all function signatures:
```python
# Good
def get_camera(camera_id: int) -> Camera | None:

# Bad
def get_camera(camera_id):
```
- Use **f-strings** only — never `%` formatting or `.format()`
- Always use **snake_case** for variables and functions
- Always use **PascalCase** for classes

### Structure
- Keep functions under **30 lines** — if longer, decompose
- One class per file unless tightly coupled
- Group imports in this order with a blank line between:
  1. Standard library
  2. Third-party packages
  3. Local modules

### Error Handling
- Always catch **specific** exceptions — never bare `except:`
```python
# Good
try:
    result = detect_frame(frame)
except cv2.error as e:
    logger.error("Frame detection failed: %s", e)

# Bad
try:
    result = detect_frame(frame)
except:
    pass
```
- Use **structured logging** — never `print()` in production code:
```python
# Good
logger.info("Camera %s connected", camera_id)

# Bad
print(f"Camera {camera_id} connected")
```

### Database
- Never use raw SQL strings — always use SQLAlchemy ORM
- Never use `Query.get()` — use `db.session.get()` instead
- Always close sessions in a `finally` block or use context managers
- Never expose database errors directly to API responses

### Security
- Never hardcode secrets, API keys, or passwords
- Always load secrets from environment variables or secret files
- Always validate and sanitize all user inputs
- Always use parameterized queries — never string-concat SQL

---

## 11. React / Frontend Rules

### Style
- Use **functional components** only — never class components
- Use **TypeScript types** or PropTypes on all component props
- Always use **camelCase** for variables and functions
- Always use **PascalCase** for component names
- Max component file length: **150 lines** — decompose if longer

### Hooks
- Never call hooks inside conditions or loops
- Extract complex hook logic into **custom hooks**:
```javascript
// Good
const { alerts, isLoading } = useAlertFeed(cameraId)

// Bad — logic dumped directly in component
const [alerts, setAlerts] = useState([])
useEffect(() => { /* 40 lines of logic */ }, [])
```

### State Management
- Keep state as **local as possible**
- Never store derived data in state — compute it instead
- Always clean up `useEffect` subscriptions and timers:
```javascript
// Good
useEffect(() => {
  const socket = connectSocket()
  return () => socket.disconnect()
}, [])
```

### Error Handling
- Always handle loading and error states in components
- Never let an unhandled promise rejection reach the user
- Always show a meaningful fallback UI on errors

### Performance
- Never recreate objects or arrays inline in JSX props
- Use `useCallback` for handlers passed to child components
- Use `useMemo` for expensive computations

---

## 12. Detection Engine Rules (CV / Python)

- Never mutate shared state across camera threads
  — each camera must have its own isolated detector instance
- Always validate frame input before processing:
```python
if frame is None or frame.size == 0:
    logger.warning("Empty frame received, skipping")
    return None
```
- Always validate positive values for frame rate,
  resolution, and confidence thresholds on initialization
- Never block the main detection loop with I/O operations
  — use threading or async for alert dispatch
- Cap all in-memory buffers (frame queues, alert histories)
  to prevent unbounded memory growth

---

## 13. API Contract Rules

- All API responses must follow this structure:
```json
{
  "status": "success" | "error",
  "data": {},
  "message": "optional human readable string"
}
```
- Never return raw exceptions or stack traces in API responses
- Always return correct HTTP status codes:
  - `200` — success
  - `201` — created
  - `400` — bad request / validation error
  - `401` — unauthorized
  - `403` — forbidden
  - `404` — not found
  - `500` — internal server error
- Always validate UUIDs, IDs, and required fields
  before processing any request

---

## 14. Testing Rules

- Every new feature must include at least **one unit test**
- Every bug fix must include a **regression test**
- Never commit code that causes existing tests to fail
- Test file naming:
  - Python: `test_<module_name>.py`
  - React: `<ComponentName>.test.jsx`
- Mock all external dependencies in unit tests
  (database, MQTT, WebRTC, camera feeds)
- Never use real credentials or live camera URLs in tests

---

## 15. What Copilot Must Never Generate

- `print()` statements in backend or detection code
- Bare `except:` or `except Exception: pass` blocks
- Hardcoded secrets, tokens, or passwords
- Raw SQL string concatenation
- Class components in React
- `var` declarations in JavaScript — use `const` or `let`
- Unused imports or variables
- Functions longer than 30 lines (Python) or
  components longer than 150 lines (React)
- TODOs without an associated issue number

---

## 16. Quick Reference — Coding

| Rule | Good | Bad |
|---|---|---|
| Python logging | `logger.info(...)` | `print(...)` |
| Exception handling | `except cv2.error` | `except:` |
| Secrets | `os.getenv("SECRET")` | `SECRET = "abc123"` |
| React components | Functional + hooks | Class components |
| State cleanup | `return () => cleanup()` | Missing cleanup |
| API response | `{ status, data }` | Raw exception string |
| Constants | Named in `settings.py` | Magic numbers inline |
| Tests | One per feature/fix | No tests |