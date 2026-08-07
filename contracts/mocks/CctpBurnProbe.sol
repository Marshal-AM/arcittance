// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "../interfaces/IERC20.sol";
import "../interfaces/ITokenMessengerV2.sol";

/** Live diagnostic — contract-initiated CCTP burn (mirrors CrossChainRouter.routeCCTP). */
contract CctpBurnProbe {
  function probeApprove(address usdc, address messenger, uint256 amount) external {
    (bool ok, ) = usdc.call(abi.encodeWithSelector(IERC20.approve.selector, messenger, amount));
    require(ok, "Approve call failed");
  }

  function probeBurn(
    address usdc,
    address messenger,
    uint256 amount,
    uint32 destinationDomain,
    bytes32 mintRecipient
  ) external returns (uint64) {
    (bool ok, ) = usdc.call(abi.encodeWithSelector(IERC20.approve.selector, messenger, amount));
    require(ok, "Approve call failed");
    return ITokenMessengerV2(messenger).depositForBurn(
      amount,
      destinationDomain,
      mintRecipient,
      usdc,
      bytes32(0),
      0,
      1000
    );
  }

  function probeBurnWithThreshold(
    address usdc,
    address messenger,
    uint256 amount,
    uint32 destinationDomain,
    bytes32 mintRecipient,
    uint32 minFinalityThreshold
  ) external returns (uint64) {
    (bool ok, ) = usdc.call(abi.encodeWithSelector(IERC20.approve.selector, messenger, amount));
    require(ok, "Approve call failed");
    return ITokenMessengerV2(messenger).depositForBurn(
      amount,
      destinationDomain,
      mintRecipient,
      usdc,
      bytes32(0),
      0,
      minFinalityThreshold
    );
  }
}
