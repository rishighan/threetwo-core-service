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

import { createReadStream, createWriteStream, readFileSync, stat } from "fs";
const fse = require("fs-extra");
import path from "path";
import { each, isEmpty, map, flatten } from "lodash";

import {
	IExplodedPathResponse,
	IExtractComicBookCoverErrorResponse,
	IExtractedComicBookCoverFile,
	IExtractionOptions,
	IFolderData,
	ISharpResizedImageStats,
} from "threetwo-ui-typings";
import { logger } from "./logger.utils";
import { validateComicBookMetadata } from "../utils/validation.utils";
import {
	constructPaths,
	explodePath,
	isValidImageFileExtension,
} from "../utils/file.utils";
import { resizeImage } from "./imagetransformation.utils";
const { writeFile, readFile } = require("fs").promises;

import sevenBin from "7zip-bin";
import { list, extract } from "node-7z";
const pathTo7zip = sevenBin.path7za;
const unrarer = require("node-unrar-js");
const { Calibre } = require("node-calibre");

export const extractCoverFromFile = async (
	extractionOptions: IExtractionOptions,
	walkedFolder: IFolderData
): Promise<
	| IExtractedComicBookCoverFile
	| IExtractedComicBookCoverFile[]
	| IExtractComicBookCoverErrorResponse
> => {
	return new Promise(async (resolve, reject) => {
		try {
			const constructedPaths = constructPaths(extractionOptions, walkedFolder);
			const calibre = new Calibre({
				library: path.resolve("./userdata/calibre-lib"),
			});
			// create directory
			const directoryOptions = {
				mode: 0o2775,
			};
		
			try {
				await fse.ensureDir(constructedPaths.targetPath, directoryOptions);
				logger.info(`${constructedPaths.targetPath} was created.`);
			} catch (error) {
				logger.error(`${error}: Couldn't create directory.`);
			}
			// extract the cover 
			let result: string;
			const targetCoverImageFilePath = path.resolve(constructedPaths.targetPath + "/" + walkedFolder.name + "_cover.jpg")
			result = await calibre.run(
				"ebook-meta",
				[path.resolve(constructedPaths.inputFilePath)],
				{
					getCover: targetCoverImageFilePath,
				}
			);
			// create renditions
			const renditionPath = constructedPaths.targetPath + "/" + walkedFolder.name + "_200px.jpg";
			const stats:ISharpResizedImageStats = await resizeImage(targetCoverImageFilePath, path.resolve(renditionPath), 200);

			resolve({
				name: walkedFolder.name,
				path: renditionPath, 
				fileSize: stats.size,
				extension: path.extname(constructedPaths.inputFilePath),
				containedIn: walkedFolder.containedIn,
				calibreMetadata: {
					coverWriteResult: result,
				}
			});
		} catch (error) {
			console.log(error);
		}
	});
};

export const unzip = async (
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

	try {
		await fse.ensureDir(paths.targetPath, directoryOptions);
		logger.info(`${paths.targetPath} was created.`);
	} catch (error) {
		logger.error(`${error}: Couldn't create directory.`);
	}
	switch (extractionOptions.extractTarget) {
		case "cover":
			return new Promise((resolve, reject) => {
				try {
					let firstImg;

					const listStream = list(path.resolve(paths.inputFilePath), {
						$cherryPick: ["*.png", "*.jpg", , "*.jpeg", "*.webp"],
						$bin: pathTo7zip,
						$progress: true,
						recursive: true,
					});

					listStream.on("data", (data) => {
						if (!firstImg) firstImg = data;
					});
					listStream.on("end", () => {
						if (firstImg) {
							const extractStream = extract(
								paths.inputFilePath,
								paths.targetPath,
								{
									$cherryPick: firstImg.file,
									$bin: pathTo7zip,
									$progress: true,
									recursive: true,
								}
							);
							extractStream.on("data", (data) => {
								//do something with the image
								console.log(data);
							});
						}
					});
				} catch (error) {
					console.log(error);
				}
				// resolve({
				// 	name: `${extractedFiles[0].fileHeader.name}`,
				// 	path: paths.targetPath,
				// 	fileSize: extractedFiles[0].fileHeader.packSize,
				// 	containedIn: walkedFolder.containedIn,
				//
				// })
			});

		case "all":
			break;

		default:
			return {
				message: "File format not supported, yet.",
				errorCode: "90",
				data: "asda",
			};
	}
};

export const unrar = async (
	extractionOptions: IExtractionOptions,
	walkedFolder: IFolderData
): Promise<IExtractedComicBookCoverFile> => {
	switch (extractionOptions.extractTarget) {
		case "cover":
			return new Promise(async (resolve, reject) => {
				const paths = constructPaths(extractionOptions, walkedFolder);
				const directoryOptions = {
					mode: 0o2775,
				};
				try {
					// read the file into a buffer
					const fileBuffer = await readFile(
						paths.inputFilePath
					).catch((err) => console.error("Failed to read file", err));
					try {
						await fse.ensureDir(paths.targetPath, directoryOptions);
						logger.info(`${paths.targetPath} was created.`);
					} catch (error) {
						logger.error(`${error}: Couldn't create directory.`);
					}

					const extractor = await unrarer.createExtractorFromData({
						data: fileBuffer,
					});
					const files = extractor.extract({});
					const extractedFiles = [...files.files];

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
					}
					resolve({
						name: `${extractedFiles[0].fileHeader.name}`,
						path: paths.targetPath,
						extension: path.extname(extractedFiles[0].fileHeader.name),
						fileSize: extractedFiles[0].fileHeader.packSize,
						containedIn: walkedFolder.containedIn,
						calibreMetadata: {
							coverWriteResult: "",
						}
					});
				} catch (error) {
					logger.error(`${error}: Couldn't write file.`);
					reject(error);
				}
			});
		case "all":
			break;
		default:
			break;
	}
};
