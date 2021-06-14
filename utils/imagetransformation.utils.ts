const sharp = require("sharp");
import { logger } from "./logger.utils";
import { explodePath } from "./file.utils";
import { isUndefined } from "lodash";

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
	imageFilePath: string,
	outputPath: string,
	newWidth: number,
	newHeight?: number
): Promise<unknown> => {
	return await sharp(imageFilePath)
		.resize(newWidth)
		.toFile(`${outputPath}`, (err, info) => {
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
