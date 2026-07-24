<?php

/**
 * Server-side render for the WordSocket Live Feed block.
 *
 * Hydrates the Interactivity API store with an initial set of posts so the
 * page is useful without JS, and the JS module can prepend new posts on top.
 *
 * @var array $attributes Block attributes.
 */

$columns  = isset($attributes['columns']) ? (int) $attributes['columns'] : 3;
$per_page = isset($attributes['postsPerPage']) ? (int) $attributes['postsPerPage'] : 100;

$query = new WP_Query([
	'post_type'      => 'post',
	'post_status'    => 'publish',
	'posts_per_page' => $per_page,
	// Match wp-admin: newest first, ties broken by oldest id first.
	'orderby'        => [
		'date' => 'DESC',
		'ID'   => 'ASC',
	],
]);

$posts_data = [];

foreach ($query->posts as $key => $post) {
	$col = ( $key % $columns ) + 1;
	$row = (int) floor( $key / $columns ) + 1;
	$posts_data[] = [
		'postId'    => $post->ID,
		'title'     => get_the_title($post),
		'url'       => get_permalink($post),
		'date'      => $post->post_date,
		'excerpt'   => get_the_excerpt($post),
		'column'    => (string) $col,
		'row'       => (string) $row,
	];
}

wp_interactivity_state('wordsocket/live-feed', [
	'posts' => $posts_data,
]);

?>
<div
	<?php echo get_block_wrapper_attributes(); ?>
	data-wp-interactive="wordsocket/live-feed">
	<ul class="wpslf-list" style="--columns: <?php echo $columns; ?>" data-wpslf-columns="<?php echo $columns; ?>">
		<template
			data-wp-each="state.posts"
			data-wp-each-key="context.item.postId">
			<li class="wpslf-item" data-wp-bind--data-post-id="context.item.postId" data-wp-style----column="context.item.column" data-wp-style----row="context.item.row">
				<a data-wp-bind--href="context.item.url" href="#">
					<h3 data-wp-text="context.item.title"></h3>
				</a>
				<p data-wp-text="context.item.excerpt"></p>
				<time data-wp-text="context.item.date"></time>
			</li>
		</template>
	</ul>
</div>