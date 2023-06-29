import {
	Context,
	Service,
	ServiceBroker,
	ServiceSchema,
	Errors,
} from "moleculer";
// import { BullMQAdapter, JobStatus, BullMqMixin } from 'moleculer-bullmq';
import { refineQuery } from "filename-parser";
import BullMqMixin from 'moleculer-bullmq';
import { extractFromArchive } from "../utils/uncompression.utils";
import { isNil, isUndefined } from "lodash";


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
				}
			},
			actions: {
				enqueue: {
					queue: true,
					rest: "/GET enqueue",
					handler: async (ctx: Context<{}>) => {
						// Enqueue the job
						const job = await this.localQueue(ctx, 'enqueue.async', ctx.params, { priority: 10 });
						console.log(`Job ${job.id} enqueued`);
						return job.id;
					}
				},
				"enqueue.async": {
					handler: async (ctx: Context<{}>) => {
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
						const { inferredIssueDetails } = refineQuery(
							result.name
						);
						console.log(
							"Issue metadata inferred: ",
							JSON.stringify(inferredIssueDetails, null, 2)
						);

						// 3c. Orchestrate the payload
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
						}

						// Add the bundleId, if present to the payload
						let bundleId = null;
						if (!isNil(ctx.locals.job.data.params.bundleId)) {
							bundleId = ctx.locals.job.data.params.bundleId;
						}

						// Add the sourcedMetadata, if present
						if (
							!isNil(ctx.locals.job.data.params.sourcedMetadata) &&
							!isUndefined(ctx.locals.job.data.params.sourcedMetadata.comicvine)
						) {
							Object.assign(
								payload.sourcedMetadata,
								ctx.locals.job.data.paramssourcedMetadata
							);
						}

						// write to mongo
						const importResult = await this.broker.call(
							"library.rawImportToDB",
							{
								importType: ctx.locals.job.data.params.importType,
								bundleId,
								payload,
							}
						);
						return {
							data: {
								importResult,
							},
							id: ctx.locals.job.id,
						};
					}
				},
			},
			events: {
				// use the `${QUEUE_NAME}.QUEUE_EVENT` scheme
				async "enqueue.async.active"(ctx) {
					console.log(`Job ID ${ctx.params.id} is set to active.`);
				},

				async "enqueue.async.completed" (ctx) {
					console.log(`Job ID ${ctx.params.id} completed.`);
				}
			}
		});
	}
}
