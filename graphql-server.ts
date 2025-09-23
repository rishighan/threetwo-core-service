import express from "express";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@as-integrations/express4";
import { typeDefs } from "./models/graphql/typedef";
import { resolvers } from "./models/graphql/resolvers";
import { ServiceBroker } from "moleculer";
import cors from "cors";

// Boot Moleculer broker in parallel
const broker = new ServiceBroker({ transporter: null }); // or your actual transporter config

async function startGraphQLServer() {
	const app = express();
	const apollo = new ApolloServer({
		typeDefs,
		resolvers,
	});

	await apollo.start();

	app.use(
		"/graphql",
        cors(),
		express.json(),
		expressMiddleware(apollo, {
			context: async ({ req }) => ({
				authToken: req.headers.authorization || null,
				broker,
			}),
		})
	);

	const PORT = 4000;
	app.listen(PORT, () =>
		console.log(`🚀 GraphQL server running at http://localhost:${PORT}/graphql`)
	);
}

async function bootstrap() {
	await broker.start(); // make sure Moleculer is up
	await startGraphQLServer();
}

bootstrap().catch((err) => {
	console.error("❌ Failed to start GraphQL server:", err);
	process.exit(1);
});
