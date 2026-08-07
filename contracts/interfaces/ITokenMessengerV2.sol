// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/**
 * @title ITokenMessengerV2
 * @notice Circle CCTP V2 TokenMessenger — burn USDC on source chain.
 * @dev Arc Testnet: 0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA
 */
interface ITokenMessengerV2 {
    function depositForBurn(
        uint256 amount,
        uint32 destinationDomain,
        bytes32 mintRecipient,
        address burnToken,
        bytes32 destinationCaller,
        uint256 maxFee,
        uint32 minFinalityThreshold
    ) external returns (uint64 nonce);
}
