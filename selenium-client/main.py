from argparse import ArgumentParser
import sys
import signal
import time
from selenium.webdriver import Chrome, ChromeOptions
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.common.by import By


def main(
    relay: bool,
    headless: bool,
    url: str,
    windows: int,
    time_windows: int,
    time_init: int,
    time_test: int,
):

    options = ChromeOptions()
    options.add_argument("use-fake-device-for-media-stream")
    options.add_argument("use-fake-ui-for-media-stream")
    options.add_argument("ignore-certificate-errors")
    options.add_argument("no-sandbox")
    options.add_argument("disable-dev-shm-usage")
    if headless:
        options.add_argument("--headless=new")

    driver = Chrome(options=options, service=Service(ChromeDriverManager().install()))

    def onexit(*args, **kwargs):
        driver.quit()
        sys.exit()

    signal.signal(signal.SIGTERM, onexit)

    try:
        driver.get(url="chrome://webrtc-internals/")

        for i in range(windows):
            driver.switch_to.new_window("window")
            driver.get(url=url)
            driver.implicitly_wait(5)
            try:
                ngrok_button = driver.find_element(
                    By.XPATH, '//button[text()="Visit Site"]'
                )
                ngrok_button.click()
            except:
                pass
            print(
                f"Session {i+1}/{windows} opened\t|\tWaiting {time_windows} seconds..."
            )
            time.sleep(time_windows)

        print(f"All sessions opened\t|\tWaiting {time_init} seconds...")
        time.sleep(time_init)
        print("Initialization Finished")

        driver.switch_to.window(driver.window_handles[0])
        driver.implicitly_wait(5)
        try:
            xpath_query = "//div[starts-with(normalize-space(), 'Caller process id:')]"
            divs = driver.find_elements(By.XPATH, xpath_query)
        except:
            driver.quit()
            print("No Caller process id found")
            return
        pids = [div.text.split(" ")[-1] for div in divs]
        print("Process IDs collected")
        print(pids)

        driver.switch_to.window(driver.window_handles[1])
        driver.implicitly_wait(5)

        print("Starting test [No relay]")
        time.sleep(time_test)
        if relay:
            relay_button = driver.find_element(By.XPATH, '//button[text()="Relay"]')
            relay_button.click()
        print("Starting test [Relay]")
        time.sleep(time_test)
    finally:
        print("Closing Driver")
        driver.quit()


if __name__ == "__main__":
    parser = ArgumentParser()
    parser.add_argument("--relay", action="store_true")
    parser.add_argument("--headless", action="store_true")
    parser.add_argument("--url", action="store")
    parser.add_argument("--windows", action="store", default=2)
    parser.add_argument("--time_windows", action="store", default=10)
    parser.add_argument("--time_init", action="store", default=15)
    parser.add_argument("--time_test", action="store", default=120)
    args = parser.parse_args()
    main(
        args.relay,
        args.headless,
        args.url,
        int(args.windows),
        int(args.time_windows),
        int(args.time_init),
        int(args.time_test),
    )
