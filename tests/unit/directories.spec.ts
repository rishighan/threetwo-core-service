/**
 * @jest-environment node
 */
import { describe, it, expect, afterEach } from "@jest/globals";

const MODULE_PATH = "../../constants/directories";

describe("directories constants", () => {
	const originalComicsDir = process.env.COMICS_DIRECTORY;
	const originalUserdataDir = process.env.USERDATA_DIRECTORY;

	afterEach(() => {
		process.env.COMICS_DIRECTORY = originalComicsDir;
		process.env.USERDATA_DIRECTORY = originalUserdataDir;
		jest.resetModules();
	});

	it("uses COMICS_DIRECTORY / USERDATA_DIRECTORY from the environment when set", () => {
		jest.resetModules();
		process.env.COMICS_DIRECTORY = "/var/home/rishi/Downloads/comics";
		process.env.USERDATA_DIRECTORY = "/var/home/rishi/Downloads/userdata";

		const { COMICS_DIRECTORY, USERDATA_DIRECTORY } = require(MODULE_PATH);

		expect(COMICS_DIRECTORY).toBe("/var/home/rishi/Downloads/comics");
		expect(USERDATA_DIRECTORY).toBe("/var/home/rishi/Downloads/userdata");
	});

	it("falls back to ./comics and ./userdata when the environment variables are unset", () => {
		jest.resetModules();
		delete process.env.COMICS_DIRECTORY;
		delete process.env.USERDATA_DIRECTORY;

		const { COMICS_DIRECTORY, USERDATA_DIRECTORY } = require(MODULE_PATH);

		expect(COMICS_DIRECTORY).toBe("./comics");
		expect(USERDATA_DIRECTORY).toBe("./userdata");
	});
});
