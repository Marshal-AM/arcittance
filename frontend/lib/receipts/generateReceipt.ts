import PDFDocument from "pdfkit";

export interface ReceiptData {
  id: string;
  sender: string;
  recipient: string;
  amount: string;
  fee: string;
  netAmount: string;
  destination: string;
  routingMethod: string;
  txHash?: string | null;
  attestationHash?: string | null;
  timestamp: string;
  type?: "single" | "batch";
  batchRecipients?: number;
  /** Dual-rail settlement trail (funding → optional StableFX → delivery). */
  legs?: {
    funding?: {
      path?: "A" | "B";
      walletAddress?: string;
      bankRefMasked?: string;
      mintTxHash?: string;
      amount?: string;
      status?: string;
    };
    /** Legacy Payins leg (pre dual-rail) */
    payin?: {
      paymentIntentId?: string;
      amount?: string;
      status?: string;
      receivedAt?: string;
      depositAddress?: string;
    };
    custody?: {
      walletId?: string;
      balanceUsdc?: string;
      balanceEurc?: string;
    };
    fx?: {
      quoteId?: string;
      tradeId?: string;
      rate?: string;
      fee?: string;
      settlementTxHash?: string;
      pair?: string;
    };
    delivery?: {
      mode?: "crypto" | "fiat";
      method?: string;
      payoutId?: string;
      amount?: string;
      currency?: string;
      status?: string;
      txHash?: string;
      chain?: string;
    };
    payout?: {
      payoutId?: string;
      amount?: string;
      currency?: string;
      status?: string;
      txHash?: string;
      chain?: string;
    };
  };
}

/** Generate a JSON receipt when PDFKit is unavailable (e.g. dev bundle path issues). */
export function generateReceiptJson(data: ReceiptData): string {
  return JSON.stringify(
    {
      title: "Arcittance Remittance Receipt",
      receiptId: data.id,
      timestamp: data.timestamp,
      sender: data.sender,
      recipient: data.recipient,
      destination: data.destination,
      routing: data.routingMethod,
      amountUsdc: data.amount,
      feesUsdc: data.fee,
      netUsdc: data.netAmount,
      txHash: data.txHash ?? null,
      attestation: data.attestationHash ?? null,
      legs: data.legs ?? null,
      disclaimer:
        "Dual-rail: Path A Circle Wallet or Path B Mint bank→mint; optional StableFX; delivery via CCTP/Gateway/Payouts/bank (sandbox).",
    },
    null,
    2
  );
}

function maskBankRef(ref?: string | null): string | undefined {
  if (!ref) return undefined;
  if (ref.length <= 6) return "***";
  return `${ref.slice(0, 3)}…${ref.slice(-3)}`;
}

/** Generate a PDF receipt buffer for a settled remittance. */
export async function generateReceiptPdf(data: ReceiptData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(20).text("Arcittance Remittance Receipt", { align: "center" });
    doc.moveDown();
    doc.fontSize(10).fillColor("#666").text(`Receipt ID: ${data.id}`, { align: "center" });
    doc.moveDown(1.5);

    doc.fillColor("#000").fontSize(12);
    const rows: [string, string][] = [
      ["Date", data.timestamp],
      ["Sender", data.sender],
      ["Recipient", data.recipient],
      ["Destination", data.destination],
      ["Routing", data.routingMethod],
      ["Amount (USDC)", data.amount],
      ["Fees (USDC)", data.fee],
      ["Net received (USDC)", data.netAmount],
    ];

    if (data.type === "batch" && data.batchRecipients != null) {
      rows.push(["Batch recipients", String(data.batchRecipients)]);
    }
    if (data.txHash) rows.push(["Transaction hash", data.txHash]);
    if (data.attestationHash) rows.push(["Attestation hash", data.attestationHash]);

    if (data.legs) {
      rows.push(["—", "—"]);
      const funding = data.legs.funding;
      if (funding) {
        const pathLabel =
          funding.path === "B" ? "Bank wire → minted onchain" : "Wallet balance used";
        rows.push([
          `Funding · ${pathLabel}`,
          [
            funding.walletAddress,
            funding.bankRefMasked ?? maskBankRef(funding.bankRefMasked),
            funding.mintTxHash,
            funding.amount,
            funding.status,
          ]
            .filter(Boolean)
            .join(" · "),
        ]);
      } else if (data.legs.payin) {
        rows.push([
          "Funding · Payin (legacy)",
          [
            data.legs.payin.paymentIntentId,
            data.legs.payin.amount ? `${data.legs.payin.amount} USDC` : null,
            data.legs.payin.status,
          ]
            .filter(Boolean)
            .join(" · "),
        ]);
      } else if (data.legs.custody?.walletId || data.legs.custody?.balanceUsdc) {
        rows.push([
          "Funding · Wallet",
          [
            data.legs.custody.walletId,
            data.legs.custody.balanceUsdc
              ? `balance ${data.legs.custody.balanceUsdc} USDC`
              : null,
          ]
            .filter(Boolean)
            .join(" · "),
        ]);
      }

      if (data.legs.fx) {
        rows.push([
          "Conversion · StableFX",
          [
            data.legs.fx.pair,
            data.legs.fx.quoteId ? `quote ${data.legs.fx.quoteId}` : null,
            data.legs.fx.rate ? `rate ${data.legs.fx.rate}` : null,
            data.legs.fx.fee ? `fee ${data.legs.fx.fee}` : null,
            data.legs.fx.settlementTxHash,
          ]
            .filter(Boolean)
            .join(" · "),
        ]);
      }

      const delivery = data.legs.delivery ?? data.legs.payout;
      if (delivery) {
        const method =
          ("method" in delivery ? delivery.method : undefined) ??
          ("mode" in delivery ? delivery.mode : undefined) ??
          "payout";
        rows.push([
          `Delivery · ${method}`,
          [
            delivery.payoutId,
            delivery.amount ? `${delivery.amount} ${delivery.currency ?? ""}` : null,
            delivery.txHash,
            delivery.status,
            "chain" in delivery ? delivery.chain : null,
          ]
            .filter(Boolean)
            .join(" · "),
        ]);
      }
    }

    for (const [label, value] of rows) {
      if (label === "—" && value === "—") {
        doc.moveDown(0.5);
        doc.fontSize(11).text("Settlement trail", { underline: true });
        doc.moveDown(0.3);
        doc.fontSize(12);
        continue;
      }
      doc.font("Helvetica-Bold").text(`${label}:`, { continued: true });
      doc.font("Helvetica").text(` ${value}`);
      doc.moveDown(0.3);
    }

    doc.moveDown();
    doc
      .fontSize(9)
      .fillColor("#888")
      .text(
        "Dual-rail remittance (sandbox). Receipt lists only legs that actually ran — no fabricated fiat.",
        { align: "center" }
      );

    doc.end();
  });
}
