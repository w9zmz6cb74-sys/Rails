import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { z } from 'zod';
import { evaluateTransaction, Policy } from './firewall.js';
import { handleX402Payment } from './middleware/x402Payment.js';
import {
  runAgentExecutionPipeline,
  decodeTransactionCalldata,
  getPendingApprovals,
  resolvePendingApproval,
} from './services/pipelineEngine.js';
import { loadAuditRecords } from './services/firebase.js';
import { INITIAL_AGENTS } from './data/mockData.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Security and CORS middleware
app.use(
  helmet({
    contentSecurityPolicy: false, // Vite requires inline scripts / styles
    crossOriginEmbedderPolicy: false,
  })
);
app.use(cors());
app.use(express.json({ limit: '20kb' }));

// Secret key for mock enclave signatures
const ENCLAVE_KEY =
  process.env.ENCLAVE_SIGNER_KEY ||
  process.env.ENCLAVE_SIGNER_SECRET ||
  crypto.randomBytes(32).toString('hex');

// ============================================================================
// FIREWALL SCHEMAS & DEFAULT POLICY
// ============================================================================

const requestSchema = z.object({
  agentId: z.string().min(1),
  sessionKey: z.string().min(1),
  chainId: z.number().int().positive(),
  recipient: z.string(),
  contractAddress: z.string(),
  functionSelector: z.string().regex(/^0x[a-fA-F0-9]{8}$/),
  valueWei: z.string().regex(/^\d+$/),
});

const defaultPolicy: Policy = {
  enabled: true,
  chainId: 11155111,
  expiresAt: Date.now() + 60 * 60 * 1000,
  maximumTransactionWei: 10_000_000_000_000_000n, // 0.01 ETH / 10 USDC (1e16)
  maximumDailyWei: 50_000_000_000_000_000n,       // 0.05 ETH / 50 USDC (5e16)
  maximumTransactionsPerHour: 10,
  approvalThresholdWei: 8_000_000_000_000_000n,   // 0.008 ETH / 8 USDC (8e15)
  allowedRecipients: [
    '0x1111111111111111111111111111111111111111',
    '0x7291a27e7f67727142436f5647563dae20d20ef5',
    '0x1010101010101010101010101010101010101010',
  ],
  blockedRecipients: [
    '0x000000000000000000000000000000000000dead',
    '0x0000000000000000000000000000000000000000',
  ],
  allowedContracts: [
    '0x2222222222222222222222222222222222222222',
    '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
    '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238',
    '0x7291a27e7f67727142436f5647563dae20d20ef5',
  ],
  allowedFunctionSelectors: ['0xa9059cbb', '0x095ea7b3', '0x40200001', '0x23b872dd'],
};

// ============================================================================
// CORE FIREWALL & HEALTH ENDPOINTS
// ============================================================================

app.get('/health', (_request, response) => {
  response.json({ status: 'healthy' });
});

/**
 * POST /api/transactions/evaluate
 * Direct deterministic firewall evaluation endpoint
 */
app.post('/api/transactions/evaluate', (request, response) => {
  const parsed = requestSchema.safeParse(request.body);

  if (!parsed.success) {
    return response.status(400).json({
      status: 'DENY',
      reason: 'Invalid request',
      errors: parsed.error.flatten(),
    });
  }

  // Lookup agent-specific policy if registered, or default policy
  const matchedAgent = INITIAL_AGENTS.find((a) => a.id === parsed.data.agentId);
  const activePolicy: Policy = matchedAgent
    ? {
        enabled: matchedAgent.status === 'active',
        chainId: parsed.data.chainId,
        expiresAt: Date.parse(matchedAgent.policy.sessionKeyExpiresAt) || Date.now() + 3600000,
        maximumTransactionWei: BigInt(Math.floor(matchedAgent.policy.maxPerTxUsd * 1e6)),
        maximumDailyWei: BigInt(Math.floor(matchedAgent.policy.dailyLimitUsd * 1e6)),
        maximumTransactionsPerHour: matchedAgent.policy.velocityMaxPerHour || 10,
        approvalThresholdWei: BigInt(
          Math.floor((matchedAgent.policy.requireHumanApprovalAboveUsd || 10) * 1e6)
        ),
        allowedRecipients: [
          ...defaultPolicy.allowedRecipients,
          ...matchedAgent.policy.allowedContractAddresses,
        ],
        blockedRecipients: defaultPolicy.blockedRecipients,
        allowedContracts: [
          ...defaultPolicy.allowedContracts,
          ...matchedAgent.policy.allowedContractAddresses,
        ],
        allowedFunctionSelectors: defaultPolicy.allowedFunctionSelectors,
      }
    : {
        ...defaultPolicy,
        chainId: parsed.data.chainId,
        expiresAt: Date.now() + 60 * 60 * 1000,
      };

  const decision = evaluateTransaction(
    {
      ...parsed.data,
      valueWei: BigInt(parsed.data.valueWei),
      timestamp: Date.now(),
    },
    activePolicy,
    {
      spentTodayWei: matchedAgent ? BigInt(Math.floor(matchedAgent.policy.spentTodayUsd * 1e6)) : 0n,
      transactionsLastHour: 0,
    }
  );

  console.log({
    event: 'FIREWALL_DECISION',
    agentId: parsed.data.agentId,
    recipient: parsed.data.recipient,
    valueWei: parsed.data.valueWei,
    decision,
    timestamp: new Date().toISOString(),
  });

  const statusCode =
    decision.status === 'DENY'
      ? 403
      : decision.status === 'REVIEW'
        ? 202
        : 200;

  return response.status(statusCode).json(decision);
});

// ============================================================================
// 10-STAGE AGENT EXECUTION PIPELINE ROUTES
// ============================================================================

const AgentPipelineRequestSchema = z.object({
  agentId: z.string().min(1, 'Agent ID is required'),
  chain: z.enum(['base-sepolia', 'ethereum-sepolia', 'solana-devnet', 'arbitrum-sepolia']),
  sessionKeyAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid session key address'),
  sessionKeySignature: z.string().optional(),
  contractAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid contract address'),
  recipientAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid recipient address'),
  recipientName: z.string().optional(),
  amountUsd: z.number().positive('Amount must be positive'),
  tokenSymbol: z.string().default('USDC'),
  tokenAddress: z.string().optional(),
  functionCall: z.string().optional(),
  rawCalldata: z.string().optional(),
  type: z.enum(['x402_micropay', 'contract_call', 'token_transfer', 'inference_fee']).optional(),
  deadline: z.number().optional(),
});

app.post('/api/pipeline/execute', async (req, res) => {
  const parseResult = AgentPipelineRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      error: 'Invalid Request Envelope',
      issues: parseResult.error.format(),
    });
  }

  const pipelineReq = parseResult.data;
  const agent = INITIAL_AGENTS.find((a) => a.id === pipelineReq.agentId) || INITIAL_AGENTS[0];

  try {
    const result = await runAgentExecutionPipeline(pipelineReq, agent);
    return res.json(result);
  } catch (err: any) {
    console.error('[Pipeline Execution Error]:', err);
    return res.status(500).json({
      success: false,
      error: 'Internal execution pipeline error',
      message: err.message,
    });
  }
});

app.post('/api/pipeline/decode', (req, res) => {
  const { rawCalldata, contractAddress, recipientAddress, amountUsd, tokenSymbol } = req.body;
  const decoded = decodeTransactionCalldata(
    rawCalldata,
    contractAddress,
    recipientAddress,
    amountUsd,
    tokenSymbol
  );
  res.json({ success: true, decoded });
});

app.get('/api/pipeline/approvals', (_req, res) => {
  const pending = getPendingApprovals();
  res.json({ success: true, pending, count: pending.length });
});

app.post('/api/pipeline/approvals/:id/resolve', async (req, res) => {
  const approvalId = req.params.id;
  const { decision, operatorNotes, operatorId } = req.body;
  const resolution = await resolvePendingApproval(approvalId, decision, operatorNotes, operatorId);
  return res.json(resolution);
});

app.get('/api/pipeline/audit-records', async (_req, res) => {
  try {
    const records = await loadAuditRecords();
    res.json({ success: true, records, count: records.length });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================================
// X402 MICROPAYMENT ROUTES
// ============================================================================

app.post('/api/x402/quote', (req, res) => {
  const { path: endpointPath, priceUsd, recipientTba, paymentToken = 'USDC' } = req.body;
  const quoteNonce = `0x${crypto.randomBytes(16).toString('hex')}`;
  const expiry = Date.now() + 60000;

  const hmac = crypto.createHmac('sha256', ENCLAVE_KEY);
  hmac.update(`${endpointPath}:${priceUsd}:${recipientTba}:${quoteNonce}:${expiry}`);
  const quoteSignature = `0x${hmac.digest('hex')}`;

  res
    .status(402)
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

app.post('/api/x402/sign', (req, res) => {
  const {
    agentId,
    tbaAddress,
    recipientAddress,
    amountUsd,
    dailyLimitUsd,
    spentTodayUsd,
    maxPerTxUsd,
    quoteNonce,
  } = req.body;

  const violations: string[] = [];
  if (amountUsd > maxPerTxUsd) {
    violations.push(`Server Enclave Rejection: Amount $${amountUsd} exceeds max per-tx limit of $${maxPerTxUsd}`);
  }
  if (spentTodayUsd + amountUsd > dailyLimitUsd) {
    violations.push(
      `Server Enclave Rejection: Projected spend $${(spentTodayUsd + amountUsd).toFixed(2)} exceeds daily limit of $${dailyLimitUsd}`
    );
  }
  if (recipientAddress?.toLowerCase().includes('dead')) {
    violations.push('Server Enclave Rejection: Destination address identified as malicious drain contract');
  }

  if (violations.length > 0) {
    return res.status(403).json({
      success: false,
      status: 'BLOCKED_BY_POLICY_FIREWALL',
      violations,
      timestamp: new Date().toISOString(),
    });
  }

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

app.get('/api/v1/data-scout', handleX402Payment, (_req, res) => {
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

// ============================================================================
// VITE DEV MIDDLEWARE OR PRODUCTION STATIC SERVING (PORT 3000)
// ============================================================================

export async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      root: projectRoot,
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(projectRoot, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(projectRoot, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AgentRails Protocol Server running on port ${PORT}`);
  });
}

startServer();

export default app;
