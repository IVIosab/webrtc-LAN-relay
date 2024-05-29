import matplotlib.pyplot as plt
import os
import csv
from datetime import datetime, timedelta


def read_csv(file_path):
    """Reads a CSV file and returns its content in a structured format."""
    data = {
        "PID": "",
        "StartTime": "",
        "EndTime": "",
        "CPU": [],
        "VMEM": [],
        "RMEM": [],
    }
    with open(file_path, "r") as csvfile:
        csvreader = csv.DictReader(csvfile)
        for row in csvreader:
            data["PID"] = row["PID"]
            data["StartTime"] = row["StartTime"]
            data["EndTime"] = row["EndTime"]
            data["CPU"] = eval(row["CPU"])
            data["VMEM"] = eval(row["VMEM"])
            data["RMEM"] = eval(row["RMEM"])
    return data


def plot_data(data, output_path):
    """Plots the data and saves the figure to the specified path."""
    start_time = datetime.strptime(data["StartTime"], "%Y-%m-%dT%H:%M:%S%z")
    end_time = datetime.strptime(data["EndTime"], "%Y-%m-%dT%H:%M:%S%z")

    # Calculate the number of seconds from start_time for each data point
    num_points = len(data["CPU"])  # Assuming CPU has a valid list of metrics
    time_deltas = [
        (i * (end_time - start_time).total_seconds() / (num_points - 1))
        for i in range(num_points)
    ]

    plt.figure(figsize=(10, 8))
    plt.subplot(311)
    plt.plot(time_deltas, data["CPU"], label="CPU Usage (%)", color="r", linestyle="--")
    plt.title(f"Time Series Data for {data['PID']}")
    plt.ylabel("CPU Usage (%)")
    plt.grid(True)

    plt.subplot(312)
    plt.plot(time_deltas, data["VMEM"], label="VMEM Usage (KB)", color="b")
    plt.ylabel("VMEM Usage (KB)")
    plt.grid(True)

    plt.subplot(313)
    plt.plot(time_deltas, data["RMEM"], label="RMEM Usage (KB)", color="g")
    plt.ylabel("RMEM Usage (KB)")
    plt.grid(True)
    plt.xlabel("Time (seconds)")

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
            data = read_csv(file_path)
            output_file_path = os.path.join(
                output_dir, f"{os.path.splitext(file_name)[0]}.png"
            )
            plot_data(data, output_file_path)
            print(f"Plot saved to {output_file_path}")


if __name__ == "__main__":
    process_files()
