# Repair source reuse

`agent_review_loop/repair.py` ports `pathMatchesContract` and
`unauthorizedChangedFiles` from `badgids/pi-pr-repair-loop/src/policy.js` at
commit `4c417231160f00d47c074c0510eca888c3c1181f`, blob
`84b6020de391573b9424ac9f0026fe34e4e54d4e`.

Source: https://github.com/badgids/pi-pr-repair-loop/blob/4c417231160f00d47c074c0510eca888c3c1181f/src/policy.js

The implementation uses Python instead of JavaScript, snake_case names and
explicit argument lists. Exact paths and directory-prefix semantics are retained.
This is a post-execution scope check, not a filesystem write sandbox.
The finding prompt also adapts the inspect/reproduce/focused repair/verification
workflow from that project's `src/prompts.js` (blob
`03058c18e83c08b27ccda9e95298c0df242af5aa`). Its Pi runtime and GitHub
commit/push workflow are not imported.

Aider's bounded reflection loop is a behavioral reference, not copied runtime:
https://github.com/Aider-AI/aider/blob/5dc9490bb35f9729ef2c95d00a19ccd30c26339c/aider/coders/base_coder.py#L933
Rondo has at most one repair and two reviews, reusing its own durable jobs.

Upstream MIT license for the ported policy and adapted prompt:

MIT License

Copyright (c) 2026

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
