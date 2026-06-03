---
name: gpt-codex-bridge
description: Use this skill when the user wants ChatGPT to coordinate Codex as an external executor through repeatable task/result handoff packets, including GPT-to-Codex planning, TASK-PACKET generation, RESULT-PACKET review, nonce/checksum validation, multi-round task decomposition, and safe human-in-the-loop escalation for browser, computer-use, coding, file, or automation workflows.
---

# GPT Codex Bridge

Use this skill to keep ChatGPT as the planner/controller and Codex as the executor. ChatGPT designs small, verifiable, rollback-friendly rounds; Codex performs the delegated work and reports back.

## Core Loop

1. Generate exactly one `TASK-PACKET` per round.
2. Do not have ChatGPT perform computer, browser, file, coding, or automation operations directly.
3. Make each task narrow, verifiable, and reversible where possible.
4. After Codex returns a `RESULT-PACKET`, inspect `run_id`, `round_id`, `nonce`, `status`, and `validation` before deciding the next round.
5. If the result is `blocked` or `failed`, diagnose the blocking cause before expanding or continuing the task.

## TASK-PACKET Requirements

Each `TASK-PACKET` must include:

- `run_id`
- `round_id`
- `nonce`
- `objective`
- `context`
- `inputs`
- `steps`
- `acceptance_criteria`
- `stop_conditions`
- `output_required`

Repeat the same `nonce` once near the beginning of the packet and once after `[TASK-PACKET END]`. If the beginning and ending nonce differ, Codex must stop and report `blocked`.

## Safety Stops

Every task must require Codex to stop and report if it encounters login, captcha, payment, deletion/destructive action, external publishing, sending messages, unauthorized access, or possible exposure of keys, tokens, cookies, browser passwords, or unrelated private data.

## References

- Read `references/protocol.md` when drafting or reviewing packets.
- Read `references/examples.md` for concrete packet patterns.
- Read `references/safety.md` when browser, computer-use, download, file, script, credential, or high-impact operations are involved.
- Use `assets/TASK_TEMPLATE.md` and `assets/RESULT_TEMPLATE.md` as the canonical packet templates.
