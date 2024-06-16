#!/bin/bash

# PID=$(pgrep bun | tail -n 1)
PID=$(pgrep bun | tail -n 1)
LOG_FILE="mem.log"

# Check if the process exists
if ! ps -p $PID > /dev/null; then
	echo "Process with PID $PID doesn't exist."
		exit 1
fi

while true; do
		MEMORY_USAGE=$(ps -o rss= -p $PID)
		    MEMORY_USAGE_MB=$(echo "scale=2; $MEMORY_USAGE / 1024" | bc)
			    echo "$(date +"%s"):$MEMORY_USAGE_MB" | tee -a $LOG_FILE
				sleep 1
done

