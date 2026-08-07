// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "../interfaces/ICrossChainRouter.sol";
import "../interfaces/IERC20.sol";

/**
 * @title MockCrossChainRouter
 * @notice Test double for ICrossChainRouter — records call counts and last args.
 */
contract MockCrossChainRouter is ICrossChainRouter {
    uint256 public cctpCallCount;
    uint256 public gatewayCallCount;

    address public lastToken;
    uint256 public lastAmount;
    uint32  public lastDestinationDomain;
    address public lastRecipient;

    bool public failCCTP;
    bool public failGateway;

    function routeCCTP(
        address token,
        uint256 amount,
        uint32 destinationDomain,
        address recipient
    ) external {
        if (failCCTP) revert("MockCrossChainRouter: forced CCTP failure");
        require(
            IERC20(token).transferFrom(msg.sender, address(this), amount),
            "Mock transferFrom failed"
        );
        cctpCallCount++;
        lastToken             = token;
        lastAmount            = amount;
        lastDestinationDomain = destinationDomain;
        lastRecipient         = recipient;
    }

    function routeGateway(
        address token,
        uint256 amount,
        uint32 destinationDomain,
        address recipient
    ) external {
        if (failGateway) revert("MockCrossChainRouter: forced Gateway failure");
        require(
            IERC20(token).transferFrom(msg.sender, address(this), amount),
            "Mock transferFrom failed"
        );
        gatewayCallCount++;
        lastToken             = token;
        lastAmount            = amount;
        lastDestinationDomain = destinationDomain;
        lastRecipient         = recipient;
    }

    function setFailCCTP(bool v) external { failCCTP = v; }
    function setFailGateway(bool v) external { failGateway = v; }
}
