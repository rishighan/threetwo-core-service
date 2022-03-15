/*
 * MIT License
 *
 * Copyright (c) 2021 Rishi Ghan
 *
 The MIT License (MIT)

Copyright (c) 2022 Rishi Ghan

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
 */

/*
 * Revision History:
 *     Initial:        2021/05/04        Rishi Ghan
 */

import {
	createWriteStream,
	createReadStream,
	promises as fs,
	readFileSync,
} from "fs";
const fse = require("fs-extra");
const Unrar = require("unrar");
import path, { parse } from "path";
import { list, extract, onlyArchive } from "node-7z-forall";
import { IExtractedComicBookCoverFile } from "threetwo-ui-typings";
import sharp from "sharp";
import { getFileConstituents } from "../utils/file.utils";
import { isNil, isUndefined, remove } from "lodash";
import { convertXMLToJSON } from "./xml.utils";
import { USERDATA_DIRECTORY, COMICS_DIRECTORY } from "../constants/directories";

export const extractComicInfoXMLFromRar = async (
	filePath: string
): Promise<Partial<IExtractedComicBookCoverFile>> => {
	const result = {
		filePath,
	};

	// Create the target directory
	const directoryOptions = {
		mode: 0o2775,
	};
	const { fileNameWithoutExtension, extension } =
		getFileConstituents(filePath);
	const targetDirectory = `${USERDATA_DIRECTORY}/covers/${fileNameWithoutExtension}`;
	await fse.ensureDir(targetDirectory, directoryOptions);
	console.info(`%s was created.`, targetDirectory);
	return new Promise((resolve, reject) => {
		const archive = new Unrar({
			path: path.resolve(filePath),
			bin: `/usr/local/bin/unrar`, // this will change depending on Docker base OS
		});

		archive.list(async (err, entries) => {
			remove(entries, ({ type }) => type === "Directory");
			const comicInfoXML = remove(
				entries,
				({ name }) => name.toLowerCase() === "comicinfo.xml"
			);
			const files = entries.sort((a, b) => {
				if (!isUndefined(a) && !isUndefined(b)) {
					return a.name
						.toLowerCase()
						.localeCompare(b.name.toLowerCase());
				}
			});
			const filesToWriteToDisk = [files[0].name, comicInfoXML[0]["name"]];
			remove(filesToWriteToDisk, (file) => !isNil(file.name));

			if (!isUndefined(comicInfoXML[0]["name"])) {
				let comicinfostring = "";
				const writeStream = createWriteStream(
					`${targetDirectory}/${comicInfoXML[0]["name"]}`
				);

				await archive.stream(comicInfoXML[0]["name"]).pipe(writeStream);
				writeStream.on("finish", async () => {
					const readStream = createReadStream(
						`${targetDirectory}/${comicInfoXML[0]["name"]}`
					);
					readStream.on("data", (data) => {
						comicinfostring += data;
					});
					readStream.on("error", (error) => reject(error));
					readStream.on("end", async () => {
						const comicInfoJSON = await convertXMLToJSON(
							comicinfostring.toString()
						);
						Object.assign(result, {
							comicInfoJSON: comicInfoJSON.comicinfo,
						});
					});
				});
			}

			const sharpStream = sharp().resize(275);
			const coverExtractionStream = archive.stream(files[0].name);
			await coverExtractionStream
				.pipe(sharpStream)
				.toFile(`${targetDirectory}/${files[0].name}`);
			// orchestrate result
			Object.assign(result, {
				name: fileNameWithoutExtension,
				extension,
				containedIn: targetDirectory,
				cover: {
					filePath: path.relative(
						process.cwd(),
						`${targetDirectory}/${files[0].name}`
					),
				},
			});
			resolve(result);
		});
	});
};

export const extractComicInfoXMLFromZip = async (
	filePath: string
): Promise<Partial<IExtractedComicBookCoverFile>> => {
	const result = {
		filePath,
	};
	// Create the target directory
	const directoryOptions = {
		mode: 0o2775,
	};
	const { fileNameWithoutExtension, extension } =
		getFileConstituents(filePath);
	const targetDirectory = `${USERDATA_DIRECTORY}/covers/${fileNameWithoutExtension}`;
	await fse.ensureDir(targetDirectory, directoryOptions);
	console.info(`%s was created.`, targetDirectory);
	let sortedFiles = [];
	const filesToWriteToDisk = [];
	return await list(filePath)
		.progress((files) => {
			// Do stuff with files...
			sortedFiles = files.sort((a, b) => {
				if (!isUndefined(a) && !isUndefined(b)) {
					return a.name
						.toLowerCase()
						.localeCompare(b.name.toLowerCase());
				}
			});
			const comicInfoXML = remove(
				sortedFiles,
				(file) => file.name.toLowerCase() === "comicinfo.xml"
			);
			if (!isUndefined(comicInfoXML)) {
				filesToWriteToDisk.push(comicInfoXML[0].name);
			}
			filesToWriteToDisk.push(sortedFiles[0].name);
		})
		.then((d) => {
			return extract(path.resolve(filePath), targetDirectory, {
				r: true,
				raw: [...filesToWriteToDisk],
			})
				.progress((files) => {
					console.log(files);
				})
				.then(() => {
					const coverFile = filesToWriteToDisk.find(
						(file) => file.toLowerCase() !== "comicinfo.xml"
					);
					Object.assign(result, {
						name: fileNameWithoutExtension,
						extension,
						containedIn: targetDirectory,
						cover: {
							filePath: path.relative(
								process.cwd(),
								`${targetDirectory}/${coverFile}`
							),
						},
					});
					// ComicInfoXML detection, parsing and conversion to JSON
					let comicinfostring = "";
					const comicInfoFile = filesToWriteToDisk.find(
						(file) => file.toLowerCase() === "comicinfo.xml"
					);
					return new Promise((resolve, reject) => {
						const comicInfoXMLStream = createReadStream(
							`${targetDirectory}/${comicInfoFile}`
						);
						comicInfoXMLStream.on("data", (data) => {
							comicinfostring += data;
						});
						comicInfoXMLStream.on("error", (error) =>
							console.log(error)
						);
						comicInfoXMLStream.on("end", async () => {
							const comicInfoJSON = await convertXMLToJSON(
								comicinfostring.toString()
							);
							Object.assign(result, {
								comicInfoJSON: comicInfoJSON.comicinfo,
							});

							resolve(result);
						});
					});
				})
				.catch((error) => {
					console.log(error);
				});
		});
};

export const extractFromArchive = async (filePath: string) => {
	const { extension } = getFileConstituents(filePath);
	switch (extension) {
		case ".cbz":
			console.log(
				"Detected file type is cbz, looking for comicinfo.xml..."
			);
			return await extractComicInfoXMLFromZip(filePath);

		case ".cbr":
			console.log(
				"Detected file type is cbr, looking for comicinfo.xml..."
			);
			return await extractComicInfoXMLFromRar(filePath);

		default:
			console.log(
				"Error inferring filetype for comicinfo.xml extraction."
			);
			break;
	}
};
