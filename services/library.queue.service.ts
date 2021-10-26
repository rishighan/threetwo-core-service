"use strict";
import {
	Context,
	Service,
	ServiceBroker,
	ServiceSchema,
	Errors,
} from "moleculer";

import BullMQMixin from "moleculer-bull";

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
					mixins: [BullMQMixin("redis://0.0.0.0:6379")],
					settings: {},
					hooks: {},
					queues: {
						"mail.send": {
							async process(job) {
								this.logger.info("New job received!", job.data);
								this.logger.info(`Processing queue...`);
								// const accounts = await this.broker.call('v1.users.list');
								// this.logger.info(accounts);
								return Promise.resolve({
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
							async handler(ctx: Context<{}>) {
								const job = await this.createJob("mail.send", {
									blah: "blah",
								});
								const failed = await this.getQueue(
									"mail.send"
								).on("failed", async (job, error) => {
									this.logger.error(
										`An error occured in 'mail.send' queue on job id '${job.id}': ${error.message}`
									);
								});
								const completed = await this.getQueue(
									"mail.send"
								).on("completed", async (job, res) => {
									this.logger.info(
										`Job with the id '${job.id}' completed.`
									);
								});
								const stalled = await this.getQueue(
									"mail.send"
								).on("stalled", async (job) => {
									this.logger.warn(
										`The job with the id '${job} got stalled!`
									);
								});
							},
						},
					},
					methods: {},
					async started(): Promise<any> {},
				},
				schema
			)
		);
	}
}
