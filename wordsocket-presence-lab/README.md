# WordSocket Presence Lab

A proof of concept, not a product: the generic half of ShopSocket's cart history (Phase 60, stage 1). What can WordPress know about a visitor's path and departure with no heartbeat, no scheduled job, and the relay's presence left exactly as it is?

- `src/journey.ts`: the journey string, `kind:id:ms` steps joined by `>`, `away` as a step, kept in `sessionStorage`.
- `src/leave.ts`: the leave report on `pagehide`, `fetch` with `keepalive` so it can carry the nonce.
- `src/track.ts`: presence with `{ v, j }`, the visit report, away and back, back/forward cache.
- `src/board.ts`: an admin page showing the live roster from presence next to what WordPress stored.
- `inc/lab.php`: the `lab` namespace, `POST /presence-lab/v1/visit` and `/leave`, one table, the admin page.

Run it on the E2E site against the rehearsal relay: `npm install && npm run build && npm run test:e2e` (settings in `tests/local.json`, same keys as WordSocket's). The six cases in `tests/e2e/lab.spec.ts` are the exit criteria: when they pass with the three browser files unchanged, the design moves into WordSocket.

## How it fits together

```mermaid
flowchart LR
  subgraph V["Visitor's browser (every public page)"]
    WPSC["WordSocket client<br/>window.WPS: visitorId(), setPresence(), on()"]
    T["track.ts<br/>open this page's step, announce, report"]
    J["journey.ts<br/>kind:id:ms steps joined by ><br/>sessionStorage 'wordsocket-journey', 50 cap<br/>away() / back() / close()"]
    L["leave.ts<br/>fetch keepalive on pagehide<br/>(nonce only when logged in)"]
    T --> J
    T --> L
  end

  subgraph WP["WordPress (inc/lab.php)"]
    ENQ["wp_enqueue_scripts<br/>track.js + inline config<br/>{ channel, kind, id, visitUrl, leaveUrl, nonce? }"]
    PS["page_step()<br/>post type + id, taxonomy + term id,<br/>or an id-less kind"]
    ALLOW["wpsignal_allow_client<br/>true on public pages and REST"]
    RES["channels()->reserve('lab',<br/>read manage_options, write everyone)"]
    TOK["wpsignal_token_channels<br/>staff tokens get lab:live"]
    VISIT["POST /presence-lab/v1/visit"]
    LEAVE["POST /presence-lab/v1/leave"]
    REC["record()<br/>upsert by visitor<br/>applied only if steps >= stored steps<br/>NULL literals for user_id / left_at"]
    TBL[("{prefix}presence_lab<br/>visitor PK, user_id, journey, steps,<br/>first_seen, last_seen, left_at")]
    ROWS["GET /presence-lab/v1/rows<br/>(manage_options, latest 50)"]
    ADMIN["Admin page 'Presence Lab'<br/>board.js + { channel, rowsUrl, nonce }"]
    PS --> ENQ
    VISIT --> REC
    LEAVE --> REC
    REC --> TBL
    TBL --> ROWS
  end

  subgraph R["WPSignal relay (memory only)"]
    HUB["presence hub<br/>lab:live: conn_id -> { v, j }"]
    KA["keepalive<br/>ping 20 s, close 1001 after 45 s silent"]
    FAN["fan-out<br/>wps.presence join / leave / sync"]
    HUB --> FAN
  end

  subgraph S["Staff browser (admin page)"]
    B["board.ts<br/>roster: leaves held 6 s,<br/>grouped by visitor,<br/>away when every tab's last step is away"]
    LIVE["Live table<br/>visitor, state, path, tabs"]
    STORED["Stored table<br/>visitor, user, path, seen, left"]
    B --> LIVE
    B --> STORED
  end

  ENQ -->|"page markup"| T
  T -->|"setPresence(lab:live, { v, j })"| WPSC
  WPSC -->|"presence frame"| HUB
  KA -.->|"dead socket closed"| HUB
  T -->|"{ v, journey } on load"| VISIT
  L -->|"{ v, journey } on pagehide"| LEAVE
  FAN -->|"wps.presence"| B
  ROWS -->|"poll every 5 s"| B
  ALLOW -.-> WPSC
  RES -.-> HUB
  TOK -.-> B
```

```mermaid
sequenceDiagram
  participant V as Visitor's browser
  participant R as Relay
  participant WP as WordPress
  participant B as Staff board

  Note over V: page load, kind:id from the markup
  V->>V: journey.step(kind, id)
  V->>R: presence join lab:live { v, j: "home:0:0" }
  R->>B: wps.presence join
  V->>WP: POST /visit { v, journey }
  WP->>WP: row upsert (steps 1)

  Note over V: tab hidden
  V->>V: journey.away()
  V->>R: presence update { v, j: "home:0:3000>away:0:0" }
  R->>B: wps.presence join (update)
  B->>B: visitor shown Away

  Note over V: tab visible again
  V->>V: journey.back()
  V->>R: presence update { v, j: "...>away:0:22000>home:0:0" }

  Note over V: navigation to the next page
  V->>V: pagehide: journey.close()
  V-->>WP: POST /leave keepalive { v, journey } (steps N)
  V--xR: socket closes
  R->>B: wps.presence leave
  B->>B: held 6 s, nothing shown

  Note over V: next page loads within the grace
  V->>R: presence join { v, j: "...>post:1:0" }
  R->>B: wps.presence join
  B->>B: same visitor, no flicker
  V->>WP: POST /visit (steps N+1)
  WP->>WP: whichever of leave and visit lands second is applied only if its step count is not lower: left_at ends NULL

  alt tab closed
    V-->>WP: POST /leave keepalive: left_at = now
    V--xR: socket closes
    R->>B: leave, dropped after 6 s
  else browser killed or network gone
    Note over WP: no leave arrives, row stays open
    R->>R: socket gone at once (process killed) or after the 45 s deadline (half-open)
    R->>B: leave, dropped after 6 s
  end
```

