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

let storeDirectory: string;

describe('Telemetry', () => {

	beforeEach(() => {
		storeDirectory = global.TMP_DIR.name;
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
			storeDirectory: storeDirectory
		});

		await telemetry.startSession();
		const events = await fs.readdir(storeDirectory);
		expect(events.length).to.equal(1);
		const data = await fs.readJSON(path.join(storeDirectory, events[0]));
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
			storeDirectory
		});

		await telemetry.startSession();
		let events = await fs.readdir(storeDirectory);
		expect(events.length).to.equal(1);
		await telemetry.emptyStore();
		await sleep(1000);

		await telemetry.endSession();
		events = await fs.readdir(storeDirectory);
		expect(events.length).to.equal(1);
		const { session } = await fs.readJSON(path.join(storeDirectory, events[0]));
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
			storeDirectory
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
			storeDirectory: storeDirectory
		});

		await telemetry.endSession();
		const events = await fs.readdir(storeDirectory);
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
			storeDirectory: storeDirectory
		});

		await telemetry.startSession();
		await telemetry.sendEvent('foo');
		await telemetry.endSession();
		const events = await fs.readdir(storeDirectory);
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
			storeDirectory
		});

		await telemetry.sendEvent('foo');
		const events = await fs.readdir(storeDirectory);
		expect(events.length).to.equal(1);
		const data = await fs.readJSON(path.join(storeDirectory, events[0]));
		expect(data.hardware.id).to.be.a('string');
		expect(data.hardware.id).to.equal('foo');
	});

	it('should work if not provided a storeDirectory', async () => {
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
		const events = await fs.readdir(storeDirectory);
		expect(events.length).to.equal(0);
		await telemetry.emptyStore();
	});

	it('should create a sessionId if none provided', async () => {
		mockEndpoint(200);

		const telemetry = new Telemetry({
			enabled: true,
			environment: 'development',
			guid: '1234',
			hardwareId: '1234',
			productVersion: '1234',
			storeDirectory
		});

		await telemetry.startSession();
		await telemetry.sendEvent('foo');
		await telemetry.endSession();
		const events = await fs.readdir(storeDirectory);
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
			storeDirectory
		});

		await telemetry.startSession();
		await telemetry.sendEvent('foo');
		await telemetry.endSession();
		const events = await fs.readdir(storeDirectory);
		expect(events.length).to.equal(0);

		telemetry.enabled = true;

		await telemetry.startSession();
		await telemetry.sendEvent('foo');
		await telemetry.endSession();
		const events2 = await fs.readdir(storeDirectory);
		expect(events2.length).to.equal(3);
	});
});
