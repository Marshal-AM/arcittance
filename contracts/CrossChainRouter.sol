// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/ICrossChainRouter.sol";
import "./interfaces/IERC20.sol";

/**
 * @title CrossChainRouter
 * @notice Circle CCTP + Gateway routing for PayrollVault and RemittanceVault.
 *
 * Routing selection (mirrors Circle comparison table):
 * - CCTP (routeCCTP): point-to-point burn/mint to a specific destination domain + recipient.
 * - Gateway (routeGateway): unified-balance instant spend — vault transfers USDC here;
 *   off-chain orchestrator calls unified-balance-kit spend, then markGatewayFulfilled().
 */
contract CrossChainRouter is ICrossChainRouter, Ownable {
  uint8 public constant ROUTING_CCTP = 0;
  uint8 public constant ROUTING_GATEWAY = 1;

  /** CCTP V2 minFinalityThreshold — 1000 required for fast transfer from Arc testnet. */
  uint32 public constant CCTP_MIN_FINALITY_THRESHOLD = 1000;

  address public payrollVault;
  address public remittanceVault;
  address public immutable tokenMessenger;
  address public immutable usdc;

  address public orchestrator;

  address public vaultRegistry;

  mapping(address => bool) public authorizedVaults;

  struct GatewayPayout {
    address token;
    uint256 amount;
    uint32 destinationDomain;
    address recipient;
    bool fulfilled;
    bytes32 gatewayRef;
  }

  mapping(bytes32 => GatewayPayout) public gatewayPayouts;

  event RouteCCTP(
    address indexed token,
    uint256 amount,
    uint32 indexed destinationDomain,
    address indexed recipient,
    uint64 nonce
  );

  event GatewayPayoutRequested(
    bytes32 indexed requestId,
    address indexed token,
    uint256 amount,
    uint32 destinationDomain,
    address indexed recipient
  );

  event GatewayPayoutFulfilled(bytes32 indexed requestId, bytes32 gatewayRef);

  modifier onlyVault() {
    require(authorizedVaults[msg.sender], "Only vault");
    _;
  }

  modifier onlyOrchestrator() {
    require(msg.sender == orchestrator, "Only orchestrator");
    _;
  }

  constructor(
    address _tokenMessenger,
    address _usdc,
    address _orchestrator
  ) Ownable(msg.sender) {
    require(_tokenMessenger != address(0), "Invalid messenger");
    require(_usdc != address(0), "Invalid USDC");
    tokenMessenger = _tokenMessenger;
    usdc = _usdc;
    orchestrator = _orchestrator;
  }

  function setVaultRegistry(address registry) external onlyOwner {
    vaultRegistry = registry;
  }

  function authorizeVault(address vault, bool allowed) external {
    require(
      msg.sender == owner() || msg.sender == vaultRegistry,
      "Not authorized"
    );
    require(vault != address(0), "Invalid vault");
    authorizedVaults[vault] = allowed;
    if (allowed && remittanceVault == address(0) && vault != payrollVault) {
      remittanceVault = vault;
    }
    if (payrollVault == address(0) && allowed) {
      payrollVault = vault;
    }
  }

  function setOrchestrator(address _orchestrator) external onlyOwner {
    orchestrator = _orchestrator;
  }

  /**
   * @notice CCTP point-to-point: pull USDC from vault and forward to orchestrator.
   * @dev Arc testnet TokenMessenger rejects depositForBurn from contracts — burns are
   *      completed off-chain via Circle Bridge Kit from the orchestrator EOA (see arcaid).
   */
  function routeCCTP(
    address token,
    uint256 amount,
    uint32 destinationDomain,
    address recipient
  ) external onlyVault {
    require(token == usdc, "Only USDC supported");
    require(amount > 0, "Amount must be > 0");
    require(destinationDomain > 0, "Invalid destination domain");
    require(recipient != address(0), "Invalid recipient");
    require(orchestrator != address(0), "Orchestrator not set");

    require(
      IERC20(token).transferFrom(msg.sender, orchestrator, amount),
      "TransferFrom failed"
    );

    emit RouteCCTP(token, amount, destinationDomain, recipient, 0);
  }

  /**
   * @notice Gateway path: escrow USDC until unified-balance-kit spend completes off-chain.
   */
  function routeGateway(
    address token,
    uint256 amount,
    uint32 destinationDomain,
    address recipient
  ) external onlyVault {
    require(token == usdc, "Only USDC supported");
    require(amount > 0, "Amount must be > 0");
    require(recipient != address(0), "Invalid recipient");

    require(
      IERC20(token).transferFrom(msg.sender, address(this), amount),
      "TransferFrom failed"
    );

    bytes32 requestId = keccak256(
      abi.encodePacked(token, amount, destinationDomain, recipient, block.timestamp, block.number)
    );

    gatewayPayouts[requestId] = GatewayPayout({
      token: token,
      amount: amount,
      destinationDomain: destinationDomain,
      recipient: recipient,
      fulfilled: false,
      gatewayRef: bytes32(0)
    });

    emit GatewayPayoutRequested(requestId, token, amount, destinationDomain, recipient);
  }

  function markGatewayFulfilled(bytes32 requestId, bytes32 gatewayRef) external onlyOrchestrator {
    GatewayPayout storage payout = gatewayPayouts[requestId];
    require(payout.amount > 0, "Unknown request");
    require(!payout.fulfilled, "Already fulfilled");

    payout.fulfilled = true;
    payout.gatewayRef = gatewayRef;

    emit GatewayPayoutFulfilled(requestId, gatewayRef);
  }

  function _addressToBytes32(address addr) internal pure returns (bytes32) {
    return bytes32(uint256(uint160(addr)));
  }
}
