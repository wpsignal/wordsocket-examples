# WordSocket Live Feed

A block that renders a grid of published posts and keeps it live: when a post is
published, updated, or removed, every browser viewing the page reflects the
change instantly and the cards animate into their new positions. No reload, no
polling.

Built on the WordPress Interactivity API and [WordSocket](https://wpsignal.io/wordsocket)
realtime.

## Requirements

- WordPress 7.0+, PHP 7.4+
- The WordSocket plugin installed and active

## Usage

1. Copy this folder into `wp-content/plugins/` and activate "WordSocket Live Feed".
2. Add the **WordSocket Live Feed** block to any post or page.

There is no build step. The view logic ships as a plain JS module
(`viewScriptModule`) and the editor renders through `ServerSideRender`.

### Attributes

| Attribute | Default | Description |
|-----------|---------|-------------|
| `columns` | `4` | Grid columns at wider viewports. |
| `postsPerPage` | `100` | Posts fetched for the initial render. |

The layout is mobile-first: one column by default, `columns` wide at `768px` and up.

## How it works

- **`inc/wordsocket.php`** registers a `livefeed` channel and two triggers:
  `livefeed.updated` (on `post_updated`) and `livefeed.deleted` (on
  `transition_post_status`, when a published post leaves the feed). Each
  publishes the post payload to subscribers.
- **`render.php`** runs a `WP_Query` (ordered `date DESC, ID ASC` to match
  wp-admin) and seeds the Interactivity store, so the grid is server-rendered
  and useful without JS.
- **`src/live-feed.js`** listens for the two events, merges or removes the post
  in the store, re-sorts with the same ordering, and animates the reflow with a
  measure-based FLIP (`getBoundingClientRect` + the Web Animations API). Because
  it measures real pixels, it works in any column count and respects
  `prefers-reduced-motion`.
- **`src/live-feed.css`** is the mobile-first grid and card styling.

## License

GPL-2.0-or-later
