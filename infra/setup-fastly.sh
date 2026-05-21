#!/bin/bash
# infra/setup-fastly.sh
set -e

# Validate prerequisites
if ! command -v jq &> /dev/null; then echo "jq not found, installing..."; sudo apt-get install -y jq; fi

echo "--- Layering Modern Edge Rate Limiter ---"
ACTIVE_VERSION=$(curl -s -H "Fastly-Key: $FASTLY_API_KEY" "https://api.fastly.com/service/$FASTLY_SERVICE_ID/details" | jq -r '.active_version.number')

echo "Cloning active version $ACTIVE_VERSION..."
CLONE_RESPONSE=$(curl -s -X PUT -H "Fastly-Key: $FASTLY_API_KEY" \
  "https://api.fastly.com/service/$FASTLY_SERVICE_ID/version/$ACTIVE_VERSION/clone")
NEW_VERSION=$(echo "$CLONE_RESPONSE" | jq -r '.number')

echo "Provisioning rate-limiter on version $NEW_VERSION..."

# Modeled exactly off your working cURL command!
# Using --data-urlencode for the JSON response to ensure it parses correctly
curl -s -X POST "https://api.fastly.com/service/$FASTLY_SERVICE_ID/version/$NEW_VERSION/rate-limiters" \
     -H "Fastly-Key: $FASTLY_API_KEY" \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -H "Accept: application/json" \
     -d "name=agent_api_limiter" \
     -d "http_methods%5B%5D=POST" \
     -d "rps_limit=10" \
     -d "window_size=10" \
     -d "client_key%5B%5D=req.http.Fastly-Client-IP" \
     -d "penalty_box_duration=60" \
     -d "action=response" \
     -d "response%5Bstatus%5D=429" \
     -d "response%5Bcontent_type%5D=application%2Fjson" \
     --data-urlencode "response[content]={\"reply\": \"Ribbit... The Wise Frog needs a moment. Try again in a minute!\"}"

echo ""
echo "Activating version $NEW_VERSION..."
curl -s -X PUT -H "Fastly-Key: $FASTLY_API_KEY" \
  "https://api.fastly.com/service/$FASTLY_SERVICE_ID/version/$NEW_VERSION/activate"

echo "Edge Rate Limiting successfully deployed and active!"
