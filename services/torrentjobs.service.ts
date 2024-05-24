"use strict";
import {
	Context,
	Service,
	ServiceBroker,
	ServiceSchema,
	Errors,
} from "moleculer";
import { DbMixin } from "../mixins/db.mixin";
import Comic from "../models/comic.model";
import BullMqMixin from "moleculer-bullmq";
const { MoleculerError } = require("moleculer").Errors;

export default class ImageTransformation extends Service {
	// @ts-ignore
	public constructor(
		public broker: ServiceBroker,
		schema: ServiceSchema<{}> = { name: "torrentjobs" }
	) {
		super(broker);
		this.parseServiceSchema({
			name: "torrentjobs",
			mixins: [DbMixin("comics", Comic), BullMqMixin],
			settings: {
				bullmq: {
					client: process.env.REDIS_URI,
				},
			},
			hooks: {},
			actions: {
				getTorrentData: {
					queue: true,
					rest: "GET /getTorrentData",
					handler: async (ctx: Context<{ trigger: string }>) => {
						const { trigger } = ctx.params;
						console.log(`Recieved ${trigger} as the trigger...`);

						const jobOptions = {
							jobId: "retrieveTorrentData",
							name: "bossy",
							repeat: {
								every: 10000, // Repeat every 10000 ms
								limit: 100, // Limit to 100 repeats
							},
						};

						const job = await this.localQueue(
							ctx,
							"fetchTorrentData",
							ctx.params,
							jobOptions
						);
						return job;
					},
				},
				fetchTorrentData: {
					rest: "GET /fetchTorrentData",
					handler: async (
						ctx: Context<{
							birdName: String;
						}>
					) => {
						const repeatableJob = await this.$resolve(
							"torrentjobs"
						).getRepeatableJobs();
						console.info(repeatableJob);
						console.info(
							`Scheduled job for fetching torrent data fired.`
						);
						// 1. query mongo for infohashes
						const infoHashes = await this.broker.call(
							"library.getInfoHashes",
							{}
						);
						// 2. query qbittorrent to see if they exist
						const torrents: any = await this.broker.call(
							"qbittorrent.getTorrentRealTimeStats",
							{ infoHashes }
						);
						// 4.
						await this.broker.call("socket.broadcast", {
							namespace: "/",
							event: "AS_TORRENT_DATA",
							args: [
								{
									torrents,
								},
							],
						});
						// 3. If they do, don't do anything
						// 4. If they don't purge them from mongo
					},
				},
			},
			methods: {},
		});
	}
}
