/*
 * MIT License
 *
 * Copyright (c) 2022 Rishi Ghan
 *
 The MIT License (MIT)

Copyright (c) 2015 Rishi Ghan

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
 */

/*
 * Revision History:
 *     Initial:        2022/01/28        Rishi Ghan
 */

"use strict";

import { refineQuery } from "filename-parser";
import { isNil, isUndefined } from "lodash";
import { Context, Service, ServiceBroker, ServiceSchema } from "moleculer";
import BullMQMixin, { SandboxedJob } from "moleculer-bull";
import { DbMixin } from "../mixins/db.mixin";
import Comic from "../models/comic.model";
import {
	extractFromArchive,
	uncompressEntireArchive,
} from "../utils/uncompression.utils";

const REDIS_URI = process.env.REDIS_URI || `redis://localhost:6379`;
const EventEmitter = require("events");
EventEmitter.defaultMaxListeners = 20;

console.log(`REDIS -> ${REDIS_URI}`);
export default class QueueService extends Service {
	public constructor(
		public broker: ServiceBroker,
		schema: ServiceSchema<{}> = { name: "importqueue" }
	) {
		super(broker);
		this.parseServiceSchema({
			name: "importqueue",
			mixins: [BullMQMixin(REDIS_URI), DbMixin("comics", Comic)],
			settings: {
				bullmq: {
					maxStalledCount: 0,
				},
			},

			hooks: {},
			queues: {
				"process.import": {
					concurrency: 10,
					async process(job: SandboxedJob) {
						console.info("New job received!", job.data);
						console.info(`Processing queue...`);
						// extract the cover
						const result = await extractFromArchive(
							job.data.fileObject.filePath
						);
						const {
							name,
							filePath,
							fileSize,
							extension,
							mimeType,
							cover,
							containedIn,
							comicInfoJSON,
						} = result;

						// Infer any issue-related metadata from the filename
						const { inferredIssueDetails } = refineQuery(
							result.name
						);
						console.log(
							"Issue metadata inferred: ",
							JSON.stringify(inferredIssueDetails, null, 2)
						);
						// Add the bundleId, if present to the payload
						let bundleId = null;
						if (!isNil(job.data.bundleId)) {
							bundleId = job.data.bundleId;
						}

						// Orchestrate the payload
						const payload = {
							importStatus: {
								isImported: true,
								tagged: false,
								matchedResult: {
									score: "0",
								},
							},
							rawFileDetails: {
								name,
								filePath,
								fileSize,
								extension,
								mimeType,
								containedIn,
								cover,
							},
							inferredMetadata: {
								issue: inferredIssueDetails,
							},
							sourcedMetadata: {
								// except for ComicInfo.xml, everything else should be copied over from the
								// parent comic
								comicInfo: comicInfoJSON,
							},
							// since we already have at least 1 copy
							// mark it as not wanted by default
							"acquisition.source.wanted": false,

							// clear out the downloads array
							// "acquisition.directconnect.downloads": [],

							// mark the metadata source
							"acquisition.source.name": job.data.sourcedFrom,
						};

						// Add the sourcedMetadata, if present
						if (!isNil(job.data.sourcedMetadata) && !isUndefined(job.data.sourcedMetadata.comicvine)) {
							Object.assign(
								payload.sourcedMetadata,
								job.data.sourcedMetadata
							);
						}

						// write to mongo
						const importResult = await this.broker.call(
							"library.rawImportToDB",
							{
								importType: job.data.importType,
								bundleId,
								payload,
							}
						);
						return {
							data: {
								importResult,
							},
							id: job.id,
							worker: process.pid,
						};
					},
				},
				"process.uncompressAndResize": {
					concurrency: 2,
					async process(job: SandboxedJob) {
						console.log(`Initiating uncompression job...`);
						return await uncompressEntireArchive(
							job.data.filePath,
							job.data.options
						);
					},
				},
			},
			actions: {
				uncompressResize: {
					rest: "POST /uncompressResize",
					params: {},
					async handler(
						ctx: Context<{
							data: { filePath: string; options: any };
						}>
					) {
						return await this.createJob(
							"process.uncompressAndResize",
							ctx.params
						);
					},
				},
				processImport: {
					rest: "POST /processImport",
					params: {},
					async handler(
						ctx: Context<{
							fileObject: object;
							importType: string;
							bundleId: number;
							sourcedFrom?: string;
							sourcedMetadata: object;
						}>
					) {
						return await this.createJob("process.import", {
							fileObject: ctx.params.fileObject,
							importType: ctx.params.importType,
							bundleId: ctx.params.bundleId,
							sourcedFrom: ctx.params.sourcedFrom,
							sourcedMetadata: ctx.params.sourcedMetadata,
						});
					},
				},
				toggleImportQueue: {
					rest: "POST /pauseImportQueue",
					params: {},
					handler: async (ctx: Context<{ action: string }>) => {
						switch (ctx.params.action) {
							case "pause":
								const foo = await this.getQueue(
									"process.import"
								).pause();
								console.log("paused", foo);
								return foo;
							case "resume":
								const soo = await this.getQueue(
									"process.import"
								).resume();
								console.log("resumed", soo);
								return soo;
							default:
								console.log("Unrecognized queue action.");
						}
					},
				},
			},
			methods: {},
			async started(): Promise<any> {
				await this.getQueue("process.import").on(
					"failed",
					async (job, error) => {
						console.error(
							`An error occured in 'process.import' queue on job id '${job.id}': ${error.message}`
						);
						console.error(job.data);
					}
				);
				await this.getQueue("process.import").on(
					"completed",
					async (job, res) => {
						await this.broker.call("socket.broadcast", {
							namespace: "/", //optional
							event: "action",
							args: [{ type: "LS_COVER_EXTRACTED", result: res }], //optional
						});
						console.info(
							`Import Job with the id '${job.id}' completed.`
						);
					}
				);
				await this.getQueue("process.import").on(
					"stalled",
					async (job) => {
						console.warn(`Import job '${job.id} stalled!`);
						console.log(`${JSON.stringify(job, null, 2)}`);
						console.log(`is stalled.`);
					}
				);

				await this.getQueue("process.uncompressAndResize").on(
					"completed",
					async (job, res) => {
						await this.broker.call("socket.broadcast", {
							namespace: "/",
							event: "action",
							args: [
								{
									type: "COMICBOOK_EXTRACTION_SUCCESS",
									result: {
										files: res,
										purpose: job.data.options.purpose,
									},
								},
							],
						});
						console.info(`Uncompression Job ${job.id} completed.`);
					}
				);
			},
		});
	}
}
