"use strict";
import {
	Context,
	Service,
	ServiceBroker,
	ServiceSchema,
	Errors,
} from "moleculer";
import { resizeImage } from "../utils/imagetransformation.utils";

export default class ProductsService extends Service {
	// @ts-ignore
	public constructor(
		public broker: ServiceBroker,
		schema: ServiceSchema<{}> = { name: "imagetransformation" }
	) {
		super(broker);
		this.parseServiceSchema(
			Service.mergeSchemas(
				{
					name: "imagetransformation",
					mixins: [],
					settings: {
						// Available fields in the responses
						fields: ["_id", "name", "quantity", "price"],

						// Validator for the `create` & `insert` actions.
						entityValidator: {
							name: "string|min:3",
							price: "number|positive",
						},
					},
					hooks: {},
					actions: {
						resize: {
							rest: "POST /resizeImage",
							params: {},
							async handler(
								ctx: Context<{
									imageFile: string | Buffer;
									newWidth: number;
									newHeight: number;
									outputPath: string;
								}>
							) {
								const resizeResult = await resizeImage(
									ctx.params.imageFile,
									ctx.params.outputPath,
									ctx.params.newWidth,
									ctx.params.newHeight
								);
								return { resizeOperationStatus: resizeResult };
							},
						},
					},
					methods: {},
				},
				schema
			)
		);
	}
}
