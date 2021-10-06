const sharp = require("sharp");
import { logger } from "./logger.utils";
import { ISharpResizedImageStats } from "threetwo-ui-typings";
const imghash = require("imghash");
const leven = require("leven");
import { isNull, reject } from "lodash";

export const extractMetadataFromImage = async (
	imageFilePath: string
): Promise<unknown> => {
	const image = await sharp(imageFilePath)
		.metadata()
		.then((metadata) => {
			return metadata;
		});
	return image;
};

export const resizeImage = async (
	imageFile: string | Buffer,
	outputPath: string,
	newWidth: number,
	newHeight?: number
): Promise<ISharpResizedImageStats> => {
	const buffer = await sharp(imageFile)
		.resize(newWidth, newHeight, {
			fit: sharp.fit.inside,
			withoutEnlargement: true,
		})
		.toBuffer();
	return await sharp(buffer).toFile(`${outputPath}`, (err, info) => {
		if (err) {
			logger.error("Failed to resize image:");
			logger.error(err);
			return err;
		}

		logger.info("Image file resized with the following parameters:");
		logger.info(info);
		return info;
	});
};

export const calculateLevenshteinDistance = async (
	imagePath1: string,
	imagePath2: string
): Promise<Record<string, unknown>> => {
	const hash1 = await imghash.hash(imagePath1);
	const hash2 = await imghash.hash(imagePath2);
	if (!isNull(hash1) && !isNull(hash2)) {
		return new Promise((resolve, reject) => {
			resolve({ levenshteinDistance: leven(hash1, hash2) });
		});
	} else {
		reject("Can't calculate the Levenshtein distance");
	}
};
