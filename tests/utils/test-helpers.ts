/**
 * Test helper utilities for file watcher e2e tests
 */
import fs from "fs";
import path from "path";
import os from "os";
import fsExtra from "fs-extra";

const fsp = fs.promises;

/**
 * Event capture interface for tracking emitted events
 */
export interface CapturedEvent {
	event: string;
	args: any[];
	timestamp: number;
}

/**
 * Creates a temporary directory for testing
 * @returns Path to the created temp directory
 */
export async function createTempDir(prefix: string = "threetwo-test-"): Promise<string> {
	const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), prefix));
	return tempDir;
}

/**
 * Removes a temporary directory and all its contents
 * @param dirPath Path to the directory to remove
 */
export async function removeTempDir(dirPath: string): Promise<void> {
	try {
		await fsExtra.remove(dirPath);
	} catch (error) {
		// Ignore errors if directory doesn't exist
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
			throw error;
		}
	}
}

/**
 * Creates a mock comic file with the specified extension
 * @param dirPath Directory to create the file in
 * @param fileName Name of the file (without extension)
 * @param extension File extension (.cbz, .cbr, .cb7)
 * @param sizeKB Size of the file in KB (default 10KB)
 * @returns Full path to the created file
 */
export async function createMockComicFile(
	dirPath: string,
	fileName: string,
	extension: ".cbz" | ".cbr" | ".cb7" = ".cbz",
	sizeKB: number = 10
): Promise<string> {
	const filePath = path.join(dirPath, `${fileName}${extension}`);
	// Create a file with random content of specified size
	const buffer = Buffer.alloc(sizeKB * 1024);
	// Add a minimal ZIP header for .cbz files to make them somewhat valid
	if (extension === ".cbz") {
		buffer.write("PK\x03\x04", 0); // ZIP local file header signature
	}
	await fsp.writeFile(filePath, buffer);
	return filePath;
}

/**
 * Creates a non-comic file (for testing filtering)
 * @param dirPath Directory to create the file in
 * @param fileName Full filename including extension
 * @param content File content
 * @returns Full path to the created file
 */
export async function createNonComicFile(
	dirPath: string,
	fileName: string,
	content: string = "test content"
): Promise<string> {
	const filePath = path.join(dirPath, fileName);
	await fsp.writeFile(filePath, content);
	return filePath;
}

/**
 * Creates a subdirectory
 * @param parentDir Parent directory path
 * @param subDirName Name of the subdirectory
 * @returns Full path to the created subdirectory
 */
export async function createSubDir(parentDir: string, subDirName: string): Promise<string> {
	const subDirPath = path.join(parentDir, subDirName);
	await fsp.mkdir(subDirPath, { recursive: true });
	return subDirPath;
}

/**
 * Deletes a file
 * @param filePath Path to the file to delete
 */
export async function deleteFile(filePath: string): Promise<void> {
	await fsp.unlink(filePath);
}

/**
 * Deletes a directory and all its contents
 * @param dirPath Path to the directory to delete
 */
export async function deleteDir(dirPath: string): Promise<void> {
	await fsExtra.remove(dirPath);
}

/**
 * Waits for a specific duration
 * @param ms Milliseconds to wait
 */
export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Waits for a condition to be true, with timeout
 * @param condition Function that returns true when condition is met
 * @param timeoutMs Maximum time to wait in milliseconds
 * @param intervalMs Check interval in milliseconds
 * @returns True if condition was met, false if timed out
 */
export async function waitForCondition(
	condition: () => boolean | Promise<boolean>,
	timeoutMs: number = 10000,
	intervalMs: number = 100
): Promise<boolean> {
	const startTime = Date.now();
	while (Date.now() - startTime < timeoutMs) {
		if (await condition()) {
			return true;
		}
		await sleep(intervalMs);
	}
	return false;
}

/**
 * Creates an event capturer that records all emitted events
 */
export class EventCapturer {
	private events: CapturedEvent[] = [];

	/**
	 * Records an event
	 */
	capture(event: string, ...args: any[]): void {
		this.events.push({
			event,
			args,
			timestamp: Date.now(),
		});
	}

	/**
	 * Returns all captured events
	 */
	getAll(): CapturedEvent[] {
		return [...this.events];
	}

	/**
	 * Returns events matching the given event name
	 */
	getByEvent(eventName: string): CapturedEvent[] {
		return this.events.filter((e) => e.event === eventName);
	}

	/**
	 * Checks if a specific event was captured
	 */
	hasEvent(eventName: string): boolean {
		return this.events.some((e) => e.event === eventName);
	}

	/**
	 * Waits for a specific event to be captured
	 */
	async waitForEvent(eventName: string, timeoutMs: number = 10000): Promise<CapturedEvent | null> {
		const result = await waitForCondition(() => this.hasEvent(eventName), timeoutMs);
		if (result) {
			return this.getByEvent(eventName)[0];
		}
		return null;
	}

	/**
	 * Clears all captured events
	 */
	clear(): void {
		this.events = [];
	}

	/**
	 * Returns the count of captured events
	 */
	get count(): number {
		return this.events.length;
	}
}

/**
 * Creates a mock file stats object
 */
export function createMockStats(options: Partial<fs.Stats> = {}): fs.Stats {
	const now = new Date();
	return {
		dev: 0,
		ino: 0,
		mode: 0o100644,
		nlink: 1,
		uid: 0,
		gid: 0,
		rdev: 0,
		size: options.size ?? 10240,
		blksize: 4096,
		blocks: 8,
		atimeMs: now.getTime(),
		mtimeMs: options.mtimeMs ?? now.getTime(),
		ctimeMs: now.getTime(),
		birthtimeMs: now.getTime(),
		atime: now,
		mtime: options.mtime ?? now,
		ctime: now,
		birthtime: now,
		isFile: () => true,
		isDirectory: () => false,
		isBlockDevice: () => false,
		isCharacterDevice: () => false,
		isSymbolicLink: () => false,
		isFIFO: () => false,
		isSocket: () => false,
	} as fs.Stats;
}

/**
 * Copies a file (simulates a real file transfer)
 * @param sourcePath Source file path
 * @param destPath Destination file path
 */
export async function copyFile(sourcePath: string, destPath: string): Promise<void> {
	await fsp.copyFile(sourcePath, destPath);
}

/**
 * Moves a file to a new location
 * @param sourcePath Source file path
 * @param destPath Destination file path
 */
export async function moveFile(sourcePath: string, destPath: string): Promise<void> {
	await fsp.rename(sourcePath, destPath);
}

/**
 * Touches a file (updates its mtime)
 * @param filePath Path to the file
 */
export async function touchFile(filePath: string): Promise<void> {
	const now = new Date();
	await fsp.utimes(filePath, now, now);
}
