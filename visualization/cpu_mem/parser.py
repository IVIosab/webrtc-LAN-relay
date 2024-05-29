import json
import csv
import os
from datetime import datetime


def parse_file(file_path):
    """Parse a single file to extract necessary metrics."""
    with open(file_path, "r") as file:
        lines = file.readlines()

    cpu_values = []
    vms_values = []
    rmem_values = []
    timestamps = []

    for line in lines:
        data = json.loads(line)
        timestamps.append(
            datetime.fromisoformat(data["timestamp"].replace("Z", "+00:00"))
        )
        cpu_values.append(data["cpu"]["total"])
        vms_values.append(data["mem"]["vms"])
        rmem_values.append(data["mem"]["rss"])

    return {
        "StartTime": min(timestamps),
        "EndTime": max(timestamps),
        "CPU": cpu_values,
        "VMEM": vms_values,
        "RMEM": rmem_values,
    }


def save_to_csv(data, output_path, file_name):
    """Save parsed data into a CSV file."""
    with open(
        os.path.join(output_path, f"{file_name}.csv"), "w", newline=""
    ) as csvfile:
        csvwriter = csv.writer(csvfile)
        csvwriter.writerow(["PID", "StartTime", "EndTime", "CPU", "VMEM", "RMEM"])
        csvwriter.writerow(
            [
                file_name,
                data["StartTime"].isoformat(),
                data["EndTime"].isoformat(),
                data["CPU"],
                data["VMEM"],
                data["RMEM"],
            ]
        )


def process_directory(input_dir="raw_input", output_dir="parsed_input"):
    """Process each file in the input directory and save to output directory."""
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    for file_name in os.listdir(input_dir):
        file_path = os.path.join(input_dir, file_name)
        if os.path.isfile(file_path):
            data = parse_file(file_path)
            save_to_csv(
                data, output_dir, file_name[:-4]
            )  # assuming the file extension is .txt


if __name__ == "__main__":
    process_directory()
