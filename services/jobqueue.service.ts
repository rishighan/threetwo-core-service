import { Context, Service, ServiceBroker } from "moleculer";
import JobResult from "../models/jobresult.model";
import { refineQuery } from "filename-parser";
import BullMqMixin from "moleculer-bullmq";
import { extractFromArchive } from "../utils/uncompression.utils";
import { isNil, isUndefined } from "lodash";
import { pubClient } from "../config/redis.config";

const { MoleculerError } = require("moleculer").Errors;

console.log(process.env.REDIS_URI);
export default class JobQueueService extends Service {
	public constructor(public broker: ServiceBroker) {
		super(broker);
		this.parseServiceSchema({
			name: "jobqueue",
			hooks: {},
			mixins: [BullMqMixin],
			settings: {
				bullmq: {
					client: process.env.REDIS_URI,
				},
			},
			actions: {
				getJobCountsByType: {
					rest: "GET /getJobCountsByType",
					handler: async (ctx: Context<{}>) => {
						console.log(ctx.params);
						return await this.$resolve("jobqueue").getJobCounts();
					}
				},
				toggle: {
					rest: "GET /toggle",
					handler: async (ctx: Context<{ action: String }>) => {
						switch (ctx.params.action) {
							case "pause":
								this.pause();
								break;
							case "resume":
								this.resume();
								break;
							default:
								console.log(`Unknown queue action.`);
						}
					},
				},
				enqueue: {
					queue: true,
					rest: "/GET enqueue",
					handler: async (ctx: Context<{}>) => {
						// Enqueue the job
						const job = await this.localQueue(ctx, "enqueue.async", ctx.params, {
							priority: 10,
						});
						console.log(`Job ${job.id} enqueued`);

						return job.id;
					},
				},
				// Comic Book Import Job Queue
				"enqueue.async": {
					handler: async (
						ctx: Context<{
							socketSessionId: String;
						}>
					) => {
						try {
							console.log(`Recieved Job ID ${ctx.locals.job.id}, processing...`);

							// 1. De-structure the job params
							const { fileObject } = ctx.locals.job.data.params;

							// 2. Extract metadata from the archive
							const result = await extractFromArchive(fileObject.filePath);
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

							// 3a. Infer any issue-related metadata from the filename
							const { inferredIssueDetails } = refineQuery(result.name);
							console.log(
								"Issue metadata inferred: ",
								JSON.stringify(inferredIssueDetails, null, 2)
							);

							// 3b. Orchestrate the payload
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
								"acquisition.source.name": ctx.locals.job.data.params.sourcedFrom,
							};

							// 3c. Add the bundleId, if present to the payload
							let bundleId = null;
							if (!isNil(ctx.locals.job.data.params.bundleId)) {
								bundleId = ctx.locals.job.data.params.bundleId;
							}

							// 3d. Add the sourcedMetadata, if present
							if (
								!isNil(ctx.locals.job.data.params.sourcedMetadata) &&
								!isUndefined(ctx.locals.job.data.params.sourcedMetadata.comicvine)
							) {
								Object.assign(
									payload.sourcedMetadata,
									ctx.locals.job.data.params.sourcedMetadata
								);
							}

							// 4. write to mongo
							const importResult = await this.broker.call("library.rawImportToDB", {
								importType: ctx.locals.job.data.params.importType,
								bundleId,
								payload,
							});
							return {
								data: {
									importResult,
								},
								id: ctx.locals.job.id,
								socketSessionId: ctx.params.socketSessionId,
							};
						} catch (error) {
							console.error(
								`An error occurred processing Job ID ${ctx.locals.job.id}`
							);
							throw new MoleculerError(error, 500, "IMPORT_JOB_ERROR", {
								data: ctx.params.socketSessionId,
							});
						}
					},
				},
				getJobResultStatistics: {
					rest: "GET /getJobResultStatistics",
					handler: async (ctx: Context<{}>) => {
						const result = await JobResult.aggregate([
							{
								$group: {
									_id: "$_id",
									jobResults: { $addToSet: "status" }
								},
								
							},
							{ $sort: { timestamp: -1 } },
							{ $skip: 0 },
							{ $limit: 5 },
						])
					}
				},
			},

			events: {
				// use the `${QUEUE_NAME}.QUEUE_EVENT` scheme
				async "enqueue.async.active"(ctx: Context<{ id: Number }>) {
					console.log(`Job ID ${ctx.params.id} is set to active.`);
				},
				async "drained"(ctx) {
					console.log("Queue drained.");
					await this.broker.call("socket.broadcast", {
						namespace: "/",
						event: "action",
						args: [{
							type: "LS_IMPORT_QUEUE_DRAINED",
						}],
					});
				},
				async "enqueue.async.completed"(ctx: Context<{ id: Number }>) {
					// 1. Fetch the job result using the job Id
					const job = await this.job(ctx.params.id);
					// 2. Increment the completed job counter
					await pubClient.incr("completedJobCount");
					// 3. Fetch the completed job count for the final payload to be sent to the client
					const completedJobCount = await pubClient.get("completedJobCount");
					// 4. Emit the LS_COVER_EXTRACTED event with the necessary details
					await this.broker.call("socket.broadcast", {
						namespace: "/",
						event: "action",
						args: [
							{
								type: "LS_COVER_EXTRACTED",
								completedJobCount,
								importResult: job.returnvalue.data.importResult,
							},
						],
					});
					// 5. Persist the job results in mongo for posterity
					await JobResult.create({
						id: ctx.params.id,
						status: "completed",
						timestamp: job.timestamp,
						failedReason: {},
					});
				

					console.log(`Job ID ${ctx.params.id} completed.`);
				},

				async "enqueue.async.failed"(ctx) {
					const job = await this.job(ctx.params.id);
					await pubClient.incr("failedJobCount");
					const failedJobCount = await pubClient.get("failedJobCount");

					await JobResult.create({
						id: ctx.params.id,
						status: "failed",
						failedReason: job.failedReason,
						timestamp: job.timestamp,
					});

					// 4. Emit the LS_COVER_EXTRACTION_FAILED event with the necessary details
					await this.broker.call("socket.broadcast", {
						namespace: "/",
						event: "action",
						args: [
							{
								type: "LS_COVER_EXTRACTION_FAILED",
								failedJobCount,
								importResult: job,
							},
						], 
					});
					
				},
			},
		});
	}
}
