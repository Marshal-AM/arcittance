// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/**
 * @title IPayrollScheduler
 * @notice Solidity-only payroll computation interface (single EVM, no cross-VM boundary).
 * @dev Stateless pure computation — no storage, no token access, no admin key.
 */
interface IPayrollScheduler {
    /**
     * @notice Compute due employees and their payment amounts
     * @dev Filters: nextPaymentDue[i] <= currentTimestamp AND salary <= approvedCap
     */
    function computePayroll(
        address[] calldata employees,
        uint256[] calldata salaries,
        uint256[] calldata nextPaymentDue,
        uint256[] calldata approvedCaps,
        uint256 currentTimestamp
    ) external returns (
        address[] memory dueEmployees,
        uint256[] memory amounts
    );
}
