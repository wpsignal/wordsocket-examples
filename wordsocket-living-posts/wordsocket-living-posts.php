<?php
/**
 * Plugin Name:       WordSocket Living Posts
 * Plugin URI:        https://wpsignal.io/wordsocket/living-posts
 * Description:       A live, self-updating grid of posts powered by WPSignal realtime and the WordPress Interactivity API. Posts appear, update, and disappear instantly.
 * Version:           1.0.1
 * Author:            WPSignal
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       wordsocket-living-posts
 * Domain Path:       /languages
 * Requires at least: 7.0
 * Tested up to:      8.4
 * Requires PHP:      7.4
 * Requires Plugins:  wordsocket
 *
 * @package WordSocket
 */

namespace WPSignal\Extensions\LivingPosts;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const PATH = __DIR__ . '/';

require_once PATH . 'inc/blocks.php';
require_once PATH . 'inc/wordsocket.php';