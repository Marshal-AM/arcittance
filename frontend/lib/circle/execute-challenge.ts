"use client";

import { remitDebug } from "@/lib/remit-debug";

const CIRCLE_APP_ID = process.env.NEXT_PUBLIC_CIRCLE_APP_ID ?? "";

export async function executeCircleChallenge(params: {
  userToken: string;
  encryptionKey: string;
  challengeId: string;
}): Promise<void> {
  if (!CIRCLE_APP_ID) {
    throw new Error("NEXT_PUBLIC_CIRCLE_APP_ID is not set");
  }

  remitDebug("challenge.execute.start", { challengeId: params.challengeId });

  const { W3SSdk } = await import("@circle-fin/w3s-pw-web-sdk");
  const sdk = new W3SSdk({ appSettings: { appId: CIRCLE_APP_ID } });
  sdk.setAuthentication({
    userToken:     params.userToken,
    encryptionKey: params.encryptionKey,
  });

  await new Promise<void>((resolve, reject) => {
    sdk.execute(params.challengeId, (err) => {
      if (err) {
        remitDebug("challenge.execute.error", {
          challengeId: params.challengeId,
          message: (err as Error).message ?? String(err),
        });
        reject(err);
        return;
      }
      remitDebug("challenge.execute.done", { challengeId: params.challengeId });
      resolve();
    });
  });
}
