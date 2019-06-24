declare module 'appcd-machine-id' {
	function machineId (midFile?: string): Promise<string>;
	export = machineId;
}
