import { Server } from "socket.io";
import { createServer } from "http";

export const SocketIOMixin = () => {
    const socketServer = createServer();
    socketServer.listen(3001, `0.0.0.0`);
    const socketIOConnection = new Server(socketServer, {
        cors: {
            origin: "*",
            methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
            preflightContinue: false,
            optionsSuccessStatus: 204,
        },
    });
    return socketIOConnection;
}