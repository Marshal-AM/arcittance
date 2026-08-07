// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/**
 * @title MockSchedulerReentry
 * @notice Scheduler mock that attempts to reenter PayrollVault.runPayroll()
 *         when computePayroll() is called — tests ReentrancyGuard.
 */
contract MockSchedulerReentry {
    address public vault;

    function setVault(address _vault) external {
        vault = _vault;
    }

    function computePayroll(
        address[] calldata,
        uint256[] calldata,
        uint256[] calldata,
        uint256[] calldata,
        uint256
    ) external returns (
        address[] memory dueEmployees,
        uint256[] memory amounts
    ) {
        (bool success,) = vault.call(abi.encodeWithSignature("runPayroll()"));
        if (!success) {
            revert("ReentrancyGuard: reentrant call blocked");
        }
        return (new address[](0), new uint256[](0));
    }
}
