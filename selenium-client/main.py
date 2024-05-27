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
                driver.implicitly_wait(5)
            except:
                pass

        print("Initialization Finished")

        if relay:
            driver.switch_to.window(driver.window_handles[1])
            driver.implicitly_wait(5)

            relay_button = driver.find_element(By.XPATH, '//button[text()="Relay"]')
            relay_button.click()
            driver.implicitly_wait(5)

        driver.switch_to.window(driver.window_handles[0])
        driver.implicitly_wait(5)

        time.sleep(60)
        driver.refresh()
        driver.implicitly_wait(5)

        idx = 1
        while True:
            try:
                span = driver.find_element(By.XPATH, f"/html/body/p/div[1]/span[{idx}]")
                span.click()
                driver.implicitly_wait(5)
                idx += 1
            except:
                break

        time.sleep(time_test)

        x = driver.find_element(By.XPATH, "/html/body/p/details[1]")
        x.click()
        x = driver.find_element(By.XPATH, "/html/body/p/details[1]/div/div/a/button")
        x.click()

        time.sleep(10)
    finally:
        print("Closing Driver")
        driver.quit()


if __name__ == "__main__":
    parser = ArgumentParser()
    parser.add_argument("--relay", action="store_true")
    parser.add_argument("--headless", action="store_true")
    parser.add_argument("--url", action="store")
    parser.add_argument("--windows", action="store", default=2)
    parser.add_argument("--time", action="store", default=300)
    args = parser.parse_args()
    main(
        args.relay,
        args.headless,
        f"https://{args.url}.ngrok-free.app/",
        int(args.windows),
        int(args.time),
    )
