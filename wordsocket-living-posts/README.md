# WordSocket Living Posts

A block that renders a grid of published posts and keeps it alive: when a post is published, updated, or removed, every browser viewing the page reflects the change instantly. Cards slide into their new positions, flash green when added or updated, and fade out red when removed. No reload, no polling.

Built on the WordPress Interactivity API and [WPSignal](https://wpsignal.io/wordsocket)s realtime infrastructure.

## Requirements

- WordPress 7.0+, PHP 7.4+
- The WordSocket plugin installed and active

## Usage

1. Copy this folder into `wp-content/plugins/` and activate "WordSocket Living Posts".
2. Add the **WordSocket Living Posts** block to any post or page.

There is no build step. The view logic ships as a plain JS module (`viewScriptModule`) and the editor renders through `ServerSideRender`.

### Block Attributes

| Attribute | Default | Description |
|-----------|---------|-------------|
| `columns` | `4` | Grid columns at wider viewports. |
| `postsPerPage` | `100` | Posts fetched for the initial render. |

The layout is mobile-first: one column by default, `columns` wide at `768px` and up.

## How it works

- **`inc/wordsocket.php`** registers a `livingposts` channel and two triggers: `lp.updated` (on `save_post`) and `lp.deleted` (on `transition_post_status`, when a published post leaves the feed). Each publishes the post payload to subscribers.
- **`render.php`** runs a `WP_Query` (ordered `date DESC, ID ASC` to match wp-admin) and seeds the Interactivity store, so the grid is server-rendered and useful without JS.
- **`src/living-posts.js`** listens for the two events, merges or removes the post in the store, re-sorts with the same ordering, and animates the reflow with a measure-based FLIP (`getBoundingClientRect` + the Web Animations API). Because it measures real pixels, it works in any column count and respects `prefers-reduced-motion`.
- **`src/living-posts.css`** is the mobile-first grid and card styling.

## License

GPL-2.0-or-later