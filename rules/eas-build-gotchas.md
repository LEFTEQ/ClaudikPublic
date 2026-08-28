---
paths:
  - "**/eas.json"
  - "**/app.config.{js,ts,json}"
  - "**/app.json"
  - "**/ios/**"
  - "**/android/**"
  - "**/.github/workflows/*build*.yml"
---

# EAS / Native Build Gotchas

- **Bun (or pnpm) workspace + EAS: any native pkg whose Xcode/Gradle build script does `require.resolve("X/package.json")` must be a DIRECT dep, not transitive.** Bun isolated install only symlinks direct deps into `apps/<app>/node_modules/`, so a purely-transitive resolver target (e.g. `@sentry/cli` pulled only by `@sentry/react-native`) is unresolvable on EAS under `bun install --frozen-lockfile` — the build crashes BEFORE skip-upload env flags are read. Locally a stale symlink masks it until a fresh checkout. Fix: declare the transitive as a direct dep pinned to the EXACT version the parent locks (check `bun.lock`) for zero drift.
- **Read EAS build logs + submission status from the CLI — skip the auth-walled dashboard, and ignore the dashboard's summary errors (regex noise matching Swift `print()` / deprecation comments, almost never the real cause).** `eas build:view <BUILD_ID> --json` returns `logFiles[]` = signed `storage.googleapis.com` URLs (no auth, ~15-min `X-Goog-Expires=900` TTL). Content is BROTLI (`content-encoding: br`), so `curl --compressed` fails ('Unrecognized content encoding type') — decode with `node -e "const fs=require('fs'),z=require('zlib');fs.writeFileSync('/tmp/o.txt',z.brotliDecompressSync(fs.readFileSync('/tmp/raw')))"`. The log is bunyan JSON-lines: grep `msg` fields per `phase` (e.g. `EAGER_BUNDLE` = JS bundling) for 'Unable to resolve' / 'error' / `Command PhaseScriptExecution failed` / `BUILD FAILED`. Submission status: EAS CLI v20 has no `submission:view`/`list` — query GraphQL: POST `https://api.expo.dev/graphql` with header `expo-session: <sessionSecret from ~/.expo/state.json auth.sessionSecret>`, body `{"query":"query{submissions{byId(submissionId:\"<SUB_ID>\"){status}}}"}` (IN_QUEUE/IN_PROGRESS/FINISHED/ERRORED; FINISHED = delivered to App Store Connect).
- EAS Build with `cli.requireCommit=false` uploads uncommitted changes — no stash needed (see `~/.claude/docs/git-safety-full.md`).
