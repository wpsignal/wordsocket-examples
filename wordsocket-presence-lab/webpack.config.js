const defaultConfig = require( '@wordpress/scripts/config/webpack.config' );
const path = require( 'path' );

// Two plain entries: the storefront tracker and the admin board. No React.
module.exports = {
	...defaultConfig,
	entry: {
		track: path.resolve( __dirname, 'src/track.ts' ),
		board: path.resolve( __dirname, 'src/board.ts' ),
	},
};
