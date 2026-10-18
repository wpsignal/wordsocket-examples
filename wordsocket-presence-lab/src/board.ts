/*
 * The lab's admin page: the live roster from relay presence (a member per
 * connection, grouped by visitor, away when every tab of theirs is hidden)
 * next to the rows WordPress stored. Plain DOM; the board is a reading
 * instrument, not a product.
 */
import "./board.css";
import { AWAY, SEPARATOR } from "./journey";

// A navigation closes the old socket a moment before the new page rejoins.
const LEAVE_GRACE_MS = 6_000;
const ROWS_POLL_MS = 5_000;

type Member = { v?: string; j?: string };

interface StoredRow {
	visitor: string;
	user_id: number | null;
	journey: string;
	first_seen: string;
	last_seen: string;
	left_at: string | null;
}

const config = window.wordsocketPresenceLabBoard;
const wps = window.WPS;
const root = document.getElementById( "presence-lab" );

function lastStep( journey: string ): string {
	const steps = journey.split( SEPARATOR );
	return steps[ steps.length - 1 ] ?? "";
}

function isAway( journey: string | undefined ): boolean {
	return lastStep( journey ?? "" ).startsWith( `${ AWAY }:` );
}

function seconds( ms: string ): string {
	return `${ ( Number( ms ) / 1000 ).toFixed( 1 ) }s`;
}

/** `product:123:3000>away:0:22000` as readable steps. */
function renderPath( journey: string ): HTMLElement {
	const path = document.createElement( "span" );
	path.className = "lab-path";
	if ( journey === "" ) {
		path.textContent = "(no steps yet)";
		path.classList.add( "lab-empty" );
		return path;
	}
	journey.split( SEPARATOR ).forEach( ( step, index ) => {
		const [ kind, id, ms ] = step.split( ":" );
		const el = document.createElement( "span" );
		el.className = "lab-step";
		el.textContent = `${ index > 0 ? "› " : "" }${ kind }${ id !== "0" ? ` ${ id }` : "" } (${ seconds( ms ?? "0" ) })`;
		path.appendChild( el );
	} );
	return path;
}

function table( headers: string[] ): { table: HTMLTableElement; body: HTMLTableSectionElement } {
	const table = document.createElement( "table" );
	const head = table.createTHead().insertRow();
	headers.forEach( ( text ) => {
		const th = document.createElement( "th" );
		th.textContent = text;
		head.appendChild( th );
	} );
	const body = table.createTBody();
	return { table, body };
}

function section( title: string, headers: string[] ): HTMLTableSectionElement {
	const wrap = document.createElement( "section" );
	wrap.className = title === "Live" ? "lab-live" : "lab-stored";
	const h2 = document.createElement( "h2" );
	h2.textContent = title;
	wrap.appendChild( h2 );
	const { table: t, body } = table( headers );
	wrap.appendChild( t );
	root?.appendChild( wrap );
	return body;
}

if ( root && config && wps ) {
	const live = section( "Live", [ "Visitor", "State", "Path", "Tabs" ] );
	const stored = section( "Stored", [ "Visitor", "User", "Path", "First seen", "Last seen", "Left" ] );

	// Connection id -> state, with leaves held for the grace.
	const members = new Map< string, Member >();
	const pendingLeaves = new Map< string, ReturnType< typeof setTimeout > >();

	const renderLive = () => {
		live.replaceChildren();
		// Group tabs by visitor: live while any tab is visible.
		const byVisitor = new Map< string, { tabs: number; away: boolean; journey: string } >();
		members.forEach( ( m ) => {
			if ( ! m.v ) return;
			const entry = byVisitor.get( m.v ) ?? { tabs: 0, away: true, journey: "" };
			entry.tabs += 1;
			if ( ! isAway( m.j ) ) entry.away = false;
			if ( ( m.j ?? "" ).length >= entry.journey.length ) entry.journey = m.j ?? "";
			byVisitor.set( m.v, entry );
		} );
		if ( byVisitor.size === 0 ) {
			const row = live.insertRow();
			const cell = row.insertCell();
			cell.colSpan = 4;
			cell.className = "lab-empty";
			cell.textContent = "Nobody on the site right now.";
			return;
		}
		byVisitor.forEach( ( entry, v ) => {
			const row = live.insertRow();
			row.dataset.visitor = v;
			row.dataset.state = entry.away ? "away" : "live";
			row.dataset.journey = entry.journey;
			const id = row.insertCell();
			const code = document.createElement( "code" );
			code.textContent = v.slice( 0, 8 );
			id.appendChild( code );
			row.insertCell().textContent = entry.away ? "Away" : "Live";
			row.insertCell().appendChild( renderPath( entry.journey ) );
			row.insertCell().textContent = String( entry.tabs );
		} );
	};

	const cancelLeave = ( id: string ) => {
		const timer = pendingLeaves.get( id );
		if ( timer !== undefined ) {
			clearTimeout( timer );
			pendingLeaves.delete( id );
		}
	};

	const handle = ( frame: WPSPresenceFrame ) => {
		if ( frame.action === "sync" ) {
			pendingLeaves.forEach( ( timer ) => clearTimeout( timer ) );
			pendingLeaves.clear();
			members.clear();
			( frame.members ?? [] ).forEach( ( m ) => m.id && members.set( m.id, ( m.state ?? {} ) as Member ) );
		} else if ( frame.action === "join" && frame.id ) {
			cancelLeave( frame.id );
			members.set( frame.id, ( frame.state ?? {} ) as Member );
		} else if ( frame.action === "leave" && frame.id ) {
			const id = frame.id;
			cancelLeave( id );
			pendingLeaves.set(
				id,
				setTimeout( () => {
					pendingLeaves.delete( id );
					members.delete( id );
					renderLive();
				}, LEAVE_GRACE_MS ),
			);
			return;
		} else {
			return;
		}
		renderLive();
	};

	wps.on( "wps.presence", ( data, channel ) => {
		if ( wps.onChannel( channel, config.channel ) ) handle( data as WPSPresenceFrame );
	} );

	const renderStored = ( rows: StoredRow[] ) => {
		stored.replaceChildren();
		if ( rows.length === 0 ) {
			const row = stored.insertRow();
			const cell = row.insertCell();
			cell.colSpan = 6;
			cell.className = "lab-empty";
			cell.textContent = "Nothing stored yet.";
			return;
		}
		rows.forEach( ( r ) => {
			const row = stored.insertRow();
			row.dataset.visitor = r.visitor;
			row.dataset.left = r.left_at ?? "";
			row.dataset.journey = r.journey;
			const id = row.insertCell();
			const code = document.createElement( "code" );
			code.textContent = r.visitor.slice( 0, 8 );
			id.appendChild( code );
			row.insertCell().textContent = r.user_id === null ? "guest" : `#${ r.user_id }`;
			row.insertCell().appendChild( renderPath( r.journey ) );
			row.insertCell().textContent = r.first_seen;
			row.insertCell().textContent = r.last_seen;
			row.insertCell().textContent = r.left_at ?? "";
		} );
	};

	const refreshStored = async () => {
		try {
			const res = await fetch( config.rowsUrl, { credentials: "same-origin", headers: { "X-WP-Nonce": config.nonce } } );
			if ( ! res.ok ) return;
			const data = ( await res.json() ) as { rows?: StoredRow[] };
			renderStored( data.rows ?? [] );
		} catch {
			// Keep the last render.
		}
	};

	renderLive();
	void refreshStored();
	setInterval( refreshStored, ROWS_POLL_MS );

	const markState = ( state: WPSConnectionState ) => {
		root.dataset.state = state.connected ? "live" : "connecting";
	};
	markState( wps.state );
	wps.onStateChange( markState );
}
