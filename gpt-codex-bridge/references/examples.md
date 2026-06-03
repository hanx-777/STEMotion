# GPT Codex Bridge Examples

## Example 1: Modify Code and Run Tests

Use when ChatGPT wants Codex to make one scoped code change.

```text
[TASK-PACKET BEGIN]
run_id: stemotion-auth-fix
round_id: 001
nonce: J7mK29qT5xLp
target_dir: /Users/lxw/Documents/STEMotion/stemotion-mvp
priority: normal

stop_conditions:
- Login, captcha, payment, destructive action, external publishing, or message sending is required.
- Required files are missing or inaccessible.
- The task packet is incomplete.
- The beginning and ending nonce do not match.
- Continuing may expose secrets, tokens, cookies, or unrelated private data.

objective:
Fix the failing password reset validation message without changing unrelated auth behavior.

context:
The user reported that the password reset page accepts empty email input but should show the existing validation style.

inputs:
- target files: app/auth/reset-password/page.tsx, components/auth/*
- package scripts may include lint and test commands
- prior result packets: none

steps:
1. Inspect the relevant files and existing validation patterns.
2. Implement the smallest code change that enforces non-empty email validation.
3. Run the most relevant lint/test command available and report the result.

acceptance_criteria:
- Empty email submission shows the existing validation style.
- No unrelated auth files are changed.
- Relevant validation or lint command is run, or a reason is reported if unavailable.

output_required:
Return a RESULT-PACKET exactly in the required format.
[TASK-PACKET END]
nonce: J7mK29qT5xLp
```

Expected result shape:

```text
[RESULT-PACKET BEGIN]
run_id: stemotion-auth-fix
round_id: 001
nonce: J7mK29qT5xLp
status: success
summary: Added empty email validation to the reset password form using the existing error pattern.
files_changed:
- /Users/lxw/Documents/STEMotion/stemotion-mvp/app/auth/reset-password/page.tsx
commands_run:
- npm run lint
validation: npm run lint completed successfully.
issues: none
next_recommendation: Review in browser or proceed to the next requested auth issue.
[RESULT-PACKET END]
```

## Example 2: Download GPT-Generated Task File and Continue

Use when ChatGPT produced or hosted a task file and wants Codex to place it in a local directory before executing it.

```text
[TASK-PACKET BEGIN]
run_id: local-taskfile-exec
round_id: 002
nonce: zR4u8LqP93sV
target_dir: /Users/lxw/Documents/STEMotion/stemotion-mvp
priority: normal

stop_conditions:
- Login, captcha, payment, destructive action, external publishing, or message sending is required.
- Required files are missing or inaccessible.
- The task packet is incomplete.
- The beginning and ending nonce do not match.
- Continuing may expose secrets, tokens, cookies, or unrelated private data.
- The download source is not explicitly provided by the user or appears unsafe.
- The downloaded file checksum does not match the supplied checksum.

objective:
Download the supplied task file into .codex/tasks and execute only the first instruction section.

context:
ChatGPT generated a task file for this run. Codex should save it locally, inspect it, and execute only the bounded first section.

inputs:
- source_url: <user-provided-artifact-or-signed-url>
- expected_sha256: <optional-checksum>
- destination: /Users/lxw/Documents/STEMotion/stemotion-mvp/.codex/tasks/round-002.md

steps:
1. Create the destination directory if needed.
2. Download the file only from the supplied source URL and verify checksum if provided.
3. Read the downloaded file and execute only the first instruction section.
4. Run any validation specified in that first section and report results.

acceptance_criteria:
- The task file is saved at the destination path.
- The checksum is verified when provided.
- Only the first instruction section is executed.
- Validation is run or a clear blocker is reported.

output_required:
Return a RESULT-PACKET exactly in the required format.
[TASK-PACKET END]
nonce: zR4u8LqP93sV
```

Blocked result if the link is missing:

```text
[RESULT-PACKET BEGIN]
run_id: local-taskfile-exec
round_id: 002
nonce: zR4u8LqP93sV
status: blocked
summary: Could not download the task file because no explicit source URL was provided.
files_changed: none
commands_run: none
validation: Not run; required input was missing.
issues: Missing source_url.
next_recommendation: Ask the user for a safe source URL and optional checksum.
[RESULT-PACKET END]
```

## Example 3: Browser or Computer Use with Login/Captcha Stop

Use when Codex may use a browser or computer-use tool but must stop for interactive or sensitive gates.

```text
[TASK-PACKET BEGIN]
run_id: browser-price-check
round_id: 001
nonce: P0vN6cQaT18m
target_dir: /Users/lxw/Downloads
priority: normal

stop_conditions:
- Login, captcha, payment, destructive action, external publishing, or message sending is required.
- Required files are missing or inaccessible.
- The task packet is incomplete.
- The beginning and ending nonce do not match.
- Continuing may expose secrets, tokens, cookies, or unrelated private data.
- The website requests credentials, browser password access, account recovery, or permission escalation.

objective:
Use a browser to inspect the public pricing page and capture the current plan names and listed prices.

context:
The user needs public pricing information only. Do not log in, bypass gates, or submit forms.

inputs:
- url: https://example.com/pricing
- output format: concise table in RESULT-PACKET summary

steps:
1. Open the supplied public URL.
2. Read visible public pricing information only.
3. Stop immediately if login, captcha, paywall, account access, or form submission is required.
4. Return observed plan names, prices, and validation notes.

acceptance_criteria:
- Public plan names and prices are reported when visible.
- No login, captcha, payment, or form submission is attempted.
- Browser/tool actions are listed in commands_run.

output_required:
Return a RESULT-PACKET exactly in the required format.
[TASK-PACKET END]
nonce: P0vN6cQaT18m
```

Blocked result if a login wall appears:

```text
[RESULT-PACKET BEGIN]
run_id: browser-price-check
round_id: 001
nonce: P0vN6cQaT18m
status: blocked
summary: The pricing page redirected to a login page before public prices were visible.
files_changed: none
commands_run:
- Opened https://example.com/pricing in browser tool
validation: Stopped before interacting with login fields.
issues: Login required to continue.
next_recommendation: Ask the user to provide public pricing data or explicit authenticated workflow instructions.
[RESULT-PACKET END]
```
