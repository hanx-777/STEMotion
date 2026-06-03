# GPT Codex Bridge

`gpt-codex-bridge` helps ChatGPT coordinate Codex as an external executor through repeatable `TASK-PACKET` and `RESULT-PACKET` handoffs.

ChatGPT remains the planner/controller. Codex remains the executor. The skill helps ChatGPT draft high-quality task packets, review Codex result packets, validate nonce/checksum continuity, diagnose blocked or failed rounds, and plan the next small round.

## Upload or Mount the Skill

Use the `gpt-codex-bridge/` folder as the uploadable skill package. If your environment accepts zip uploads, upload `gpt-codex-bridge.zip`. If your environment discovers local skills, place the folder under your skills directory, such as:

```bash
~/.codex/skills/gpt-codex-bridge
```

Then start a ChatGPT thread and explicitly invoke:

```text
Use $gpt-codex-bridge to create a Codex TASK-PACKET for my task.
```

## Start the First Round

Give ChatGPT:

- The overall objective.
- The Codex working directory.
- Relevant files, links, constraints, and validation expectations.
- Any operation that must be treated as sensitive or forbidden.

ChatGPT should generate one `TASK-PACKET`. Paste that packet into Codex. Codex should execute only that round and return a `RESULT-PACKET`. Paste the result back into ChatGPT for review and the next round.

## Recommended Codex AGENTS.md

Also configure the Codex project with executor rules. Copy the companion `codex_executor_AGENTS.md` file into the target Codex project as `AGENTS.md`, or merge its rules with the existing project `AGENTS.md`.

The AGENTS.md rules tell Codex to read complete task packets, validate nonce values, run validation, stop for sensitive gates, and return a structured result packet.

## Human-in-the-Loop

This workflow does not guarantee fully unattended execution. Login, captcha, payment, deletion, publishing, external message sending, credential exposure, unauthorized access, and other high-impact operations require Codex to stop and request human confirmation.
