"use strict";
import {
	Context,
	Service,
	ServiceBroker,
	ServiceSchema,
	Errors,
} from "moleculer";
import BullMQMixin from "moleculer-bull";
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
					mixins: [BullMQMixin(REDIS_URI)],
					settings: {},
					hooks: {},
					queues: {
						"process.import": {
							async process(job) {
								this.logger.info("New job received!", job.data);
								this.logger.info(`Processing queue...`);
								const result = await this.broker.call('import.processAndImportToDB', job.data);
                                
								return Promise.resolve({
                                    result,
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
							async handler(ctx: Context<{ extractionOptions: object, walkedFolders: object}>) {
								return await this.createJob("process.import", {
                                    extractionOptions: ctx.params.extractionOptions,
									walkedFolders: ctx.params.walkedFolders,
								});
                                
								
							},
						},
					},
					methods: {},
					async started(): Promise<any> {
                        const failed = await this.getQueue(
                            "process.import"
                        ).on("failed", async (job, error) => {
                            this.logger.error(
                                `An error occured in 'mail.send' queue on job id '${job.id}': ${error.message}`
                            );
                        });
                        const completed = await this.getQueue(
                            "process.import"
                        ).on("completed", async (job, res) => {
                            this.logger.info(
                                `Job with the id '${job.id}' completed.`
                            );
                        });
                        const stalled = await this.getQueue(
                            "process.import"
                        ).on("stalled", async (job) => {
                            this.logger.warn(
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
