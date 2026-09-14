import os from 'os';

let lastSample = null;

export function computeCpuPercent(previous, current) {
	if (!previous || !current) {
		return 0;
	}
	const cpuDeltaUs =
		current.cpu.user - previous.cpu.user + (current.cpu.system - previous.cpu.system);
	const wallDeltaMs = current.timestamp - previous.timestamp;
	if (wallDeltaMs <= 0 || cpuDeltaUs < 0) {
		return 0;
	}
	return Number(((cpuDeltaUs / (wallDeltaMs * 1000)) * 100).toFixed(1));
}

export function getSystemMetrics() {
	const timestamp = Date.now();
	const cpuUsage = process.cpuUsage();
	const previous = lastSample;
	lastSample = { cpu: cpuUsage, timestamp };

	const cores = os.cpus()?.length || 1;
	const processUptimeSeconds = Math.round(process.uptime());
	const lifetimeCpuPercent =
		processUptimeSeconds > 0
			? Number(
					(((cpuUsage.user + cpuUsage.system) / (processUptimeSeconds * 1e6)) * 100).toFixed(1)
				)
			: 0;

	const memory = process.memoryUsage();
	const systemTotalBytes = os.totalmem();
	const systemFreeBytes = os.freemem();
	const cpuPercent = previous
		? computeCpuPercent(previous, { cpu: cpuUsage, timestamp })
		: lifetimeCpuPercent;
	const memoryLimitMb = Number(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE);
	const memoryLimitBytes = memoryLimitMb > 0 ? memoryLimitMb * 1024 * 1024 : null;

	return {
		scope: 'serverless-instance',
		cpu: {
			usagePercent: cpuPercent,
			usagePercentOfMachine: Number((cpuPercent / cores).toFixed(1)),
			sampleWindowMs: previous
				? timestamp - previous.timestamp
				: Math.round(processUptimeSeconds * 1000),
			cores,
			loadAverage: os.loadavg().map((value) => Number(value.toFixed(2))),
			processUptimeSeconds,
			systemUptimeSeconds: Math.round(os.uptime()),
		},
		memory: {
			limitBytes: memoryLimitBytes,
			rssBytes: memory.rss,
			rssPercentOfLimit:
				memoryLimitBytes !== null
					? Number(((memory.rss / memoryLimitBytes) * 100).toFixed(1))
					: null,
			heapTotalBytes: memory.heapTotal,
			heapUsedBytes: memory.heapUsed,
			heapUsedPercent:
				memory.heapTotal > 0
					? Number(((memory.heapUsed / memory.heapTotal) * 100).toFixed(1))
					: 0,
			externalBytes: memory.external,
			arrayBuffersBytes: memory.arrayBuffers || 0,
			systemTotalBytes,
			systemFreeBytes,
			systemUsedPercent:
				systemTotalBytes > 0
					? Number(
							(((systemTotalBytes - systemFreeBytes) / systemTotalBytes) * 100).toFixed(1)
						)
					: 0,
		},
	};
}
