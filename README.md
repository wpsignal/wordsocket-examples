# WordSocket Examples

Official example plugins showing how to build realtime WordPress features on
[WordSocket](https://wpsignal.io/wordsocket) and the WPSignal realtime service.

WordSocket bridges WordPress to WPSignal: your site publishes HMAC-signed events
on WordPress hooks, and subscribed browsers receive them live over WebSocket
(with an SSE fallback), no page reload.

## Examples

| Plugin | What it demonstrates |
|--------|----------------------|
| [`wordsocket-live-feed`](./wordsocket-live-feed) | A live post-feed block: published posts appear, update, and disappear in real time with a FLIP animation, built on the WordPress Interactivity API. |

## Requirements

- WordPress 7.0+, PHP 7.4+
- The [WordSocket](https://wpsignal.io/wordsocket) plugin installed and active

Each example is a standalone plugin. Drop its folder into `wp-content/plugins/`
and activate it.

## License

GPL-2.0-or-later
