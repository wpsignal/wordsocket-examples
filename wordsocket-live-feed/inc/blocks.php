<?php
/**
 * Blocks.
 *
 * @package WPSignal\Extensions\LiveFeed
 */

namespace WPSignal\Extensions\LiveFeed;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Register the block.
 */
function register_blocks() {
	register_block_type( DIR, [
		'render' => DIR . 'render.php',
	] );
}
add_action( 'init', __NAMESPACE__ . '\register_blocks' );