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

const fse = require("fs-extra");
import path from "path";

import {
	IExtractComicBookCoverErrorResponse,
	IExtractedComicBookCoverFile,
	IExtractionOptions,
	IFolderData,
	ISharpResizedImageStats,
} from "threetwo-ui-typings";
import { logger } from "./logger.utils";
import { constructPaths, explodePath, walkFolder } from "../utils/file.utils";
import { resizeImage } from "./imagetransformation.utils";

const sevenZip = require("7zip-min");
const unrar = require("node-unrar-js");
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
			const constructedPaths = constructPaths(
				extractionOptions,
				walkedFolder
			);
			const calibre = new Calibre();

			// create directory
			const directoryOptions = {
				mode: 0o2775,
			};

			try {
				await fse.ensureDir(
					constructedPaths.targetPath,
					directoryOptions
				);
				logger.info(`${constructedPaths.targetPath} was created.`);
			} catch (error) {
				logger.error(`${error}: Couldn't create directory.`);
			}

			// extract the cover
			let result: string;
			const targetCoverImageFilePath = path.resolve(
				constructedPaths.targetPath +
					"/" +
					walkedFolder.name +
					"_cover.jpg"
			);
			const ebookMetaPath =
				`${process.env.CALIBRE_EBOOK_META_PATH}` || `ebook-meta`;
			result = await calibre.run(
				ebookMetaPath,
				[constructedPaths.inputFilePath],
				{
					getCover: targetCoverImageFilePath,
				}
			);

			// create renditions
			const renditionPath =
				constructedPaths.targetPath +
				"/" +
				walkedFolder.name +
				"_200px.jpg";
			const stats: ISharpResizedImageStats = await resizeImage(
				targetCoverImageFilePath,
				path.resolve(renditionPath),
				200
			);

			resolve({
				name: walkedFolder.name,
				path: renditionPath,
				fileSize: walkedFolder.fileSize,
				extension: path.extname(constructedPaths.inputFilePath),
				cover: {
					filePath: renditionPath,
				},
				containedIn: walkedFolder.containedIn,
				calibreMetadata: {
					coverWriteResult: result,
				},
			});
		} catch (error) {
			console.log(error);
		}
	});
};

export const unrarArchive = async (
	filePath: string,
	options: IExtractionOptions
) => {
	// create directory
	const directoryOptions = {
		mode: 0o2775,
	};

	const fileBuffer = await fse
		.readFile(filePath)
		.catch((err) => console.error("Failed to read file", err));
	try {
		logger.info("Unrar initiating.");
		await fse.ensureDir(options.targetExtractionFolder, directoryOptions);
		logger.info(`${options.targetExtractionFolder} was created.`);

		const extractor = await unrar.createExtractorFromData({
			data: fileBuffer,
		});
		const files = extractor.extract({});
		const extractedFiles = [...files.files];
		for (const file of extractedFiles) {
			logger.info(`Attempting to write ${file.fileHeader.name}`);
			const fileBuffer = file.extraction;
			const fileName = explodePath(file.fileHeader.name).fileName;
			// resize image
			await resizeImage(
				fileBuffer,
				path.resolve(options.targetExtractionFolder + "/" + fileName),
				200
			);
		}
		// walk the newly created folder and return results
		return await walkFolder(options.targetExtractionFolder, [
			".jpg",
			".png",
			".jpeg",
		]);
	} catch (error) {
		logger.error(`${error}`);
	}
};
