/*
 * The tracker every public page runs. Since WordSocket 0.30 the journey, the
 * leave, away and the back/forward cache all live in `WPS.presence.track()`;
 * the lab only names the channel and stores what the reports say (inc/lab.php
 * listens to `wpsignal_visitor_visit` and `wpsignal_visitor_leave`).
 * WordSocket's client is a footer script that runs before this one, so
 * `window.WPS` is already there.
 */

const config = window.wordsocketPresenceLab;
const wps = window.WPS;

if ( config && wps?.presence ) {
	wps.presence.track( config.channel );
}
