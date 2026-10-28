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

2026-10-27 Rondo fixes: bridge revision4 retains bounded public agent-message/tool-call
updates for the owned worker and exposes drainEvents; reasoning updates and unrelated
sessions are excluded. `terminated` is considered idle only after outgoing RPCs and native
active-session checks clear. Native activation moves from empty session creation to the
first public progress event (or native input wait), avoiding the observed early history-read
race. These are Rondo adaptations, not claims of an upstream patch or all-version support.

2026-10-28: revision6 also tracks native permission/question/elicitation control events
outside `update.sessionUpdate`. A terminal history projection can hide these requests
in `session:get` while the backend still waits. Only owned sessions are tracked.
Permission requests reuse Rondo's existing ACP permission projection and answer UI;
the selected native option returns through `session:resolvePermission` to the exact
request ID. No automatic permission grant, prompt replay or private history edit is used.
`session:notifyListenerReady` replays pending inputs only, without loading full history.
Questions/elicitation without an in-product handler still use the native input entry.
Unanswered permissions cancel the native turn before helper cleanup; confirmed native
cancellation clears the local input cache. Background progress does not open a window.

Rechecked upstream on 2026-10-28: the pinned gateway source blob above is unchanged.
Kxiandaoyan's live ACP sender explicitly avoids loading/replaying full history before
prompting. The permission adaptation comes from Rondo's existing ACP answer flow and
inspection of the installed WorkBuddy handlers; it is not represented as upstream code.
The installed WorkBuddy 5.9.3 accepts the revision6 transport handshake (zero model turns).
