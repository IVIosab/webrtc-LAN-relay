from argparse import ArgumentParser
import sys
import signal
import time
from selenium.webdriver import Chrome, ChromeOptions
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.common.by import By


def initialize_driver():
    options = ChromeOptions()
    options.add_argument("use-fake-device-for-media-stream")
    options.add_argument("use-fake-ui-for-media-stream")
    options.add_argument("ignore-certificate-errors")
    options.add_argument("no-sandbox")
    options.add_argument("disable-dev-shm-usage")
    options.add_argument("site-per-process")
    # options.add_argument("start-maximized")

    driver = Chrome(options=options, service=Service(ChromeDriverManager().install()))
    return driver


def open_internals(driver):
    driver.get(url="chrome://webrtc-internals/")
    driver.implicitly_wait(5)


def update_internals(driver):
    driver.switch_to.window(driver.window_handles[0])
    driver.implicitly_wait(5)
    driver.refresh()
    driver.implicitly_wait(5)

    idx = 1
    while True:
        try:
            driver.find_element(By.XPATH, f"/html/body/p/div[1]/span[{idx}]").click()
            idx += 1
            driver.implicitly_wait(5)
        except:
            break


def open_peer(driver, url):
    driver.switch_to.new_window("window")
    driver.get(url=url)
    driver.implicitly_wait(5)
    try:
        driver.find_element(By.XPATH, '//button[text()="Visit Site"]').click()
        driver.implicitly_wait(5)
    except:
        pass

    update_internals(driver)


def start_relay(driver):
    driver.switch_to.window(driver.window_handles[1])
    driver.implicitly_wait(5)
    try:
        driver.find_element(By.XPATH, '//button[text()="Relay"]').click()
        driver.implicitly_wait(5)
    except:
        pass

    update_internals(driver)


def main(
    url: str,
):
    driver = initialize_driver()

    open_internals(driver)

    def onexit(*args, **kwargs):
        driver.quit()
        sys.exit()

    signal.signal(signal.SIGTERM, onexit)

    try:
        while True:
            cmd = input(">")
            if cmd == "open":
                open_peer(driver, url)
            elif cmd == "relay":
                start_relay(driver)
            elif cmd == "update":
                update_internals(driver)
    except:
        pass
    finally:
        print("Closing Driver")
        driver.quit()


if __name__ == "__main__":
    parser = ArgumentParser()
    parser.add_argument("--url", action="store")
    args = parser.parse_args()
    main(f"https://{args.url}.ngrok-free.app/")
