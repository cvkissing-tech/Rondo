# Native execution source reuse

`native-bridge.mjs` directly adapts the `RENDERER_BRIDGE` constant (source lines 10–117)
from `dudu555-djiao/codex-workbuddy-gateway/src/native-desktop-trigger.ts`, fixed commit
`fbaaa2ef6d6cb59f48b953a1f27058202a81553f`.
Source blob SHA: `34979b126142e8be7b60e991eda34d2b2a4ade8c`.
The authoritative source identity is the fixed commit and path below. No upstream license file
was returned at `LICENSE` for this revision. Reuse follows the user's stated authorization;
this notice does not invent an upstream license.

Source: https://github.com/dudu555-djiao/codex-workbuddy-gateway/blob/fbaaa2ef6d6cb59f48b953a1f27058202a81553f/src/native-desktop-trigger.ts

Kept: MessageChannel framing, session creation, busy/input detection, receipt markers,
model validation/readback. Adapted: private global namespace, request prefix and exposed
RPC primitive for cancelling only the saved dedicated session. The macOS launcher and
workbench are not imported. Windows process ownership checks live in `native-driver.mjs`.

`execution.py` session activation follows `activate_via_deeplink` in
Kxiandaoyan/workbuddy-acp-bridge at commit `3f2f52e7a03b32c455b1718ad43730177472e2ff`:
https://github.com/Kxiandaoyan/workbuddy-acp-bridge/blob/3f2f52e7a03b32c455b1718ad43730177472e2ff/acp_live_send.py#L145
Only the session created for this Rondo job is opened. Its speculative prompt retry and
first-frame-as-success behavior are not copied.

The other surveyed projects supply comparisons, not vendored code. In particular this
implementation does not extract account credentials, spawn a replacement coding harness,
force fullAccess/allow_always or insert rows into WorkBuddy's private history database.
