import { Service, ServiceBroker } from "moleculer";
const OpenApiMixin = require("moleculer-auto-openapi");

/**
 * Generates an OpenAPI 3.0 schema from every action's `rest:`/`params:`
 * definitions across the broker's services. The schema is served at
 * /api/openapi/openapi.json; the Scalar UI itself is served as a raw
 * function alias in services/api.service.ts (bypassing ctx.meta-based
 * response typing, which moleculer 0.15 no longer reliably propagates
 * back to the gateway for locally-invoked actions).
 */
export default class OpenApiService extends Service {
	public constructor(broker: ServiceBroker) {
		super(broker);
		this.parseServiceSchema({
			name: "openapi",
			mixins: [OpenApiMixin],
			settings: {
				openapi: {
					info: {
						title: "ThreeTwo Core Service API",
						description: "Comic library management API",
						version: process.env.npm_package_version || "1.0.0",
					},
				},
			} as any,
		});
	}
}
