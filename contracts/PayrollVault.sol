// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IPayrollScheduler.sol";
import "./interfaces/ICrossChainRouter.sol";

/**
 * @title PayrollVault
 * @notice On-chain payroll vault with Arc-local and CCTP/Gateway cross-chain payments.
 * @dev destinationChainId 0 = Arc-local; >0 = cross-chain via ICrossChainRouter.
 *      routingMethod 0 = CCTP (point-to-point), 1 = Gateway (unified balance).
 */
contract PayrollVault is Ownable, ReentrancyGuard {
    uint8 public constant ROUTING_CCTP = 0;
    uint8 public constant ROUTING_GATEWAY = 1;

    struct Employee {
        address wallet;
        uint256 salaryAmount;
        address payToken;
        uint256 payInterval;
        uint256 nextPaymentDue;
        uint256 approvedCap;
        uint32  destinationChainId;
        uint8   routingMethod;
        uint8   transferSpeed; // 0 = standard CCTP, 1 = fast CCTP (orchestrator hint)
        bool    active;
    }

    mapping(uint256 => Employee) public employees;
    uint256 public employeeCount;
    address public immutable schedulerContract;
    address public immutable crossChainRouter;

    event VaultDeposited(address indexed token, uint256 amount);
    event EmployeeRegistered(
        uint256 indexed id,
        address indexed wallet,
        uint256 salary,
        uint32 destinationChainId,
        uint8 routingMethod
    );
    event EmployeeDeactivated(uint256 indexed id);
    event PayrollExecuted(uint256 employeeCount, uint256 totalPayout);

    constructor(address _schedulerContract, address _crossChainRouter) Ownable(msg.sender) {
        require(_schedulerContract != address(0), "Invalid scheduler address");
        require(_crossChainRouter != address(0), "Invalid router address");
        schedulerContract = _schedulerContract;
        crossChainRouter  = _crossChainRouter;
    }

    function deposit(address token, uint256 amount) external onlyOwner {
        require(token != address(0), "Invalid token");
        require(amount > 0, "Amount must be > 0");
        require(
            IERC20(token).transferFrom(msg.sender, address(this), amount),
            "Transfer failed"
        );
        emit VaultDeposited(token, amount);
    }

    function registerEmployee(
        address wallet,
        uint256 salary,
        address token,
        uint256 interval,
        uint256 cap,
        uint32 destinationChainId,
        uint8 routingMethod,
        uint8 transferSpeed
    ) external onlyOwner returns (uint256 id) {
        require(wallet != address(0), "Invalid wallet");
        require(salary > 0, "Salary must be > 0");
        require(token != address(0), "Invalid token");
        require(interval > 0, "Interval must be > 0");
        require(cap >= salary, "Cap must be >= salary");
        require(routingMethod <= ROUTING_GATEWAY, "Invalid routing method");

        id = employeeCount++;
        employees[id] = Employee({
            wallet:             wallet,
            salaryAmount:       salary,
            payToken:           token,
            payInterval:        interval,
            nextPaymentDue:     block.timestamp,
            approvedCap:        cap,
            destinationChainId: destinationChainId,
            routingMethod:      routingMethod,
            transferSpeed:      transferSpeed,
            active:             true
        });
        emit EmployeeRegistered(id, wallet, salary, destinationChainId, routingMethod);
    }

    function deactivateEmployee(uint256 id) external onlyOwner {
        require(employees[id].active, "Already inactive");
        employees[id].active = false;
        emit EmployeeDeactivated(id);
    }

    function runPayroll() external nonReentrant {
        uint256 count = employeeCount;
        address[] memory wallets    = new address[](count);
        uint256[] memory salaries   = new uint256[](count);
        uint256[] memory nextDue    = new uint256[](count);
        uint256[] memory caps       = new uint256[](count);
        uint256   activeCount       = 0;
        address   payToken          = address(0);

        for (uint256 i = 0; i < count; i++) {
            if (employees[i].active) {
                wallets[activeCount]  = employees[i].wallet;
                salaries[activeCount] = employees[i].salaryAmount;
                nextDue[activeCount]  = employees[i].nextPaymentDue;
                caps[activeCount]     = employees[i].approvedCap;
                if (activeCount == 0) payToken = employees[i].payToken;
                activeCount++;
            }
        }

        assembly {
            mstore(wallets,  activeCount)
            mstore(salaries, activeCount)
            mstore(nextDue,  activeCount)
            mstore(caps,     activeCount)
        }

        if (activeCount == 0) return;

        (address[] memory dueEmployees, uint256[] memory amounts) =
            IPayrollScheduler(schedulerContract).computePayroll(
                wallets, salaries, nextDue, caps, block.timestamp
            );

        if (dueEmployees.length == 0) return;

        uint256 totalPayout = 0;
        for (uint256 i = 0; i < amounts.length; i++) {
            totalPayout += amounts[i];
        }
        require(
            IERC20(payToken).balanceOf(address(this)) >= totalPayout,
            "Insufficient vault balance"
        );

        for (uint256 i = 0; i < dueEmployees.length; i++) {
            (uint32 destId, uint8 routingMethod) = _getEmployeeRouting(dueEmployees[i]);
            if (destId == 0) {
                require(
                    IERC20(payToken).transfer(dueEmployees[i], amounts[i]),
                    "Local transfer failed"
                );
            } else {
                require(
                    IERC20(payToken).approve(crossChainRouter, amounts[i]),
                    "Approve router failed"
                );
                if (routingMethod == ROUTING_GATEWAY) {
                    ICrossChainRouter(crossChainRouter).routeGateway(
                        payToken,
                        amounts[i],
                        destId,
                        dueEmployees[i]
                    );
                } else {
                    ICrossChainRouter(crossChainRouter).routeCCTP(
                        payToken,
                        amounts[i],
                        destId,
                        dueEmployees[i]
                    );
                }
            }
        }

        _updateDueDates(dueEmployees);
        emit PayrollExecuted(dueEmployees.length, totalPayout);
    }

    function getEmployee(uint256 id) external view returns (Employee memory) {
        return employees[id];
    }

    function vaultBalance(address token) external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }

    function _getEmployeeRouting(address wallet) internal view returns (uint32 destId, uint8 routingMethod) {
        for (uint256 i = 0; i < employeeCount; i++) {
            if (employees[i].wallet == wallet && employees[i].active) {
                return (employees[i].destinationChainId, employees[i].routingMethod);
            }
        }
        return (0, ROUTING_CCTP);
    }

    function _updateDueDates(address[] memory paid) internal {
        for (uint256 i = 0; i < paid.length; i++) {
            for (uint256 j = 0; j < employeeCount; j++) {
                if (employees[j].wallet == paid[i] && employees[j].active) {
                    employees[j].nextPaymentDue += employees[j].payInterval;
                    break;
                }
            }
        }
    }
}
