# Retention & reminders — user research + product map

**Shipped with:** kind reminders, ICS calendar, welcome-back, streak freezes, 5‑min micro-session, score compare.

## What users say (forums / social)

### Reconfirmed
- **Consistency beats intensity** (r/singing practice threads).
- **Streaks pull people back** (Duolingo culture).
- **Reminders raise retention** when opt-in and relevant ([Airship](https://www.airship.com/blog/push-notification-strategy-customer-retention/)).
- **Progress visibility** is emotional gold (same song years later on r/singing).

### Surprising
- **Guilt notifications backfire** — “makes me feel worse / failing at life” ([r/duolingo](https://www.reddit.com/r/duolingo/comments/1qkx0p6/notifications_like_this_are_the_worst/)).
- **Daily streak pressure** is hated by a segment of users ([r/iosapps](https://www.reddit.com/r/iosapps/comments/1rf2fss/)).
- Singers fall off from **life**, not missing content — need **re-entry**, not more videos.
- Paid “course apps” often dismissed as YouTube; **live practice tools** win.

## Product rules we ship
1. Kind copy only (ES/EN).  
2. Opt-in reminders; calendar ICS as primary offline habit.  
3. Flexible weekly goals already exist; freezes without monetized shame.  
4. Micro-session (5 min) lowers open barrier.  
5. Score compare after save (progress emotion).  

## Tech limits
True closed-tab push needs a push server + service worker. Documented for later with billing Worker. Local: on-visit banners + optional Notification API when permitted.
