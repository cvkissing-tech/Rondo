# Codex shipped composer reuse

Source: installed OpenAI Codex 26.1021.3705.0, `app/resources/app.asar!/webview/assets/`.
The user explicitly authorized frontend reuse/reverse engineering for this project.

REA analyzed selected shipped JS modules as inert text (parent Evidence
`ev_45324be29d34caab057ef8763d9505f343f6548e2229f640c01c6880a54ecc0c`).
The recovered composer CSS retains its original hashed selectors and declarations.
`provenance.json` records exact artifact hashes and rule byte ranges.

`ComposerLayout.tsx` is a React adapter for the recovered Root/Body/Attachments/Input/Footer
structure and data variants. Private editor, stores, authentication and telemetry are
not copied. The native textarea uses our existing form state. The local token bridge
maps the source surface colors to Jean; geometry is taken from the shipped rules.
This is CSS source reuse with a reconstructed adapter, not a claim to original TSX
recovery or an independently runnable import of the Codex desktop application.

The static analysis covers selected bundles only. It does not establish the original
application's full runtime behavior. Original installed files were not modified.
