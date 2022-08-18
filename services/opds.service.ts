import { Context, Service, ServiceBroker, ServiceSchema } from "moleculer";

import { basename, extname, join } from "path";
import { lookup } from "mime-types";
import { promises as fs } from "fs";
import { responseStream } from "http-response-stream";
import { isUndefined } from "lodash";
import { buildAsync } from "calibre-opds";
import initMain from "calibre-opds/lib/index";
import { EnumLinkRel } from "opds-extra/lib/const";
import { async as FastGlob } from "@bluelovers/fast-glob/bluebird";
import { Entry, Feed } from "opds-extra/lib/v1";
import { Link } from "opds-extra/lib/v1/core";
import xml2js from "xml2js";
import { COMICS_DIRECTORY } from "../constants/directories";

export default class OpdsService extends Service {
	// @ts-ignore
	public constructor(
		public broker: ServiceBroker,
		schema: ServiceSchema<{}> = { name: "opds" }
	) {
		super(broker);
		this.parseServiceSchema({
			name: "opds",
			mixins: [],
			settings: {
				port: process.env.PORT || 3001,
			},
			hooks: {},
			actions: {
				serve: {
					rest: "POST /serve",
					handler: async (ctx) => {
						return buildAsync(
							initMain({
								title: `title`,
								subtitle: `subtitle`,
								icon: "/favicon.ico",
							}),
							[
								async (feed: Feed) => {
									feed.id =
										"urn:uuid:2853dacf-ed79-42f5-8e8a-a7bb3d1ae6a2";
									feed.books = feed.books || [];
									await FastGlob(
										[
											"*.cbr",
											"*.cbz",
											"*.cb7",
											"*.cba",
											"*.cbt",
										],
										{
											cwd: COMICS_DIRECTORY,
										}
									).each((file, idx) => {
										const ext = extname(file);
										const title = basename(file, ext);
										const href = encodeURI(
											`/comics/${file}`
										);
										const type =
											lookup(ext) ||
											"application/octet-stream";

										const entry = Entry.deserialize<Entry>({
											title,
											id: idx.toString(),
											links: [
												{
													rel: EnumLinkRel.ACQUISITION,
													href,
													type,
												} as Link,
											],
										});

										if (
											!isUndefined(feed) &&
											!isUndefined(feed.books)
										) {
											feed.books.push(entry);
										}
									});

									return feed;
								},
							]
						).then((feed) => {
							ctx.meta.$responseHeaders = {
								"Content-Type": " application/xml",
							};
							let data;
							xml2js.parseString(feed.toXML(), (err, result) => {
								result.feed.link = {
									$: {
										rel: "self",
										href: "/opds-catalogs/root.xml",
										type: "application/atom+xml;profile=opds-catalog;kind=navigation",
									},
									_: "",
								};
								const builder = new xml2js.Builder({
									xmldec: {
										version: "1.0",
										encoding: "UTF-8",
										standalone: false,
									},
								});
								data = builder.buildObject(result, {
									renderOpts: {
										pretty: true,
										indent: " ",
										newline: "\n",
										allowEmpty: true,
									},
								});
							});
							return data;
						});
					},
				},
			},
			methods: {},
		});
	}
}
