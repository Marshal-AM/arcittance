// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title FXSettlementEscrow
 * @notice Thin PvP registry linking a remittance to a StableFX trade.
 * @dev Circle's FxEscrow + Permit2 settle the FX leg on-chain. This contract
 *      only records both legs (FX + remittance payout) for payment-vs-payment
 *      tracking — it does not custody USDC.
 */
contract FXSettlementEscrow is Ownable {
    struct Settlement {
        bytes32 stableFxTradeId;
        address payer;
        uint256 usdcAmount;
        bytes32 fxSettlementTxHash;
        bytes32 payoutTxHash;
        bool    fxConfirmed;
        bool    payoutConfirmed;
        bool    opened;
    }

    address public orchestrator;

    mapping(bytes32 => Settlement) public settlements;

    event SettlementOpened(
        bytes32 indexed remittanceRef,
        bytes32 indexed stableFxTradeId,
        address indexed payer,
        uint256 usdcAmount
    );
    event FxConfirmed(bytes32 indexed remittanceRef, bytes32 settlementTxHash);
    event PayoutConfirmed(bytes32 indexed remittanceRef, bytes32 payoutTxHash);
    event OrchestratorUpdated(address indexed orchestrator);

    modifier onlyOrchestrator() {
        require(msg.sender == orchestrator || msg.sender == owner(), "Not orchestrator");
        _;
    }

    constructor(address _orchestrator) Ownable(msg.sender) {
        require(_orchestrator != address(0), "Invalid orchestrator");
        orchestrator = _orchestrator;
    }

    function setOrchestrator(address _orchestrator) external onlyOwner {
        require(_orchestrator != address(0), "Invalid orchestrator");
        orchestrator = _orchestrator;
        emit OrchestratorUpdated(_orchestrator);
    }

    function open(
        bytes32 remittanceRef,
        bytes32 stableFxTradeId,
        address payer,
        uint256 usdcAmount
    ) external onlyOrchestrator {
        require(remittanceRef != bytes32(0), "Invalid remittance ref");
        require(stableFxTradeId != bytes32(0), "Invalid trade id");
        require(payer != address(0), "Invalid payer");
        require(usdcAmount > 0, "Amount must be > 0");
        require(!settlements[remittanceRef].opened, "Already opened");

        settlements[remittanceRef] = Settlement({
            stableFxTradeId:    stableFxTradeId,
            payer:              payer,
            usdcAmount:         usdcAmount,
            fxSettlementTxHash: bytes32(0),
            payoutTxHash:       bytes32(0),
            fxConfirmed:        false,
            payoutConfirmed:    false,
            opened:             true
        });

        emit SettlementOpened(remittanceRef, stableFxTradeId, payer, usdcAmount);
    }

    function confirmFx(bytes32 remittanceRef, bytes32 settlementTxHash) external onlyOrchestrator {
        Settlement storage s = settlements[remittanceRef];
        require(s.opened, "Unknown settlement");
        require(!s.fxConfirmed, "FX already confirmed");
        require(settlementTxHash != bytes32(0), "Invalid tx hash");

        s.fxConfirmed = true;
        s.fxSettlementTxHash = settlementTxHash;
        emit FxConfirmed(remittanceRef, settlementTxHash);
    }

    function confirmPayout(bytes32 remittanceRef, bytes32 payoutTxHash) external onlyOrchestrator {
        Settlement storage s = settlements[remittanceRef];
        require(s.opened, "Unknown settlement");
        require(s.fxConfirmed, "FX not confirmed");
        require(!s.payoutConfirmed, "Payout already confirmed");
        require(payoutTxHash != bytes32(0), "Invalid tx hash");

        s.payoutConfirmed = true;
        s.payoutTxHash = payoutTxHash;
        emit PayoutConfirmed(remittanceRef, payoutTxHash);
    }

    function isSettled(bytes32 remittanceRef) external view returns (bool) {
        Settlement storage s = settlements[remittanceRef];
        return s.opened && s.fxConfirmed && s.payoutConfirmed;
    }

    function getSettlement(bytes32 remittanceRef) external view returns (Settlement memory) {
        return settlements[remittanceRef];
    }
}
