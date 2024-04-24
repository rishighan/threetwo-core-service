"use strict";
import {
	Context,
	Service,
	ServiceBroker,
	ServiceSchema,
	Errors,
} from "moleculer";
import axios from "axios";
import AirDCPPSocket from "../shared/airdcpp.socket";

export default class AirDCPPService extends Service {
	// @ts-ignore
	public constructor(
		public broker: ServiceBroker,
		schema: ServiceSchema<{}> = { name: "airdcpp" }
	) {
		super(broker);
		this.parseServiceSchema({
			name: "airdcpp",
			mixins: [],
			hooks: {},
			actions: {
				initialize: {
					rest: "POST /initialize",
					handler: async (
						ctx: Context<{
							host: {
								hostname: string;
								port: string;
								protocol: string;
								username: string;
								password: string;
							};
						}>
					) => {
						try {
							const {
								host: {
									hostname,
									protocol,
									port,
									username,
									password,
								},
							} = ctx.params;
							const airDCPPSocket = new AirDCPPSocket({
								protocol,
								hostname: `${hostname}:${port}`,
								username,
								password,
							});
							return await airDCPPSocket.connect();
						} catch (err) {
							console.error(err);
						}
					},
				},
				getHubs: {
					rest: "POST /getHubs",
					handler: async (
						ctx: Context<{
							host: {
								hostname: string;
								port: string;
								protocol: string;
								username: string;
								password: string;
							};
						}>
					) => {
						console.log(ctx.params);
						const {
							host: {
								hostname,
								port,
								protocol,
								username,
								password,
							},
						} = ctx.params;
						try {
							const airDCPPSocket = new AirDCPPSocket({
								protocol,
								hostname: `${hostname}:${port}`,
								username,
								password,
							});
							await airDCPPSocket.connect();
							return await airDCPPSocket.get(`hubs`);
						} catch (err) {
							throw err;
						}
					},
				},
			},
			methods: {},
		});
	}
}
