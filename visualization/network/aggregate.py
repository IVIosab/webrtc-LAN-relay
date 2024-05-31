import json
import csv
import os
from itertools import zip_longest
from datetime import datetime


def get_files(input_dir="parsed_input"):
    input_files = []

    input_files = os.listdir(input_dir)
    for i in range(len(input_files)):
        input_files[i] = input_files[i][0:-4]

    return input_files


def sum_two_lists(list_1, list_2):
    list_1.reverse()
    list_2.reverse()
    result = [x + y for x, y in zip_longest(list_1, list_2, fillvalue=0)]
    result.reverse()
    return result


def sum_lists(lists):
    result = lists[0]
    for i in range(1, len(lists)):
        result = sum_two_lists(result, lists[i])
    return result


def fill_list(list, size):
    zeros = [0] * (size - len(list))
    if len(zeros) > 0:
        list = list + zeros
    return list


def get_max_length(data_dict):
    max_length = 0
    for peer, peer_data in data_dict.items():
        for metric, metric_data in peer_data.items():
            if len(metric_data) > max_length:
                max_length = len(metric_data)
    return max_length


def finalize_data_dict(data_dict, length):
    for peer, peer_data in data_dict.items():
        for metric, metric_data in peer_data.items():
            data_dict[peer][metric] = fill_list(metric_data, length)
    return data_dict


def clean_data_dict(data_dict):
    peers = []
    cleaned_data_dict = {}
    for peer_connection_id, peer_connection_data in data_dict.items():
        peer = peer_connection_id.split("-")[0]
        if peer not in cleaned_data_dict:
            peers.append(peer)
            cleaned_data_dict[peer] = {
                "bytes_sent": [peer_connection_data["bytes_sent"]],
                "bytes_sent_in_bits/s": [peer_connection_data["bytes_sent_in_bits/s"]],
                "bytes_received": [peer_connection_data["bytes_received"]],
                "bytes_received_in_bits/s": [
                    peer_connection_data["bytes_received_in_bits/s"]
                ],
            }
        else:
            cleaned_data_dict[peer]["bytes_sent"].append(
                peer_connection_data["bytes_sent"]
            )
            cleaned_data_dict[peer]["bytes_sent_in_bits/s"].append(
                peer_connection_data["bytes_sent_in_bits/s"]
            )
            cleaned_data_dict[peer]["bytes_received"].append(
                peer_connection_data["bytes_received"]
            )
            cleaned_data_dict[peer]["bytes_received_in_bits/s"].append(
                peer_connection_data["bytes_received_in_bits/s"]
            )
    for peer in peers:
        cleaned_data_dict[peer]["bytes_sent"].sort(key=len)
        cleaned_data_dict[peer]["bytes_sent_in_bits/s"].sort(key=len)
        cleaned_data_dict[peer]["bytes_received"].sort(key=len)
        cleaned_data_dict[peer]["bytes_received_in_bits/s"].sort(key=len)
        cleaned_data_dict[peer]["bytes_sent"].reverse()
        cleaned_data_dict[peer]["bytes_sent_in_bits/s"].reverse()
        cleaned_data_dict[peer]["bytes_received"].reverse()
        cleaned_data_dict[peer]["bytes_received_in_bits/s"].reverse()
        cleaned_data_dict[peer]["bytes_sent"] = sum_lists(
            cleaned_data_dict[peer]["bytes_sent"]
        )
        cleaned_data_dict[peer]["bytes_sent_in_bits/s"] = sum_lists(
            cleaned_data_dict[peer]["bytes_sent_in_bits/s"]
        )
        cleaned_data_dict[peer]["bytes_received"] = sum_lists(
            cleaned_data_dict[peer]["bytes_received"]
        )
        cleaned_data_dict[peer]["bytes_received_in_bits/s"] = sum_lists(
            cleaned_data_dict[peer]["bytes_received_in_bits/s"]
        )

    return cleaned_data_dict


def save_file(data_dict, file):
    csv_file_path = f"final_data/{file}.csv"
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


def read_csv(file):
    data = {}
    with open(file, "r") as csvfile:
        reader = csv.reader(csvfile)
        for row in reader:
            if row[0] == "Peer":
                continue
            data[row[0]] = {
                "bytes_sent": eval(row[1]),
                "bytes_sent_in_bits/s": eval(row[2]),
                "bytes_received": eval(row[3]),
                "bytes_received_in_bits/s": eval(row[4]),
            }
    return data


def parse_file(file):
    data = read_csv(f"parsed_input/{file}.csv")
    max_length = get_max_length(data)
    final_data = finalize_data_dict(data, max_length)
    clean_data = clean_data_dict(final_data)
    save_file(clean_data, file)


def main():
    files = get_files()
    for file in files:
        parse_file(file)


if __name__ == "__main__":
    main()
