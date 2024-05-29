#!/bin/bash

# Check if a PID was provided as an argument
if [ -z "$1" ]; then
    echo "Usage: $0 <pid>"
    exit 1
fi

# Assign the provided PID to a variable
pid=$1

# Execute the command with the specified PID
sudo atop -J PRM,PRC 1 | sed 's/"cgroup": "[^"]*"/"cgroup": ""/g' | jq --unbuffered -c "{ timestamp: .timestamp, cpu: (.PRC[] | select(.pid == $pid)), mem: (.PRM[] | select(.pid == $pid))}" | python3 -u atop_parser.py --pid $pid
