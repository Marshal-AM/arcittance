// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "./interfaces/ICrossChainRouter.sol";

/**
 * @title CrossChainRouterStub
 * @notice Phase 1 placeholder — emits auditable events until CCTP/Gateway impl (Phase 4).
 */
contract CrossChainRouterStub is ICrossChainRouter {
    event RouteCCTP(
        address indexed token,
        uint256 amount,
        uint32 indexed destinationDomain,
        address indexed recipient
    );

    event RouteGateway(
        address indexed token,
        uint256 amount,
        uint32 indexed destinationDomain,
        address indexed recipient
    );

    function routeCCTP(
        address token,
        uint256 amount,
        uint32 destinationDomain,
        address recipient
    ) external {
        emit RouteCCTP(token, amount, destinationDomain, recipient);
    }

    function routeGateway(
        address token,
        uint256 amount,
        uint32 destinationDomain,
        address recipient
    ) external {
        emit RouteGateway(token, amount, destinationDomain, recipient);
    }
}
