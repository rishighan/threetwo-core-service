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

import { promises as fs } from "fs";
const fse = require("fs-extra");
const Unrar = require("unrar");
import path, { parse } from "path";
import {
	IExtractComicBookCoverErrorResponse,
	IExtractedComicBookCoverFile,
	IExtractionOptions,
	IFolderData,
	ISharpResizedImageStats,
} from "threetwo-ui-typings";
import sharp from "sharp";
import {
	explodePath,
	getFileConstituents,
	walkFolder,
} from "../utils/file.utils";
import { resizeImage } from "./imagetransformation.utils";
import { each, filter, isNil, isUndefined, remove } from "lodash";
import { convertXMLToJSON } from "./xml.utils";
import sevenBin from "7zip-bin";
import { extract, list } from "node-7z";
const pathTo7zip = sevenBin.path7za;
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
			const {
				extension,
				fileNameWithExtension,
				fileNameWithoutExtension,
			} = getFileConstituents(filePath);

			const targetDirectory = `${USERDATA_DIRECTORY}/covers/${fileNameWithoutExtension}`;

			await fse.ensureDir(targetDirectory, directoryOptions);
			console.info(`%s was created.`, targetDirectory);

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

export const extractComicInfoXMLFromRar = async (
	filePath: string,
	fileToExtract: string
) => {
	try {
		// Create the target directory
		const directoryOptions = {
			mode: 0o2775,
		};
		const { fileNameWithoutExtension } = getFileConstituents(filePath);
		const targetDirectory = `${USERDATA_DIRECTORY}/covers/${fileNameWithoutExtension}`;
		await fse.ensureDir(targetDirectory, directoryOptions);
		console.info(`%s was created.`, targetDirectory);

		const archive = new Unrar(path.resolve(filePath));
		// or
		// var archive = new Unrar({
		//   path:      protectedArchivePath,
		//   arguments: ['-pPassword'],
		//   bin: pathToUnrarBin // Default: unrar
		// });
		archive.list(function (err, entries) {
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
			const sharpStream = sharp().resize(200, 200);
			const coverImageStream = archive
				.stream(files[0].name)
				.on("error", console.error)
				// .pipe(
				// 	require("fs").createWriteStream(`${targetDirectory}/0.jpg`)
				// );
				.pipe(sharpStream)
				.toFile(`${targetDirectory}/0.jpg`, (err, info) => {
					if (err) {
						console.log("Failed to resize image:");
						console.log(err);
						return err;
					}

					console.log(
						"Image file resized with the following parameters: %o",
						info
					);
					return info;
				});
			if (!isUndefined(comicInfoXML[0])) {
				console.log(comicInfoXML);
				const comicinfoStream = archive.stream(comicInfoXML[0]["name"]);
				comicinfoStream.on("error", console.error);
				comicinfoStream.pipe(
					require("fs").createWriteStream(
						`${targetDirectory}/dhanda.xml`
					)
				);
			}
		});

		// const extracted = extractor.extract({
		// 	files: ({ name }) => name.toLowerCase() === 'comicinfo.xml',
		//   });
		// const files = [...extracted.files]; //load the files
		// if (!isUndefined(files[0])) {
		// 	console.log(
		// 		`comicinfo.xml detected in ${filePath}, attempting extraction...`
		// 	);
		// 	const fileContents = String.fromCharCode.apply(
		// 		null,
		// 		files[0].extraction
		// 	);
		// 	const parsedJSON = await convertXMLToJSON(fileContents);
		// 	console.log(parsedJSON);
		// 	return parsedJSON.comicinfo;
		// }
	} catch (error) {
		throw new Error(error);
	}
};

export const extractComicInfoXMLFromZip = async (
	filePath: string,
	outputDirectory: string
) => {
	try {
		const listStream = list(path.resolve(filePath), {
			$cherryPick: ["*.png", "*.jpg", , "*.jpeg", "*.webp", "*.xml"],
			$bin: pathTo7zip,
		});
		const fileList = [];
		listStream
			.on("data", (chunk) => fileList.push(chunk))
			.on("end", async () => {
				// Look for ComicInfo.xml
				const comicInfoXML = remove(fileList, (item) =>
					!isUndefined(item)
						? path.basename(item.file).toLowerCase() ===
						  "comicinfo.xml"
						: undefined
				);
				// Sort the file list array naturally
				const sortedFileList = fileList.sort((a, b) =>
					a.file.toLowerCase().localeCompare(b.file.toLowerCase())
				);

				// Create the target directory
				const directoryOptions = {
					mode: 0o2775,
				};
				const { fileNameWithoutExtension } =
					getFileConstituents(filePath);
				const targetDirectory = `${USERDATA_DIRECTORY}/covers/${fileNameWithoutExtension}`;
				await fse.ensureDir(targetDirectory, directoryOptions);
				console.info(`%s was created.`, targetDirectory);

				// files to write
				const filesToWrite = [];
				if (
					!isUndefined(sortedFileList[0]) &&
					!isUndefined(sortedFileList[0].file)
				) {
					filesToWrite.push(sortedFileList[0].file);
				}

				// if ComicInfo.xml present, include it in the file list to be written to disk
				if (!isUndefined(comicInfoXML[0])) {
					console.log(`ComicInfo.xml detected in ${filePath}`);
					filesToWrite.push(comicInfoXML[0].file);
				}

				// Remove nulls, undefined and empty elements from the file list
				const filteredFilesToWrite = filesToWrite.filter(
					(item) => !isUndefined(item)
				);
				const extractStream = extract(
					`${path.resolve(filePath)}`,
					targetDirectory,
					{
						$cherryPick: filteredFilesToWrite,
						$bin: pathTo7zip,
					}
				);
				extractStream.on("data", (data) => {
					//do something with the image
					console.log("ZIP:", data);
				});
			});

		// for await (const chunk of foo) {
		// 	if (chunk.status === "extracted") {
		// 		console.log(
		// 			`comicinfo.xml detected in ${filePath}, attempting extraction...`
		// 		);
		// 		const fileContents = await fs.readFile(
		// 			path.resolve(`${outputDirectory}/${chunk.file}`),
		// 			"utf8"
		// 		);
		// 		const parsedJSON = await convertXMLToJSON(
		// 			Buffer.from(fileContents)
		// 		);
		// 		console.log(parsedJSON);
		// 		return parsedJSON.comicinfo;
		// 	}
		// }
	} catch (error) {
		throw new Error(error);
	}
};

export const extractFromArchive = async (
	filePath: string,
	outputDirectory: string,
	extension: string
) => {
	switch (extension) {
		case ".cbz":
			console.log(
				"Detected file type is cbz, looking for comicinfo.xml..."
			);
			return await extractComicInfoXMLFromZip(filePath, outputDirectory);

		case ".cbr":
			console.log(
				"Detected file type is cbr, looking for comicinfo.xml..."
			);
			return await extractComicInfoXMLFromRar(filePath, outputDirectory);

		default:
			console.log(
				"Error inferring filetype for comicinfo.xml extraction."
			);
			break;
	}
};
