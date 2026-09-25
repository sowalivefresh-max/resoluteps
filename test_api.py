import json
import urllib.request

url = 'https://resolute-92775.web.app/api'
data = json.dumps({"action":"getPublicBranding","args":[]}).encode('utf-8')
req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})

try:
    with urllib.request.urlopen(req) as response:
        print(response.read().decode('utf-8'))
except Exception as e:
    print(f"Error: {e}")
