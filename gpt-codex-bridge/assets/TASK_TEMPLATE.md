[TASK-PACKET BEGIN]
run_id: <stable-project-id>
round_id: <001>
nonce: <random-12-to-20-char-string>
target_dir: <local-working-directory>
priority: normal

stop_conditions:
- Login, captcha, payment, destructive action, external publishing, or message sending is required.
- Required files are missing or inaccessible.
- The task packet is incomplete.
- The beginning and ending nonce do not match.
- Continuing may expose secrets, tokens, cookies, or unrelated private data.

objective:
<one clear objective for this round>

context:
<necessary background>

inputs:
<files, links, directories, or previous result packets>

steps:
1. <step>
2. <step>
3. <validation step>

acceptance_criteria:
- <criterion>
- <criterion>

output_required:
Return a RESULT-PACKET exactly in the required format.
[TASK-PACKET END]
nonce: <same nonce as above>
