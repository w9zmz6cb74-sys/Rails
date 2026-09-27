import { verifyTypedData, getAddress } from 'viem';
import type { Request, Response, NextFunction } from 'express';

// --- CONFIGURATION ---
// Your live wallet address set to receive USDC payouts:
export const RECIPIENT_WALLET = "0x9edd941e433ae3896a8adea7aaccc8bd0869a2b4"; 

// Base Mainnet Chain ID = 8453 (Change to 84532 for Base Sepolia Testnet)
export const CHAIN_ID = 8453; 

// Base Mainnet USDC Contract Address:
export const USDC_CONTRACT = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

// Canonical Uniswap Permit2 Contract Address:
export const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

// Price per API call: 1000 atomic units = 0.001 USDC
export const PRICE_PER_CALL = "1000";

// EIP-712 Domain and Types for Uniswap Permit2
export const permit2Domain = {
  name: 'Permit2',
  chainId: CHAIN_ID,
  verifyingContract: PERMIT2_ADDRESS as `0x${string}`,
} as const;

export const permit2Types = {
  TokenPermissions: [
    { name: 'token', type: 'address' },
    { name: 'amount', type: 'uint256' },
  ],
  PermitTransferFrom: [
    { name: 'permitted', type: 'TokenPermissions' },
    { name: 'spender', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

/**
 * Middleware function to enforce HTTP 402 Pay-per-Call Micropayments
 */
export async function handleX402Payment(req: Request, res: Response, next: NextFunction) {
  const xPaymentHeader = req.headers['x-payment'] as string | undefined;

  // 1. If no payment header is attached, send HTTP 402 Payment Required challenge
  if (!xPaymentHeader) {
    return res.status(402).json({
      x402Version: 1,
      accepts: [{
        scheme: 'exact',
        network: `eip155:${CHAIN_ID}`,
        maxAmountRequired: PRICE_PER_CALL,
        resource: req.path,
        description: 'AgentRails Paid API Service Call',
        payTo: getAddress(RECIPIENT_WALLET),
        asset: getAddress(USDC_CONTRACT),
      }]
    });
  }

  // 2. Decode and verify payment signature
  try {
    const decoded = JSON.parse(Buffer.from(xPaymentHeader, 'base64').toString('utf-8'));
    const { token, amount, nonce, deadline, spender, signature, agent_address } = decoded;

    // Check expiration
    const currentTime = Math.floor(Date.now() / 1000);
    if (currentTime > Number(deadline)) {
      return res.status(402).json({ error: 'Payment signature expired' });
    }

    // Verify EIP-712 Signature using viem
    const isValid = await verifyTypedData({
      address: agent_address as `0x${string}`,
      domain: permit2Domain,
      types: permit2Types,
      primaryType: 'PermitTransferFrom',
      message: {
        permitted: {
          token: getAddress(token),
          amount: BigInt(amount),
        },
        spender: getAddress(spender),
        nonce: BigInt(nonce),
        deadline: BigInt(deadline),
      },
      signature: signature as `0x${string}`,
    });

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid signature or unauthorized agent' });
    }

    // Signature verified! Proceed to API handler
    next();
  } catch (err: any) {
    return res.status(400).json({ error: `Invalid payment header: ${err.message}` });
  }
}
