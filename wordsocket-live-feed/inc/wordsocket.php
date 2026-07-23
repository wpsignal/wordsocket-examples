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
 * Register the `livefeed.updated` WPSignal trigger.
 */
function register_trigger() {
	WPS::trigger( 'livefeed.updated' )
		->on( 'post_updated', 10, 3 )
		->channel( 'livefeed' )
		->data( function ( $post_ID, $post_after, $_post_before ) {
			$stop = true;
			return [
				'id'          => $post_ID,
				'title'       => get_the_title( $post_after ),
				'url'         => get_permalink( $post_after ),
				'date'        => get_the_date( 'M j, Y', $post_after ),
				'excerpt'     => get_the_excerpt( $post_after ),
                // 'index'       => null, // Gets generated on the client.
                // 'prevIndex'   => null, // Gets generated on the client.
			];
		} )
		->when( function ( $_post_ID, $post_after, $_post_before ) {
			return $post_after->post_status === 'publish'
				&& $post_after->post_type === 'post';
		} )
		->register();
}
add_action( 'wpsignal_loaded', __NAMESPACE__ . '\register_trigger' );