import { randomUUID, publicEncrypt, createPublicKey } from "crypto";
import { getCircleConfig } from "./config";

const CIRCLE_API_BASE = "https://api.circle.com";

async function circleFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const { apiKey } = getCircleConfig();
  const res = await fetch(`${CIRCLE_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  return res;
}

async function encryptEntitySecret(): Promise<string> {
  const { walletsEntitySecret } = getCircleConfig();
  const secret = walletsEntitySecret.trim().replace(/^0x/, "");

  const pkRes = await circleFetch("/v1/w3s/config/entity/publicKey");
  if (!pkRes.ok) {
    const body = await pkRes.text();
    throw new Error(`Circle entity public key fetch failed (${pkRes.status}): ${body}`);
  }

  const pkJson = (await pkRes.json()) as { data?: { publicKey?: string } };
  const publicKeyPem = pkJson.data?.publicKey;
  if (!publicKeyPem) {
    throw new Error("Circle entity public key: unexpected response shape");
  }

  const key = createPublicKey(publicKeyPem);
  const plaintext = Buffer.from(secret, "hex");
  const cipher = publicEncrypt(
    { key, padding: 4 /* RSA_PKCS1_OAEP_PADDING */, oaepHash: "sha256" },
    plaintext
  );

  return cipher.toString("base64");
}

async function fetchDefaultWalletSetId(): Promise<string> {
  const res = await circleFetch("/v1/w3s/walletSets?pageSize=1");
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Circle wallet sets list failed (${res.status}): ${body}`);
  }

  const json = (await res.json()) as { data?: { walletSets?: { id: string }[] } };
  const walletSetId = json.data?.walletSets?.[0]?.id;
  if (!walletSetId) {
    throw new Error("No Circle wallet set found — create one in Circle Console first");
  }

  return walletSetId;
}

/** Health ping — list wallets (validates API key + W3S access). */
export async function pingWalletsApi(): Promise<void> {
  const res = await circleFetch("/v1/w3s/wallets?pageSize=1");
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Circle Wallets API ping failed (${res.status}): ${body}`);
  }
}

/** Create an ephemeral developer-controlled wallet on Arc testnet. */
export async function createTestWallet(): Promise<{ walletId: string; address: string }> {
  const [walletSetId, entitySecretCiphertext] = await Promise.all([
    fetchDefaultWalletSetId(),
    encryptEntitySecret(),
  ]);

  const res = await circleFetch("/v1/w3s/developer/wallets", {
    method: "POST",
    body: JSON.stringify({
      idempotencyKey: randomUUID(),
      accountType: "SCA",
      blockchains: ["ARC-TESTNET"],
      count: 1,
      walletSetId,
      entitySecretCiphertext,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Circle Wallets create failed (${res.status}): ${body}`);
  }

  const json = (await res.json()) as {
    data?: { wallets?: { id: string; address: string }[] };
  };

  const wallet = json.data?.wallets?.[0];
  if (!wallet?.id || !wallet?.address) {
    throw new Error("Circle Wallets create: unexpected response shape");
  }

  return { walletId: wallet.id, address: wallet.address };
}
