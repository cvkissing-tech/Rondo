# T3 Code work log reuse

Source: https://github.com/pingdotgg/t3code
Commit: 3de45c6254345f968fbdc64db7b149bf4f429855
File: apps/web/src/components/chat/WorkLog.tsx
Original blob SHA: 90a42a68f0cede3999b40aa75fcc7a9f10cd5c5b
License: MIT, retained in LICENSE.

Actual WorkLogBlock/List/Button/Row/Details product source is copied. Imports use
Jean's existing cn; text-secondary-label maps to text-muted-foreground. No private
backend, store, model connection or new package is imported. Task state and record
content come from our existing MCP and persisted SQLite jobs.
