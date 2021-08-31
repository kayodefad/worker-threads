#!/usr/bin/env node

const {
  Worker,
  isMainThread,
  parentPort,
  workerData,
} = require("worker_threads");

const fetch = require("node-fetch");
const cheerio = require("cheerio");
const { URL } = require("url");
const path = require("path");
const yargs = require("yargs");

// Defining flags
const options = yargs
  .usage("Usage: -n <workers>")
  .option("n", {
    alias: "workers",
    describe: "Number of workers crawling in parallel.",
    type: "number",
    demandOption: true,
  })
  .option("u", {
    alias: "url",
    describe: "URL to crawl.",
    type: "string",
    demandOption: true,
  }).argv;

const workerPath = path.resolve("scraping-worker.js");

const seenUrls = {};

// Main function
const crawl = ({ url }) => {
  if (seenUrls[url]) return;
  seenUrls[url] = true;
  new Promise(async (parentResolve, parentReject) => {
    const { host, protocol } = new URL(url);

    const response = await fetch(url);
    const html = await response.text();
    const $ = cheerio.load(html);
    const links = $("a")
      .map((i, link) => link.attribs.href)
      .get();

    const linksAdj = links
      .map(l => getUrl(l, host, protocol))
      .filter(link => link.includes(host));

    if (options.workers > linksAdj.length) options.workers = linksAdj.length;

    const segmentSize = Math.floor(linksAdj.length / options.workers);
    let rem = linksAdj.length % options.workers;
    const segments = [];
    const remainder = linksAdj.slice(linksAdj.length - rem);

    for (let i = 0; i < options.workers; i++) {
      const start = i * segmentSize;
      const end = start + segmentSize;
      const segment = linksAdj.slice(start, end);
      segments.push(segment);
    }

    if (rem !== 0) {
      for (let i = 0; i < remainder.length; i++) {
        segments[i].push(remainder[i]);
      }
    }

    const results = await Promise.all(
      segments.map(
        segment =>
          new Promise((resolve, reject) => {
            const worker = new Worker(workerPath, {
              workerData: segment,
            });
            worker.on("message", resolve);
            worker.on("error", reject);
            worker.on("exit", code => {
              if (code !== 0)
                reject(new Error(`Worker stopped with exit code ${code}`));
            });
          })
      )
    );

    parentResolve(results);
    // results.map(result => console.log(result));

  });
};

// Function to format url
const getUrl = (link, host, protocol) => {
  if (link.includes("https")) {
    return link;
  } else if (link.startsWith("/")) {
    return `${protocol}//${host}${link}`;
  } else {
    return `${protocol}//${host}/${link}`;
  }
};

// Calling th crawl function
crawl({
  url: options.url,
});
