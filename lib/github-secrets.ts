// Server-only — creates GitHub Actions repository secrets via the GitHub
// API for a newly-registered dynamic agent. Each secret is encrypted
// client-side (well, server-side here, but "client" from GitHub's API
// perspective) with the repo's public key using libsodium sealed-box
// encryption, the same scheme GitHub's own docs specify and the same
// scheme this project's Python side already uses (PyNaCl) for the
// equivalent operation.
//
// Requires GITHUB_SECRETS_PAT in the environment: a fine-grained PAT
// scoped to just the Paper-trading-agent repo with "Secrets: Read and
// write" permission and nothing else. Never exposed to the client —
// this file is only ever imported from API route handlers.

import sodium from "libsodium-wrappers";

const OWNER = "FlashedPepper76";
const REPO = "Paper-trading-agent";

function githubHeaders() {
  const token = process.env.GITHUB_SECRETS_PAT;
  if (!token) {
    throw new Error(
      "GITHUB_SECRETS_PAT is not set. This needs to be a fine-grained GitHub PAT scoped to " +
        `${OWNER}/${REPO} with 'Secrets: Read and write' permission, set as a server-only ` +
        "environment variable in Vercel."
    );
  }
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

let publicKeyCache: { key_id: string; key: string } | null = null;

async function getRepoPublicKey(): Promise<{ key_id: string; key: string }> {
  if (publicKeyCache) return publicKeyCache;
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/actions/secrets/public-key`, {
    headers: githubHeaders(),
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch repo public key: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  publicKeyCache = { key_id: data.key_id, key: data.key };
  return publicKeyCache;
}

async function encryptSecret(value: string, publicKeyBase64: string): Promise<string> {
  await sodium.ready;
  const binPublicKey = sodium.from_base64(publicKeyBase64, sodium.base64_variants.ORIGINAL);
  const binSecret = sodium.from_string(value);
  const encryptedBytes = sodium.crypto_box_seal(binSecret, binPublicKey);
  return sodium.to_base64(encryptedBytes, sodium.base64_variants.ORIGINAL);
}

async function putSecret(name: string, value: string): Promise<void> {
  const { key_id, key } = await getRepoPublicKey();
  const encrypted_value = await encryptSecret(value, key);
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/actions/secrets/${name}`, {
    method: "PUT",
    headers: { ...githubHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ encrypted_value, key_id }),
  });
  if (!res.ok) {
    throw new Error(`Failed to create secret ${name}: ${res.status} ${await res.text()}`);
  }
}

export type AgentSecrets = {
  alpacaApiKey: string;
  alpacaSecretKey: string;
  geminiApiKey: string;
  geminiApiKey2?: string;
  groqApiKey?: string;
};

// Creates every secret trade_dynamic.yml/snapshot_dynamic.yml expect for
// this agent_id, following the "_<agent_id>" suffix convention (see those
// workflow files — GitHub matches secret names case-insensitively, so the
// agent_id's case doesn't need to match anything in particular).
export async function createAgentSecrets(agentId: string, secrets: AgentSecrets): Promise<void> {
  const entries: [string, string | undefined][] = [
    [`ALPACA_API_KEY_${agentId}`, secrets.alpacaApiKey],
    [`ALPACA_SECRET_KEY_${agentId}`, secrets.alpacaSecretKey],
    [`GEMINI_API_KEY_${agentId}`, secrets.geminiApiKey],
    [`GEMINI_API_KEY_${agentId}_2`, secrets.geminiApiKey2],
    [`GROQ_API_KEY_${agentId}`, secrets.groqApiKey],
  ];

  // Sequential, not Promise.all — GitHub's secrets API is not high-volume
  // and this keeps error attribution (which secret failed) unambiguous.
  for (const [name, value] of entries) {
    if (!value) continue;
    await putSecret(name, value);
  }
}
