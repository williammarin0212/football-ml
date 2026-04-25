import requests
import os

url = "https://premier.72-60-245-2.sslip.io/export/events"
output_file = "../../csv/events_raw.csv"

print(f"Downloading raw events data from {url}...")
response = requests.get(url, stream=True)
response.raise_for_status()

with open(output_file, 'wb') as f:
    for chunk in response.iter_content(chunk_size=8192):
        f.write(chunk)

print(f"File successfully saved to {output_file}")
