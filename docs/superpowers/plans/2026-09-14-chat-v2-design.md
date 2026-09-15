# Chat v2 Redesign — Plan
Goal: Redesign chat to BeUI layered workspace + fixes per user spec
Scope: grouping, collapsible sidebar, avatar/badge selects, expand composer, bubble footer, remove hermes

Tasks:
1. Sidebar grouping by date (today/yesterday/prev7/prev30/older) from updated_at
2. Collapsible internal sidebar (280 ↔ 56, toggle like kanban, persist kb-chat-sidebar-collapsed)
3. Remove hermes select, hidden agent=hermes
4. Profile select: Avatar + fallback initials + valid/broken hint, Workspace select: dot + ssh/os badge
5. Composer: max-h, scroll, expand button, Enter send / Shift+Enter newline
6. Bubble footer hybrid: assistant → model·elapsed always, state only when running/error
7. Verify build + no regression on deep-link/SSE/stop
