import { logger } from "../utils/logger.utils";
//RabbitMQ
const amqp = require("amqplib/callback_api");
const rabbitUrl = "amqp://localhost";

export const sendRabbitMQ = (queueName, data) => {
    // connect to local rabbitmq instance
	amqp.connect(rabbitUrl, (error0, connection) => {
		if (error0) {
			throw error0;
		}
        // create channel
		connection.createChannel((error1, channel) => {
			if (error1) {
				throw error1;
			}
			const queue = queueName;
            // Checks for “queueName (updateStock)” queue. If it doesn’t exist, then it creates one.
			channel.assertQueue(queue, {
				durable: false,
			});
			channel.sendToQueue(queue, Buffer.from(data));
			logger.info(`${data} sent`);
		});
		setTimeout(function() {
			connection.close();
			// process.exit(0);
		}, 500);
	});
};
