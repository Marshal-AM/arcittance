module.exports = {
  testEnvironment: "node",
  roots: ["<rootDir>/__tests__"],
  testMatch: ["**/*.test.ts"],
  transform: { "^.+\\.ts$": ["ts-jest", { tsconfig: { module: "commonjs" } }] },
};
