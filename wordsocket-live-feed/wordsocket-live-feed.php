<?php
/**
 * Plugin Name:       WordSocket Live Feed
 * Plugin URI:        https://wpsignal.io/wordsocket/live-feed
 * Description:       WordSocket Live Feed: a live post feed powered by WPSignal realtime and the WordPress Interactivity API. New posts appear instantly.
 * Version:           0.1.2
 * Author:            WPSignal
 * License:           GPL-2.0-or-later
 * Text Domain:       wordsocket
 * Requires at least: 7.0
 * Requires Plugins:  wordsocket
 * Tested up to:      7.0
 * Requires PHP:      7.4
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       wordsocket
 * Domain Path:       /languages
 * Requires at least: 7.0
 * Requires Plugins:  wordsocket
 * Tested up to:      7.0
 * Requires PHP:      7.4
 *
 * @package WordSocket
 */

namespace WPSignal\Extensions\LiveFeed;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const VERSION = '0.1.0';
const DIR     = __DIR__ . '/';

require_once DIR . 'inc/blocks.php';
require_once DIR . 'inc/wordsocket.php';