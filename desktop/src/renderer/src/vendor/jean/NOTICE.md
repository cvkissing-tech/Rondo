# Jean UI source reuse

Source: https://github.com/coollabsio/jean
Commit: cdbb6af79c745e4ff9d51d592bf4e90e9f1308d3
Copyright: Andras Bacsai and Jean contributors.
License: Apache-2.0 (LICENSE.md retained).

Imported the actual React sidebar, form/input-group, resizable, tooltip, popover, sheet and small controls. Replaced upstream @/ imports with the local @jean/ alias and reicon imports with the already installed Lucide equivalents. The theme is extracted from src/App.css before unused animation rules; Windows system fonts are used. The desktop-only mobile hook and cookies are adapted where file:// requires it. Product-specific store, Tauri, authentication, network, billing and agent integrations were not imported; components receive our real MCP-backed task state.

Each source file keeps its origin header. Original file identities:

- src/components/ui/button.tsx: 7e58115a89c95c53763c4b9f962e71af5a224d98
- src/components/ui/input.tsx: af2b4a27f49e9161d2b04c716dff6ad2b3054c25
- src/components/ui/textarea.tsx: 27b1c1e5693557fa48bfad8531cf53159a3c9c5a
- src/components/ui/input-group.tsx: f5d4895ed7495e99d59965195f97b33e58a3ac01
- src/components/ui/resizable.tsx: b4254c53b2ef9960d0329ce7714a00a7625060b5
- src/components/ui/sidebar.tsx: 5d1caf4c2f06089b9c120c70fdf4d36dc82f8846
- src/components/ui/tooltip.tsx: d8b773f09b8edd490f33f483198131cd20815c04
- src/components/ui/sheet.tsx: 2ef9e235c6b10a7e6f401e5b870853c338018fde
- src/components/ui/separator.tsx: db42857da588e0fca75e5983fe78a058cb47c705
- src/components/ui/skeleton.tsx: e3beb90241eeeca34da099f60f96e6d40411af00
- src/components/ui/badge.tsx: 8c3e2400420ddac2fd5e6ad20fd39d1ea09132de
- src/components/ui/alert.tsx: 386fe6e806316d4004adad7f84a6e017086dacac
- src/components/ui/empty.tsx: 64dab6b296e2e0b98ce7e4b4fcde587be6eefe67
- src/components/ui/popover.tsx: a839c5433473474be80b67044f1c8ea594ad901c
- src/components/ui/toggle-group.tsx: 37651b71946ec11ad1529592ea556ee575f3c5e4
- src/components/ui/toggle.tsx: 2bb080a82355afb2ef76e9651b67796cfcdce2e5
- src/components/ui/field.tsx: 579bf5fbe5dfeac5b046de2de4fb9200d5c5c8e7
- src/components/ui/label.tsx: eaa82fa8b100a49909b0320a051d780ca8992711
- src/lib/utils.ts: fed2fe91e4d2321f997c0209881db87fe0d07ba9
- src/lib/viewport.ts: 7320bd28b937eff6b9d28d86d4a5a0f79845621b
- src/hooks/use-mobile.ts: 73a539b51eeebd46abd84cfb6194704553ca9844
- src/App.css: c983367c4782964ff743170b67f15038cffcd73f
- LICENSE.md: ee20ed536e9c50a32c01d9ef99799a4f9005adb6

## Product-level layout adaptation in 0.9.1

The following product JSX and utility-class layouts are adapted, rather than
replacing only primitives. Private Tauri/store/network dependencies become props
and the existing SidebarProvider. Unsupported product entries are omitted.
Task labels and callbacks use the actual MCP task state; the visual rules remain
those of the source product. This is a selective port, not an import of Jean's backend.

- MainWindow.tsx: 6ed9bcdc919480bbba3730fdb5ef4da4dfefb59f
- SidebarTabRail.tsx: 0f993c7ce4c285e278c4fbd6b19a6f54e771604f
- ProjectsSidebar.tsx: d86b4e1fe53b8671249232ffad77bdb421864ee2
- ProjectTreeItem.tsx: 06eda12d98d53c693d38b244051c835a9aebdb3a
- WelcomeProjectGrid.tsx: b8ff451cc8a7a35b7202ad1a81d3d8228111e27a

Local adapters: components/workbench/WorkbenchShell.tsx and TaskSidebar.tsx;
App.tsx retains the WelcomeProjectGrid content container layout for task creation.

0.14.0: Rondo replaces the prior SidebarTabRail composition with a single project sidebar and main-only toolbar, combining the adapted Jean navigation/theme with T3 conversation composition. TaskSidebar gains shared arrow/Home/End keyboard tab activation. The original source identity remains attribution, not a claim of unchanged upstream layout.
