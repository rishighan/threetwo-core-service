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

import { createReadStream, createWriteStream, existsSync, statSync } from "fs";
import { isEmpty, isNil, isUndefined, remove, each, map, reject } from "lodash";
import * as p7zip from "p7zip-threetwo";
import path from "path";
import sharp from "sharp";
import { sanitize } from "sanitize-filename-ts";
import { IMPORT_IMAGE_FILE_FORMATS } from "../constants/allowedFileFormats";
import { USERDATA_DIRECTORY } from "../constants/directories";
import {
	checkFileExists,
	getFileConstituents,
	createDirectory,
	walkFolder,
} from "../utils/file.utils";
import { convertXMLToJSON } from "./xml.utils";
const fse = require("fs-extra");
const Unrar = require("unrar");
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

const UNRAR_BIN_PATH = process.env.UNRAR_BIN_PATH || "/usr/local/bin/unrar";

/**
 * Method that extracts comicInfo.xml file from a .rar archive, if one exists.
 * Also extracts the first image in the listing, which is assumed to be the cover.
 * @param {string} filePath
 * @returns {any}
 */
export const extractComicInfoXMLFromRar = async (
	filePath: string
): Promise<any> => {
	try {
		const result = {
			filePath,
		};

		// Create the target directory
		const directoryOptions = {
			mode: 0o2775,
		};
		const { fileNameWithoutExtension, extension } =
			getFileConstituents(filePath);
		const targetDirectory = `${USERDATA_DIRECTORY}/covers/${sanitize(
			fileNameWithoutExtension
		)}`;
		await createDirectory(directoryOptions, targetDirectory);

		const archive = new Unrar({
			path: path.resolve(filePath),
			bin: `${UNRAR_BIN_PATH}`, // this will change depending on Docker base OS
		});

		const filesInArchive: [RarFile] = await new Promise(
			(resolve, reject) => {
				return archive.list((err, entries) => {
					if (err) {
						reject(err);
					}
					resolve(entries);
				});
			}
		);

		remove(filesInArchive, ({ type }) => type === "Directory");
		const comicInfoXML = remove(
			filesInArchive,
			({ name }) => path.basename(name).toLowerCase() === "comicinfo.xml"
		);

		remove(
			filesInArchive,
			({ name }) =>
				!IMPORT_IMAGE_FILE_FORMATS.includes(
					path.extname(name).toLowerCase()
				)
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
				console.log(path.basename(comicInfoXML[0].name));
				const comicInfoXMLFileName = path.basename(
					comicInfoXML[0].name
				);
				const writeStream = createWriteStream(
					`${targetDirectory}/${comicInfoXMLFileName}`
				);

				archive.stream(comicInfoXML[0]["name"]).pipe(writeStream);
				writeStream.on("finish", async () => {
					const readStream = createReadStream(
						`${targetDirectory}/${comicInfoXMLFileName}`
					);
					readStream.on("data", (data) => {
						comicinfostring += data;
					});
					readStream.on("error", (error) => reject(error));
					readStream.on("end", async () => {
						if (
							existsSync(
								`${targetDirectory}/${comicInfoXMLFileName}`
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
			const coverFile = sanitize(path.basename(files[0].name));
			const sharpStream = sharp().resize(275).toFormat("png");
			const coverExtractionStream = archive.stream(files[0].name);
			const resizeStream = coverExtractionStream.pipe(sharpStream);

			resizeStream.toFile(
				`${targetDirectory}/${coverFile}`,
				(err, info) => {
					if (err) {
						reject(err);
					}
					checkFileExists(`${targetDirectory}/${coverFile}`).then(
						(bool) => {
							console.log(`${coverFile} exists: ${bool}`);
							// orchestrate result
							resolve({
								filePath,
								name: fileNameWithoutExtension,
								extension,
								containedIn: targetDirectory,
								fileSize: fse.statSync(filePath).size,
								cover: {
									filePath: path.relative(
										process.cwd(),
										`${targetDirectory}/${coverFile}`
									),
								},
							});
						}
					);
				}
			);
		});

		return Promise.all([comicInfoXMLFilePromise, coverFilePromise]);
	} catch (err) {
		reject(err);
	}
};

export const extractComicInfoXMLFromZip = async (
	filePath: string
): Promise<any> => {
	try {
		// Create the target directory
		const directoryOptions = {
			mode: 0o2775,
		};
		const { fileNameWithoutExtension, extension } =
			getFileConstituents(filePath);
		const targetDirectory = `${USERDATA_DIRECTORY}/covers/${sanitize(
			fileNameWithoutExtension
		)}`;
		await createDirectory(directoryOptions, targetDirectory);

		let filesToWriteToDisk = { coverFile: null, comicInfoXML: null };
		const extractionTargets = [];

		// read the archive
		let filesFromArchive = await p7zip.read(path.resolve(filePath));
		// detect ComicInfo.xml
		const comicInfoXMLFileObject = remove(
			filesFromArchive.files,
			(file) => path.basename(file.name.toLowerCase()) === "comicinfo.xml"
		);
		// only allow allowed image formats
		remove(
			filesFromArchive.files,
			({ name }) =>
				!IMPORT_IMAGE_FILE_FORMATS.includes(
					path.extname(name).toLowerCase()
				)
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
		filesToWriteToDisk.coverFile = sanitize(path.basename(files[0].name));
		if (!isEmpty(comicInfoXMLFileObject)) {
			filesToWriteToDisk.comicInfoXML = comicInfoXMLFileObject[0].name;
			extractionTargets.push(filesToWriteToDisk.comicInfoXML);
		}
		// Extract the files.
		await p7zip.extract(
			filePath,
			targetDirectory,
			extractionTargets,
			"",
			false
		);

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
				comicInfoXMLStream.on(
					"data",
					(data) => (comicinfoString += data)
				);
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
			const sharpStream = sharp().resize(275).toFormat("png");
			const coverStream = createReadStream(
				`${targetDirectory}/${filesToWriteToDisk.coverFile}`
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
							fileSize: fse.statSync(filePath).size,
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
	} catch (err) {
		reject(err);
	}
};

export const extractFromArchive = async (filePath: string) => {
	console.info(`Unrar is located at: ${UNRAR_BIN_PATH}`);
	console.info(`p7zip is located at: ${process.env.SEVENZ_BINARY_PATH}`);
	const { extension } = getFileConstituents(filePath);
	console.log(
		`Detected file type is ${extension}, looking for comicinfo.xml...`
	);
	switch (extension) {
		case ".cbz":
		case ".cb7":
			const cbzResult = await extractComicInfoXMLFromZip(filePath);
			return Object.assign({}, ...cbzResult);

		case ".cbr":
			const cbrResult = await extractComicInfoXMLFromRar(filePath);
			return Object.assign({}, ...cbrResult);

		default:
			console.log(
				"Error inferring filetype for comicinfo.xml extraction."
			);
			break;
	}
};

/**
 * Proxy method that calls uncompression on a .zip or a .rar archive and optionally resizes the images contained therein
 * @param {string} filePath
 * @param {any} options
 * @returns {Promise} A promise containing the contents of the uncompressed archive.
 */
export const uncompressEntireArchive = async (
	filePath: string,
	options: any
) => {
	const { extension } = getFileConstituents(filePath);
	switch (extension) {
		case ".cbz":
		case ".cb7":
			return await uncompressZipArchive(filePath, options);
		case ".cbr":
			return await uncompressRarArchive(filePath, options);
	}
};

/**
 * Method that uncompresses a .zip file
 * @param {string} filePath
 * @param {any} options
 * @returns {any}
 */
export const uncompressZipArchive = async (filePath: string, options: any) => {
	// Create the target directory
	const directoryOptions = {
		mode: 0o2775,
	};
	const { fileNameWithoutExtension } = getFileConstituents(filePath);
	const targetDirectory = `${USERDATA_DIRECTORY}/expanded/${fileNameWithoutExtension}`;
	await createDirectory(directoryOptions, targetDirectory);
	await p7zip.extract(filePath, targetDirectory, [], "", false);

	return await resizeImageDirectory(targetDirectory, options);
};

export const uncompressRarArchive = async (filePath: string, options: any) => {
	// Create the target directory
	const directoryOptions = {
		mode: 0o2775,
	};
	const { fileNameWithoutExtension, extension } =
		getFileConstituents(filePath);
	const targetDirectory = `${USERDATA_DIRECTORY}/expanded/${fileNameWithoutExtension}`;
	await createDirectory(directoryOptions, targetDirectory);

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
	let extractionPromises = [];
	// iterate over the files

	each(filesInArchive, (file) => {
		extractionPromises.push(
			new Promise((resolve, reject) => {
				const fileExtractionStream = archive.stream(file.name);
				const fileWriteStream = createWriteStream(
					`${targetDirectory}/${path.basename(file.name)}`
				);
				fileExtractionStream.pipe(fileWriteStream);
				fileWriteStream.on("finish", async () => {
					resolve(`${targetDirectory}/${path.basename(file.name)}`);
				});
			})
		);
	});

	await Promise.all(extractionPromises);
	return await resizeImageDirectory(targetDirectory, options);
};

export const resizeImageDirectory = async (
	directoryPath: string,
	options: any
) => {
	const files = await walkFolder(directoryPath, [
		".jpg",
		".jpeg",
		".JPG",
		".JPEG",
		".png",
		".bmp",
	]);
	const resizePromises = [];
	map(files, (file) => {
		resizePromises.push(resizeImage(directoryPath, file, options));
	});

	return await Promise.all(resizePromises);
};

export const resizeImage = (directoryPath: string, file: any, options: any) => {
	const { baseWidth } = options.imageResizeOptions;
	const sharpResizeInstance = sharp().resize(baseWidth).toFormat("png");
	return new Promise((resolve, reject) => {
		const resizedStream = createReadStream(
			`${directoryPath}/${file.name}${file.extension}`
		);
		if (fse.existsSync(`${directoryPath}/${file.name}${file.extension}`)) {
			resizedStream
				.pipe(sharpResizeInstance)
				.toFile(
					`${directoryPath}/${file.name}_${baseWidth}px${file.extension}`
				)
				.then((data) => {
					console.log(
						`Resized image ${JSON.stringify(data, null, 4)}`
					);
					fse.unlink(
						`${directoryPath}/${file.name}${file.extension}`
					);
					resolve(
						`${directoryPath}/${file.name}_${baseWidth}px${file.extension}`
					);
				});
		}
	});
};
