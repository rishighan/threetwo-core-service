"use strict";
import { Context, Service, ServiceBroker, ServiceSchema } from "moleculer";
import fs from "fs";
import { DbMixin } from "../mixins/db.mixin";
import Comic from "../models/comic.model";
import { walkFolder, getCovers } from "../utils/uncompression.utils";
import {
	IExtractionOptions,
	IFolderData,
} from "../interfaces/folder.interface";
import axios from "axios";
import { Readable } from "stream";
import through2 from "through2";
import oboe from "oboe";
import H from "highland";
import { stringify } from "highland-json";
const IO = require("socket.io")();

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
					},
					methods: {},
				},
				schema
			)
		);
	}
}
