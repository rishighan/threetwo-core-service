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
import { execFile } from "child_process";
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
	getMimeType,
} from "../utils/file.utils";
import { convertXMLToJSON } from "./xml.utils";
const { MoleculerError } = require("moleculer").Errors;
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
// errors array
const errors = [];
/**
 * Method that extracts comicInfo.xml file from a .rar archive, if one exists.
 * Also extracts the first image in the listing, which is assumed to be the cover.
 * @param {string} filePath
 * @returns {any}
 */
export const extractComicInfoXMLFromRar = async (
	filePath: string,
	mimeType: string
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

		// Try unrar-based extraction first, fall back to p7zip if it fails
		let unrarError: Error | null = null;
		try {
			const result = await extractComicInfoXMLFromRarUsingUnrar(
				filePath,
				mimeType,
				targetDirectory,
				fileNameWithoutExtension,
				extension
			);
			return result;
		} catch (err) {
			unrarError = err;
			console.warn(
				`unrar-based extraction failed for ${filePath}: ${err.message}. Falling back to p7zip.`
			);
		}

		try {
			const result = await extractComicInfoXMLFromRarUsingP7zip(
				filePath,
				mimeType,
				targetDirectory,
				fileNameWithoutExtension,
				extension
			);
			return result;
		} catch (p7zipError) {
			console.error(
				`p7zip-based extraction also failed for ${filePath}: ${p7zipError.message}`
			);
			throw new Error(
				`Failed to extract RAR archive: ${filePath}. ` +
				`unrar error: ${unrarError?.message}. ` +
				`p7zip error: ${p7zipError.message}. ` +
				`Ensure 'unrar' is installed at ${UNRAR_BIN_PATH} or '7z' is available via SEVENZ_BINARY_PATH.`
			);
		}
	} catch (err) {
		throw err;
	}
};

/**
 * List files in a RAR archive using the unrar binary directly.
 * Uses `unrar lb` (bare list) for reliable output — one filename per line.
 */
const listRarFiles = (filePath: string): Promise<string[]> => {
	return new Promise((resolve, reject) => {
		execFile(
			UNRAR_BIN_PATH,
			["lb", path.resolve(filePath)],
			{ maxBuffer: 10 * 1024 * 1024 },
			(err, stdout, stderr) => {
				if (err) {
					return reject(
						new Error(
							`unrar lb failed for ${filePath}: ${err.message}${stderr ? ` (stderr: ${stderr})` : ""}`
						)
					);
				}
				const files = stdout
					.split(/\r?\n/)
					.map((line) => line.trim())
					.filter((line) => line.length > 0);
				resolve(files);
			}
		);
	});
};

/**
 * Extract a single file from a RAR archive to stdout as a Buffer.
 * Uses `unrar p -inul` (print to stdout, no messages).
 */
const extractRarFileToBuffer = (
	filePath: string,
	entryName: string
): Promise<Buffer> => {
	return new Promise((resolve, reject) => {
		execFile(
			UNRAR_BIN_PATH,
			["p", "-inul", path.resolve(filePath), entryName],
			{ maxBuffer: 50 * 1024 * 1024, encoding: "buffer" },
			(err, stdout, stderr) => {
				if (err) {
					return reject(
						new Error(
							`unrar p failed for ${entryName} in ${filePath}: ${err.message}`
						)
					);
				}
				resolve(stdout as unknown as Buffer);
			}
		);
	});
};

/**
 * Extract comic info and cover from a RAR archive using the unrar binary directly.
 * Bypasses the `unrar` npm package which has parsing bugs.
 */
const extractComicInfoXMLFromRarUsingUnrar = async (
	filePath: string,
	mimeType: string,
	targetDirectory: string,
	fileNameWithoutExtension: string,
	extension: string
): Promise<any> => {
	// List all files in the archive using bare listing
	const allFiles = await listRarFiles(filePath);

	console.log(
		`RAR (unrar direct): ${allFiles.length} total entries in ${filePath}`
	);

	// Find ComicInfo.xml
	const comicInfoXMLEntry = allFiles.find(
		(name) => path.basename(name).toLowerCase() === "comicinfo.xml"
	);

	// Filter to image files only
	const imageFiles = allFiles
		.filter((name) =>
			IMPORT_IMAGE_FILE_FORMATS.includes(
				path.extname(name).toLowerCase()
			)
		)
		.sort((a, b) =>
			path
				.basename(a)
				.toLowerCase()
				.localeCompare(path.basename(b).toLowerCase())
		);

	if (imageFiles.length === 0) {
		throw new Error(
			`No image files found via unrar in RAR archive: ${filePath}`
		);
	}

	// Extract and parse ComicInfo.xml if present
	let comicInfoResult: { comicInfoJSON: any } = { comicInfoJSON: null };
	if (comicInfoXMLEntry) {
		try {
			const xmlBuffer = await extractRarFileToBuffer(
				filePath,
				comicInfoXMLEntry
			);
			const comicInfoJSON = await convertXMLToJSON(
				xmlBuffer.toString("utf-8")
			);
			console.log(
				`comicInfo.xml successfully extracted: ${comicInfoJSON.comicinfo}`
			);
			comicInfoResult = { comicInfoJSON: comicInfoJSON.comicinfo };
		} catch (xmlErr) {
			console.warn(
				`Failed to extract ComicInfo.xml from ${filePath}: ${xmlErr.message}`
			);
		}
	}

	// Extract and resize cover image (first image file)
	const coverEntryName = imageFiles[0];
	const coverFile = path.basename(coverEntryName);
	const coverBaseName = sanitize(path.basename(coverFile, path.extname(coverFile)));
	const coverOutputFile = `${targetDirectory}/${coverBaseName}.png`;

	const coverBuffer = await extractRarFileToBuffer(
		filePath,
		coverEntryName
	);

	await sharp(coverBuffer)
		.resize(275)
		.toFormat("png")
		.toFile(coverOutputFile);

	console.log(`${coverFile} cover written to: ${coverOutputFile}`);

	const relativeCoverPath = path.relative(process.cwd(), coverOutputFile);
	console.log(`RAR cover path (relative): ${relativeCoverPath}`);
	console.log(`RAR cover file exists: ${existsSync(coverOutputFile)}`);

	const coverResult = {
		filePath,
		name: fileNameWithoutExtension,
		extension,
		containedIn: targetDirectory,
		fileSize: fse.statSync(filePath).size,
		mimeType,
		cover: {
			filePath: relativeCoverPath,
		},
	};

	return [comicInfoResult, coverResult];
};

/**
 * Fallback: Extract comic info and cover from a RAR archive using p7zip (7z).
 * Uses the same approach as extractComicInfoXMLFromZip since p7zip handles RAR files.
 */
const extractComicInfoXMLFromRarUsingP7zip = async (
	filePath: string,
	mimeType: string,
	targetDirectory: string,
	fileNameWithoutExtension: string,
	extension: string
): Promise<any> => {
	let filesToWriteToDisk = { coverFile: null, comicInfoXML: null };
	const extractionTargets = [];

	// read the archive using p7zip (supports RAR)
	let filesFromArchive = await p7zip.read(path.resolve(filePath));

	console.log(
		`RAR (p7zip): ${filesFromArchive.files.length} total entries in ${filePath}`
	);

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

	if (files.length === 0) {
		throw new Error(`No image files found in RAR archive: ${filePath}`);
	}

	// Push the first file (cover) to our extraction target
	extractionTargets.push(files[0].name);
	filesToWriteToDisk.coverFile = path.basename(files[0].name);

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
	const coverBaseName = sanitize(path.basename(
		filesToWriteToDisk.coverFile,
		path.extname(filesToWriteToDisk.coverFile)
	));
	const coverOutputFile = `${targetDirectory}/${coverBaseName}.png`;
	const coverInputFile = `${targetDirectory}/${filesToWriteToDisk.coverFile}`;

	await sharp(coverInputFile)
		.resize(275)
		.toFormat("png")
		.toFile(coverOutputFile);

	const comicInfoResult = await comicInfoXMLPromise;

	const coverResult = {
		filePath,
		name: fileNameWithoutExtension,
		extension,
		mimeType,
		containedIn: targetDirectory,
		fileSize: fse.statSync(filePath).size,
		cover: {
			filePath: path.relative(process.cwd(), coverOutputFile),
		},
	};

	return [comicInfoResult, coverResult];
};

export const extractComicInfoXMLFromZip = async (
	filePath: string,
	mimeType: string
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

		if (files.length === 0) {
			throw new Error(`No image files found in ZIP archive: ${filePath}`);
		}

		// Push the first file (cover) to our extraction target
		extractionTargets.push(files[0].name);
		filesToWriteToDisk.coverFile = path.basename(files[0].name);

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
		const coverBaseName = sanitize(path.basename(filesToWriteToDisk.coverFile, path.extname(filesToWriteToDisk.coverFile)));
		const coverOutputFile = `${targetDirectory}/${coverBaseName}.png`;
		const coverInputFile = `${targetDirectory}/${filesToWriteToDisk.coverFile}`;

		await sharp(coverInputFile)
			.resize(275)
			.toFormat("png")
			.toFile(coverOutputFile);

		const comicInfoResult = await comicInfoXMLPromise;

		const coverResult = {
			filePath,
			name: fileNameWithoutExtension,
			extension,
			mimeType,
			containedIn: targetDirectory,
			fileSize: fse.statSync(filePath).size,
			cover: {
				filePath: path.relative(process.cwd(), coverOutputFile),
			},
		};

		return [comicInfoResult, coverResult];
	} catch (err) {
		throw err;
	}
};

export const extractFromArchive = async (filePath: string) => {
	console.info(`Unrar is located at: ${UNRAR_BIN_PATH}`);
	console.info(`p7zip is located at: ${process.env.SEVENZ_BINARY_PATH}`);

	const mimeType = await getMimeType(filePath);
	console.log(`File has the following mime-type: ${mimeType}`);
	switch (mimeType) {
		case "application/x-7z-compressed; charset=binary":
		case "application/zip; charset=binary":
			const cbzResult = await extractComicInfoXMLFromZip(
				filePath,
				mimeType
			);
			if (!Array.isArray(cbzResult)) {
				throw new Error(`extractComicInfoXMLFromZip returned a non-iterable result for: ${filePath}`);
			}
			return Object.assign({}, ...cbzResult);

		case "application/x-rar; charset=binary":
			const cbrResult = await extractComicInfoXMLFromRar(
				filePath,
				mimeType
			);
			if (!Array.isArray(cbrResult)) {
				throw new Error(`extractComicInfoXMLFromRar returned a non-iterable result for: ${filePath}`);
			}
			return Object.assign({}, ...cbrResult);

		default:
			console.error(
				"Error inferring filetype for comicinfo.xml extraction."
			);
			throw new MoleculerError({}, 500, "FILETYPE_INFERENCE_ERROR", {
				data: { message: "Cannot infer filetype." },
			});
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
	const mimeType = await getMimeType(filePath);
	console.log(`File has the following mime-type: ${mimeType}`);
	switch (mimeType) {
		case "application/x-7z-compressed; charset=binary":
		case "application/zip; charset=binary":
			return await uncompressZipArchive(filePath, {
				...options,
				mimeType,
			});
		case "application/x-rar; charset=binary":
			return await uncompressRarArchive(filePath, {
				...options,
				mimeType,
			});
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
	const targetDirectory = `${USERDATA_DIRECTORY}/expanded/${options.purpose}/${sanitize(fileNameWithoutExtension)}`;
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
	const targetDirectory = `${USERDATA_DIRECTORY}/expanded/${options.purpose}/${sanitize(fileNameWithoutExtension)}`;
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

/**
 * Method that resizes an image in a specified location based on parameters provided
 * @param {string} directoryPath
 * @param {any} file
 * @param {any} options
 * @returns {any}
 */
export const resizeImage = (directoryPath: string, file: any, options: any) => {
	const { baseWidth } = options.imageResizeOptions;
	const sharpResizeInstance = sharp().resize(baseWidth).toFormat("jpg");
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
