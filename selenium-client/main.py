from argparse import ArgumentParser
import sys
import signal
import time
import subprocess
from selenium.webdriver import Chrome, ChromeOptions
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.common.by import By


def main(
    relay: bool,
    url: str,
    windows: int,
    time_test: int,
):

    options = ChromeOptions()
    options.add_argument("use-fake-device-for-media-stream")
    options.add_argument("use-fake-ui-for-media-stream")
    options.add_argument("ignore-certificate-errors")
    options.add_argument("no-sandbox")
    options.add_argument("disable-dev-shm-usage")
    options.add_argument("site-per-process")
    # options.add_argument("--process-per-site")
    # options.add_argument("--incognito")

    driver = Chrome(options=options, service=Service(ChromeDriverManager().install()))

    def onexit(*args, **kwargs):
        driver.quit()
        sys.exit()

    signal.signal(signal.SIGTERM, onexit)

    subprocesses = []

    try:
        driver.get(url="chrome://webrtc-internals/")
        driver.implicitly_wait(5)
        for i in range(windows):
            driver.switch_to.new_window("window")
            driver.get(url=url)
            driver.implicitly_wait(5)
            try:
                driver.find_element(By.XPATH, '//button[text()="Visit Site"]').click()
                driver.implicitly_wait(5)
            except:
                pass

        if relay:
            driver.switch_to.window(driver.window_handles[1])
            driver.implicitly_wait(5)

            driver.find_element(By.XPATH, '//button[text()="Relay"]').click()
            driver.implicitly_wait(5)

        driver.switch_to.window(driver.window_handles[0])
        driver.implicitly_wait(5)
        pids = driver.find_elements(
            By.XPATH, "//div[contains(text(), 'Caller process id:')]"
        )
        pids = [pid.text.split(":")[1].strip() for pid in pids]
        print(f"pids: {pids}")

        time.sleep(60)
        print("Initialization Finished")

        driver.refresh()
        driver.implicitly_wait(5)

        idx = 1
        while True:
            try:
                driver.find_element(
                    By.XPATH, f"/html/body/p/div[1]/span[{idx}]"
                ).click()
                idx += 1
                driver.implicitly_wait(5)
            except:
                break

        # Open subprocess for each pid
        # for pid in pids:
        #     cmd = f'sudo atop -J PRM,PRC,PRN 1 | sed \'s/"cgroup": "[^"]*"/"cgroup": ""/g\' | jq --unbuffered -c \'{{ timestamp: .timestamp, net: (.PRN[] | select(.pid == {pid})), cpu: (.PRC[] | select(.pid == {pid})), mem: (.PRM[] | select(.pid == {pid}))}}\''
        #     proc = subprocess.Popen(cmd, shell=True, stdout=subprocess.PIPE, text=True)
        #     subprocesses.append((proc, f"{pid}.json"))

        time.sleep(time_test)
        # Close subprocesses
        driver.find_element(By.XPATH, "/html/body/p/details[1]").click()
        driver.find_element(
            By.XPATH, "/html/body/p/details[1]/div/div/a/button"
        ).click()

        # Save output and close subprocesses
        # for proc, filename in subprocesses:
        #     with open(filename, "w") as file:
        #         file.write(proc.stdout.read())
        #     proc.terminate()

        time.sleep(10)
    finally:
        print("Closing Driver")
        driver.quit()


if __name__ == "__main__":
    parser = ArgumentParser()
    parser.add_argument("--relay", action="store_true")
    parser.add_argument("--url", action="store")
    parser.add_argument("--windows", action="store", default=2)
    parser.add_argument("--time", action="store", default=300)
    args = parser.parse_args()
    main(
        args.relay,
        f"https://{args.url}.ngrok-free.app/",
        int(args.windows),
        int(args.time),
    )
