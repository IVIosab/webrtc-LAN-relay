import json
import csv
import os
from itertools import zip_longest
from datetime import datetime


def get_files(input_dir="raw_input", output_dir="parsed_input"):
    input_files = []

    input_files = os.listdir(input_dir)
    for i in range(len(input_files)):
        input_files[i] = input_files[i][0:-4]

    return input_files


def fill_list(list, size):
    zeros = [0] * (size - len(list))
    if len(zeros) > 0:
        list = zeros + list
    return list


def data_to_dict(data):
    data_dict = {}
    for peer_connection_id, peer_connection_data in data["PeerConnections"].items():
        data_dict[peer_connection_id] = {}
        for stats_id, stats_data in peer_connection_data["stats"].items():
            if stats_data["statsType"] == "remote-inbound-rtp":
                if stats_data["startTime"] == stats_data["endTime"]:
                    continue
                if "-roundTripTime" in stats_id and "Measurements" not in stats_id:
                    data_dict[peer_connection_id][stats_id] = eval(stats_data["values"])

    return data_dict


def get_max_length(data_dict):
    max_length = 0
    for peer, peer_data in data_dict.items():
        for metric, metric_data in peer_data.items():
            if len(metric_data) > max_length:
                max_length = len(metric_data)
    return max_length


def clean_data_dict(data_dict, length):
    cleaned_data_dict = {}

    for peer_connection_id, peer_connection_data in data_dict.items():
        cleaned_data_dict[peer_connection_id] = {}
        cleaned_data_dict[peer_connection_id]["bytes_sent"] = fill_list(
            peer_connection_data["bytes_sent"], length
        )
        cleaned_data_dict[peer_connection_id]["bytes_sent_in_bits/s"] = fill_list(
            peer_connection_data["bytes_sent_in_bits/s"], length
        )
        cleaned_data_dict[peer_connection_id]["bytes_received"] = fill_list(
            peer_connection_data["bytes_received"], length
        )
        cleaned_data_dict[peer_connection_id]["bytes_received_in_bits/s"] = fill_list(
            peer_connection_data["bytes_received_in_bits/s"], length
        )

    return cleaned_data_dict


def save_file(data_dict, file):
    csv_file_path = f"parsed_input/{file}.csv"
    with open(csv_file_path, "w", newline="") as csvfile:
        csvwriter = csv.writer(csvfile)
        csvwriter.writerow(
            [
                "Peer",
                "BytesSent",
                "BytesSent_in_bits/s",
                "BytesReceived",
                "BytesReceived_in_bits/s",
            ]
        )
        for peer, data in data_dict.items():
            csvwriter.writerow(
                [
                    peer,
                    data["bytes_sent"],
                    data["bytes_sent_in_bits/s"],
                    data["bytes_received"],
                    data["bytes_received_in_bits/s"],
                ]
            )
        print(f"File {file} saved")
    return


def save_file_RTT(data_dict, file):
    csv_file_path = f"parsed_input/{file}.csv"
    with open(csv_file_path, "w", newline="") as csvfile:
        csvwriter = csv.writer(csvfile)
        csvwriter.writerow(
            [
                "Peer",
                "RTT",
            ]
        )
        for peer, data in data_dict.items():
            for metric, metric_data in data.items():
                if "roundTripTime" in metric:
                    csvwriter.writerow(
                        [
                            peer + "_" + metric.split("-")[0],
                            metric_data,
                        ]
                    )
        print(f"File {file} saved")
    return


def clean_RTT(data_dict):
    length = get_max_length(data_dict)
    clean_data_dict = {}
    for peer, peer_data in data_dict.items():
        clean_data_dict[peer] = {}
        for metric, metric_data in peer_data.items():
            if "roundTripTime" in metric:
                clean_data_dict[peer][metric] = fill_list(metric_data, length)
    return clean_data_dict


def parse_file(file):
    with open(f"raw_input/{file}.txt", "r") as f:
        data = json.load(f)
        data_dict = data_to_dict(data)
        # print("-------------------")
        # for peer, peer_data in data_dict.items():
        #     print(peer, peer_data.keys())
        # print("-------------------")
        clean_data = clean_RTT(data_dict)
        # print(clean_data)
        # max_length = get_max_length(data_dict)
        # clean_data = clean_data_dict(data_dict, max_length)
        save_file_RTT(clean_data, file)


def main():
    files = get_files()
    for file in files:
        parse_file(file)


if __name__ == "__main__":
    main()
