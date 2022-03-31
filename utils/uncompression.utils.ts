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
	existsSync,
} from "fs";
const fse = require("fs-extra");
const Unrar = require("unrar");
import path, { parse } from "path";
import * as p7zip from "p7zip";
import { IExtractedComicBookCoverFile } from "threetwo-ui-typings";
import sharp from "sharp";
import { getFileConstituents } from "../utils/file.utils";
import { flatten, isEmpty, isNil, isUndefined, remove } from "lodash";
import { convertXMLToJSON } from "./xml.utils";
import { USERDATA_DIRECTORY, COMICS_DIRECTORY } from "../constants/directories";
import { IMPORT_IMAGE_FILE_FORMATS } from "../constants/allowedFileFormats";
interface RarFile {
	name: string;
	type: string;
	size?: string;
	packedSize?: string;
	ratio?: string;
	mtime: string;
	attributes: string;
	crc32: string;
	hostOS: string;
	compression: string;
}

const UNRAR_BIN_PATH = process.env.UNRAR_BIN_PATH || "/opt/homebrew/bin/unrar";
export const extractComicInfoXMLFromRar = async (
	filePath: string
): Promise<any> => {
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
	const archive = new Unrar({
		path: path.resolve(filePath),
		bin: `${UNRAR_BIN_PATH}`, // this will change depending on Docker base OS
	});
	const filesInArchive: [RarFile] = await new Promise((resolve, reject) => {
		return archive.list((err, entries) => {
			resolve(entries);
		});
	});

	remove(filesInArchive, ({ type }) => type === "Directory");
	const comicInfoXML = remove(
		filesInArchive,
		({ name }) => path.basename(name).toLowerCase() === "comicinfo.xml"
	);
	remove(
		filesInArchive,
		({ name }) => !IMPORT_IMAGE_FILE_FORMATS.includes(path.extname(name))
	);
	const files = filesInArchive.sort((a, b) => {
		if (!isUndefined(a) && !isUndefined(b)) {
			return path
				.basename(a.name)
				.toLowerCase()
				.localeCompare(path.basename(b.name).toLowerCase());
		}
	});
	const comicInfoXMLFilePromise = new Promise((resolve, reject) => {
		let comicinfostring = "";
		if (!isUndefined(comicInfoXML[0])) {
			const writeStream = createWriteStream(
				`${targetDirectory}/${comicInfoXML[0].name}`
			);

			archive.stream(comicInfoXML[0]["name"]).pipe(writeStream);
			writeStream.on("finish", async () => {
				const readStream = createReadStream(
					`${targetDirectory}/${comicInfoXML[0].name}`
				);
				readStream.on("data", (data) => {
					comicinfostring += data;
				});
				readStream.on("error", (error) => reject(error));
				readStream.on("end", async () => {
					if (
						existsSync(
							`${targetDirectory}/${path.basename(
								comicInfoXML[0].name
							)}`
						)
					) {
						const comicInfoJSON = await convertXMLToJSON(
							comicinfostring.toString()
						);

						resolve({ comicInfoJSON: comicInfoJSON.comicinfo });
					}
				});
			});
		} else {
			resolve({ comicInfoJSON: null });
		}
	});

	const coverFilePromise = new Promise((resolve, reject) => {
		const coverFile = path.basename(files[0].name);
		const sharpStream = sharp().resize(275);
		const coverExtractionStream = archive.stream(files[0].name);
		const resizeStream = coverExtractionStream.pipe(sharpStream);

		resizeStream.toFile(`${targetDirectory}/${coverFile}`, (err, info) => {
			if (err) {
				reject(err);
			}
			if (existsSync(`${targetDirectory}/${coverFile}`)) {
				// orchestrate result
				resolve({
					filePath,
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
			}
		});
	});

	return Promise.all([comicInfoXMLFilePromise, coverFilePromise]);
};

export const extractComicInfoXMLFromZip = async (
	filePath: string
): Promise<any> => {
	// Create the target directory
	const directoryOptions = {
		mode: 0o2775,
	};
	const { fileNameWithoutExtension, extension } =
		getFileConstituents(filePath);
	const targetDirectory = `${USERDATA_DIRECTORY}/covers/${fileNameWithoutExtension}`;
	await fse.ensureDir(targetDirectory, directoryOptions);
	console.info(`%s was created.`, targetDirectory);
	let filesToWriteToDisk = { coverFile: null, comicInfoXML: null };
	const extractionTargets = [];

	// read the archive
	let filesFromArchive = await p7zip.read(path.resolve(filePath));

	// only allow allowed image formats
	remove(
		filesFromArchive.files,
		({ name }) => !IMPORT_IMAGE_FILE_FORMATS.includes(path.extname(name))
	);

	// detect comicinfo.xml
	const comicInfoXMLFileObject = remove(
		filesFromArchive.files,
		(file) => path.basename(file.name.toLowerCase()) === "comicinfo.xml"
	);

	// Natural sort
	const files = filesFromArchive.files.sort((a, b) => {
		if (!isUndefined(a) && !isUndefined(b)) {
			return path
				.basename(a.name)
				.toLowerCase()
				.localeCompare(path.basename(b.name).toLowerCase());
		}
	});
	// Push the first file (cover) to our extraction target
	extractionTargets.push(files[0].name);
	filesToWriteToDisk.coverFile = files[0].name;
	if (!isEmpty(comicInfoXMLFileObject)) {
		filesToWriteToDisk.comicInfoXML = comicInfoXMLFileObject[0].name;
		extractionTargets.push(filesToWriteToDisk.comicInfoXML);
	}

	await p7zip.extract(
		filePath,
		targetDirectory,
		extractionTargets,
		"",
		false
	);

	console.log("ENDHAAA", extractionTargets);
	// ComicInfoXML detection, parsing and conversion to JSON
	// Write ComicInfo.xml to disk
	let comicinfostring = "";
	const comicInfoXMLPromise = new Promise((resolve, reject) => {
		if (
			!isNil(filesToWriteToDisk.comicInfoXML) &&
			existsSync(
				`${targetDirectory}/${path.basename(
					filesToWriteToDisk.comicInfoXML
				)}`
			)
		) {
			let comicinfoString = "";
			const comicInfoXMLStream = createReadStream(
				`${targetDirectory}/${path.basename(
					filesToWriteToDisk.comicInfoXML
				)}`
			);
			comicInfoXMLStream.on("data", (data) => (comicinfoString += data));
			comicInfoXMLStream.on("end", async () => {
				const comicInfoJSON = await convertXMLToJSON(
					comicinfoString.toString()
				);
				resolve({
					comicInfoJSON: comicInfoJSON.comicinfo,
				});
			});
		} else {
			resolve({
				comicInfoJSON: null,
			});
		}
	});
	// Write the cover to disk
	const coverFilePromise = new Promise((resolve, reject) => {
		const sharpStream = sharp().resize(275);
		const coverStream = createReadStream(
			`${targetDirectory}/${path.basename(filesToWriteToDisk.coverFile)}`
		);
		coverStream
			.pipe(sharpStream)
			.toFile(
				`${targetDirectory}/${path.basename(
					filesToWriteToDisk.coverFile
				)}`,
				(err, info) => {
					if (err) {
						reject(err);
					}
					// Update metadata
					resolve({
						filePath,
						name: fileNameWithoutExtension,
						extension,
						containedIn: targetDirectory,
						cover: {
							filePath: path.relative(
								process.cwd(),
								`${targetDirectory}/${path.basename(
									filesToWriteToDisk.coverFile
								)}`
							),
						},
					});
				}
			);
	});

	return Promise.all([comicInfoXMLPromise, coverFilePromise]);
};

export const extractFromArchive = async (filePath: string) => {
	console.info(`Unrar is located at: ${UNRAR_BIN_PATH}`);
	const { extension } = getFileConstituents(filePath);
	switch (extension) {
		case ".cbz":
			console.log(
				"Detected file type is cbz, looking for comicinfo.xml..."
			);
			const cbzResult = await extractComicInfoXMLFromZip(filePath);
			return Object.assign({}, ...cbzResult);

		case ".cbr":
			console.log(
				"Detected file type is cbr, looking for comicinfo.xml..."
			);
			const cbrResult = await extractComicInfoXMLFromRar(filePath);
			return Object.assign({}, ...cbrResult);

		default:
			console.log(
				"Error inferring filetype for comicinfo.xml extraction."
			);
			break;
	}
};
