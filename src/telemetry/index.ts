import machineId from 'appcd-machine-id';
import * as fs from 'fs-extra';
import got from 'got';
import ms = require('ms');
import * as os from 'os';
import * as path from 'path';
import { v4 } from 'uuid';

/**
 * Telemetry reporter
 *
 * @param {string} guid - Application guid to be used.
 * @param {string} sessionId - Session for analytic events to be tied to.
 * @param {string} productVersion - Version of the product reporting telemetry events.
 * @param {string} [persistDirectory] - Folder to store events on disk.
 * @param {string} [hardwareId] - ID for the machine.
 * @param {string} [url] - URL to override default URL with.
 *
 * @export
 * @class Telemetry
 */
export class Telemetry {

	public enabled: boolean;
	public hasActiveSession: boolean;

	private environment: environment;
	private guid: string;
	private hardwareId: string|undefined;
	private sessionId: string;
	private persistDirectory: string|undefined;
	private persistLength: number;
	private productVersion: string;
	private url = 'https://api.appcelerator.com/p/v4/app-track';
	private sessionStartTime: number|undefined;

	constructor ({ enabled, environment, guid, hardwareId, persistDirectory, persistLength, productVersion, sessionId, url }: TelemetryOpts) {
		this.enabled = enabled;
		this.environment = environment;
		this.guid = guid;
		this.hardwareId = hardwareId;
		this.sessionId = sessionId  || v4();
		this.persistLength = ms(persistLength || '30d');
		this.productVersion = productVersion;
		this.persistDirectory = persistDirectory;
		this.url = url || this.url;
		this.hasActiveSession = false;
	}

	public async startSession (data?: Record<string, unknown>): Promise<void> {
		if (!this.enabled) {
			return;
		}
		this.sessionStartTime = Date.now();
		this.hasActiveSession = true;
		return this.sendEvent('session.start', data);
	}

	public async endSession (data?: Record<string, unknown>): Promise<void> {
		if (!this.sessionStartTime) {
			return;
		}

		const duration = Date.now() - this.sessionStartTime;
		this.hasActiveSession = false;
		await this.sendEvent('session.end', data, { duration });
		// reassign a new session id
		this.sessionId = v4();
	}

	public async sendEvent (event: string, data?: Record<string, unknown>, sessionData?: Record<string, unknown>): Promise<void> {

		if (!this.enabled) {
			return;
		}

		if (!this.hardwareId) {
			this.hardwareId = await machineId();
		}

		const eventInfo: Event = {
			app: this.guid,
			event,
			distribution: {
				version: this.productVersion,
				environment: this.environment
			},
			id: v4(),
			hardware: {
				id: this.hardwareId,
				arch: os.arch()
			},
			os: {
				name: os.platform(),
				version: os.release()
			},
			session: {
				id: this.sessionId,
				...sessionData
			},
			timestamp: Date.now(),
			version: '4',
			data
		};

		try {
			await got(this.url, {
				body: eventInfo,
				json: true,
				method: 'POST'
			});
		} catch (error) {
			// TODO
		}

		if (this.persistDirectory) {
			await fs.ensureDir(this.persistDirectory);
			await fs.writeJSON(path.join(this.persistDirectory, `${eventInfo.timestamp}.json`), eventInfo);
		}
	}

	public async empty (): Promise<void> {
		if (this.persistDirectory) {
			const currentDate = Date.now();
			const files = await fs.readdir(this.persistDirectory);
			for (const file of files) {
				const filePath = path.join(this.persistDirectory, file);
				try {
					const timestamp = parseInt(path.basename(file, '.json'), 10);
					if (isNaN(timestamp)) {
						// not an event file so just ignore it
						continue;
					}
					const deleteFile = currentDate - timestamp > this.persistLength;
					if (deleteFile) {
						await fs.remove(filePath);
					}
				} catch (error) {
					// do nothing
				}
			}
		}
	}
}

export interface Event {
	app: string;
	event: string;
	distribution: {
		environment: environment;
		version: string;
	};
	id: string;
	hardware: {
		id: string;
		arch: string;
	};
	os: {
		name: string;
		version: string;
	};
	session: {
		id: string;
	};
	timestamp: number;
	version: string;
	data?: Record<string, unknown>;
}

interface TelemetryOpts {
	enabled: boolean;
	environment: environment;
	guid: string;
	hardwareId?: string;
	persistDirectory?: string;
	persistLength?: string;
	productVersion: string;
	sessionId?: string;
	url?: string;
}

type environment = 'development'|'production';
