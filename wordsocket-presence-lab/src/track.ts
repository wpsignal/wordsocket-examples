/*
 * The tracker every public page runs: open this page's journey step, enter
 * presence with the visitor id and the journey, report the visit, and keep
 * the journey honest while the tab is hidden or left. WordSocket's client is
 * a footer script that runs before this one, so `window.WPS` is already there.
 */
import { createJourney } from "./journey";
import { sendLeave } from "./leave";

const config = window.wordsocketPresenceLab;
const wps = window.WPS;

if ( config && wps ) {
	const journey = createJourney();
	const v = wps.visitorId();

	const announce = () => wps.setPresence( config.channel, { v, j: journey.current() } );

	const visit = () => {
		const headers: Record< string, string > = { "Content-Type": "application/json" };
		if ( config.nonce ) headers[ "X-WP-Nonce" ] = config.nonce;
		void fetch( config.visitUrl, {
			method: "POST",
			credentials: "same-origin",
			headers,
			body: JSON.stringify( { v, journey: journey.current() } ),
		} ).catch( () => undefined );
	};

	journey.step( config.kind, config.id );
	announce();
	visit();

	document.addEventListener( "visibilitychange", () => {
		if ( document.hidden ) journey.away();
		else journey.back();
		announce();
	} );

	window.addEventListener( "pagehide", () => {
		sendLeave( config.leaveUrl, { v, journey: journey.close() }, config.nonce );
	} );

	// Restored from the back/forward cache: the page is live again.
	window.addEventListener( "pageshow", ( event ) => {
		if ( event.persisted ) {
			journey.step( config.kind, config.id );
			announce();
			visit();
		}
	} );
}
