import chokidar, { FSWatcher } from "chokidar";
import fs from "fs";
import path from "path";
import { Service, ServiceBroker, ServiceSchema } from "moleculer";
import ApiGateway from "moleculer-web";
import debounce from "lodash/debounce";
import { IFolderData } from "threetwo-ui-typings";

/**
 * ApiService exposes REST endpoints and watches the comics directory for changes.
 * It uses chokidar to monitor filesystem events and broadcasts them via the Moleculer broker.
 * @extends Service
 */
export default class ApiService extends Service {
  /**
   * The chokidar file system watcher instance.
   * @private
   */
  private fileWatcher?: any;

  /**
   * Creates an instance of ApiService.
   * @param {ServiceBroker} broker - The Moleculer service broker instance.
   */
  public constructor(broker: ServiceBroker) {
    super(broker);
    this.parseServiceSchema({
      name: "api",
      mixins: [ApiGateway],
      settings: {
        port: process.env.PORT || 3000,
        routes: [
          {
            path: "/api",
            whitelist: ["**"],
            cors: {
              origin: "*",
              methods: ["GET", "OPTIONS", "POST", "PUT", "DELETE"],
              allowedHeaders: ["*"],
              exposedHeaders: [],
              credentials: false,
              maxAge: 3600,
            },
            use: [],
            mergeParams: true,
            authentication: false,
            authorization: false,
            autoAliases: true,
            aliases: {},
            callingOptions: {},
            bodyParsers: {
              json: { strict: false, limit: "1MB" },
              urlencoded: { extended: true, limit: "1MB" },
            },
            mappingPolicy: "all",
            logging: true,
          },
          {
            path: "/userdata",
            use: [ApiGateway.serveStatic(path.resolve("./userdata"))],
          },
          {
            path: "/comics",
            use: [ApiGateway.serveStatic(path.resolve("./comics"))],
          },
          {
            path: "/logs",
            use: [ApiGateway.serveStatic("logs")],
          },
        ],
        log4XXResponses: false,
        logRequestParams: true,
        logResponseData: true,
        assets: { folder: "public", options: {} },
      },
      events: {},
      methods: {},
      started: this.startWatcher,
      stopped: this.stopWatcher,
    });
  }

  /**
   * Initializes and starts the chokidar watcher on the COMICS_DIRECTORY.
   * Debounces rapid events and logs initial scan completion.
   * @private
   */
  private startWatcher(): void {
    const rawDir = process.env.COMICS_DIRECTORY;
    if (!rawDir) {
      this.logger.error("COMICS_DIRECTORY not set; cannot start watcher");
      return;
    }
    const watchDir = path.resolve(rawDir);
    this.logger.info(`Watching comics folder at: ${watchDir}`);
    if (!fs.existsSync(watchDir)) {
      this.logger.error(`✖ Comics folder does not exist: ${watchDir}`);
      return;
    }

    this.fileWatcher = chokidar.watch(watchDir, {
      persistent: true,
      ignoreInitial: true,
      followSymlinks: true,
      depth: 10,
      usePolling: true,
      interval: 5000,
      atomic: true,
      awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 100 },
      ignored: (p) => p.endsWith(".dctmp") || p.includes("/.git/"),
    });

    /**
     * Debounced handler for file system events, batching rapid triggers
     * into a 200ms window. Leading and trailing calls invoked.
     * @param {string} event - Type of file event (add, change, etc.).
     * @param {string} p - Path of the file or directory.
     * @param {fs.Stats} [stats] - Optional file stats for add/change events.
     */
    const debouncedEvent = debounce(
      (event: string, p: string, stats?: fs.Stats) => {
        try {
          this.handleFileEvent(event, p, stats);
        } catch (err) {
          this.logger.error(
            `Error handling file event [${event}] for ${p}:`,
            err
          );
        }
      },
      200,
      { leading: true, trailing: true }
    );

    this.fileWatcher
      .on("ready", () => this.logger.info("Initial scan complete."))
      .on("error", (err) => this.logger.error("Watcher error:", err))
      .on("add", (p, stats) => debouncedEvent("add", p, stats))
      .on("change", (p, stats) => debouncedEvent("change", p, stats))
      .on("unlink", (p) => debouncedEvent("unlink", p))
      .on("addDir", (p) => debouncedEvent("addDir", p))
      .on("unlinkDir", (p) => debouncedEvent("unlinkDir", p));
  }

  /**
   * Stops and closes the chokidar watcher, freeing resources.
   * @private
   */
  private async stopWatcher(): Promise<void> {
    if (this.fileWatcher) {
      this.logger.info("Stopping file watcher...");
      await this.fileWatcher.close();
      this.fileWatcher = undefined;
    }
  }

  /**
   * Handles a filesystem event by logging and optionally importing new files.
   * @param event - The type of chokidar event ('add', 'change', 'unlink', etc.).
   * @param filePath - The full path of the file or directory that triggered the event.
   * @param stats - Optional fs.Stats data for 'add' or 'change' events.
   * @private
   */
  private async handleFileEvent(
    event: string,
    filePath: string,
    stats?: fs.Stats
  ): Promise<void> {
    this.logger.info(`File event [${event}]: ${filePath}`);
    if (event === "add" && stats) {
      setTimeout(async () => {
        const newStats = await fs.promises.stat(filePath);
        if (newStats.mtime.getTime() === stats.mtime.getTime()) {
          this.logger.info(`Stable file detected: ${filePath}, importing.`);
          const folderData: IFolderData = await this.broker.call(
            "library.walkFolders",
            { basePathToWalk: filePath }
          );
          await this.broker.call("importqueue.processImport", {
            fileObject: {
              filePath,
              fileSize: folderData[0].fileSize,
            },
          });
        }
      }, 3000);
    }
    this.broker.broadcast(event, { path: filePath });
  }
}
