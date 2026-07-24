<?php
/**
 * Blocks.
 *
 * @package WPSignal\Extensions\LivingPosts
 */

namespace WPSignal\Extensions\LivingPosts;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Register the block.
 */
function register_blocks() {
	register_block_type( DIR );
}
add_action( 'init', __NAMESPACE__ . '\register_blocks' );