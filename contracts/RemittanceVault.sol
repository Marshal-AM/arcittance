// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/ICrossChainRouter.sol";

/**
 * @title RemittanceVault
 * @notice One-off consumer remittance sends on Arc (Phase 5).
 */
contract RemittanceVault is ReentrancyGuard {
  uint8 public constant ROUTING_CCTP = 0;
  uint8 public constant ROUTING_GATEWAY = 1;

  address public immutable crossChainRouter;
  address public immutable usdc;
  address public treasury;
  uint16 public feeBps;

  uint256 public remittanceCount;

  struct Remittance {
    address sender;
    address recipient;
    uint256 amount;
    uint256 fee;
    uint32 destinationChainId;
    uint8 routingMethod;
    bytes32 attestationHash;
    bool completed;
  }

  mapping(uint256 => Remittance) public remittances;

  event RemittanceSent(
    uint256 indexed id,
    address indexed sender,
    address indexed recipient,
    uint256 amount,
    uint256 fee,
    uint32 destinationChainId,
    uint8 routingMethod,
    bytes32 attestationHash
  );

  constructor(address _crossChainRouter, address _usdc, address _treasury) {
    require(_crossChainRouter != address(0), "Invalid router");
    require(_usdc != address(0), "Invalid USDC");
    crossChainRouter = _crossChainRouter;
    usdc = _usdc;
    treasury = _treasury;
  }

  function setTreasury(address _treasury) external {
    require(_treasury != address(0), "Invalid treasury");
    treasury = _treasury;
  }

  function setFeeBps(uint16 _feeBps) external {
    require(_feeBps <= 500, "Fee too high");
    feeBps = _feeBps;
  }

  function sendRemittance(
    address token,
    uint256 amount,
    address recipient,
    uint32 destinationChainId,
    uint8 routingMethod,
    bytes32 attestationHash
  ) external nonReentrant returns (uint256 id) {
    require(token == usdc, "Only USDC");
    require(amount > 0, "Amount must be > 0");
    require(recipient != address(0), "Invalid recipient");

    uint256 fee = (amount * feeBps) / 10_000;
    uint256 net = amount - fee;

    require(
      IERC20(token).transferFrom(msg.sender, address(this), amount),
      "Transfer failed"
    );

    if (fee > 0) {
      require(IERC20(token).transfer(treasury, fee), "Fee transfer failed");
    }

    id = remittanceCount++;
    remittances[id] = Remittance({
      sender: msg.sender,
      recipient: recipient,
      amount: net,
      fee: fee,
      destinationChainId: destinationChainId,
      routingMethod: routingMethod,
      attestationHash: attestationHash,
      completed: true
    });

    if (destinationChainId == 0) {
      require(IERC20(token).transfer(recipient, net), "Local transfer failed");
    } else if (routingMethod == ROUTING_GATEWAY) {
      require(IERC20(token).approve(crossChainRouter, net), "Approve failed");
      ICrossChainRouter(crossChainRouter).routeGateway(
        token,
        net,
        destinationChainId,
        recipient
      );
    } else {
      require(IERC20(token).approve(crossChainRouter, net), "Approve failed");
      ICrossChainRouter(crossChainRouter).routeCCTP(
        token,
        net,
        destinationChainId,
        recipient
      );
    }

    emit RemittanceSent(
      id,
      msg.sender,
      recipient,
      net,
      fee,
      destinationChainId,
      routingMethod,
      attestationHash
    );
  }
}
