/**
 * WordSocket Live Feed - Editor script.
 */
( function () {
	const { registerBlockType } = wp.blocks;
	const ServerSideRender = wp.serverSideRender;
	const el = wp.element.createElement;

	registerBlockType( 'wordsocket/live-feed', {
		edit( { attributes } ) {
			return el( ServerSideRender, {
				block: 'wordsocket/live-feed',
				attributes,
			} );
		},
	} );
} )();
