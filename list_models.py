import os
import requests
from dotenv import load_dotenv

load_dotenv()
r = requests.get(
    "https://generativelanguage.googleapis.com/v1beta/models",
    headers={"x-goog-api-key": os.getenv("GEMINI_API_KEY")},
    params={"pageSize": 100},
    timeout=20,
)
print("Status:", r.status_code)
if not r.ok:
    print(r.text[:300])
for m in r.json().get("models", []):
    if "generateContent" in m.get("supportedGenerationMethods", []):
        print(m["name"])