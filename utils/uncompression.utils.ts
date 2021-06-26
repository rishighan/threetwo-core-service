/*
 * MIT License
 *
 * Copyright (c) 2021 Rishi Ghan
 *
 The MIT License (MIT)

Copyright (c) 2021 Rishi Ghan

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

import { createReadStream, createWriteStream } from "fs";
const fse = require("fs-extra");

import { default as unzipper } from "unzipper";
import _ from "lodash";
import { each, isEmpty, map } from "lodash";
import {
	IExplodedPathResponse,
	IExtractComicBookCoverErrorResponse,
	IExtractedComicBookCoverFile,
	IExtractionOptions,
	IFolderData,
} from "threetwo-ui-typings";
import { logger } from "./logger.utils";
import { validateComicBookMetadata } from "../utils/validation.utils";
import { constructPaths, explodePath } from "../utils/file.utils";
import { resizeImage } from "./imagetransformation.utils";
const { writeFile, readFile } = require("fs").promises;
const unrarer = require("node-unrar-js");

export const unrar = async (
	extractionOptions: IExtractionOptions,
	walkedFolder: IFolderData
): Promise<
	| IExtractedComicBookCoverFile
	| IExtractedComicBookCoverFile[]
	| IExtractComicBookCoverErrorResponse
> => {
	const paths = constructPaths(extractionOptions, walkedFolder);
	const directoryOptions = {
		mode: 0o2775,
	};
	const fileBuffer = await readFile(paths.inputFilePath).catch((err) =>
		console.error("Failed to read file", err)
	);
	try {
		await fse.ensureDir(paths.targetPath, directoryOptions);
		logger.info(`${paths.targetPath} was created.`);
	} catch (error) {
		logger.error(`${error}: Couldn't create directory.`);
	}

	const extractor = await unrarer.createExtractorFromData({
		data: fileBuffer,
	});

	switch (extractionOptions.extractTarget) {
		case "cover":
			console.log(walkedFolder);
			return new Promise(async (resolve, reject) => {
				try {
					let fileNameToExtract = "";
					const list = extractor.getFileList();
					const fileHeaders = [...list.fileHeaders];
					each(fileHeaders, async (fileHeader) => {
						const fileName = explodePath(fileHeader.name).fileName;
						if (
							fileName !== "" &&
							fileHeader.flags.directory === false &&
							isEmpty(fileNameToExtract)
						) {
							logger.info(
								`Attempting to write ${fileHeader.name}`
							);
							fileNameToExtract = fileHeader.name;
							const file = extractor.extract({
								files: [fileHeader.name],
							});
							const extractedFile = [...file.files][0];
							const fileArrayBuffer = extractedFile.extraction;

							// Resize it to the specified width
							const outputFilePath =
								paths.targetPath + "/" + fileName;
							await resizeImage(
								fileArrayBuffer,
								outputFilePath,
								200
							);
							let comicBookMetadata = {
								name: `${fileName}`,
								path: paths.targetPath,
								fileSize: fileHeader.packSize,
								containedIn: walkedFolder.containedIn,
							};
							if (validateComicBookMetadata(comicBookMetadata)) {
								resolve(comicBookMetadata);
							}
						}
					});
				} catch (error) {
					logger.error(`${error}: Couldn't write file.`);
					reject(error);
				}
			});

		case "all":
			return new Promise(async (resolve, reject) => {
				try {
					const files = extractor.extract({});
					const extractedFiles = [...files.files];
					const comicBookCoverFiles: IExtractedComicBookCoverFile[] =
						[];
					for (const file of extractedFiles) {
						logger.info(
							`Attempting to write ${file.fileHeader.name}`
						);
						const fileBuffer = file.extraction;
						const fileName = explodePath(
							file.fileHeader.name
						).fileName;

						if (
							fileName !== "" &&
							file.fileHeader.flags.directory === false
						) {
							await writeFile(
								paths.targetPath + "/" + fileName,
								fileBuffer
							);
						}
						comicBookCoverFiles.push({
							name: `${file.fileHeader.name}`,
							path: paths.targetPath,
							fileSize: file.fileHeader.packSize,
							containedIn: walkedFolder.containedIn,
						});
					}
					resolve(_.flatten(comicBookCoverFiles));
				} catch (error) {
					resolve({
						message: `${error}`,
						errorCode: "500",
						data: walkedFolder.name,
					});
				}
			});

		default:
			return {
				message: "File format not supported, yet.",
				errorCode: "90",
				data: "asda",
			};
	}
};

export const unzip = async (
	extractionOptions: IExtractionOptions,
	walkedFolder: IFolderData
): Promise<
	| IExtractedComicBookCoverFile[]
	| IExtractedComicBookCoverFile
	| IExtractComicBookCoverErrorResponse
> => {
	const directoryOptions = {
		mode: 0o2775,
	};
	const paths = constructPaths(extractionOptions, walkedFolder);
	const extractedFiles: IExtractedComicBookCoverFile[] = [];

	try {
		await fse.ensureDir(paths.targetPath, directoryOptions);
		logger.info(`${paths.targetPath} was created or already exists.`);
	} catch (error) {
		logger.error(`${error} Couldn't create directory.`);
	}

	const zip = createReadStream(paths.inputFilePath).pipe(
		unzipper.Parse({ forceStream: true })
	);
	for await (const entry of zip) {
		const fileName = explodePath(entry.path).fileName;
		const size = entry.vars.uncompressedSize;
		if (
			extractedFiles.length === 1 &&
			extractionOptions.extractTarget === "cover"
		) {
			break;
		}
		if (fileName !== "" && entry.type !== "Directory") {
			logger.info(`Attempting to write ${fileName}`);
			entry
				.pipe(createWriteStream(paths.targetPath + "/" + fileName))
				.on("finish", () => {
					extractedFiles.push({
						name: fileName,
						fileSize: size,
						path: paths.targetPath,
						containedIn: walkedFolder.containedIn,
					});
				});
		}
		entry.autodrain();
	}

	return new Promise(async (resolve, reject) => {
		logger.info("");
		if (extractionOptions.extractTarget === "cover") {
			resolve(extractedFiles[0]);
		} else {
			resolve(extractedFiles);
		}
	});
};

export const extractArchive = async (
	extractionOptions: IExtractionOptions,
	walkedFolder: IFolderData
): Promise<
	| IExtractedComicBookCoverFile
	| IExtractedComicBookCoverFile[]
	| IExtractComicBookCoverErrorResponse
> => {
	switch (walkedFolder.extension) {
		case ".cbz":
			return await unzip(extractionOptions, walkedFolder);
		case ".cbr":
			return await unrar(extractionOptions, walkedFolder);
		default:
			return {
				message: "File format not supported, yet.",
				errorCode: "90",
				data: `${extractionOptions}`,
			};
	}
};

export const getCovers = async (
	options: IExtractionOptions,
	walkedFolders: IFolderData[]
): Promise<
	| IExtractedComicBookCoverFile
	| IExtractComicBookCoverErrorResponse
	| IExtractedComicBookCoverFile[]
	| (
			| IExtractedComicBookCoverFile
			| IExtractComicBookCoverErrorResponse
			| IExtractedComicBookCoverFile[]
	  )[]
	| IExtractComicBookCoverErrorResponse
> => {
	switch (options.extractionMode) {
		case "bulk":
			const extractedDataPromises = map(
				walkedFolders,
				async (folder) => await extractArchive(options, folder)
			);
			return Promise.all(extractedDataPromises).then((data) =>
				_.flatten(data)
			);
		case "single":
			return await extractArchive(options, walkedFolders[0]);
		default:
			logger.error("Unknown extraction mode selected.");
			return {
				message: "Unknown extraction mode selected.",
				errorCode: "90",
				data: `${options}`,
			};
	}
};
