<?php
/**
 * The lab: one table of visitors, two public routes the browser reports to,
 * the presence namespace, the storefront script, and the admin page.
 *
 * Everything here is the generic half of ShopSocket's cart history (Phase 60):
 * what WordPress can know about a visitor's path and departure with no
 * heartbeat and no job. Nothing WooCommerce.
 *
 * @package WPSignal\Extensions\PresenceLab
 */

namespace WPSignal\Extensions\PresenceLab;

use WPSignal\WPS;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** Longest journey string accepted (50 steps of `kind:id:ms` is well under this). */
const MAX_JOURNEY_BYTES = 4000;

/** A journey: `kind:id:ms` steps joined by `>`. Ids only, never a URL or a word. */
const JOURNEY_PATTERN = '/^[a-z_]+:\d+:\d+(>[a-z_]+:\d+:\d+)*$/';

/** WordSocket's visitor id is a version 4 UUID. */
const VISITOR_PATTERN = '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i';

/**
 * The visitors table name.
 *
 * @return string
 */
function table(): string {
	global $wpdb;
	return $wpdb->prefix . 'presence_lab';
}

/**
 * Create or update the table once per DB_VERSION, WooCommerce's way.
 *
 * @return void
 */
function install(): void {
	if ( get_option( 'presence_lab_db_version' ) === DB_VERSION ) {
		return;
	}
	global $wpdb;
	require_once ABSPATH . 'wp-admin/includes/upgrade.php';
	$table   = table();
	$collate = $wpdb->get_charset_collate();
	dbDelta(
		"CREATE TABLE {$table} (
			visitor char(36) NOT NULL,
			user_id bigint(20) unsigned NULL,
			journey text NULL,
			steps smallint unsigned NOT NULL DEFAULT 0,
			first_seen datetime NOT NULL,
			last_seen datetime NOT NULL,
			left_at datetime NULL,
			PRIMARY KEY  (visitor),
			KEY last_seen (last_seen),
			KEY left_at (left_at)
		) {$collate};"
	);
	update_option( 'presence_lab_db_version', DB_VERSION, false );
}
add_action( 'plugins_loaded', __NAMESPACE__ . '\install' );

/**
 * Whether this request renders a public page (not admin, AJAX, cron or REST).
 *
 * @return bool
 */
function is_public_page(): bool {
	if ( is_admin() || wp_doing_ajax() || wp_doing_cron() ) {
		return false;
	}
	return ! ( defined( 'REST_REQUEST' ) && REST_REQUEST );
}

/*
 * Visitors get the client on every public page, and a token during any REST
 * request so a refresh works (the same reasoning as ShopSocket's storefront).
 */
add_filter(
	'wpsignal_allow_client',
	static function ( bool $allow ): bool {
		if ( $allow ) {
			return true;
		}
		if ( defined( 'REST_REQUEST' ) && REST_REQUEST ) {
			return true;
		}
		return is_public_page();
	}
);

/*
 * The namespace: staff read it, everyone may write presence to it. Reserving
 * it puts the site in strict channel mode, so the board's subscription is
 * registered below rather than assumed from the site wildcard.
 */
add_action(
	'wpsignal_loaded',
	static function (): void {
		WPS::instance()->channels()->reserve( NS, STAFF_CAP, '__return_true' );
	}
);

add_filter(
	'wpsignal_token_channels',
	static function ( array $channels, int $user_id ): array {
		if ( $user_id > 0 && user_can( $user_id, STAFF_CAP ) ) {
			$channels[] = CHANNEL;
		}
		return $channels;
	},
	10,
	2
);

/**
 * The step this request's page is, as `{ kind, id }`: the post type and id
 * for singular pages, the taxonomy and term id for term archives, and an
 * id-less kind for everything else. Never a slug, title or search term.
 *
 * @return array{kind: string, id: int}
 */
function page_step(): array {
	if ( is_front_page() ) {
		return array(
			'kind' => 'home',
			'id'   => (int) get_queried_object_id(),
		);
	}
	if ( is_singular() ) {
		$type = get_post_type();
		return array(
			'kind' => sanitize_key( is_string( $type ) ? $type : 'post' ),
			'id'   => (int) get_queried_object_id(),
		);
	}
	if ( is_category() ) {
		return array(
			'kind' => 'category',
			'id'   => (int) get_queried_object_id(),
		);
	}
	if ( is_tag() ) {
		return array(
			'kind' => 'tag',
			'id'   => (int) get_queried_object_id(),
		);
	}
	if ( is_tax() ) {
		$term = get_queried_object();
		return array(
			'kind' => sanitize_key( $term->taxonomy ?? 'term' ),
			'id'   => (int) get_queried_object_id(),
		);
	}
	if ( is_search() ) {
		return array(
			'kind' => 'search',
			'id'   => 0,
		);
	}
	if ( is_archive() || is_home() ) {
		return array(
			'kind' => 'archive',
			'id'   => 0,
		);
	}
	return array(
		'kind' => 'other',
		'id'   => 0,
	);
}

/**
 * A wp-scripts asset file, or a fallback for an unbuilt checkout.
 *
 * @param string $name Entry name.
 * @return array{dependencies: string[], version: string}
 */
function asset( string $name ): array {
	$file = DIR . "build/{$name}.asset.php";
	return file_exists( $file ) ? require $file : array(
		'dependencies' => array(),
		'version'      => VERSION,
	);
}

/**
 * Print a config object before a script, as JSON that cannot close the tag.
 *
 * @param string $handle Script handle.
 * @param string $name   Global name.
 * @param array  $config The object.
 * @return void
 */
function inline_config( string $handle, string $name, array $config ): void {
	wp_add_inline_script(
		$handle,
		'window.' . $name . ' = ' . wp_json_encode( $config, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT ) . ';',
		'before'
	);
}

/*
 * The tracker rides on every public page WordSocket's client is on. The nonce
 * goes only to logged-in visitors: a guest page may come from a full-page
 * cache, and a stale nonce on a cookie-less request is refused by the REST
 * API where no nonce at all is accepted.
 */
add_action(
	'wp_enqueue_scripts',
	static function (): void {
		if ( ! wp_script_is( 'wpsignal', 'enqueued' ) ) {
			return;
		}
		$asset = asset( 'track' );
		wp_enqueue_script(
			SLUG . '-track',
			URL . 'build/track.js',
			array_merge( $asset['dependencies'], array( 'wpsignal' ) ),
			$asset['version'],
			true
		);
		$step   = page_step();
		$config = array(
			'channel'  => CHANNEL,
			'kind'     => $step['kind'],
			'id'       => $step['id'],
			'visitUrl' => rest_url( REST_NS . '/visit' ),
			'leaveUrl' => rest_url( REST_NS . '/leave' ),
		);
		if ( is_user_logged_in() ) {
			$config['nonce'] = wp_create_nonce( 'wp_rest' );
		}
		inline_config( SLUG . '-track', 'wordsocketPresenceLab', $config );
	},
	20
);

/**
 * Write what a visitor reported. The row is created on the first report and
 * updated by later ones, but only by a report at least as far along: the leave
 * of one page and the visit of the next are two requests that can land in
 * either order, so a report is ordered by how many steps its journey holds,
 * never by when it arrived. A visit clears `left_at` (they are back), a leave
 * sets it.
 *
 * @param string $visitor The browser's visitor id.
 * @param string $journey The journey string, possibly empty.
 * @param bool   $leaving Whether this is the leave report.
 * @return void
 */
function record( string $visitor, string $journey, bool $leaving ): void {
	global $wpdb;
	$now     = current_time( 'mysql', true );
	$user_id = get_current_user_id();
	$steps   = '' === $journey ? 0 : substr_count( $journey, '>' ) + 1;
	/*
	 * `prepare()` turns a PHP null into an empty string, which MySQL stores as
	 * 0 or the zero date, so the two nullable values are spelled as literals.
	 */
	$user_sql = $user_id > 0 ? (string) $user_id : 'NULL';
	$left_sql = $leaving ? $wpdb->prepare( '%s', $now ) : 'NULL';
	// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- The plugin's own table.
	$wpdb->query(
		$wpdb->prepare(
			// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name from table(); the literals are an integer or NULL and a prepared string or NULL; `steps` is assigned last so the IFs read the stored count.
			'INSERT INTO ' . table() . ' (visitor, user_id, journey, steps, first_seen, last_seen, left_at)
			VALUES (%s, ' . $user_sql . ', %s, %d, %s, %s, ' . $left_sql . ')
			ON DUPLICATE KEY UPDATE
				user_id = COALESCE(VALUES(user_id), user_id),
				journey = IF(VALUES(steps) >= steps, VALUES(journey), journey),
				last_seen = IF(VALUES(steps) >= steps, VALUES(last_seen), last_seen),
				left_at = IF(VALUES(steps) >= steps, VALUES(left_at), left_at),
				steps = GREATEST(steps, VALUES(steps))',
			$visitor,
			$journey,
			$steps,
			$now,
			$now
		)
	);
}

/**
 * The handler for both public routes.
 *
 * @param \WP_REST_Request $request The request.
 * @param bool             $leaving Whether this is `/leave`.
 * @return \WP_REST_Response
 */
function report( \WP_REST_Request $request, bool $leaving ): \WP_REST_Response {
	record( (string) $request->get_param( 'v' ), (string) $request->get_param( 'journey' ), $leaving );
	$response = rest_ensure_response( array( 'ok' => true ) );
	$response->header( 'Cache-Control', 'no-store' );
	return $response;
}

/**
 * The latest rows for the admin page.
 *
 * @return array<int, array<string, mixed>>
 */
function rows(): array {
	global $wpdb;
	// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.NotPrepared -- The plugin's own table, no user input.
	$rows = $wpdb->get_results( 'SELECT visitor, user_id, journey, first_seen, last_seen, left_at FROM ' . table() . ' ORDER BY last_seen DESC LIMIT 50', ARRAY_A );
	return array_map(
		static fn( array $row ): array => array(
			'visitor'    => (string) $row['visitor'],
			'user_id'    => null === $row['user_id'] ? null : (int) $row['user_id'],
			'journey'    => (string) $row['journey'],
			'first_seen' => (string) $row['first_seen'],
			'last_seen'  => (string) $row['last_seen'],
			'left_at'    => $row['left_at'],
		),
		(array) $rows
	);
}

add_action(
	'rest_api_init',
	static function (): void {
		$args = array(
			'v'       => array(
				'type'              => 'string',
				'required'          => true,
				'validate_callback' => static fn( $value ): bool => is_string( $value ) && 1 === preg_match( VISITOR_PATTERN, $value ),
			),
			'journey' => array(
				'type'              => 'string',
				'default'           => '',
				'validate_callback' => static fn( $value ): bool => is_string( $value )
					&& strlen( $value ) <= MAX_JOURNEY_BYTES
					&& ( '' === $value || 1 === preg_match( JOURNEY_PATTERN, $value ) ),
			),
		);
		foreach ( array( 'visit' => false, 'leave' => true ) as $route => $leaving ) {
			register_rest_route(
				REST_NS,
				'/' . $route,
				array(
					'methods'             => 'POST',
					'args'                => $args,
					'callback'            => static fn( \WP_REST_Request $request ) => report( $request, $leaving ),
					'permission_callback' => '__return_true',
				)
			);
		}
		register_rest_route(
			REST_NS,
			'/rows',
			array(
				'methods'             => 'GET',
				'callback'            => static fn() => rest_ensure_response( array( 'rows' => rows() ) ),
				'permission_callback' => static fn() => current_user_can( STAFF_CAP ),
			)
		);
	}
);

/*
 * The admin page: a live roster from presence next to the stored rows.
 */
add_action(
	'admin_menu',
	static function (): void {
		$hook = add_menu_page(
			__( 'Presence Lab', 'wordsocket-presence-lab' ),
			__( 'Presence Lab', 'wordsocket-presence-lab' ),
			STAFF_CAP,
			SLUG,
			static function (): void {
				echo '<div class="wrap"><h1>' . esc_html__( 'Presence Lab', 'wordsocket-presence-lab' ) . '</h1>';
				echo '<p>' . esc_html__( 'Live: who is on the site right now, from relay presence. Stored: what each visitor reported to WordPress.', 'wordsocket-presence-lab' ) . '</p>';
				echo '<div id="presence-lab" data-state="loading"></div></div>';
			},
			'dashicons-visibility'
		);
		add_action(
			'admin_enqueue_scripts',
			static function ( string $current ) use ( $hook ): void {
				if ( $current !== $hook || ! wp_script_is( 'wpsignal', 'enqueued' ) ) {
					return;
				}
				$asset = asset( 'board' );
				wp_enqueue_style( SLUG . '-board', URL . 'build/board.css', array(), $asset['version'] );
				wp_enqueue_script(
					SLUG . '-board',
					URL . 'build/board.js',
					array_merge( $asset['dependencies'], array( 'wpsignal' ) ),
					$asset['version'],
					true
				);
				inline_config(
					SLUG . '-board',
					'wordsocketPresenceLabBoard',
					array(
						'channel' => CHANNEL,
						'rowsUrl' => rest_url( REST_NS . '/rows' ),
						'nonce'   => wp_create_nonce( 'wp_rest' ),
					)
				);
			}
		);
	}
);
