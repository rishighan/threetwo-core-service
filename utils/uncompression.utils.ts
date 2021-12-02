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

import { constructPaths, explodePath, walkFolder } from "../utils/file.utils";
import { resizeImage } from "./imagetransformation.utils";
import { isNil } from "lodash";
const sevenZip = require("7zip-min");
const unrar = require("node-unrar-js");
const { Calibre } = require("node-calibre");
import { USERDATA_DIRECTORY, COMICS_DIRECTORY } from "../constants/directories";

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
				console.info(`${constructedPaths.targetPath} was created.`);
			} catch (error) {
				console.error(`${error}: Couldn't create directory.`);
			}

			// extract the cover
			let result: string;
			const targetCoverImageFilePath = path.resolve(
				constructedPaths.targetPath +
					"/" +
					walkedFolder.name +
					"_cover.jpg"
			);
			const ebookMetaPath = process.env.CALIBRE_EBOOK_META_PATH
				? `${process.env.CALIBRE_EBOOK_META_PATH}`
				: `ebook-meta`;
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
			console.info(error);
		}
	});
};

export const extractCoverFromFile2 = async (
	fileObject: any
): Promise<any> => {
	try {
		const { filePath, size} = fileObject;
		
		const calibre = new Calibre();
		console.info(`Initiating extraction process for path ${filePath}`);

		// 1. Check for process.env.COMICS_DIRECTORY and process.env.USERDATA_DIRECTORY
		if (!isNil(USERDATA_DIRECTORY)) {
			// 2. Create the directory to which the cover image will be extracted
			console.info("Attempting to create target directory for cover extraction...");
			const directoryOptions = {
				mode: 0o2775,
			};
			const fileNameWithExtension = path.basename(filePath);
			const fileNameWithoutExtension = path.basename(filePath, path.extname(filePath));
			const targetDirectory = `${USERDATA_DIRECTORY}/covers/${fileNameWithoutExtension}`;
			
			await fse.ensureDir(targetDirectory, directoryOptions);
			console.info(`%s was created.`, targetDirectory);

			// 3. extract the cover
			console.info(`Starting cover extraction...`);
			let result: string;
			const targetCoverImageFilePath = path.resolve(
				targetDirectory +
					"/" +
					fileNameWithoutExtension +
					"_cover.jpg"
			);
			const ebookMetaPath = process.env.CALIBRE_EBOOK_META_PATH
				? `${process.env.CALIBRE_EBOOK_META_PATH}`
				: `ebook-meta`;
			result = await calibre.run(
				ebookMetaPath,
				[filePath],
				{
					getCover: targetCoverImageFilePath,
				}
			);
			console.info(`ebook-meta ran with the following result: %o`, result)

			// 4. create rendition path
			const renditionPath =
				targetDirectory+
				"/" +
				fileNameWithoutExtension +
				"_200px.jpg";

			// 5. resize image
			await resizeImage(
				targetCoverImageFilePath,
				path.resolve(renditionPath),
				200
			);
			return {
				name: fileNameWithoutExtension,
				path:  filePath,
				fileSize: size,
				extension: path.extname(filePath),
				cover: {
					filePath: path.relative(process.cwd(),renditionPath),
				},
				containedIn: path.dirname(fileNameWithExtension),
				calibreMetadata: {
					coverWriteResult: result,
				},
			};
		}
	} catch (error) {
		console.error(error);
	}
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
		console.info("Unrar initiating.");
		await fse.ensureDir(options.targetExtractionFolder, directoryOptions);
		console.info(`${options.targetExtractionFolder} was created.`);

		const extractor = await unrar.createExtractorFromData({
			data: fileBuffer,
		});
		const files = extractor.extract({});
		const extractedFiles = [...files.files];
		for (const file of extractedFiles) {
			console.info(`Attempting to write ${file.fileHeader.name}`);
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
		console.info(`${error}`);
	}
};
