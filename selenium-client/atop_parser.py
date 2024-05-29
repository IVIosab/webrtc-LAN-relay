from argparse import ArgumentParser
import sys
from datetime import datetime, timezone
import json


def main(pid):
    dumps = []
    try:
        while True:
            line = sys.stdin.readline()
            data = json.loads(line)
            result = {
                "timestamp": 0,
                "cpu": {},
                "mem": {},
            }
            result["timestamp"] = (
                datetime.fromtimestamp(data["timestamp"])
                .replace(tzinfo=timezone.utc)
                .isoformat()
            )

            cpu = data["cpu"]
            result["cpu"]["total"] = (int(cpu["utime"]) + int(cpu["stime"])) / 100

            mem = data["mem"]
            result["mem"]["vms"] = int(mem["vmem"]) / 1024
            result["mem"]["rss"] = int(mem["rmem"]) / 1024

            dumps.append(json.dumps(result))
    except KeyboardInterrupt:
        with open(f"cpu_mem/pid-{pid}.txt", "w") as f:
            f.write("\n".join(dumps))


if __name__ == "__main__":
    parser = ArgumentParser()
    parser.add_argument("--pid", action="store")
    args = parser.parse_args()
    main(pid=int(args.pid))
