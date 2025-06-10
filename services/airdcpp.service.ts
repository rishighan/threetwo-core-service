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
					timeout: 70000,
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
				search: {
					rest: "POST /search",
					timeout: 20000,
					handler: async (
						ctx: Context<{
							host: {
								hostname;
								port;
								protocol;
								username;
								password;
							};
							dcppSearchQuery;
						}>
					) => {
						try {
							const {
								host: {
									hostname,
									port,
									protocol,
									username,
									password,
								},
								dcppSearchQuery,
							} = ctx.params;
							const airDCPPSocket = new AirDCPPSocket({
								protocol,
								hostname: `${hostname}:${port}`,
								username,
								password,
							});
							await airDCPPSocket.connect();
							const searchInstance = await airDCPPSocket.post(
								`search`
							);

							// Post the search
							const searchInfo = await airDCPPSocket.post(
								`search/${searchInstance.id}/hub_search`,
								dcppSearchQuery
							);
							await this.sleep(10000);
							const results = await airDCPPSocket.get(
								`search/${searchInstance.id}/results/0/5`
							);
							return results;
						} catch (err) {
							throw err;
						}
					},
				},
			},
			methods: {
				sleep: (ms: number) => {
					return new Promise((resolve) => setTimeout(resolve, ms));
				},
			},
		});
	}
}
