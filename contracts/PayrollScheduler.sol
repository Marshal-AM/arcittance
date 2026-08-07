// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "./interfaces/IPayrollScheduler.sol";

/**
 * @title PayrollScheduler
 * @notice Pure-Solidity payroll due-date and cap filtering.
 * @dev Stateless: no storage, no token access, no admin key.
 */
contract PayrollScheduler is IPayrollScheduler {
    function computePayroll(
        address[] calldata employees,
        uint256[] calldata salaries,
        uint256[] calldata nextPaymentDue,
        uint256[] calldata approvedCaps,
        uint256 currentTimestamp
    ) external pure returns (
        address[] memory dueEmployees,
        uint256[] memory amounts
    ) {
        uint256 len = employees.length;
        address[] memory tempAddr = new address[](len);
        uint256[] memory tempAmt  = new uint256[](len);
        uint256 count = 0;

        for (uint256 i = 0; i < len; i++) {
            if (nextPaymentDue[i] > currentTimestamp) continue;
            if (salaries[i] > approvedCaps[i]) continue;
            tempAddr[count] = employees[i];
            tempAmt[count]  = salaries[i];
            count++;
        }

        dueEmployees = new address[](count);
        amounts      = new uint256[](count);
        for (uint256 i = 0; i < count; i++) {
            dueEmployees[i] = tempAddr[i];
            amounts[i]      = tempAmt[i];
        }
    }
}
