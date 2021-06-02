"use strict";
import { Context, Service, ServiceBroker, ServiceSchema } from "moleculer";
import { DbMixin } from "../mixins/db.mixin";
import Comic from "../models/comic.model";
import { walkFolder } from "../utils/uncompression.utils";
import { convertXMLToJSON } from "../utils/xml.utils";

export default class ProductsService extends Service {
	// @ts-ignore
	public constructor(
		public broker: ServiceBroker,
		schema: ServiceSchema<{}> = { name: "import" }
	) {
		super(broker);
		this.parseServiceSchema(
			Service.mergeSchemas(
				{
					name: "import",
					mixins: [DbMixin("comics", Comic)],
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
						walkFolders: {
							rest: "POST /walkFolders",
							params: {
								basePathToWalk: "string",
							},
							async handler(
								ctx: Context<{ basePathToWalk: string }>
							) {
								return await walkFolder(
									ctx.params.basePathToWalk
								);
							},
						},
						convertXMLToJSON: {
							rest: "POST /convertXmlToJson",
							params: {},
							async handler(ctx: Context<{}>) {
								return convertXMLToJSON("lagos");
							},
						},
						rawImportToDB: {
							rest: "POST /rawImportToDB",
							params: { payload: "object" },
							async handler(ctx: Context<{ payload: object }>) {
								return new Promise((resolve, reject) => {
									Comic.create(
										ctx.params.payload,
										(error, data) => {
											if (data) {
												resolve(data);
											} else if (error) {
												reject(new Error(error));
											}
										}
									);
								});
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
