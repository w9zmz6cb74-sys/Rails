import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { handleX402Payment } from './src/middleware/x402Payment.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
// Retrieve ENCLAVE_SIGNER_KEY or generate a random 64-character hex key (32 bytes) in memory
const ENCLAVE_KEY =
  process.env.ENCLAVE_SIGNER_KEY ||
  process.env.ENCLAVE_SIGNER_SECRET ||
  crypto.randomBytes(32).toString('hex');

if (!process.env.ENCLAVE_SIGNER_KEY && !process.env.ENCLAVE_SIGNER_SECRET) {
  console.log(`[Enclave] ENCLAVE_SIGNER_KEY not set. Auto-generated 64-character mock key: ${ENCLAVE_KEY.slice(0, 10)}...${ENCLAVE_KEY.slice(-8)}`);
}

app.use(express.json());

/**
 * Route: POST /api/x402/quote
 * Generates mocked x402 micropayment challenge headers and cryptographic quote.
 */
app.post('/api/x402/quote', (req, res) => {
  const { path: endpointPath, priceUsd, recipientTba, paymentToken = 'USDC' } = req.body;
  const quoteNonce = `0x${crypto.randomBytes(16).toString('hex')}`;
  const expiry = Date.now() + 60000; // 60 seconds TTL

  // Sign quote with enclave secret
  const hmac = crypto.createHmac('sha256', ENCLAVE_KEY);
  hmac.update(`${endpointPath}:${priceUsd}:${recipientTba}:${quoteNonce}:${expiry}`);
  const quoteSignature = `0x${hmac.digest('hex')}`;

  res.status(402)
    .set({
      'WWW-Authenticate': `x402-eip712 realm="AgentRails Protocol", token="${paymentToken}", quote="${quoteNonce}"`,
      'X-Payment-Quote': quoteNonce,
      'X-Payment-Recipient': recipientTba || '0x7291a27e7f67727142436f5647563dae20d20ef5',
      'X-Payment-Amount-USD': (priceUsd || 0.02).toString(),
      'X-Payment-Expiry': expiry.toString(),
      'X-Enclave-Attestation': quoteSignature,
    })
    .json({
      error: 'Payment Required',
      statusCode: 402,
      protocol: 'x402-v1.4',
      quote: {
        nonce: quoteNonce,
        recipient: recipientTba,
        amountUsd: priceUsd || 0.02,
        token: paymentToken,
        expiry,
        attestation: quoteSignature,
      },
    });
});

/**
 * Route: POST /api/x402/sign
 * Server-side Enclave Signer:
 * Validates policy constraints on the server and signs an EIP-712 UserOperation
 * using the server's private enclave key without ever exposing it to client-side code.
 */
app.post('/api/x402/sign', (req, res) => {
  const {
    agentId,
    tbaAddress,
    recipientAddress,
    amountUsd,
    dailyLimitUsd,
    spentTodayUsd,
    maxPerTxUsd,
    allowedContractAddresses = [],
    quoteNonce,
  } = req.body;

  // 1. Invariant Evaluation on Server
  const violations: string[] = [];

  if (amountUsd > maxPerTxUsd) {
    violations.push(`Server Enclave Rejection: Amount $${amountUsd} exceeds max per-tx limit of $${maxPerTxUsd}`);
  }

  if (spentTodayUsd + amountUsd > dailyLimitUsd) {
    violations.push(
      `Server Enclave Rejection: Projected spend $${(spentTodayUsd + amountUsd).toFixed(2)} exceeds daily burn limit of $${dailyLimitUsd}`
    );
  }

  const isDrainAttempt = recipientAddress?.toLowerCase().includes('dead');
  if (isDrainAttempt) {
    violations.push('Server Enclave Rejection: Destination address identified as untrusted drain contract');
  }

  if (violations.length > 0) {
    return res.status(403).json({
      success: false,
      status: 'BLOCKED_BY_POLICY_FIREWALL',
      violations,
      timestamp: new Date().toISOString(),
    });
  }

  // 2. Generate Cryptographic EIP-712 Signature in Enclave
  const hmac = crypto.createHmac('sha256', ENCLAVE_KEY);
  hmac.update(`${agentId}:${tbaAddress}:${recipientAddress}:${amountUsd}:${quoteNonce || ''}`);
  const enclaveSignature = `0x${hmac.digest('hex')}${crypto.randomBytes(33).toString('hex')}`;
  const userOpHash = `0x${crypto.randomBytes(32).toString('hex')}`;

  return res.json({
    success: true,
    status: 'APPROVED',
    userOpHash,
    enclaveSignature,
    tbaAddress,
    recipientAddress,
    amountUsd,
    remainingDailyBudget: Math.max(0, dailyLimitUsd - (spentTodayUsd + amountUsd)),
    timestamp: new Date().toISOString(),
    signerEnclaveType: 'Intel SGX / AWS Nitro Enclave (Mocked with HMAC-SHA256 Secret)',
  });
});

/**
 * Route: POST /api/policy/validate
 * Standalone server-side policy validator
 */
app.post('/api/policy/validate', (req, res) => {
  const { policy, amountUsd, recipientAddress } = req.body;
  const violations: string[] = [];

  if (!policy) {
    return res.status(400).json({ error: 'Missing policy object' });
  }

  if (amountUsd > policy.maxPerTxUsd) {
    violations.push(`Exceeds max per-tx cap ($${policy.maxPerTxUsd})`);
  }
  if (policy.spentTodayUsd + amountUsd > policy.dailyLimitUsd) {
    violations.push(`Exceeds daily burn cap ($${policy.dailyLimitUsd})`);
  }
  if (recipientAddress?.toLowerCase().includes('dead')) {
    violations.push('Target address is flagged malicious drain contract');
  }

  const valid = violations.length === 0;
  return res.json({
    valid,
    status: valid ? 'APPROVED' : 'BLOCKED_BY_POLICY',
    violations,
    evaluatedAt: new Date().toISOString(),
  });
});

/**
 * Route: GET /api/v1/data-scout
 * Protected by handleX402Payment middleware (Permit2 Pay-per-Call)
 */
app.get('/api/v1/data-scout', handleX402Payment, (req, res) => {
  res.json({
    status: 'success',
    message: 'Payment verified via AgentRails x402 gateway.',
    data: {
      market_trend: 'Bullish',
      confidence_score: 0.94,
      timestamp: Math.floor(Date.now() / 1000),
      network: 'Base Mainnet (8453)',
      asset: 'USDC',
    },
  });
});

// Vite Middleware Integration (Dev) or Static File Serving (Prod)
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AgentRails Protocol Server running on port ${PORT}`);
  });
}

startServer();
