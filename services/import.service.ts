"use strict";
import { Context, Service, ServiceBroker, ServiceSchema } from "moleculer";
import { DbMixin } from "../mixins/db.mixin";
import Comic from "../models/comic.model";
import {
	walkFolder,
	getCovers,
} from "../utils/uncompression.utils";
import {
	IExtractionOptions,
	IFolderData,
} from "../interfaces/folder.interface";

export default class ProductsService extends Service {
	// @ts-ignore
	public constructor(public broker: ServiceBroker, schema: ServiceSchema<{}> = {}) {
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
							async handler(ctx: Context<{ basePathToWalk: string}>) {
								return await walkFolder(ctx.params.basePathToWalk);
							}
						},
						getComicCovers: {
							rest: "POST /getComicCovers",
							params: {
								extractionOptions: "object",
								walkedFolders: "array",

							},
							async handler(
								ctx: Context<{
									extractionOptions: IExtractionOptions;
									walkedFolders: IFolderData[];
								}>
							) {
								return await getCovers(
									ctx.params.extractionOptions,
									ctx.params.walkedFolders
								);
								
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
