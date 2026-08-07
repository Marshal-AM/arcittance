// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/**
 * @title ICrossChainRouter
 * @notice Cross-chain routing via Circle CCTP and Gateway (implemented Phase 4).
 */
interface ICrossChainRouter {
    function routeCCTP(
        address token,
        uint256 amount,
        uint32 destinationDomain,
        address recipient
    ) external;

    function routeGateway(
        address token,
        uint256 amount,
        uint32 destinationDomain,
        address recipient
    ) external;
}
