const { Worker, parentPort, workerData } = require("worker_threads");
const chalk = require("chalk");

// Get array of links
const links = workerData;

const result = links.forEach(link => console.log(link));

parentPort.postMessage(result);
