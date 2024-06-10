import os
import csv
import matplotlib.pyplot as plt


def read_csv(file_path):
    data_dict = {}
    with open(file_path, "r") as csvfile:
        csvreader = csv.DictReader(csvfile)
        for row in csvreader:
            peer = row["Peer"]
            data_dict[peer] = {
                "RTT": [],
            }
            data_dict[peer]["RTT"] = eval(row["RTT"])
    return data_dict


def fill_list(list, size):
    zeros = [0] * (size - len(list))
    if len(zeros) > 0:
        list = zeros + list
    return list


def get_max_length(data_dict):
    max_length = 0
    for peer, peer_data in data_dict.items():
        for metric, metric_data in peer_data.items():
            if len(metric_data) > max_length:
                max_length = len(metric_data)
    return max_length


def normalize_data(data_dict):
    max_length = get_max_length(data_dict)
    for peer, peer_data in data_dict.items():
        for metric, metric_data in peer_data.items():
            data_dict[peer][metric] = fill_list(metric_data, max_length)
    return data_dict, max_length


def get_time(data_dict, length):
    diff = length - len(data_dict["RTT"])
    return list(range(diff, length))


def plot_data(data_dict, output_file):
    length = get_max_length(data_dict)

    colors = {}
    plt.figure(figsize=(20, 10))
    for idx, (peer, peer_data) in enumerate(data_dict.items()):
        time = get_time(peer_data, length)
        if peer not in colors:
            colors[peer] = plt.cm.tab10(idx % 10)
        color = colors[peer]
        plt.plot(
            time,
            peer_data["RTT"],
            label=f"{peer} RTT",
            linestyle="-",
            color=color,
        )
    plt.xlabel("Time (s)")
    plt.ylabel("Bits/s")
    plt.legend()
    plt.grid(True)
    plt.savefig(output_file)
    plt.close()


def main(input_dir="final_data", output_dir="figures"):
    for file_name in os.listdir(input_dir):
        if file_name.endswith("RTT.csv"):
            data_dict = read_csv(os.path.join(input_dir, file_name))
            plot_data(
                data_dict, os.path.join(output_dir, file_name.replace(".csv", ".png"))
            )


if __name__ == "__main__":
    main()
