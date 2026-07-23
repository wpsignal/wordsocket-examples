<?php

/**
 * Server-side render for the WordSocket Live Feed block.
 *
 * Hydrates the Interactivity API store with an initial set of posts so the
 * page is useful without JS, and the JS module can prepend new posts on top.
 *
 * @var array $attributes Block attributes.
 */

const COLUMNS = 3;

$per_page = isset($attributes['postsPerPage']) ? (int) $attributes['postsPerPage'] : 5;

$query = new WP_Query([
	'post_type'      => 'post',
	'post_status'    => 'publish',
	'posts_per_page' => $per_page,
	'no_found_rows'  => true,
]);

$posts_data = [];

foreach ($query->posts as $key => $post) {
	$col = ( $key % COLUMNS ) + 1;
	$row = (int) floor( $key / COLUMNS ) + 1;
	$posts_data[] = [
		'id'        => $post->ID,
		'title'     => get_the_title($post),
		'url'       => get_permalink($post),
		'date'      => get_the_date('M j, Y', $post),
		'excerpt'   => get_the_excerpt($post),
		'column'     => (string) $col,
		'prevColumn' => (string) $col,
		'row'       => (string) $row,
		'prevRow'   => (string) $row,
		'index'     => (string) $key,
	];
}

wp_interactivity_state('wordsocket/live-feed', [
	'posts' => $posts_data,
]);

?>
<div
	<?php echo get_block_wrapper_attributes(); ?>
	data-wp-interactive="wordsocket/live-feed">
	<ul class="wpslf-list">
		<template
			data-wp-each="state.posts"
			data-wp-each-key="context.item.id">
			<li class="wpslf-item" data-wp-style----column="context.item.column" data-wp-style----prev-column="context.item.prevColumn" data-wp-style----row="context.item.row" data-wp-style----prev-row="context.item.prevRow">
				<a data-wp-bind--href="context.item.url" href="#">
					<span data-wp-text="context.item.prevColumn"></span>/
					<span data-wp-text="context.item.column"></span>
					<span data-wp-text="context.item.title"></span>
				</a>
				<p data-wp-text="context.item.excerpt"></p>
				<time data-wp-text="context.item.date"></time>
			</li>
		</template>
	</ul>
</div>