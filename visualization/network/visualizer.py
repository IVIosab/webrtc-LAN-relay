import os
import csv
import matplotlib.pyplot as plt
from collections import defaultdict
from datetime import datetime, timedelta
import matplotlib.dates as mdates
from argparse import ArgumentParser


def read_csv(file_path):
    """Reads a CSV file and returns its content."""
    data = defaultdict(
        lambda: {
            "startTime": "",
            "endTime": "",
            "bytes_sent": [],
            "bytes_sent_in_bits/s": [],
            "bytes_received": [],
            "bytes_received_in_bits/s": [],
        }
    )
    with open(file_path, "r") as csvfile:
        csvreader = csv.DictReader(csvfile)
        for row in csvreader:
            peer_id = row["PeerConnectionID"].split("-")[0]
            data[peer_id]["startTime"] = row["StartTime"]
            data[peer_id]["endTime"] = row["EndTime"]
            data[peer_id]["bytes_sent"].append(eval(row["BytesSent"]))
            data[peer_id]["bytes_sent_in_bits/s"].append(
                eval(row["BytesSent_in_bits/s"])
            )
            data[peer_id]["bytes_received"].append(eval(row["BytesReceived"]))
            data[peer_id]["bytes_received_in_bits/s"].append(
                eval(row["BytesReceived_in_bits/s"])
            )
    return data


def aggregate_data(data):
    """Aggregates the data for each X."""
    aggregated_data = defaultdict(
        lambda: {
            "startTime": None,
            "endTime": None,
            "bytes_sent": [],
            "bytes_sent_in_bits/s": [],
            "bytes_received": [],
            "bytes_received_in_bits/s": [],
        }
    )
    for peer_id, peer_data in data.items():
        bytes_sent_sum = [sum(x) for x in zip(*peer_data["bytes_sent"])]
        bytes_sent_in_bits_sum = [
            sum(x) for x in zip(*peer_data["bytes_sent_in_bits/s"])
        ]
        bytes_received_sum = [sum(x) for x in zip(*peer_data["bytes_received"])]
        bytes_received_in_bits_sum = [
            sum(x) for x in zip(*peer_data["bytes_received_in_bits/s"])
        ]
        aggregated_data[peer_id]["bytes_sent"] = bytes_sent_sum
        aggregated_data[peer_id]["bytes_sent_in_bits/s"] = bytes_sent_in_bits_sum
        aggregated_data[peer_id]["bytes_received"] = bytes_received_sum
        aggregated_data[peer_id][
            "bytes_received_in_bits/s"
        ] = bytes_received_in_bits_sum

        start_time = datetime.strptime(peer_data["startTime"], "%Y-%m-%dT%H:%M:%S.%fZ")
        end_time = datetime.strptime(peer_data["endTime"], "%Y-%m-%dT%H:%M:%S.%fZ")
        aggregated_data[peer_id]["startTime"] = start_time
        aggregated_data[peer_id]["endTime"] = end_time
    return aggregated_data


def plot_data(data, output_path, type):
    """Plots the data and saves the figure to the specified path."""
    colors = {}
    all_times = []
    for peer_id, peer_data in data.items():
        all_times.append(peer_data["startTime"])
        all_times.append(peer_data["endTime"])

    min_time = min(all_times)

    plt.figure(figsize=(12, 8))
    for idx, (peer_id, peer_data) in enumerate(data.items()):
        start_time = peer_data["startTime"]
        time_deltas = [
            (t - min_time).total_seconds()
            for t in [
                start_time
                + timedelta(
                    seconds=i
                    * (peer_data["endTime"] - start_time).total_seconds()
                    / len(peer_data["bytes_sent"])
                )
                for i in range(len(peer_data["bytes_sent"]))
            ]
        ]

        if peer_id not in colors:
            colors[peer_id] = plt.cm.tab10(idx % 10)

        color = colors[peer_id]
        if type == "bytes":
            plt.plot(
                time_deltas,
                peer_data["bytes_sent"],
                label=f"{peer_id} - Sent",
                linestyle="--",
                color=color,
            )
            plt.plot(
                time_deltas,
                peer_data["bytes_received"],
                label=f"{peer_id} - Received",
                linestyle="-",
                color=color,
            )
        else:
            plt.plot(
                time_deltas,
                peer_data["bytes_sent_in_bits/s"],
                label=f"{peer_id} - Sent",
                linestyle="--",
                color=color,
            )
            plt.plot(
                time_deltas,
                peer_data["bytes_received_in_bits/s"],
                label=f"{peer_id} - Received",
                linestyle="-",
                color=color,
            )

    plt.xlabel("Time (seconds)")
    if type == "bytes":
        plt.ylabel("Bytes")
        plt.title("Bytes Sent and Received Over Time")
    else:
        plt.ylabel("Bits/s")
        plt.title("Bits Sent and Received Over Time")

    plt.legend()
    plt.grid(True)
    plt.savefig(output_path)
    plt.close()


def main(input_dir="parsed_input", output_dir="figures", type="bytes"):
    """Main function to process all CSV files in the input directory."""
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    for file_name in os.listdir(input_dir):
        if file_name.endswith(".csv"):
            file_path = os.path.join(input_dir, file_name)
            data = read_csv(file_path)
            if not data:
                print(f"No data found in {file_path}")
                continue
            # print(f"Data read from {file_path}: {data.items()}")
            aggregated_data = aggregate_data(data)
            if not aggregated_data:
                print(f"No aggregated data for {file_path}")
                continue
            # print(f"Aggregated data: {aggregated_data.items()}")

            name, _ = os.path.splitext(file_name)
            output_path = os.path.join(output_dir, f"{name}.png")

            plot_data(aggregated_data, output_path, type)
            print(f"Figure saved to {output_path}")


if __name__ == "__main__":
    parser = ArgumentParser()
    parser.add_argument("--type", default="bytes", help="bytes or bits")
    args = parser.parse_args()
    main(type=args.type)
