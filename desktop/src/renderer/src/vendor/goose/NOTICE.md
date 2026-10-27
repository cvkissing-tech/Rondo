# Goose ACP readiness reuse

Source: https://github.com/block/goose (repository may redirect to its current owner)
Commit: 2c6812a358db1b11953b9fafc05c6126eb818788
License: Apache-2.0, included as LICENSE.

AgentReadinessPanel.tsx adapts ui/desktop/src/components/settings/providers/AcpReadinessPanel.tsx: icon/status line, found/missing/checking branches, diagnostic output, setup explanation and refresh action. Props and Button import target Rondo/Jean; upstream account-success wording is replaced with protocol-handshake truth. Probe is explicit rather than automatically run at mount; no provider enable API, authentication or telemetry is copied. Original source hashes are in source-manifest.json. SettingsView.tsx was inspected for its separate settings workspace and list/detail space allocation; its navigation runtime is not included.
