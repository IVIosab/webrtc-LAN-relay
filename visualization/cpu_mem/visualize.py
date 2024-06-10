import matplotlib.pyplot as plt
import os
import csv


def read_csv(file_path):
    data = {}
    length = 0
    with open(file_path, "r") as csvfile:
        csvreader = csv.DictReader(csvfile)
        for row in csvreader:
            data[row["Peer"]] = {
                "CPU": eval(row["CPU"]),
                "VMEM": eval(row["VMEM"]),
                "RMEM": eval(row["RMEM"]),
            }
            length = max(length, len(eval(row["CPU"])))
    return data, length


def fill_list(list, size):
    zeros = [0] * (size - len(list))
    if len(zeros) > 0:
        list = zeros + list
    return list


def match_length(data, length):
    for peer, peer_data in data.items():
        data[peer]["CPU"] = fill_list(peer_data["CPU"], length)
        data[peer]["VMEM"] = fill_list(peer_data["VMEM"], length)
        data[peer]["RMEM"] = fill_list(peer_data["RMEM"], length)
    return data


def average_5seconds(data_list):
    average = []
    for idx in range(0, len(data_list) - 4):
        average.append(sum(data_list[idx : idx + 5]) / 5)
    return average


def plot_data(data, output_path):
    # Calculate the number of seconds from start_time for each data point
    colors = {}
    plt.figure(figsize=(16, 8))
    for idx, (peer, peer_data) in enumerate(data.items()):
        if peer not in colors:
            colors[peer] = plt.cm.tab10(idx % 10)
        num_points = len(
            average_5seconds(peer_data["CPU"])
        )  # Assuming CPU has a valid list of metrics
        time_deltas = [i for i in range(num_points)]
        color = colors[peer]
        plt.plot(
            time_deltas,
            average_5seconds(peer_data["CPU"]),
            label=f"{peer} CPU Usage (%)",
            color=color,
            linestyle="-",
        )
    plt.ylabel("CPU Usage (%)")
    plt.xlabel("Time (s)")
    plt.grid(True)
    plt.legend()
    plt.tight_layout()
    plt.savefig(output_path)
    plt.close()


def process_files(input_dir="parsed_input", output_dir="figures"):
    """Process each CSV file in the input directory to generate plots."""
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    for file_name in os.listdir(input_dir):
        if file_name.endswith(".csv"):
            file_path = os.path.join(input_dir, file_name)
            data, length = read_csv(file_path)
            data = match_length(data, length)
            output_file_path = os.path.join(
                output_dir, f"{os.path.splitext(file_name)[0]}.png"
            )
            plot_data(data, output_file_path)
            print(f"Plot saved to {output_file_path}")


if __name__ == "__main__":
    process_files()
