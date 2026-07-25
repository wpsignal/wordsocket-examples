<?php
/**
 * WordSocket Living Posts - WPSignal configuration.
 *
 * @package WPSignal\Extensions\LivingPosts
 */

namespace WPSignal\Extensions\LivingPosts;

use WPSignal\WPS;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Register the `livingposts` WPSignal channel.
 */
function register_channel( array $channels, int $user_id, string $site_id ) {
	$channels[] = 'site:' . $site_id . ':livingposts';
	return $channels;
}
add_filter( 'wpsignal_token_channels', __NAMESPACE__ . '\register_channel', 10, 3 );

/**
 * Register the `lp.updated` and `lp.deleted` WPSignal triggers.
 */
function register_trigger() {
	// On post save, update
	WPS::trigger( 'lp.updated' )
		->on( 'save_post', 10, 2 )
		->channel( 'livingposts' )
		->data( fn( $post_id, $post ) => [
			'postId'  => $post_id,
			'title'   => get_the_title( $post ),
			'url'     => get_permalink( $post ),
			'date'    => $post->post_date,
			'excerpt' => get_the_excerpt( $post ),
		] )
		->when( fn( $post_id, $post ) =>
			$post->post_status === 'publish'
			&& $post->post_type === 'post'
		)
		->register();

	// On post delete
	WPS::trigger( 'lp.deleted' )
		->on( 'transition_post_status', 10, 3 )
		->channel( 'livingposts' )
		->data( fn( $new_status, $old_status, $post ) => [
			'postId' => $post->ID,
		] )
		->when( fn( $new_status, $old_status, $post ) =>
			$old_status === 'publish'
			&& $new_status !== 'publish'
			&& $post->post_type === 'post'
		)
		->register();
}
add_action( 'wpsignal_loaded', __NAMESPACE__ . '\register_trigger' );