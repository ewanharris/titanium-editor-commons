import { expect } from 'chai';
import * as fs from 'fs-extra';
import nock from 'nock';
import * as path from 'path';
import { Telemetry } from '../src';
import proxyquire = require('proxyquire');

function mockEndpoint (responseCode: number): nock.Scope {
	return nock('https://api.appcelerator.com')
		.post('/p/v4/app-track')
		.reply(responseCode);
}

async function sleep (time: number): Promise<void> {
	return new Promise(resolve => {
		setTimeout(() => {
			resolve();
		}, time);
	});
}

let persistDirectory: string;

describe('Telemetry', () => {

	beforeEach(() => {
		persistDirectory = global.TMP_DIR.name;
	});

	afterEach(async () => {
		nock.cleanAll();
	});

	it('should prefer user provided hardwareId', async () => {
		mockEndpoint(200);
		const telemetry = new Telemetry({
			enabled: true,
			environment: 'development',
			guid: '1234',
			hardwareId: '1234',
			productVersion: '1234',
			sessionId: '1234',
			persistDirectory: persistDirectory
		});

		await telemetry.startSession();
		const events = await fs.readdir(persistDirectory);
		expect(events.length).to.equal(1);
		const data = await fs.readJSON(path.join(persistDirectory, events[0]));
		expect(data.hardware.id).to.equal('1234');
	});

	it('should calculate session length', async () => {
		mockEndpoint(200);

		const telemetry = new Telemetry({
			enabled: true,
			environment: 'development',
			guid: '1234',
			hardwareId: '1234',
			productVersion: '1234',
			sessionId: '1234',
			persistDirectory,
			persistLength: '1'
		});

		await telemetry.startSession();
		let events = await fs.readdir(persistDirectory);
		expect(events.length).to.equal(1);
		await telemetry.empty();
		await sleep(1000);

		await telemetry.endSession();
		events = await fs.readdir(persistDirectory);
		expect(events.length).to.equal(1);
		const { session } = await fs.readJSON(path.join(persistDirectory, events[0]));
		expect(session.duration).to.be.closeTo(1000, 25);
	});

	it('should not throw errors', async () => {
		mockEndpoint(404);

		const telemetry = new Telemetry({
			enabled: true,
			environment: 'development',
			guid: '1234',
			hardwareId: '1234',
			productVersion: '1234',
			sessionId: '1234',
			persistDirectory
		});

		await telemetry.sendEvent('foo');
		await telemetry.startSession();
		await telemetry.endSession();
	});

	it('should not send end session if no start', async () => {
		mockEndpoint(200);

		const telemetry = new Telemetry({
			enabled: true,
			environment: 'development',
			guid: '1234',
			hardwareId: '1234',
			productVersion: '1234',
			sessionId: '1234',
			persistDirectory: persistDirectory
		});

		await telemetry.endSession();
		const events = await fs.readdir(persistDirectory);
		expect(events.length).to.equal(0);
	});

	it('should do nothing in not enabled', async () => {
		mockEndpoint(200);

		const telemetry = new Telemetry({
			enabled: false,
			environment: 'development',
			guid: '1234',
			hardwareId: '1234',
			productVersion: '1234',
			sessionId: '1234',
			persistDirectory
		});

		await telemetry.startSession();
		await telemetry.sendEvent('foo');
		await telemetry.endSession();
		const events = await fs.readdir(persistDirectory);
		expect(events.length).to.equal(0);
	});

	it('should collect machine id if not provided', async () => {
		mockEndpoint(200);

		const machineIdStub = global.sandbox.stub().resolves('foo');

		const { Telemetry: MockedTelemetry } = proxyquire<{ Telemetry: typeof Telemetry }>('../src/telemetry/index', {
			'appcd-machine-id': {
				default: machineIdStub
			}
		});

		const telemetry = new MockedTelemetry({
			enabled: true,
			environment: 'development',
			guid: '1234',
			productVersion: '1234',
			sessionId: '1234',
			persistDirectory
		});

		await telemetry.sendEvent('foo');
		const events = await fs.readdir(persistDirectory);
		expect(events.length).to.equal(1);
		const data = await fs.readJSON(path.join(persistDirectory, events[0]));
		expect(data.hardware.id).to.be.a('string');
		expect(data.hardware.id).to.equal('foo');
	});

	it('should work if not provided a persistDirectory', async () => {
		mockEndpoint(200);

		const telemetry = new Telemetry({
			enabled: true,
			environment: 'development',
			guid: '1234',
			hardwareId: '1234',
			productVersion: '1234',
			sessionId: '1234'
		});

		await telemetry.startSession();
		await telemetry.sendEvent('foo');
		await telemetry.endSession();
		const events = await fs.readdir(persistDirectory);
		expect(events.length).to.equal(0);
		await telemetry.empty();
	});

	it('should create a sessionId if none provided', async () => {
		mockEndpoint(200);

		const telemetry = new Telemetry({
			enabled: true,
			environment: 'development',
			guid: '1234',
			hardwareId: '1234',
			productVersion: '1234',
			persistDirectory
		});

		await telemetry.startSession();
		await telemetry.sendEvent('foo');
		await telemetry.endSession();
		const events = await fs.readdir(persistDirectory);
		expect(events.length).to.equal(3);
	});

	it('should allow toggling enabled state', async () => {
		mockEndpoint(200);

		const telemetry = new Telemetry({
			enabled: false,
			environment: 'development',
			guid: '1234',
			hardwareId: '1234',
			productVersion: '1234',
			persistDirectory
		});

		await telemetry.startSession();
		await telemetry.sendEvent('foo');
		await telemetry.endSession();
		const events = await fs.readdir(persistDirectory);
		expect(events.length).to.equal(0);

		telemetry.enabled = true;

		await telemetry.startSession();
		await telemetry.sendEvent('foo');
		await telemetry.endSession();
		const events2 = await fs.readdir(persistDirectory);
		expect(events2.length).to.equal(3);
	});

	it('should only clear events that are passed the persistLength', async () => {
		mockEndpoint(200);

		const telemetry = new Telemetry({
			enabled: true,
			environment: 'development',
			guid: '1234',
			hardwareId: '1234',
			productVersion: '1234',
			persistDirectory,
			persistLength: '1h'
		});

		// Older than 1 hour
		await fs.writeJSON(path.join(persistDirectory, '1116975600000.json'), {
			timestamp: 1116975600000
		});

		// Older than 1 hour
		await fs.writeJSON(path.join(persistDirectory, '1527289200000.json'), {
			timestamp: 1527289200000
		});

		await telemetry.startSession();
		await telemetry.sendEvent('foo');
		await telemetry.endSession();

		const events = await fs.readdir(persistDirectory);
		expect(events.length).to.equal(5);

		await telemetry.empty();
		const events2 = await fs.readdir(persistDirectory);
		expect(events2.length).to.equal(3);
	});

	it('should only clear event files', async () => {
		mockEndpoint(200);

		const telemetry = new Telemetry({
			enabled: true,
			environment: 'development',
			guid: '1234',
			hardwareId: '1234',
			productVersion: '1234',
			persistDirectory,
			persistLength: '1h'
		});

		// Older than 1 hour
		await fs.writeJSON(path.join(persistDirectory, '1116975600000.json'), {
			timestamp: 1116975600000
		});

		// Older than 1 hour
		await fs.writeJSON(path.join(persistDirectory, '1527289200000.json'), {
			timestamp: 1527289200000
		});

		// Not a valid event file
		await fs.writeFile(path.join(persistDirectory, '.test'), 'foo');

		await telemetry.startSession();
		await telemetry.sendEvent('foo');
		await telemetry.endSession();

		const events = await fs.readdir(persistDirectory);
		expect(events.length).to.equal(6);

		await telemetry.empty();
		const events2 = await fs.readdir(persistDirectory);
		expect(events2.length).to.equal(4);
	});

	it('should track active session', async () => {
		mockEndpoint(200);

		const telemetry = new Telemetry({
			enabled: true,
			environment: 'development',
			guid: '1234',
			hardwareId: '1234',
			productVersion: '1234',
			sessionId: '1234',
			persistDirectory,
			persistLength: '1'
		});

		await telemetry.startSession();
		expect(telemetry.hasActiveSession).to.equal(true);
		let events = await fs.readdir(persistDirectory);
		expect(events.length).to.equal(1);
		await telemetry.empty();
		await sleep(1000);

		await telemetry.endSession();
		expect(telemetry.hasActiveSession).to.equal(false);
		events = await fs.readdir(persistDirectory);
		expect(events.length).to.equal(1);
		const { session } = await fs.readJSON(path.join(persistDirectory, events[0]));
		expect(session.duration).to.be.closeTo(1000, 25);
	});
});
