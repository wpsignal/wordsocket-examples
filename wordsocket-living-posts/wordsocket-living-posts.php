<?php
/**
 * Plugin Name:       WordSocket Live Feed
 * Plugin URI:        https://wpsignal.io/wordsocket/live-feed
 * Description:       A live post feed powered by WPSignal realtime and the WordPress Interactivity API. Posts appear, update, and disappear instantly.
 * Version:           0.1.2
 * Author:            WPSignal
 * License:           GPL-2.0-or-later
 * Text Domain:       wordsocket
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       wordsocket
 * Domain Path:       /languages
 * Requires at least: 7.0
 * Tested up to:      8.4
 * Requires PHP:      7.4
 * Requires Plugins:  wordsocket
 *
 * @package WordSocket
 */

namespace WPSignal\Extensions\LiveFeed;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const DIR = __DIR__ . '/';

require_once DIR . 'inc/blocks.php';
require_once DIR . 'inc/wordsocket.php';