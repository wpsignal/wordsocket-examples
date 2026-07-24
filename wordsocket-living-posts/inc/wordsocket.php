<?php
/**
 * WordSocket Live Feed - WPSignal configuration.
 *
 * @package WPSignal\Extensions\LiveFeed
 */

namespace WPSignal\Extensions\LiveFeed;

use WPSignal\WPS;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Register the `livefeed` WPSignal channel.
 */
function register_channel( array $channels, int $user_id, string $site_id ) {
	$channels[] = 'site:' . $site_id . ':livefeed';
	return $channels;
}
add_filter( 'wpsignal_token_channels', __NAMESPACE__ . '\register_channel', 10, 3 );

/**
 * Register the `livefeed.updated` and `livefeed.deleted` WPSignal triggers.
 */
function register_trigger() {
	WPS::trigger( 'livefeed.updated' )
		->on( 'save_post', 10, 2 )
		->channel( 'livefeed' )
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

	// When a published post leaves the feed (trashed or unpublished), trigger
	// the `livefeed.deleted` event.
	WPS::trigger( 'livefeed.deleted' )
		->on( 'transition_post_status', 10, 3 )
		->channel( 'livefeed' )
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