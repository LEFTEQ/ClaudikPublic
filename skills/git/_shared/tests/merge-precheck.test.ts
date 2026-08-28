import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeChecks, summarizeGates, substituteHookTokens, summarizeBotApproval, parseBotList, canonicalizeBotLogin } from "../bin/merge-precheck.ts";
import { parseConfig } from "../bin/sync-context.ts";

test("no checks configured → NONE", () => {
  assert.equal(summarizeChecks(null), "NONE");
  assert.equal(summarizeChecks([]), "NONE");
});

test("any failing check → FAILURE", () => {
  assert.equal(summarizeChecks([{ status: "COMPLETED", conclusion: "SUCCESS" }, { status: "COMPLETED", conclusion: "FAILURE" }]), "FAILURE");
});

test("in-progress check → PENDING", () => {
  assert.equal(summarizeChecks([{ status: "COMPLETED", conclusion: "SUCCESS" }, { status: "IN_PROGRESS", conclusion: "" }]), "PENDING");
});

test("all complete & successful → SUCCESS", () => {
  assert.equal(summarizeChecks([{ status: "COMPLETED", conclusion: "SUCCESS" }, { status: "COMPLETED", conclusion: "SUCCESS" }]), "SUCCESS");
});

// Commit StatusContext nodes (legacy commit statuses, e.g. a review bot's "Review completed")
// carry their terminal result in `state`, with NO CheckRun `status`/`conclusion` fields.
test("StatusContext SUCCESS (no status/conclusion fields) → SUCCESS", () => {
  assert.equal(summarizeChecks([{ state: "SUCCESS" }]), "SUCCESS");
});

test("mixed CheckRun + StatusContext, all green → SUCCESS", () => {
  assert.equal(
    summarizeChecks([
      { status: "COMPLETED", conclusion: "SUCCESS" }, // license-check
      { status: "COMPLETED", conclusion: "SKIPPED" }, // skipped E2E-comment job
      { state: "SUCCESS" }, // review-bot commit status
    ]),
    "SUCCESS",
  );
});

test("StatusContext PENDING/EXPECTED → PENDING", () => {
  assert.equal(summarizeChecks([{ state: "PENDING" }]), "PENDING");
  assert.equal(summarizeChecks([{ state: "EXPECTED" }]), "PENDING");
});

test("StatusContext FAILURE/ERROR → FAILURE", () => {
  assert.equal(summarizeChecks([{ state: "FAILURE" }]), "FAILURE");
  assert.equal(summarizeChecks([{ state: "ERROR" }]), "FAILURE");
});

const clean = {
  state: "OPEN", mergeable: "MERGEABLE", mergeStateStatus: "CLEAN",
  reviewDecision: "APPROVED", checks: "SUCCESS" as const, worktreeDirty: false, isDraft: false,
  botApprovalOk: true,
};

test("all gates pass on a clean approved green PR", () => {
  const g = summarizeGates(clean);
  assert.equal(g.allPass, true);
  assert.deepEqual(g.failed, []);
});

test("no review required (null decision) still passes the approval gate", () => {
  const g = summarizeGates({ ...clean, reviewDecision: "" });
  assert.equal(g.approvedOk, true);
  assert.equal(g.allPass, true);
});

test("dirty worktree fails the clean gate", () => {
  const g = summarizeGates({ ...clean, worktreeDirty: true });
  assert.equal(g.cleanOk, false);
  assert.ok(g.failed.includes("clean"));
  assert.equal(g.allPass, false);
});

test("conflicts fail the mergeable gate (CONFLICTING or DIRTY status)", () => {
  assert.equal(summarizeGates({ ...clean, mergeable: "CONFLICTING" }).mergeableOk, false);
  assert.equal(summarizeGates({ ...clean, mergeStateStatus: "DIRTY" }).mergeableOk, false);
});

test("pending CI fails the ci gate", () => {
  assert.ok(summarizeGates({ ...clean, checks: "PENDING" }).failed.includes("ci"));
});

test("changes requested / review required fail the approval gate", () => {
  assert.equal(summarizeGates({ ...clean, reviewDecision: "CHANGES_REQUESTED" }).approvedOk, false);
  assert.equal(summarizeGates({ ...clean, reviewDecision: "REVIEW_REQUIRED" }).approvedOk, false);
});

test("draft and non-open PRs are flagged", () => {
  assert.ok(summarizeGates({ ...clean, isDraft: true }).failed.includes("draft"));
  assert.ok(summarizeGates({ ...clean, state: "MERGED" }).failed.includes("open"));
});

test("pending bot approval fails the botReview gate", () => {
  const g = summarizeGates({ ...clean, botApprovalOk: false });
  assert.equal(g.botApprovalOk, false);
  assert.ok(g.failed.includes("botReview"));
  assert.equal(g.allPass, false);
});

// --- parseBotList ---
test("parseBotList defaults to review-bot[bot] when unset/empty", () => {
  assert.deepEqual(parseBotList(undefined), ["review-bot[bot]"]);
  assert.deepEqual(parseBotList("   "), ["review-bot[bot]"]);
});

test("parseBotList splits on comma/space and lowercases", () => {
  assert.deepEqual(parseBotList("review-bot[bot], my-ci-machine-user"), ["review-bot[bot]", "my-ci-machine-user"]);
  assert.deepEqual(parseBotList("Review-Bot[bot]"), ["review-bot[bot]"]);
});

// --- summarizeBotApproval ---
const botBase = { configList: ["review-bot[bot]"], requested: [], latestReviews: [] };

test("no bots on the PR → vacuously approved", () => {
  const s = summarizeBotApproval(botBase);
  assert.equal(s.ok, true);
  assert.deepEqual(s.required, []);
});

test("a required bot reviewer must have a latest APPROVED review", () => {
  const requested = ["review-bot"]; // bare login named in config (config path)
  const cfg = ["review-bot"];
  // requested but no approval yet → pending
  const pending = summarizeBotApproval({ ...botBase, configList: cfg, requested });
  assert.equal(pending.ok, false);
  assert.deepEqual(pending.pending, ["review-bot"]);
  // CHANGES_REQUESTED → still pending
  const changes = summarizeBotApproval({ ...botBase, configList: cfg, latestReviews: [{ login: "review-bot", state: "CHANGES_REQUESTED" }] });
  assert.equal(changes.ok, false);
  // APPROVED → ok
  const approved = summarizeBotApproval({ ...botBase, configList: cfg, latestReviews: [{ login: "review-bot", state: "APPROVED" }] });
  assert.equal(approved.ok, true);
});

test("review-bot only gates when it is on the PR ('if it is in the reviewers')", () => {
  // Configured but absent from the PR entirely → does not block.
  const s = summarizeBotApproval({ ...botBase, configList: ["review-bot"] });
  assert.equal(s.ok, true);
  assert.deepEqual(s.required, []);
});

test("a [bot] reviewer is auto-required without config; a non-[bot] machine user is not", () => {
  // GitHub App bot (login ends [bot]) is auto-detected even when not in config.
  const auto = summarizeBotApproval({ ...botBase, requested: ["some-app[bot]"] });
  assert.deepEqual(auto.pending, ["some-app[bot]"]);
  // A machine user without [bot] suffix and not in config is NOT treated as a required bot.
  const human = summarizeBotApproval({ ...botBase, latestReviews: [{ login: "some-machine-user", state: "COMMENTED" }] });
  assert.equal(human.ok, true);
});

// --- canonicalizeBotLogin (GraphQL strips the [bot] suffix; we restore it via __typename) ---
test("canonicalizeBotLogin restores [bot] for Bot actors, lowercases, leaves Users alone", () => {
  assert.equal(canonicalizeBotLogin("review-bot", "Bot"), "review-bot[bot]");
  assert.equal(canonicalizeBotLogin("SomeApp", "Bot"), "someapp[bot]");
  assert.equal(canonicalizeBotLogin("already[bot]", "Bot"), "already[bot]"); // no double suffix
  assert.equal(canonicalizeBotLogin("ACME", "User"), "acme");
  assert.equal(canonicalizeBotLogin("ACME", undefined), "acme");
});

test("a GitHub App bot (review-bot) auto-gates with NO config after canonicalization", () => {
  // Mirrors the real review-bot flow: GraphQL returns `review-bot` typename Bot →
  // gatherBotData canonicalizes to `review-bot[bot]` → auto-detected, default config only.
  const login = canonicalizeBotLogin("review-bot", "Bot"); // review-bot[bot]
  const pending = summarizeBotApproval({ ...botBase, requested: [login] });
  assert.equal(pending.ok, false);
  assert.deepEqual(pending.pending, ["review-bot[bot]"]);
  const approved = summarizeBotApproval({ ...botBase, latestReviews: [{ login, state: "APPROVED" }] });
  assert.equal(approved.ok, true);
});

test("config entry matches with or without the [bot] suffix", () => {
  const login = "review-bot[bot]"; // canonicalized review login
  // bare config entry still matches the suffixed login (config path is suffix-insensitive)
  const bare = summarizeBotApproval({ configList: ["review-bot"], requested: [login], latestReviews: [] });
  assert.deepEqual(bare.pending, ["review-bot[bot]"]);
});

const ctx = { slug: "pr-266", branch: "feat-x", worktree: "/r/.worktrees/pr-266", pr: 266 };

test("substituteHookTokens fills {slug}/{branch}/{worktree}/{pr}", () => {
  assert.equal(
    substituteHookTokens("/wk:cleanup {slug} --remove --yes --delete-remote", ctx),
    "/wk:cleanup pr-266 --remove --yes --delete-remote",
  );
  assert.equal(substituteHookTokens("{slug} {branch} {worktree} {pr}", ctx), "pr-266 feat-x /r/.worktrees/pr-266 266");
});

test("substituteHookTokens replaces every occurrence and leaves token-free commands alone", () => {
  assert.equal(substituteHookTokens("echo {pr}-{pr}", ctx), "echo 266-266");
  assert.equal(substituteHookTokens("docker compose down -v", ctx), "docker compose down -v");
});

// --- BEFORE_REVIEW_CMD (pre-review quiesce hook) -----------------------------
// Symmetric with AFTER_MERGE_CMD. These pin the SHIPPED config shape: both keys
// coexist in one file, comments between them do not swallow the next key, and
// the hook resolves for /prc — which runs BEFORE a PR exists, i.e. with pr = 0.

test("a config carrying BOTH hooks parses both, comments and all", () => {
  const cfg = parseConfig([
    "# post-merge teardown",
    "AFTER_MERGE_CMD=/wk:cleanup {slug} --remove --yes --delete-remote",
    "",
    "# pre-review quiesce: runs on loop entry AND each round",
    "BEFORE_REVIEW_CMD=/wk:pause {slug}",
  ].join("\n"));
  assert.equal(cfg.AFTER_MERGE_CMD, "/wk:cleanup {slug} --remove --yes --delete-remote");
  assert.equal(cfg.BEFORE_REVIEW_CMD, "/wk:pause {slug}");
});

test("BEFORE_REVIEW_CMD substitutes like any other hook", () => {
  assert.equal(substituteHookTokens("/wk:pause {slug}", ctx), "/wk:pause pr-266");
});

test("the quiesce hook resolves before a PR exists (prc runs it with pr = 0)", () => {
  const noPr = { slug: "wk-quiesce", branch: "work/wk-quiesce", worktree: "/r/.worktrees/wk-quiesce", pr: 0 };
  assert.equal(substituteHookTokens("/wk:pause {slug}", noPr), "/wk:pause wk-quiesce");
  assert.equal(substituteHookTokens("cmd --pr {pr}", noPr), "cmd --pr 0");
});

test("a project with no quiesce hook yields null, not an error", () => {
  const cfg = parseConfig("AFTER_MERGE_CMD=/wk:cleanup {slug}\n");
  assert.equal(cfg.BEFORE_REVIEW_CMD ?? null, null);
});
