import { HardhatUserConfig, subtask } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-verify";
import { TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS } from "hardhat/builtin-tasks/task-names";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config();

const ARC_CHAIN_ID = 5042002;
const ARC_RPC_URL  = process.env.ARC_RPC_URL || "https://rpc.testnet.arc.io";

const TEST_TOKEN_SOL = path.join(__dirname, "test/mocks/MockERC20.sol");

subtask(TASK_COMPILE_SOLIDITY_GET_SOURCE_PATHS).setAction(async (_, __, runSuper) => {
  const paths: string[] = await runSuper();
  if (fs.existsSync(TEST_TOKEN_SOL)) {
    paths.push(TEST_TOKEN_SOL);
  }
  return paths;
});

const config: HardhatUserConfig = {
  paths: {
    tests: "./test/unit",
  },
  solidity: {
    version: "0.8.30",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
      evmVersion: "prague",
    },
  },
  networks: {
    hardhat: {
      chainId: ARC_CHAIN_ID,
    },
    arcTestnet: {
      chainId: ARC_CHAIN_ID,
      url: ARC_RPC_URL,
      accounts: process.env.DEPLOYER_PRIVATE_KEY
        ? [process.env.DEPLOYER_PRIVATE_KEY]
        : [],
      gasMultiplier: 1.2,
    },
  },
  etherscan: {
    apiKey: { arcTestnet: "no-api-key-needed" },
    customChains: [{
      network: "arcTestnet",
      chainId: ARC_CHAIN_ID,
      urls: {
        apiURL:     "https://testnet.arcscan.app/api",
        browserURL: "https://testnet.arcscan.app",
      },
    }],
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    outputFile: "test/results/gas-report.txt",
    noColors: true,
  },
};

export default config;
