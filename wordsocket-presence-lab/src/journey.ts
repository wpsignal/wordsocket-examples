/*
 * A visitor's journey: one string of `kind:id:ms` steps joined by `>`, where a
 * step is a state and how long it lasted. Pages are steps (`product:123:3000`),
 * and so is being away (`away:0:22000`, the tab hidden). Only one step is
 * open at a time; it is closed when the next one opens or when the page is
 * left. The closed steps live in `sessionStorage`, so the string follows the
 * visitor from page to page and dies with the tab.
 *
 * Ids only: a step never carries a URL, a slug or anything a person typed.
 */

export const JOURNEY_KEY = "wordsocket-journey";
export const MAX_STEPS = 50;
export const AWAY = "away";
export const SEPARATOR = ">";

const STEP = /^[a-z_]+:\d+:\d+$/;

/*
 * A tab close fires `visibilitychange` (hidden) a moment before `pagehide`,
 * so without this every closed tab would end in an `away` of a few
 * milliseconds that nobody chose. An away shorter than this at the moment of
 * leaving is the browser's own ordering, not the visitor's, and is dropped.
 */
const UNLOAD_AWAY_MS = 1000;

interface OpenStep {
	kind: string;
	id: number;
	since: number;
}

export interface Journey {
	/** The journey with the open step's elapsed time included. */
	current(): string;
	/** Close the open step, store, and return the journey. For `pagehide`. */
	close(): string;
	/** Close whatever is open and open a step for this page. */
	step( kind: string, id: number ): void;
	/** The tab was hidden: close the page step, open `away`. */
	away(): void;
	/** The tab is visible again: close `away`, reopen the page step. */
	back(): void;
}

function storage(): Storage | null {
	try {
		return window.sessionStorage;
	} catch {
		return null;
	}
}

function load( store: Storage | null ): string[] {
	try {
		const raw = store?.getItem( JOURNEY_KEY ) ?? "";
		return raw === "" ? [] : raw.split( SEPARATOR ).filter( ( s ) => STEP.test( s ) );
	} catch {
		return [];
	}
}

function format( kind: string, id: number, ms: number ): string {
	return `${ kind }:${ Math.max( 0, Math.floor( id ) ) }:${ Math.max( 0, Math.round( ms ) ) }`;
}

export function createJourney( store: Storage | null = storage(), now: () => number = () => Date.now() ): Journey {
	let closed = load( store );
	let open: OpenStep | null = null;
	let page: { kind: string; id: number } | null = null;

	const commit = () => {
		try {
			store?.setItem( JOURNEY_KEY, closed.join( SEPARATOR ) );
		} catch {
			// Storage blocked: the journey lasts for this page only.
		}
	};

	// Close the open step into the list, keeping the newest MAX_STEPS.
	const finish = () => {
		if ( ! open ) return;
		closed.push( format( open.kind, open.id, now() - open.since ) );
		if ( closed.length > MAX_STEPS ) closed = closed.slice( closed.length - MAX_STEPS );
		open = null;
		commit();
	};

	return {
		current() {
			const steps = open ? [ ...closed, format( open.kind, open.id, now() - open.since ) ] : closed;
			return steps.join( SEPARATOR );
		},
		close() {
			if ( open?.kind === AWAY && now() - open.since < UNLOAD_AWAY_MS ) {
				open = null;
			}
			finish();
			return closed.join( SEPARATOR );
		},
		step( kind, id ) {
			finish();
			page = { kind, id };
			open = { kind, id, since: now() };
		},
		away() {
			if ( ! open || open.kind === AWAY ) return;
			finish();
			open = { kind: AWAY, id: 0, since: now() };
		},
		back() {
			if ( open?.kind !== AWAY || ! page ) return;
			finish();
			open = { ...page, since: now() };
		},
	};
}
