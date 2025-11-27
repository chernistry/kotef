# Ticket: 57 Fix Git Integration - Default Dry-Run Blocks All Git Operations

Spec version: v1.0

## User Problem
Git operations (repo initialization, commits) are silently skipped because `dryRun` defaults to `true` in config. Users expect git to work by default but see:
```
"Dry-run mode: skipping git operations"
"gitEnabled":true,"gitInitialized":false
```

Even when:
- No `.git` folder exists
- No `--dry-run` flag passed
- `gitEnabled: true` and `gitAutoInit: true` in config

## Root Cause Analysis
**File**: `src/core/config.ts:17`
```typescript
dryRun: z.boolean().default(true),  // ❌ WRONG DEFAULT
```

This causes:
1. `cfg.dryRun = true` unless explicitly overridden
2. `ensureGitRepo()` receives `dryRun: true` → skips all git operations
3. `commitTicketRun()` receives `dryRun: true` → skips commits
4. User sees "success" but no git history created

## Outcome / Success Signals
- New projects get `.git` folder automatically
- Completed tickets create git commits
- `--dry-run` flag still works when explicitly passed
- Logs show "Git repository initialized" instead of "skipping git operations"

## Objective & Definition of Done
Change default `dryRun` to `false` so git works by default.

- [ ] Change `src/core/config.ts:17` from `default(true)` to `default(false)`
- [ ] Verify: Run `node bin/kotef run --root /tmp/test-project --goal "test"` → creates `.git`
- [ ] Verify: `--dry-run` flag still disables git when passed explicitly
- [ ] Update docs if needed to mention `--dry-run` flag

## Steps
1. Edit `src/core/config.ts` line 17: `dryRun: z.boolean().default(false),`
2. Rebuild: `npm run build`
3. Test without flag: should create git repo
4. Test with `--dry-run`: should skip git operations

## Affected files/modules
- `src/core/config.ts` (1 line change)

## Tests
```bash
# Test 1: Default behavior (should create .git)
rm -rf /tmp/test-kotef && mkdir /tmp/test-kotef
node bin/kotef run --root /tmp/test-kotef --goal "test"
ls /tmp/test-kotef/.git  # Should exist

# Test 2: Explicit dry-run (should NOT create .git)
rm -rf /tmp/test-kotef2 && mkdir /tmp/test-kotef2
node bin/kotef run --root /tmp/test-kotef2 --goal "test" --dry-run
ls /tmp/test-kotef2/.git  # Should NOT exist
```

## Risks & Edge Cases
- **Breaking change**: Users relying on dry-run default will now get git operations
  - Mitigation: This is the intended behavior, dry-run should be opt-in
- **CI/CD environments**: May create unwanted git repos
  - Mitigation: CI should explicitly pass `--dry-run` if needed

## Dependencies
None

## Priority
**HIGH** - Blocks core functionality (git history, ticket commits)
