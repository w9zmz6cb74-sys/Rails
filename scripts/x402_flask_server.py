import base64
import json
import time
from functools import wraps
from flask import Flask, request, jsonify
from eth_account import Account
from eth_account.messages import encode_typed_data
from eth_utils import to_checksum_address

app = Flask(__name__)

# --- CONFIGURATION (Change these for your live app) ---
# Your wallet address that receives USDC payments:
RECIPIENT_WALLET = "0x7291a27e7f67727142436f5647563dae20d20ef5"

# Base Mainnet Chain ID = 8453 (Or 84532 for Base Sepolia testnet)
CHAIN_ID = 84532 

# USDC Token Contract Address on Base:
USDC_CONTRACT_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"

# Canonical Uniswap Permit2 Contract Address:
PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3"

# Price per API request in atomic units (e.g., 1000 = 0.001 USDC since USDC uses 6 decimals)
PRICE_PER_CALL_USDC = "1000"


def verify_permit2_signature(chain_id: int, token: str, amount: int, nonce: int, deadline: int, spender: str, signature: str, expected_signer: str) -> bool:
    """
    Recovers the signer address from an EIP-712 Permit2 authorization signature 
    and checks if it matches the agent's expected wallet address.
    """
    domain = {
        "name": "Permit2",
        "chainId": chain_id,
        "verifyingContract": to_checksum_address(PERMIT2_ADDRESS)
    }

    types = {
        "TokenPermissions": [
            {"name": "token", "type": "address"},
            {"name": "amount", "type": "uint256"}
        ],
        "PermitTransferFrom": [
            {"name": "permitted", "type": "TokenPermissions"},
            {"name": "spender", "type": "address"},
            {"name": "nonce", "type": "uint256"},
            {"name": "deadline", "type": "uint256"}
        ]
    }

    message = {
        "permitted": {
            "token": to_checksum_address(token),
            "amount": int(amount)
        },
        "spender": to_checksum_address(spender),
        "nonce": int(nonce),
        "deadline": int(deadline)
    }

    typed_data = {
        "types": types,
        "domain": domain,
        "primaryType": "PermitTransferFrom",
        "message": message
    }

    try:
        signable_message = encode_typed_data(full_message=typed_data)
        recovered_address = Account.recover_message(signable_message, signature=signature)
        return recovered_address.lower() == expected_signer.lower()
    except Exception:
        return False


def require_x402_payment(price_atomic_units: str):
    """
    Decorator that enforces HTTP 402 Pay-per-Call micropayments for AI Agents.
    """
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # Check for the X-PAYMENT header sent by the AI Agent
            x_payment_header = request.headers.get("X-PAYMENT")

            # STEP 1: If no payment signature is attached, reply with HTTP 402 Payment Required
            if not x_payment_header:
                payment_requirement = {
                    "x402Version": 1,
                    "accepts": [{
                        "scheme": "exact",
                        "network": f"eip155:{CHAIN_ID}",
                        "maxAmountRequired": price_atomic_units,
                        "resource": request.path,
                        "description": "AgentRails Paid API Service Call",
                        "payTo": to_checksum_address(RECIPIENT_WALLET),
                        "asset": to_checksum_address(USDC_CONTRACT_ADDRESS)
                    }]
                }
                return jsonify(payment_requirement), 402

            # STEP 2: Decode and verify payment signature
            try:
                # The X-PAYMENT header contains base64-encoded JSON payload
                decoded_bytes = base64.b64decode(x_payment_header)
                payment_payload = json.loads(decoded_bytes.decode('utf-8'))

                token = payment_payload["token"]
                amount = int(payment_payload["amount"])
                nonce = int(payment_payload["nonce"])
                deadline = int(payment_payload["deadline"])
                spender = payment_payload["spender"]
                signature = payment_payload["signature"]
                agent_address = payment_payload["agent_address"]

                # Expiration check
                if int(time.time()) > deadline:
                    return jsonify({"error": "Payment signature expired"}), 402

                # Amount check
                if amount < int(price_atomic_units):
                    return jsonify({"error": "Insufficient payment amount"}), 402

                # Cryptographic verification
                is_valid = verify_permit2_signature(
                    chain_id=CHAIN_ID,
                    token=token,
                    amount=amount,
                    nonce=nonce,
                    deadline=deadline,
                    spender=spender,
                    signature=signature,
                    expected_signer=agent_address
                )

                if not is_valid:
                    return jsonify({"error": "Invalid signature or unauthorized agent"}), 401

            except Exception as e:
                return jsonify({"error": f"Invalid X-PAYMENT payload: {str(e)}"}), 400

            # STEP 3: Payment verified! Execute and serve the underlying API endpoint
            return f(*args, **kwargs)

        return decorated_function
    return decorator


# --- PAID API ENDPOINTS FOR AI AGENTS ---

@app.route('/api/v1/data-scout', methods=['GET'])
@require_x402_payment(price_atomic_units=PRICE_PER_CALL_USDC)
def get_premium_data():
    """
    Example monetized endpoint. Charges 0.001 USDC per call.
    """
    return jsonify({
        "status": "success",
        "message": "Payment verified via AgentRails x402 gateway.",
        "data": {
            "market_trend": "Bullish",
            "confidence_score": 0.94,
            "timestamp": int(time.time())
        }
    }), 200


if __name__ == '__main__':
    # Run on local server (Port 5000)
    print(f"Starting AgentRails x402 Flask Server on port 5000...")
    print(f"Pay-to recipient: {RECIPIENT_WALLET}")
    app.run(host='0.0.0.0', port=5000, debug=True)
