// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "../interfaces/ITokenMessengerV2.sol";
import "../interfaces/IERC20.sol";

contract MockTokenMessenger is ITokenMessengerV2 {
    uint64 public nextNonce = 1;

    function depositForBurn(
        uint256 amount,
        uint32 destinationDomain,
        bytes32 mintRecipient,
        address burnToken,
        bytes32 destinationCaller,
        uint256 maxFee,
        uint32 minFinalityThreshold
    ) external returns (uint64 nonce) {
        require(amount > 0, "amount");
        require(destinationDomain > 0, "domain");
        require(mintRecipient != bytes32(0), "recipient");
        require(burnToken != address(0), "token");

        require(
            IERC20(burnToken).transferFrom(msg.sender, address(this), amount),
            "transferFrom failed"
        );

        nonce = nextNonce++;
        return nonce;
    }
}
