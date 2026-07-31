/**
 * @jest-environment node
 */
import { describe, it, expect } from "@jest/globals";
import { toUserdataWebPath } from "../../utils/staticPaths.utils";

describe("toUserdataWebPath", () => {
	it("converts an absolute file path under USERDATA_DIRECTORY into a /userdata-rooted web path", () => {
		const userDataDirectory = "/var/home/rishi/Downloads/userdata";
		const absoluteFilePath =
			"/var/home/rishi/Downloads/userdata/covers/Some Comic 001/cover-000.png";

		expect(toUserdataWebPath(absoluteFilePath, userDataDirectory)).toBe(
			"/userdata/covers/Some Comic 001/cover-000.png"
		);
	});

	it("is independent of process.cwd() (the bug this replaces)", () => {
		const userDataDirectory = "/var/home/rishi/Downloads/userdata";
		const absoluteFilePath =
			"/var/home/rishi/Downloads/userdata/covers/Foo/bar.png";

		const originalCwd = process.cwd();
		try {
			process.chdir("/tmp");
			expect(toUserdataWebPath(absoluteFilePath, userDataDirectory)).toBe(
				"/userdata/covers/Foo/bar.png"
			);
		} finally {
			process.chdir(originalCwd);
		}
	});

	it("handles a relative-style USERDATA_DIRECTORY fallback consistently", () => {
		const userDataDirectory = "./userdata";
		const absoluteFilePath = require("path").resolve(
			"./userdata/covers/Foo/bar.png"
		);

		expect(toUserdataWebPath(absoluteFilePath, userDataDirectory)).toBe(
			"/userdata/covers/Foo/bar.png"
		);
	});
});
