# Safety Rules

Use these rules when drafting task packets and reviewing result packets.

## Privacy and Secrets

- Do not read unrelated private files, browser profiles, chat logs, mailboxes, documents, or downloads.
- Do not expose keys, tokens, cookies, session IDs, browser passwords, recovery codes, or private certificates.
- Do not ask Codex to print environment variables or credential files unless the user explicitly needs a named non-secret value.
- Treat accidental secret exposure as `blocked` and ask for human guidance.

## Access Boundaries

- Do not bypass login, captcha, paywalls, rate limits, account checks, or permission systems.
- Do not use credential stuffing, session hijacking, cookie reuse, or hidden browser password access.
- Stop if the requested action appears to require access the user has not clearly authorized.

## High-Impact Operations

Mark the task `blocked` and request human confirmation before:

- Deleting, overwriting, wiping, or bulk modifying user data.
- Publishing content externally.
- Sending email, chat, social, SMS, or other external messages.
- Making purchases, payments, trades, or subscription changes.
- Changing production systems, permissions, billing, security settings, or account ownership.

## Downloads, Web, and Scripts

- Check source, intent, and risk before downloading files, reading webpages, or executing scripts.
- Prefer official or user-provided sources.
- Verify checksums when provided.
- Inspect downloaded scripts before execution.
- Do not execute unknown binaries or install global tools without explicit user approval.
- Keep downloaded artifacts inside the task scope and report exact paths.

## Packet Safety

- Every `TASK-PACKET` must include stop conditions.
- Keep tasks small enough to stop safely.
- Do not continue if the packet is incomplete, internally inconsistent, or has mismatched nonce values.
- Do not expand scope after a `blocked` or `failed` result until the cause is diagnosed.
