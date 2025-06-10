import chokidar, { FSWatcher } from "chokidar";
import fs from "fs";
import path from "path";
import { Service, ServiceBroker, ServiceSchema } from "moleculer";
import ApiGateway from "moleculer-web";
import debounce from "lodash/debounce";
import { IFolderData } from "threetwo-ui-typings";

/**
 * ApiService exposes REST endpoints and watches the comics directory for changes.
 * Uses chokidar to watch the directory and broadcasts file events via Moleculer.
 */
export default class ApiService extends Service {
  public constructor(broker: ServiceBroker) {
    super(broker);
    this.parseServiceSchema({
      name: "api",
      mixins: [ApiGateway],
      // More info about settings: https://moleculer.services/docs/0.14/moleculer-web.html
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

  /** Active file system watcher instance. */
private fileWatcher?: any;

  /**
   * Starts watching the comics directory with debounced, robust handlers.
   */
  private startWatcher(): void {
    const watchDir = path.resolve(process.env.COMICS_PATH || "/comics");
    this.logger.info(`Watching comics folder: ${watchDir}`);

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

    const debouncedEvent = debounce(
      (event: string, p: string, stats?: fs.Stats) => {
        try {
          this.handleFileEvent(event, p, stats);
        } catch (err) {
          this.logger.error(`Error handling file event [${event}] for ${p}:`, err);
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
   * Stops the file watcher and frees resources.
   */
  private async stopWatcher(): Promise<void> {
    if (this.fileWatcher) {
      this.logger.info("Stopping file watcher...");
      await this.fileWatcher.close();
      this.fileWatcher = undefined;
    }
  }

  /**
   * Handles and broadcasts file system events.
   * @param event - Event type (add, change, etc.)
   * @param filePath - Path of the file or directory
   * @param stats - Optional file stats
   */
  private async handleFileEvent(
    event: string,
    filePath: string,
    stats?: fs.Stats
  ): Promise<void> {
    this.logger.info(`File event [${event}]: ${filePath}`);
    if (event === "add" && stats) {
      // Wait for write to stabilize
      setTimeout(async () => {
        const newStats = await fs.promises.stat(filePath);
        if (newStats.mtime.getTime() === stats.mtime.getTime()) {
          this.logger.info(`Stable file detected: ${filePath}, importing.`);
          const folderData: IFolderData = await this.broker.call(
            "library.walkFolders",
            { basePathToWalk: filePath }
          );
          await this.broker.call("importqueue.processImport", {
            fileObject: { filePath, fileSize: folderData[0].fileSize },
          });
        }
      }, 3000);
    }
    // Broadcast to other services or clients
    this.broker.broadcast(event, { path: filePath });
  }
}
