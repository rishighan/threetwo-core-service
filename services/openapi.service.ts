import { Context, Service, ServiceBroker } from "moleculer";
const OpenApiMixin = require("moleculer-auto-openapi");

/**
 * Generates an OpenAPI 3.0 schema from every action's `rest:`/`params:`
 * definitions across the broker's services, and serves a Scalar UI for it
 * (overriding the mixin's default Swagger UI). Routes are wired up in
 * services/api.service.ts under /api/openapi.
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
			},
			actions: {
				// Overrides the mixin's default Swagger-UI-based `ui` action with
				// Scalar, served locally from node_modules (no CDN dependency) via
				// the /api/openapi/scalar static route in api.service.ts.
				ui: {
					handler(ctx: Context<{ url?: string }, { $responseType?: string }>) {
						ctx.meta.$responseType = "text/html; charset=utf-8";
						return `<!doctype html>
<html>
  <head>
    <title>ThreeTwo Core Service API</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <script
      id="api-reference"
      data-url="${ctx.params.url || (this.settings as any).schemaPath}"
    ></script>
    <script src="/api/openapi/scalar/standalone.js"></script>
  </body>
</html>`;
					},
				},
			},
		});
	}
}
