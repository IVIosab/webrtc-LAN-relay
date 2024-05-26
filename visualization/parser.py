import json
import csv

# import matplotlib.pyplot as plt

import os


def files_to_visualize(input_dir="input", output_dir="output"):
    input_files = []
    output_files = []

    visualize_files = []

    input_files = os.listdir(input_dir)
    for i in range(len(input_files)):
        input_files[i] = input_files[i][0:-4]
    output_files = os.listdir(output_dir)
    for i in range(len(output_files)):
        output_files[i] = output_files[i][0:-4]

    for i in range(len(input_files)):
        if input_files[i] not in output_files:
            visualize_files.append(input_files[i])

    return visualize_files


def parse_files(files):
    files_data = {}
    parsed_files_data = {}
    for file in files:
        with open(f"input/{file}.txt", "r") as f:
            data = json.load(f)
            files_data[file] = data

    for key, value in files_data.items():
        data = value
        parsed_data = {}

        for peer_connection_id, peer_connection_data in data["PeerConnections"].items():
            parsed_data[peer_connection_id] = {
                "bytes_sent": [],
                "bytes_sent_in_bits/s": [],
                "bytes_received": [],
                "bytes_received_in_bits/s": [],
                "startTime": "",
                "endTime": "",
            }
            for stats_id, stats_data in peer_connection_data["stats"].items():
                if stats_data["statsType"] == "transport":
                    if "bytesReceived" in stats_id and "bits" not in stats_id:
                        if stats_data["startTime"] == stats_data["endTime"]:
                            continue
                        parsed_data[peer_connection_id]["bytes_received"].extend(
                            json.loads(stats_data["values"])
                        )
                        parsed_data[peer_connection_id]["startTime"] = stats_data[
                            "startTime"
                        ]
                        parsed_data[peer_connection_id]["endTime"] = stats_data[
                            "endTime"
                        ]
                    if "bytesSent" in stats_id and "bits" not in stats_id:
                        if stats_data["startTime"] == stats_data["endTime"]:
                            continue
                        parsed_data[peer_connection_id]["bytes_sent"].extend(
                            json.loads(stats_data["values"])
                        )
                    if "bytesReceived_in_bits/s" in stats_id:
                        if stats_data["startTime"] == stats_data["endTime"]:
                            continue
                        parsed_data[peer_connection_id][
                            "bytes_received_in_bits/s"
                        ].extend(json.loads(stats_data["values"]))
                    if "bytesSent_in_bits/s" in stats_id:
                        if stats_data["startTime"] == stats_data["endTime"]:
                            continue
                        parsed_data[peer_connection_id]["bytes_sent_in_bits/s"].extend(
                            json.loads(stats_data["values"])
                        )

        parsed_files_data[key] = parsed_data

    return parsed_files_data


def save_files(parsed_data):
    for key, value in parsed_data.items():
        csv_file_path = f"output/{key}.csv"
        with open(csv_file_path, "w", newline="") as csvfile:
            csvwriter = csv.writer(csvfile)
            csvwriter.writerow(
                [
                    "PeerConnectionID",
                    "StartTime",
                    "EndTime",
                    "BytesSent",
                    "BytesSent_in_bits/s",
                    "BytesReceived",
                    "BytesReceived_in_bits/s",
                ]
            )
            for peer_connection_id, data in value.items():
                csvwriter.writerow(
                    [
                        peer_connection_id,
                        data["startTime"],
                        data["endTime"],
                        data["bytes_sent"],
                        data["bytes_sent_in_bits/s"],
                        data["bytes_received"],
                        data["bytes_received_in_bits/s"],
                    ]
                )

        print(f"File {key} saved")
    return


def main():
    files = files_to_visualize()
    parsed_data = parse_files(files)
    save_files(parsed_data)


if __name__ == "__main__":
    main()
