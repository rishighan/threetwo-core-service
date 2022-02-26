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
import { isNil, isUndefined } from "lodash";
import { convertXMLToJSON } from "./xml.utils";
const sevenZip = require("7zip-min");
const unrar = require("node-unrar-js");
const { Calibre } = require("node-calibre");
import { USERDATA_DIRECTORY, COMICS_DIRECTORY } from "../constants/directories";

export const extractCoverFromFile2 = async (
	fileObject: any
): Promise<IExtractedComicBookCoverFile> => {
	try {
		const { filePath, fileSize } = fileObject;

		const calibre = new Calibre();
		console.info(`Initiating extraction process for path ${filePath}`);

		// 1. Check for process.env.COMICS_DIRECTORY and process.env.USERDATA_DIRECTORY
		if (!isNil(USERDATA_DIRECTORY)) {
			// 2. Create the directory to which the cover image will be extracted
			console.info(
				"Attempting to create target directory for cover extraction..."
			);
			const directoryOptions = {
				mode: 0o2775,
			};
			const extension = path.extname(filePath);
			const fileNameWithExtension = path.basename(filePath);
			const fileNameWithoutExtension = path.basename(
				filePath,
				path.extname(filePath)
			);
			const targetDirectory = `${USERDATA_DIRECTORY}/covers/${fileNameWithoutExtension}`;

			await fse.ensureDir(targetDirectory, directoryOptions);
			console.info(`%s was created.`, targetDirectory);

			// 2.1 look for comicinfo.xml
			extractFileFromArchive(filePath, targetDirectory, extension);

			// 3. extract the cover
			console.info(`Starting cover extraction...`);
			let result: string;
			const targetCoverImageFilePath = path.resolve(
				targetDirectory + "/" + fileNameWithoutExtension + "_cover.jpg"
			);
			const ebookMetaPath = process.env.CALIBRE_EBOOK_META_PATH
				? `${process.env.CALIBRE_EBOOK_META_PATH}`
				: `ebook-meta`;
			result = await calibre.run(ebookMetaPath, [filePath], {
				getCover: targetCoverImageFilePath,
			});
			console.info(
				`ebook-meta ran with the following result: %o`,
				result
			);

			// 4. create rendition path
			const renditionPath =
				targetDirectory + "/" + fileNameWithoutExtension + "_275px.jpg";

			// 5. resize image
			await resizeImage(
				targetCoverImageFilePath,
				path.resolve(renditionPath),
				275
			);
			return {
				name: fileNameWithoutExtension,
				filePath,
				fileSize,
				extension,
				cover: {
					filePath: path.relative(process.cwd(), renditionPath),
				},
				containedIn: path.resolve(fileNameWithExtension),
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

export const extractFileFromRar = async (
	filePath: string,
	fileToExtract: string
) => {
	try {
		// Read the archive file into a typedArray
		const fileBuffer = await fse
			.readFile(filePath)
			.catch((err) => console.error("Failed to read file", err));
		const extractor = await unrar.createExtractorFromData({
			data: fileBuffer,
		});

		const list = extractor.getFileList();
		const listArcHeader = list.arcHeader; // archive header
		const fileHeaders = [...list.fileHeaders]; // load the file headers

		const extracted = extractor.extract({ files: ["ComicInfo.xml"] });
		const files = [...extracted.files]; //load the files
		console.log("asdas", files[0]);
		if(!isUndefined(files[0])) {
			const trin = String.fromCharCode.apply(null, files[0].extraction)
		    const foo =	await convertXMLToJSON(trin);
			console.log(foo);
		}
	} catch (error) {
		throw new Error(error);
	}
};

export const extractFileFromZip = async (
	filePath: string,
	outputDirectory: string
) => {
	const foo = sevenZip.cmd(
		["e", path.resolve(filePath), outputDirectory, "*.xml"],
		(err) => {
			console.log(err);
		}
	);
	return foo;
};

export const extractFileFromArchive = async (
	filePath: string,
	outputDirectory: string,
	extension: string
) => {
	console.log(extension);
	switch (extension) {
		case ".cbz":
			console.log("cbz");
			extractFileFromZip(filePath, outputDirectory);
			break;

		case ".cbr":
			console.log("cbr");
			extractFileFromRar(filePath, outputDirectory);
			break;

		default:
			console.log("error na rao");
			break;
	}
};
