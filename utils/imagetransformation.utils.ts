const sharp = require("sharp");
import { ISharpResizedImageStats } from "threetwo-ui-typings";
const imghash = require("imghash");
const leven = require("leven");
import { isNull, reject } from "lodash";
import Jimp from "jimp";
const { Image } = require("image-js");

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
};

export const analyze = async (inputFilePath: string | Buffer) => {
	const stats = await sharp(inputFilePath).stats();
	// const { r, g, b } = dominant;
	return stats;
};

export const getColorHistogramData = async (
	inputFilePath: string | Buffer,
	isValueHistogram: Boolean
) => {
	return new Promise(async (resolve, reject) => {
		let image = await Image.load(inputFilePath);
		console.log(image.getHistograms());
		const histograms = image.getHistograms();
		let rgb_values = {
			r: histograms[0],
			g: histograms[1],
			b: histograms[2],
		};

		resolve(rgb_values);
	}).catch((err) => reject(err));
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
