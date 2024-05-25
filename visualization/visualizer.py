import os
import csv
import matplotlib.pyplot as plt
from collections import defaultdict


def read_csv(file_path):
    """Reads a CSV file and returns its content."""
    data = defaultdict(
        lambda: {
            "bytes_sent": [],
            "bytes_received": [],
            "bytes_sent_startTime": "",
            "bytes_received_startTime": "",
        }
    )
    with open(file_path, "r") as csvfile:
        csvreader = csv.DictReader(csvfile)
        for row in csvreader:
            peer_id = row["PeerConnectionID"].split("-")[0]
            data[peer_id]["bytes_sent"].append(eval(row["BytesSentValues"]))
            data[peer_id]["bytes_sent_startTime"] = row["BytesSentStartTime"]
            data[peer_id]["bytes_received"].append(eval(row["BytesReceivedValues"]))
            data[peer_id]["bytes_received_startTime"] = row["BytesReceivedStartTime"]
    return data


def aggregate_data(data):
    """Aggregates the data for each X."""
    aggregated_data = defaultdict(lambda: {"bytes_sent": [], "bytes_received": []})
    for peer_id, peer_data in data.items():
        bytes_sent_sum = [sum(x) for x in zip(*peer_data["bytes_sent"])]
        bytes_received_sum = [sum(x) for x in zip(*peer_data["bytes_received"])]
        aggregated_data[peer_id]["bytes_sent"] = bytes_sent_sum
        aggregated_data[peer_id]["bytes_received"] = bytes_received_sum
        aggregated_data[peer_id]["bytes_sent_startTime"] = peer_data[
            "bytes_sent_startTime"
        ]
        aggregated_data[peer_id]["bytes_received_startTime"] = peer_data[
            "bytes_received_startTime"
        ]
    return aggregated_data


def plot_data(data, output_path):
    """Plots the data and saves the figure to the specified path."""
    colors = {}

    plt.figure(figsize=(12, 8))
    for idx, (peer_id, peer_data) in enumerate(data.items()):
        x_values = list(range(len(peer_data["bytes_sent"])))

        if peer_id not in colors:
            colors[peer_id] = plt.cm.tab10(idx % 10)

        color = colors[peer_id]
        plt.plot(
            x_values,
            peer_data["bytes_sent"],
            label=f"{peer_id} - Sent",
            linestyle="--",
            color=color,
        )
        plt.plot(
            x_values,
            peer_data["bytes_received"],
            label=f"{peer_id} - Received",
            linestyle="-",
            color=color,
        )

    plt.xlabel("Time (index)")
    plt.ylabel("Bytes")
    plt.title("Bytes Sent and Received Over Time")
    plt.legend()
    plt.grid(True)
    plt.savefig(output_path)
    plt.close()


def main(input_dir="output", output_dir="figures"):
    """Main function to process all CSV files in the input directory."""
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    for file_name in os.listdir(input_dir):
        if file_name.endswith(".csv"):
            file_path = os.path.join(input_dir, file_name)
            data = read_csv(file_path)
            aggregated_data = aggregate_data(data)

            name, _ = os.path.splitext(file_name)
            output_path = os.path.join(output_dir, f"{name}.png")

            plot_data(aggregated_data, output_path)
            print(f"Figure saved to {output_path}")


if __name__ == "__main__":
    main()
