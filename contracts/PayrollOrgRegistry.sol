// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "./PayrollVault.sol";

interface IVaultAuthorizer {
    function authorizeVault(address vault, bool allowed) external;
}

/**
 * @title PayrollOrgRegistry
 * @notice On-chain organisations with per-creator payroll vaults (factory pattern).
 * @dev Creator registers an org, deploys a vault they own, then manages payroll on that vault.
 */
contract PayrollOrgRegistry {
    struct Organization {
        string  name;
        address creator;
        address vault;
        uint64  createdAt;
        bool    vaultCreated;
    }

    address public immutable schedulerContract;
    address public immutable crossChainRouter;

    uint256 public organizationCount;
    mapping(uint256 => Organization) public organizations;
    mapping(address => uint256[]) private _creatorOrgIds;

    event OrganizationCreated(uint256 indexed orgId, address indexed creator, string name);
    event VaultCreated(uint256 indexed orgId, address indexed vault, address indexed creator);

    constructor(address _schedulerContract, address _crossChainRouter) {
        require(_schedulerContract != address(0), "Invalid scheduler");
        require(_crossChainRouter != address(0), "Invalid router");
        schedulerContract = _schedulerContract;
        crossChainRouter  = _crossChainRouter;
    }

    function createOrganization(string calldata name) external returns (uint256 orgId) {
        require(bytes(name).length > 0, "Name required");
        require(bytes(name).length <= 64, "Name too long");

        orgId = organizationCount++;
        organizations[orgId] = Organization({
            name:         name,
            creator:      msg.sender,
            vault:        address(0),
            createdAt:    uint64(block.timestamp),
            vaultCreated: false
        });
        _creatorOrgIds[msg.sender].push(orgId);

        emit OrganizationCreated(orgId, msg.sender, name);
    }

    function createVault(uint256 orgId) external returns (address vaultAddr) {
        Organization storage org = organizations[orgId];
        require(org.creator == msg.sender, "Not org creator");
        require(!org.vaultCreated, "Vault already exists");

        PayrollVault vault = new PayrollVault(schedulerContract, crossChainRouter);
        vaultAddr = address(vault);

        vault.transferOwnership(msg.sender);
        IVaultAuthorizer(crossChainRouter).authorizeVault(vaultAddr, true);

        org.vault        = vaultAddr;
        org.vaultCreated = true;

        emit VaultCreated(orgId, vaultAddr, msg.sender);
    }

    function getOrganization(uint256 orgId) external view returns (Organization memory) {
        require(orgId < organizationCount, "Invalid org");
        return organizations[orgId];
    }

    function getCreatorOrgCount(address creator) external view returns (uint256) {
        return _creatorOrgIds[creator].length;
    }

    function getCreatorOrgId(address creator, uint256 index) external view returns (uint256) {
        require(index < _creatorOrgIds[creator].length, "Invalid index");
        return _creatorOrgIds[creator][index];
    }
}
