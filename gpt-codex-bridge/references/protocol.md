# GPT Codex Bridge Protocol

## Purpose

This protocol coordinates ChatGPT as planner/controller and Codex as executor. ChatGPT emits one bounded `TASK-PACKET`, Codex executes it, and Codex returns one `RESULT-PACKET`. ChatGPT validates the result before issuing any next packet.

## TASK-PACKET Structure

Use this structure for every delegated round:

```text
[TASK-PACKET BEGIN]
run_id: <stable-project-id>
round_id: <001>
nonce: <random-12-to-20-char-string>
target_dir: <local-working-directory>
priority: normal

stop_conditions:
- <conditions that force Codex to stop and report>

objective:
<one clear objective for this round>

context:
<only the necessary background>

inputs:
<files, links, directories, prior RESULT-PACKET summary, checksums, constraints>

steps:
1. <inspect or prepare>
2. <perform the bounded work>
3. <validate the result>

acceptance_criteria:
- <observable success criterion>
- <observable success criterion>

output_required:
Return a RESULT-PACKET exactly in the required format.
[TASK-PACKET END]
nonce: <same nonce as above>
```

Required fields are `run_id`, `round_id`, `nonce`, `objective`, `context`, `inputs`, `steps`, `acceptance_criteria`, `stop_conditions`, and `output_required`. `target_dir` and `priority` are recommended for execution clarity.

## RESULT-PACKET Structure

Codex must return this structure after every round:

```text
[RESULT-PACKET BEGIN]
run_id:
round_id:
nonce:
status: success | blocked | failed
summary:
files_changed:
commands_run:
validation:
issues:
next_recommendation:
[RESULT-PACKET END]
```

Field meanings:

- `run_id`: Must match the active run.
- `round_id`: Must match the task round just executed.
- `nonce`: Must match both nonce occurrences from the task packet.
- `status`: Use only `success`, `blocked`, or `failed`.
- `summary`: Concise description of what happened.
- `files_changed`: Exact paths changed, or `none`.
- `commands_run`: Commands or tools used, or `none`.
- `validation`: Tests, checks, screenshots, manual inspections, or explicit reason validation could not run.
- `issues`: Problems, risks, missing data, blocked conditions, or `none`.
- `next_recommendation`: Codex recommendation only; ChatGPT decides the next packet.

## Round Progression Rules

- Keep `run_id` stable for the whole user goal.
- Increment `round_id` only after ChatGPT accepts the previous `RESULT-PACKET`.
- Emit exactly one `TASK-PACKET` per ChatGPT turn of delegation.
- Do not combine unrelated objectives in one round.
- Keep each round small enough to validate and roll back.
- Include prior results only as concise context needed for the next round.
- Stop the run when acceptance criteria for the overall user goal are met.

## Nonce and Checksum Rules

- Generate a fresh random `nonce` for each round, 12 to 20 characters.
- Put the nonce near the top of the `TASK-PACKET` and repeat it after `[TASK-PACKET END]`.
- Codex must compare both nonce values before executing.
- ChatGPT must compare the returned nonce with the issued nonce before trusting the result.
- If any nonce is missing or mismatched, the status must be treated as `blocked`.
- If a packet includes a file checksum, artifact checksum, or body checksum in `inputs`, Codex must verify it before trusting the referenced artifact. A checksum mismatch is `blocked`.

## Status Handling

### success

Treat `success` as valid only when:

- `run_id`, `round_id`, and `nonce` match.
- `validation` is present and credible.
- Acceptance criteria are satisfied or clearly explained.
- No stop condition was triggered.

Then either end the run or create the next small `TASK-PACKET`.

### blocked

Use `blocked` when Codex could not proceed safely or lacked required access, files, permissions, user confirmation, or complete instructions. ChatGPT must:

- Identify the exact blocker from `issues`, `validation`, and `summary`.
- Ask the human for confirmation or missing information when needed.
- Create an unblock-only task if safe and specific.
- Avoid expanding scope or continuing the original task until the blocker is resolved.

### failed

Use `failed` when Codex attempted the task but validation failed, commands errored, or the result is incomplete. ChatGPT must:

- Determine whether failure is due to implementation, environment, ambiguity, or bad assumptions.
- Decide whether to issue a repair task, a diagnostic task, or ask the human.
- Keep any repair task limited to the failed surface.
- Avoid treating a failed result as progress without evidence.

## Creating the Next Round

When generating the next task:

1. Verify the previous result identifiers and nonce.
2. Compare the result against the previous acceptance criteria.
3. Summarize only relevant completed work and unresolved issues.
4. Choose one objective for the next round.
5. Add concrete validation requirements.
6. Carry forward safety stop conditions.
7. Generate a new nonce and increment `round_id`.

## Avoiding Task Drift

- Keep a short run ledger: original goal, current round, accepted results, open blockers.
- Reject new objectives that are not required for the original goal unless the user approves them.
- Do not let Codex's `next_recommendation` become the plan automatically.
- Convert broad requests into narrow execution slices.
- Preserve user constraints verbatim when they are safety, scope, file, or output constraints.
- Prefer "inspect, change one surface, validate" over large speculative task packets.
