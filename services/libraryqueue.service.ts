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

import { extend, isNil, isUndefined } from "lodash";
import {
	Context,
	Service,
	ServiceBroker,
	ServiceSchema,
	Errors,
} from "moleculer";

import BullMQMixin from "moleculer-bull";
import { SandboxedJob } from "moleculer-bull";
import { DbMixin } from "../mixins/db.mixin";
import Comic from "../models/comic.model";
import { extractCoverFromFile2 } from "../utils/uncompression.utils";
import { io } from "./api.service";
const REDIS_URI = process.env.REDIS_URI || `redis://0.0.0.0:6379`;

console.log(`REDIS -> ${REDIS_URI}`);
export default class LibraryQueueService extends Service {
	public constructor(public broker: ServiceBroker) {
		super(broker);
		this.parseServiceSchema({
			name: "libraryqueue",
			mixins: [BullMQMixin(REDIS_URI), DbMixin("comics", Comic)],
			settings: {},
			hooks: {},
			queues: {
				"process.import": {
					concurrency: 30,
					async process(job: SandboxedJob) {
						console.info("New job received!", job.data);
						console.info(`Processing queue...`);
						// extract the cover
						const result = await extractCoverFromFile2(
							job.data.fileObject
						);

						// write to mongo
						const dbImportResult = await this.broker.call(
							"import.rawImportToDB",
							{
								importStatus: {
									isImported: true,
									tagged: false,
									matchedResult: {
										score: "0",
									},
								},
								rawFileDetails: result,
								sourcedMetadata: {
									comicvine: {},
								},
							},
							{}
						);

						return Promise.resolve({
							dbImportResult,
							id: job.id,
							worker: process.pid,
						});
					},
				},
				"issue.findMatchesInLibrary": {
					concurrency: 20,
					async process(job: SandboxedJob) {
						try {
							console.log(
								"Job recieved to find issue matches in library."
							);
							const matchesInLibrary = await this.broker.call(
								"search.searchComic",
								{
									queryObject: job.data.queryObject,
								}
							);
							if (
								!isNil(matchesInLibrary) &&
								!isUndefined(matchesInLibrary)
							) {
								console.log("Matches found in library:");

								const foo = extend(
									{ issue: job.data.queryObject.issueMetadata },
									{ matches: matchesInLibrary }
								);
								return foo;
							} else {
								console.log(
									"No match was found for this issue in the library."
								);
							}
						} catch (error) {
							throw error;
						}
					},
				},
			},
			actions: {
				enqueue: {
					rest: "POST /enqueue",
					params: {},
					async handler(
						ctx: Context<{
							fileObject: object;
						}>
					) {
						return await this.createJob("process.import", {
							fileObject: ctx.params.fileObject,
						});
					},
				},
				issuesForSeries: {
					rest: "POST /findIssuesForSeries",
					params: {},
					handler: async (
						ctx: Context<{
							queryObject: {
								issueName: string;
								issueNumber: string;
								issueId: string;
								issueMetadata: object;
							};
						}>
					) => {
						return await this.createJob(
							"issue.findMatchesInLibrary",
							{
								queryObject: ctx.params.queryObject,
							}
						);
					},
				},
			},
			methods: {},
			async started(): Promise<any> {
				io.on("connection", async (client) => {
					await this.getQueue("process.import").on(
						"failed",
						async (job, error) => {
							console.error(
								`An error occured in 'process.import' queue on job id '${job.id}': ${error.message}`
							);
						}
					);
					await this.getQueue("process.import").on(
						"completed",
						async (job, res) => {
							client.emit("action", {
								type: "LS_COVER_EXTRACTED",
								result: res,
							});
							console.info(
								`Job with the id '${job.id}' completed.`
							);
						}
					);
					await this.getQueue("process.import").on(
						"stalled",
						async (job) => {
							console.warn(
								`The job with the id '${job} got stalled!`
							);
						}
					);

					await this.getQueue("issue.findMatchesInLibrary").on(
						"failed",
						async (job, error) => {
							console.error(
								`An error occured in 'issue.findMatchesInLibrary' queue on job id '${job.id}': ${error.message}`
							);
						}
					);
					await this.getQueue("issue.findMatchesInLibrary").on(
						"completed",
						async (job, res) => {
							client.emit("action", {
								type: "CV_ISSUES_FOR_VOLUME_IN_LIBRARY_SUCCESS",
								result: res,
							});
							console.info(
								`Job with the id '${job.id}' completed.`
							);
						}
					);
					await this.getQueue("issue.findMatchesInLibrary").on(
						"stalled",
						async (job) => {
							console.warn(
								`The job with the id '${job} got stalled!`
							);
						}
					);
				});
			},
		});
	}
}
