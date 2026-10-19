/*
 * The slice of WordSocket's `window.WPS` the lab uses (the full contract is
 * `wp-plugin/src/types/globals.d.ts`), and the two inline configs PHP prints.
 */

interface WPSPresenceMember {
	id: string;
	state?: Record< string, unknown >;
}

interface WPSPresenceFrame {
	action?: "join" | "leave" | "sync";
	id?: string;
	state?: Record< string, unknown >;
	members?: WPSPresenceMember[];
}

interface WPSConnectionState {
	connected: boolean;
	transport: string | null;
}

interface WPSPresenceTracker {
	readonly visitor: string;
	journeyId(): string;
	journey(): string;
	update( state: Record< string, unknown > ): void;
	onChange( handler: ( journey: string, journeyId: string ) => void ): () => void;
	stop(): void;
}

interface WPSApi {
	setPresence( channel: string, state: Record< string, unknown > | null ): void;
	on( event: string, handler: ( data: Record< string, unknown >, channel: string ) => void ): () => void;
	onChannel( channel: string, expected: string ): boolean;
	onStateChange( handler: ( state: WPSConnectionState ) => void ): () => void;
	visitorId(): string;
	/** Visitor tracking over presence, WordSocket 0.30. */
	presence?: {
		track( channel: string, options?: { state?: Record< string, unknown >; report?: boolean } ): WPSPresenceTracker;
	};
	readonly state: WPSConnectionState;
}

interface PresenceLabTrackConfig {
	channel: string;
}

interface PresenceLabBoardConfig {
	channel: string;
	rowsUrl: string;
	nonce: string;
}

interface Window {
	WPS?: WPSApi;
	/** WordSocket's own inline config; only its presence matters to the lab. */
	wpSignalConfig?: Record< string, unknown >;
	wordsocketPresenceLab?: PresenceLabTrackConfig;
	wordsocketPresenceLabBoard?: PresenceLabBoardConfig;
}
