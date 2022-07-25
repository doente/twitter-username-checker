const { isMainThread, parentPort, workerData, Worker } = require("worker_threads");
const fs = require("fs");
const chalk = require("chalk");
const axios = require("axios");
const _usernames = fs.readFileSync("./usernames.txt").toString().split('\r\n');

let numCPUs = 5; // 30+ = explosion proxyless
let completed = 0;

const workers = [];

if (numCPUs > _usernames.length) {
	numCPUs = _usernames.length;
}

class TwitterDumper {
	constructor() { }

	static async init() {
		return new Promise((resolve, reject) => {
			for (let i = 0; i < numCPUs; i++) {
				const worker = new Worker(__filename, {
					trackUnmanagedFds: true,
					workerData: {
						folders: _usernames.filter((_, index) => index % numCPUs === i)
					}
				});

				TwitterDumper.handleWorker(worker, i, resolve, reject);
			}
		});
	}

	static handleWorker(worker, i, resolve, reject) {
		if (!workers[i]) workers.push({ completed: false, worker });
		else workers[i] = worker;

		worker.on("message", (message) => {
			const _worker = workers[i];

			if (typeof message.lastIndex === "number") {
				_worker.lastIndex = message.lastIndex;
			}

			if (message.completed) {
				_worker.completed = true;

				completed++;
			}

			if (completed >= numCPUs) {
				resolve(true);
			}

			if (message.info) {
				if (message.type !== "die") fs.appendFileSync(`lives.txt`, message.username + "\n");
			}
		});

		worker.on("error", reject);

		worker.on("exit", (code) => {
			if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`));
			if (workers[i].lastIndex === _usernames.filter((_, index) => index % numCPUs === i).length - 1) return;
			console.log(chalk`{blue [}{yellow CHK}{blue ]} {blue Worker} Thread ${i} dead, restarting...`);
			const worker = new Worker(__filename, {
				trackUnmanagedFds: true,
				workerData: {
					lastIndex: workers[i].lastIndex,
					folders: _usernames.filter((_, index) => index % numCPUs === i)
				}
			});
			TwitterDumper.handleWorker(worker, i, resolve, reject);
		});
	}

	async dumpTwitters() {
		for (let i = workerData.lastIndex || 0; i < workerData.folders.length; i++) {
			parentPort.postMessage({ lastIndex: i });

			const username = workerData.folders[i]
			const result = await this.dumpTwitter(username);
			parentPort.postMessage(result);
		}

		parentPort.postMessage({
			completed: true
		});
	}

	async dumpTwitter(username) {
		const body = await axios.get(`https://twitter.com/i/api/i/users/username_available.json?username=${username}`, {
			headers: {
				"authorization": "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA",
				"x-guest-token": "1541486022587998209",
			}
		});

		if (body.data && body.data.valid) {
			console.log(chalk`{blue [}{yellow DUMP}{blue ]} {green Live} ${username}`);
			return { type: "live", username, info: body.data.valid };
		} else {
			console.log(chalk`{blue [}{yellow DUMP}{blue ]} {red Die} ${username}`);
			return { type: "die", username };
		}
	}
}

if (isMainThread) {
	console.clear();
	TwitterDumper.init();
} else {
	const chk = new TwitterDumper();
	chk.dumpTwitters();
}
