#!/bin/bash
# Check if the first argument is 'dev', use ts-node; otherwise, use node
MODE=$1

# Extract the host and port from MONGO_URI
HOST_PORT=$(echo $MONGO_URI | sed -e 's/mongodb:\/\///' -e 's/\/.*$//')

# Assuming the script is called from the project root
PROJECT_ROOT=$(pwd)
CONFIG_PATH="$PROJECT_ROOT/moleculer.config.ts"

# Set the correct path for moleculer-runner based on the mode
if [ "$MODE" == "dev" ]; then
	# For development: use ts-node
	MOLECULER_RUNNER="ts-node $PROJECT_ROOT/node_modules/moleculer/bin/moleculer-runner.js --hot --repl --config $CONFIG_PATH $PROJECT_ROOT/services/**/*.service.ts"
else
	# For production: direct node execution of the compiled JavaScript
	MOLECULER_RUNNER="moleculer-runner --config $PROJECT_ROOT/dist/moleculer.config.js $PROJECT_ROOT/dist/services/**/*.service.js"
fi

# Run wait-for-it, then start the application
./scripts/wait-for-it.sh $HOST_PORT -- $MOLECULER_RUNNER
