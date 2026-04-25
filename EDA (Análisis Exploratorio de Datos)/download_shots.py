import requests
import pandas as pd

BASE = "https://premier.72-60-245-2.sslip.io"
print("Downloading shots from API...")
res = requests.get(f"{BASE}/events?is_shot=true&limit=10000").json()

shots = pd.DataFrame(res['events'])
print("Columns in downloaded shots:", shots.columns.tolist())

shots.to_csv('../../csv/shots_with_qualifiers.csv', index=False)
print("Saved to ../../csv/shots_with_qualifiers.csv")
