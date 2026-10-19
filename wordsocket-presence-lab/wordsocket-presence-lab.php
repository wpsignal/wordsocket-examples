<?php
/**
 * Plugin Name:       WordSocket Presence Lab
 * Plugin URI:        https://wpsignal.io/wordsocket
 * Description:       Reference consumer of WordSocket's visitor journeys (WPS.presence.track()): a table of visits and a live board. Not for production sites.
 * Version:           0.3.0
 * Author:            WPSignal
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       wordsocket-presence-lab
 * Requires Plugins:  wordsocket
 * Requires PHP:      8.2
 *
 * @package WPSignal\Extensions\PresenceLab
 */

namespace WPSignal\Extensions\PresenceLab;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const VERSION    = '0.3.0';
const DB_VERSION = '2';
const SLUG       = 'wordsocket-presence-lab';
const DIR        = __DIR__ . '/';
define( 'WPSignal\Extensions\PresenceLab\URL', plugin_dir_url( __FILE__ ) );

/** The reserved namespace (staff read, everyone writes presence) and its live channel. */
const NS      = 'lab';
const CHANNEL = 'lab:live';
const REST_NS = 'presence-lab/v1';

/** Who may read presence and the stored rows. */
const STAFF_CAP = 'manage_options';

require_once DIR . 'inc/lab.php';
