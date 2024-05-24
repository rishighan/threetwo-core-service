#!/bin/bash
echo "Starting script with mode: $MODE"

# Extract the host and port from MONGO_URI
HOST_PORT=$(echo $MONGO_URI | sed -e 's/mongodb:\/\///' -e 's/\/.*$//')

# Assuming the script is called from the project root
PROJECT_ROOT=$(pwd)
echo "Project root: $PROJECT_ROOT"

CONFIG_PATH="$PROJECT_ROOT/moleculer.config.ts"
echo "Configuration path: $CONFIG_PATH"

# Set the correct path for moleculer-runner based on the mode
if [ "$MODE" == "dev" ]; then
	# For development: use ts-node
	MOLECULER_RUNNER="ts-node $PROJECT_ROOT/node_modules/moleculer/bin/moleculer-runner.js --hot --repl --config $CONFIG_PATH $PROJECT_ROOT/services/**/*.service.ts"
	echo "Moleculer Runner for dev: $MOLECULER_RUNNER"
else
	# For production: direct node execution of the compiled JavaScript
	MOLECULER_RUNNER="moleculer-runner --config $PROJECT_ROOT/dist/moleculer.config.js $PROJECT_ROOT/dist/services/**/*.service.js"
	echo "Moleculer Runner for prod: $MOLECULER_RUNNER"
fi

# Run wait-for-it, then start the application
./scripts/wait-for-it.sh $HOST_PORT -- $MOLECULER_RUNNER
