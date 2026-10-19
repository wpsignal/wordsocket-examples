<?php
/**
 * The lab: one table of journeys (one row per visit, grouped by visitor) fed
 * by WordSocket's visit and leave reports, the presence namespace, the
 * storefront script, and the admin page.
 *
 * Since WordSocket 0.30 the journey, the page step and the two public routes
 * are WordSocket's (`WPS.presence.track()`, `POST /wpsignal/v1/visit` and
 * `/leave`); this file is what an extension writes on top: a channel, a
 * listener on `wpsignal_visitor_visit` and `wpsignal_visitor_leave`, and a
 * store of its own. Nothing WooCommerce.
 *
 * @package WPSignal\Extensions\PresenceLab
 */

namespace WPSignal\Extensions\PresenceLab;

use WPSignal\WPS;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * The journeys table name.
 *
 * @return string
 */
function table(): string {
	global $wpdb;
	return $wpdb->prefix . 'presence_lab';
}

/**
 * Create the table once per DB_VERSION, WooCommerce's way. A lab keeps no
 * data worth migrating, and `dbDelta` cannot change a primary key, so a
 * version bump drops the old table first (version 2 moved the key from the
 * visitor to the journey).
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
	// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.DirectDatabaseQuery.SchemaChange, WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- The plugin's own table, name from table().
	$wpdb->query( "DROP TABLE IF EXISTS {$table}" );
	dbDelta(
		"CREATE TABLE {$table} (
			journey_id char(36) NOT NULL,
			visitor char(36) NOT NULL,
			user_id bigint(20) unsigned NULL,
			journey text NULL,
			steps smallint unsigned NOT NULL DEFAULT 0,
			first_seen datetime NOT NULL,
			last_seen datetime NOT NULL,
			left_at datetime NULL,
			PRIMARY KEY  (journey_id),
			KEY visitor (visitor),
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
 * The tracker rides on every public page WordSocket's client is on. The page's
 * step, the report routes and the nonce are WordSocket's own config now; the
 * lab only names its channel.
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
		inline_config( SLUG . '-track', 'wordsocketPresenceLab', array( 'channel' => CHANNEL ) );
	},
	20
);

/**
 * Write what a visitor reported, as WordSocket hands it to the
 * `wpsignal_visitor_visit` and `wpsignal_visitor_leave` actions.
 *
 * @param array{visitor: string, journey_id: string, journey: string, steps: int, user_id: int, leaving: bool} $report The report.
 * @return void
 */
function record( array $report ): void {
	global $wpdb;
	$now        = current_time( 'mysql', true );
	$visitor    = $report['visitor'];
	$journey_id = $report['journey_id'];
	$journey    = $report['journey'];
	$steps      = $report['steps'];
	$user_id    = $report['user_id'];
	$leaving    = $report['leaving'];
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
			'INSERT INTO ' . table() . ' (journey_id, visitor, user_id, journey, steps, first_seen, last_seen, left_at)
			VALUES (%s, %s, ' . $user_sql . ', %s, %d, %s, %s, ' . $left_sql . ')
			ON DUPLICATE KEY UPDATE
				user_id = COALESCE(VALUES(user_id), user_id),
				journey = IF(VALUES(steps) >= steps, VALUES(journey), journey),
				last_seen = IF(VALUES(steps) >= steps, VALUES(last_seen), last_seen),
				left_at = IF(VALUES(steps) >= steps, VALUES(left_at), left_at),
				steps = GREATEST(steps, VALUES(steps))',
			$journey_id,
			$visitor,
			$journey,
			$steps,
			$now,
			$now
		)
	);
	if ( $leaving ) {
		return;
	}
	// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- The plugin's own table.
	$wpdb->query(
		$wpdb->prepare(
			// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- Table name from table().
			'UPDATE ' . table() . ' SET left_at = last_seen WHERE visitor = %s AND journey_id <> %s AND left_at IS NULL',
			$visitor,
			$journey_id
		)
	);
}

add_action( 'wpsignal_visitor_visit', __NAMESPACE__ . '\\record' );
add_action( 'wpsignal_visitor_leave', __NAMESPACE__ . '\\record' );

/**
 * The latest rows for the admin page, newest first; the board groups them by visitor.
 *
 * @return array<int, array<string, mixed>>
 */
function rows(): array {
	global $wpdb;
	// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.NotPrepared -- The plugin's own table, no user input.
	$rows = $wpdb->get_results( 'SELECT journey_id, visitor, user_id, journey, first_seen, last_seen, left_at FROM ' . table() . ' ORDER BY last_seen DESC LIMIT 50', ARRAY_A );
	return array_map(
		static fn( array $row ): array => array(
			'journey_id' => (string) $row['journey_id'],
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
