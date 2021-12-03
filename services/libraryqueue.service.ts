"use strict";
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
const REDIS_URI = process.env.REDIS_URI || `redis://0.0.0.0:6379`;

export default class LibraryQueueService extends Service {
	public constructor(
		public broker: ServiceBroker,
		schema: ServiceSchema<{}> = { name: "libraryqueue" }
	) {
		super(broker);
		this.parseServiceSchema(
			Service.mergeSchemas(
				{
					name: "libraryqueue",
					mixins: [BullMQMixin(REDIS_URI), DbMixin("comics", Comic)],
					settings: {},
					hooks: {},
					queues: {
						"process.import": {
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
					},
					methods: {},
					async started(): Promise<any> {
						const failed = await this.getQueue("process.import").on(
							"failed",
							async (job, error) => {
								console.error(
									`An error occured in 'process.import' queue on job id '${job.id}': ${error.message}`
								);
							}
						);
						const completed = await this.getQueue(
							"process.import"
						).on("completed", async (job, res) => {
							console.info(
								`Job with the id '${job.id}' completed.`
							);
						});
						const stalled = await this.getQueue(
							"process.import"
						).on("stalled", async (job) => {
							console.warn(
								`The job with the id '${job} got stalled!`
							);
						});
					},
				},
				schema
			)
		);
	}
}
