/*
 * Tell WordPress the page is being left. `fetch` with `keepalive` outlives
 * the page like `sendBeacon` does, and unlike it can carry the REST nonce, so
 * a logged-in visitor stays themselves instead of becoming a guest. Best
 * effort by nature: a crash sends nothing, and that is what relay presence
 * is for.
 */

export interface LeaveReport {
	v: string;
	journey: string;
}

export function sendLeave( url: string, report: LeaveReport, nonce?: string ): void {
	const headers: Record< string, string > = { "Content-Type": "application/json" };
	if ( nonce ) headers[ "X-WP-Nonce" ] = nonce;
	try {
		void fetch( url, {
			method: "POST",
			keepalive: true,
			credentials: "same-origin",
			headers,
			body: JSON.stringify( report ),
		} ).catch( () => undefined );
	} catch {
		// An unloading page may refuse the request; nothing to do.
	}
}
